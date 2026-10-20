import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

/**
 * Applies migrations/NNN_name.sql in order, each once and in its own
 * transaction, recording them in schema_migrations. A lock keeps two API
 * instances starting together from both applying one.
 */
export async function migrate(pool: pg.Pool, dir = new URL("../migrations/", import.meta.url)) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7310)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version as string));
    const applied: string[] = [];
    for (const file of readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort()) {
      const version = file.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(new URL(file, dir), "utf8"));
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        applied.push(version);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(e as Error).message}`, { cause: e });
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(7310)").catch(() => {});
    client.release();
  }
}
