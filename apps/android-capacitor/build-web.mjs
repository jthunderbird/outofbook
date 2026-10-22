// Builds the web app for the bundled Android app into www/: the API calls go
// to the public server, the service worker and the full Stockfish build (113 MB)
// are left out, and Claude is hidden (see apps/web/src/lib/platform.ts).
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "www");
execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
  cwd: join(here, "../web"),
  stdio: "inherit",
  env: { ...process.env, VITE_TARGET: "capacitor", VITE_API_BASE: process.env.VITE_API_BASE ?? "https://outofbook.net" },
});
for (const f of ["engines/stockfish-18/stockfish-18-single.js", "engines/stockfish-18/stockfish-18-single.wasm", "sw.js", ".well-known", "privacy.html", "delete-account.html"])
  rmSync(join(out, f), { recursive: true, force: true });
