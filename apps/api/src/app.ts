// OutOfBook API: accounts by Lichess token, saved games (200 per user,
// unlimited for allowlisted users), a position eval cache shared by everyone,
// and each user's built repertoire model. The DB is the source of truth; the
// browser keeps a copy and reads it first.
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

export const SAVE_LIMIT = 200;

export interface AppOptions {
  pool: pg.Pool;
  /** Lichess ids with no saved-games limit. */
  unlimited: Set<string>;
  /** Test-only login by the X-Dev-User header. Never on in production (see server.ts). */
  devAuth: boolean;
  /** Production: the built web app, served with the API from one origin. */
  staticDir?: string;
  /** How the API asks Lichess who a token belongs to; replaced in tests. */
  lichessAccount?: (authorization: string) => Promise<{ id: string; username: string } | null>;
  /** Origins of other apps allowed to call the API: the bundled Android app runs at https://localhost. */
  corsOrigins?: string[];
  logger?: boolean;
}

const lichessAccount = async (authorization: string) => {
  const r = await fetch("https://lichess.org/api/account", { headers: { Authorization: authorization, "User-Agent": "OutOfBook" } });
  return r.ok ? ((await r.json()) as { id: string; username: string }) : null;
};

export async function buildApp(o: AppOptions): Promise<FastifyInstance> {
  const { pool } = o;
  const account = o.lichessAccount ?? lichessAccount;
  const app = Fastify({ logger: o.logger ? { level: "info" } : false, bodyLimit: 50 * 1024 * 1024 });
  // gzip at a low level: 2,000 evals (678 KB) shrink to about 150 KB in a few ms;
  // higher levels and brotli cost more server time than they save on the wire.
  await app.register(compress, { threshold: 1024, encodings: ["gzip"], zlibOptions: { level: 1 } });
  if (o.corsOrigins?.length) await app.register(cors, { origin: o.corsOrigins, methods: ["GET", "POST", "PUT", "DELETE"], maxAge: 86400 });
  app.addContentTypeParser("application/gzip", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  // A Lichess token identifies the user; we never see a password. Cached briefly.
  const tokenCache = new Map<string, { id: string; name: string; at: number }>();
  async function userOf(req: FastifyRequest): Promise<{ id: string; name: string } | null> {
    if (o.devAuth && req.headers["x-dev-user"]) {
      const n = String(req.headers["x-dev-user"]);
      return { id: n.toLowerCase(), name: n };
    }
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return null;
    const hit = tokenCache.get(h);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
    const a = await account(h).catch(() => null);
    if (!a) return null;
    const u = { id: a.id.toLowerCase(), name: a.username, at: Date.now() };
    tokenCache.set(h, u);
    return u;
  }

  async function upsertUser(u: { id: string; name: string }) {
    const r = await pool.query(
      `INSERT INTO users (id, username, unlimited) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET last_seen = now(), unlimited = users.unlimited OR $3
       RETURNING unlimited`,
      [u.id, u.name, o.unlimited.has(u.id)],
    );
    return r.rows[0].unlimited as boolean;
  }

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/me", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    const unlimited = await upsertUser(u);
    const c = await pool.query("SELECT count(*)::int AS n FROM games WHERE user_id = $1", [u.id]);
    return { username: u.name, unlimited, savedGames: c.rows[0].n, limit: unlimited ? null : SAVE_LIMIT };
  });

  // Account deletion (Google Play requires it): the user's games, model and user row.
  // Shared evals carry no personal data and stay.
  app.delete("/api/me", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const g = await client.query("DELETE FROM games WHERE user_id = $1", [u.id]);
      await client.query("DELETE FROM models WHERE user_id = $1", [u.id]);
      await client.query("DELETE FROM users WHERE id = $1", [u.id]);
      await client.query("COMMIT");
      return { deleted: true, games: g.rowCount };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });

  // Replace the user's saved set. Over the limit: refused, nothing saved.
  app.put("/api/games", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    const unlimited = await upsertUser(u);
    const games = req.body as { id: string; date: number }[];
    if (!Array.isArray(games)) return reply.code(400).send({ error: "expected an array of games" });
    if (!unlimited && games.length > SAVE_LIMIT) return reply.code(413).send({ error: `limit is ${SAVE_LIMIT} games`, limit: SAVE_LIMIT });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM games WHERE user_id = $1", [u.id]);
      for (let i = 0; i < games.length; i += 500) {
        await client.query(
          `INSERT INTO games (user_id, game_id, played_at, data)
           SELECT $1, g->>'id', to_timestamp((g->>'date')::bigint / 1000.0), g FROM jsonb_array_elements($2::jsonb) g
           ON CONFLICT DO NOTHING`,
          [u.id, JSON.stringify(games.slice(i, i + 500))],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return { saved: games.length };
  });

  app.get("/api/games", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    const r = await pool.query("SELECT data FROM games WHERE user_id = $1 ORDER BY played_at DESC", [u.id]);
    return r.rows.map((x) => x.data);
  });

  // Shared eval cache: anyone may read; logged-in users may write deeper evals.
  app.post("/api/evals/get", async (req, reply) => {
    const { keys, minDepth = 0 } = (req.body ?? {}) as { keys?: unknown; minDepth?: number };
    if (!Array.isArray(keys)) return reply.code(400).send({ error: "expected { keys: string[] }" });
    const r = await pool.query("SELECT key, data FROM evals WHERE key = ANY($1) AND depth >= $2", [keys.slice(0, 2000).map(String), Number(minDepth) || 0]);
    return Object.fromEntries(r.rows.map((x) => [x.key, x.data]));
  });

  app.post("/api/evals/put", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    if (!Array.isArray(req.body)) return reply.code(400).send({ error: "expected an array of { key, eval }" });
    const items = (req.body as { key: string; eval: { depth: number; lines: unknown[] } }[])
      .slice(0, 2000)
      .filter((i) => typeof i?.key === "string" && Number.isFinite(i.eval?.depth) && i.eval?.lines?.length);
    await pool.query(
      `INSERT INTO evals (key, depth, data)
       SELECT i->>'key', (i->'eval'->>'depth')::int, i->'eval' FROM jsonb_array_elements($1::jsonb) i
       ON CONFLICT (key) DO UPDATE SET depth = EXCLUDED.depth, data = EXCLUDED.data, updated_at = now()
       WHERE evals.depth < EXCLUDED.depth`,
      [JSON.stringify(items)],
    );
    return { stored: items.length };
  });

  // The built model. GET returns it only when the stored hash matches (else 404),
  // served as stored with Content-Encoding: gzip, so the browser inflates it.
  app.get("/api/model", { compress: false }, async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    const { hash } = req.query as { hash?: string };
    const r = await pool.query("SELECT hash, gz FROM models WHERE user_id = $1", [u.id]);
    if (!r.rows.length || (hash && r.rows[0].hash !== hash)) return reply.code(404).send({ error: "no model for these games" });
    return reply.header("Content-Type", "application/json").header("Content-Encoding", "gzip").header("X-Model-Hash", r.rows[0].hash).send(r.rows[0].gz);
  });

  app.put("/api/model", async (req, reply) => {
    const u = await userOf(req);
    if (!u) return reply.code(401).send({ error: "not logged in" });
    await upsertUser(u);
    const hash = String((req.query as { hash?: string }).hash ?? "");
    const gz = req.body as Buffer;
    if (!hash || !Buffer.isBuffer(gz) || gz[0] !== 0x1f || gz[1] !== 0x8b) return reply.code(400).send({ error: "expected ?hash= and a gzip body" });
    await pool.query(
      `INSERT INTO models (user_id, hash, gz) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, gz = EXCLUDED.gz, built_at = now()`,
      [u.id, hash, gz],
    );
    return { stored: gz.length };
  });

  if (o.staticDir) {
    // COOP/COEP make the page cross-origin isolated (SharedArrayBuffer for engines),
    // as the dev server does.
    app.addHook("onSend", async (_req, reply) => {
      reply.header("Cross-Origin-Opener-Policy", "same-origin");
      reply.header("Cross-Origin-Embedder-Policy", "require-corp");
    });
    // Digital Asset Links: lets the Android app open this site without a browser bar.
    app.get("/.well-known/assetlinks.json", async (_req, reply) =>
      reply
        .type("application/json")
        .header("Cache-Control", "no-cache")
        .send(await readFile(join(o.staticDir!, ".well-known/assetlinks.json"), "utf8").catch(() => "[]")),
    );
    await app.register(fastifyStatic, {
      root: o.staticDir,
      // Vite's hashed bundles never change; everything else is revalidated.
      setHeaders: (res, path) => res.header("Cache-Control", /\/assets\//.test(path) ? "public, max-age=31536000, immutable" : "no-cache"),
    });
    // The app is one page: unknown non-API paths get index.html.
    app.setNotFoundHandler((req, reply) =>
      req.method === "GET" && !req.url.startsWith("/api/") ? reply.type("text/html").header("Cache-Control", "no-cache").sendFile("index.html") : reply.code(404).send({ error: "not found" }),
    );
  }

  return app;
}
