// API tests against a real Postgres: each run creates a throwaway database,
// applies the migrations, and drops it afterwards. Needs DATABASE_URL (run in
// the dev stack: docker compose exec api npm test).
import { gzipSync } from "node:zlib";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, SAVE_LIMIT } from "../src/app.js";
import { migrate } from "../src/db.js";
import type { FastifyInstance } from "fastify";

const url = process.env.DATABASE_URL;

describe.runIf(url)("API", () => {
  const dbName = `oob_test_${Date.now()}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let app: FastifyInstance;
  const as = (user: string) => ({ "x-dev-user": user });
  const game = (i: number) => ({ id: `g${i}`, date: Date.UTC(2026, 0, 1) + i, sans: ["e4"] });

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const u = new URL(url!);
    u.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: u.toString() });
    expect(await migrate(pool)).toEqual(["001_init"]);
    app = await buildApp({ pool, unlimited: new Set(["bigsaver"]), devAuth: true, lichessAccount: async (h) => (h === "Bearer good" ? { id: "Tokenuser", username: "TokenUser" } : null) });
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it("migrations run once", async () => expect(await migrate(pool)).toEqual([]));

  it("needs a login for account routes", async () => {
    expect((await app.inject({ url: "/api/me" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/me", headers: { authorization: "Bearer bad" } })).statusCode).toBe(401);
  });

  it("knows a Lichess token's user", async () => {
    const r = await app.inject({ url: "/api/me", headers: { authorization: "Bearer good" } });
    expect(r.json()).toMatchObject({ username: "TokenUser", savedGames: 0, limit: SAVE_LIMIT });
  });

  it("saves and returns games, newest first", async () => {
    const put = await app.inject({ method: "PUT", url: "/api/games", headers: as("alice"), payload: [game(1), game(2)] });
    expect(put.json()).toEqual({ saved: 2 });
    expect((await app.inject({ url: "/api/games", headers: as("alice") })).json().map((g: { id: string }) => g.id)).toEqual(["g2", "g1"]);
  });

  it("refuses more than the limit, unless the user is allowlisted", async () => {
    const many = Array.from({ length: SAVE_LIMIT + 1 }, (_, i) => game(i));
    expect((await app.inject({ method: "PUT", url: "/api/games", headers: as("alice"), payload: many })).statusCode).toBe(413);
    const ok = await app.inject({ method: "PUT", url: "/api/games", headers: as("bigsaver"), payload: many });
    expect(ok.json()).toEqual({ saved: SAVE_LIMIT + 1 });
    expect((await app.inject({ url: "/api/me", headers: as("bigsaver") })).json()).toMatchObject({ unlimited: true, limit: null });
  });

  it("keeps the deeper eval", async () => {
    const put = (depth: number, cp: number) => app.inject({ method: "POST", url: "/api/evals/put", headers: as("alice"), payload: [{ key: "k1", eval: { depth, lines: [{ cp, pv: ["e2e4"] }] } }] });
    await put(20, 30);
    await put(12, 99);
    const got = await app.inject({ method: "POST", url: "/api/evals/get", payload: { keys: ["k1", "missing"] } });
    expect(got.json()).toEqual({ k1: { depth: 20, lines: [{ cp: 30, pv: ["e2e4"] }] } });
    await put(24, 31);
    expect((await app.inject({ method: "POST", url: "/api/evals/get", payload: { keys: ["k1"] } })).json().k1.depth).toBe(24);
  });

  it("rejects malformed eval requests", async () => {
    expect((await app.inject({ method: "POST", url: "/api/evals/get", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/evals/put", headers: as("alice"), payload: { nope: 1 } })).statusCode).toBe(400);
  });

  it("stores the model and returns it only for the matching hash", async () => {
    const gz = gzipSync(JSON.stringify({ metrics: { games: 2 } }));
    const put = await app.inject({ method: "PUT", url: "/api/model?hash=h1", headers: { ...as("alice"), "content-type": "application/gzip" }, payload: gz });
    expect(put.json()).toEqual({ stored: gz.length });
    const got = await app.inject({ url: "/api/model?hash=h1", headers: as("alice") });
    expect(got.headers["content-encoding"]).toBe("gzip");
    expect(got.rawPayload.equals(gz)).toBe(true);
    expect((await app.inject({ url: "/api/model?hash=other", headers: as("alice") })).statusCode).toBe(404);
  });

  it("deletes the account with its games and model, keeping the shared evals", async () => {
    const h = as("leaver");
    await app.inject({ method: "PUT", url: "/api/games", headers: h, payload: [game(1), game(2)] });
    await app.inject({ method: "PUT", url: "/api/model?hash=x", headers: { ...h, "content-type": "application/gzip" }, payload: gzipSync("{}") });
    await app.inject({ method: "POST", url: "/api/evals/put", headers: h, payload: [{ key: "leaver-pos", eval: { depth: 10, lines: [{ cp: 1, pv: ["e2e4"] }] } }] });
    const del = await app.inject({ method: "DELETE", url: "/api/me", headers: h });
    expect(del.json()).toEqual({ deleted: true, games: 2 });
    for (const t of ["games", "models"]) expect((await pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = 'leaver'`)).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM users WHERE id = 'leaver'")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM evals WHERE key = 'leaver-pos'")).rows[0].n).toBe(1);
    expect((await app.inject({ method: "DELETE", url: "/api/me" })).statusCode).toBe(401);
  });

  it("allows the bundled Android app's origin, and only it", async () => {
    const withCors = await buildApp({ pool, unlimited: new Set(), devAuth: false, corsOrigins: ["https://localhost"] });
    const pre = (origin: string) =>
      withCors.inject({ method: "OPTIONS", url: "/api/me", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect((await pre("https://localhost")).headers["access-control-allow-origin"]).toBe("https://localhost");
    expect((await pre("https://evil.example")).headers["access-control-allow-origin"]).toBeUndefined();
    await withCors.close();
  });

  it("ignores the dev header when dev auth is off", async () => {
    const strict = await buildApp({ pool, unlimited: new Set(), devAuth: false });
    expect((await strict.inject({ url: "/api/me", headers: as("alice") })).statusCode).toBe(401);
    await strict.close();
  });
});
