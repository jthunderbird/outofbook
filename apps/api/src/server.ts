// Starts the API: applies migrations, then listens on :8080. In production
// (NODE_ENV=production) it also serves the built web app from STATIC_DIR.
import pg from "pg";
import { buildApp } from "./app.js";
import { migrate } from "./db.js";

const production = process.env.NODE_ENV === "production";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const applied = await migrate(pool);
if (applied.length) console.log(`migrations applied: ${applied.join(", ")}`);

const app = await buildApp({
  pool,
  unlimited: new Set(
    (process.env.UNLIMITED_USERS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ),
  // Test-only header login: ignored in production whatever the variable says.
  devAuth: !production && process.env.DEV_AUTH === "1",
  staticDir: production ? process.env.STATIC_DIR : undefined,
  corsOrigins: (process.env.CORS_ORIGINS ?? "https://localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  logger: true,
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8080) });
