// Downloads the engine and model files the web app serves from apps/web/public/
// (kept out of git: about 63 MB). Every file is pinned to an exact upstream
// version and checked against its SHA-256; files already present with the
// right hash are skipped. Run: npm run assets
//
// Licences: Stockfish.js (GPL-3.0), onnxruntime-web (MIT), Maia 3 model and
// worker from CSSLab/maia-platform-frontend (GPL-3.0).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public");
const MAIA = "https://raw.githubusercontent.com/CSSLab/maia-platform-frontend";

/** Each file comes from a direct URL, or from a file inside an npm tarball. */
const ASSETS = [
  {
    to: "engines/stockfish-18/stockfish-18-lite-single.js",
    npm: "stockfish@18.0.7",
    file: "bin/stockfish-18-lite-single.js",
    sha256: "2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe",
  },
  {
    to: "engines/stockfish-18/stockfish-18-lite-single.wasm",
    npm: "stockfish@18.0.7",
    file: "bin/stockfish-18-lite-single.wasm",
    sha256: "a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1",
  },
  { to: "ort/ort.wasm.min.js", npm: "onnxruntime-web@1.23.0", file: "dist/ort.wasm.min.js", sha256: "aec37bf5b223afd8ac358e6647369c724cc08727c258760bb88e4f6ce69ab68f" },
  { to: "ort/ort-wasm-simd-threaded.mjs", npm: "onnxruntime-web@1.23.0", file: "dist/ort-wasm-simd-threaded.mjs", sha256: "c0bc2244e2c95fbf39a5eccb595bca31defb9eefdffa6f9ce0325a1c47524461" },
  { to: "ort/ort-wasm-simd-threaded.wasm", npm: "onnxruntime-web@1.23.0", file: "dist/ort-wasm-simd-threaded.wasm", sha256: "3260fcdb33b4fc4ec33e89caf392e13625823e01049d3bf32c38464f9dbfe14c" },
  {
    to: "maia3/maia3_simplified.onnx",
    url: `${MAIA}/0013cc8e6ec52c88f5b3d694781d4cc8427cb91a/public/maia3/maia3_simplified.onnx`,
    sha256: "405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856",
  },
  {
    to: "maia3/LICENSE-maia-platform-frontend.txt",
    url: `${MAIA}/31fd9fb3515293b68f5717b4f564578faada2461/LICENSE`,
    sha256: "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986",
  },
];

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const tarballs = new Map(); // npm spec -> extracted package dir
async function fromNpm(spec, file) {
  if (!tarballs.has(spec)) {
    const [name, version] = spec.split("@");
    const dir = mkdtempSync(join(tmpdir(), "oob-assets-"));
    writeFileSync(join(dir, "p.tgz"), await download(`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`));
    execFileSync("tar", ["xzf", "p.tgz"], { cwd: dir });
    tarballs.set(spec, join(dir, "package"));
  }
  return readFileSync(join(tarballs.get(spec), file));
}

let fetched = 0;
for (const a of ASSETS) {
  const target = join(PUBLIC, a.to);
  if (existsSync(target) && sha(readFileSync(target)) === a.sha256) continue;
  const buf = a.url ? await download(a.url) : await fromNpm(a.npm, a.file);
  const got = sha(buf);
  if (got !== a.sha256) throw new Error(`${a.to}: SHA-256 ${got}, expected ${a.sha256}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
  fetched++;
  console.log(`fetched ${a.to} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
for (const dir of tarballs.values()) rmSync(dirname(dir), { recursive: true, force: true });
console.log(fetched ? `assets: ${fetched} fetched, all verified` : "assets: all present and verified");
