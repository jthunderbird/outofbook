// Builds the web app for the bundled Android app into www/: the API calls go
// to the public server, the service worker and the full Stockfish build (113 MB)
// are left out, and Claude is hidden (see apps/web/src/lib/platform.ts).
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "www");
const { appId } = JSON.parse(readFileSync(join(here, "capacitor.config.json"), "utf8"));
execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
  cwd: join(here, "../web"),
  stdio: "inherit",
  env: { ...process.env, VITE_TARGET: "capacitor", VITE_APP_ID: appId, VITE_API_BASE: process.env.VITE_API_BASE ?? "https://outofbook.net" },
});
for (const f of ["engines/stockfish-18/stockfish-18-single.js", "engines/stockfish-18/stockfish-18-single.wasm", "sw.js", ".well-known", "privacy.html", "delete-account.html"])
  rmSync(join(out, f), { recursive: true, force: true });

// Shown instead of the app when the phone's Android System WebView is older than
// capacitor.config.json's minWebViewVersion: the engines need WebAssembly SIMD (Chrome 91+).
writeFileSync(
  join(out, "webview-too-old.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>OutOfBook</title><style>body{margin:0;background:#0d1117;color:#e6edf3;font:17px/1.6 system-ui,sans-serif}main{max-width:30rem;margin:0 auto;padding:3rem 1.5rem}
img{height:64px}a.b{display:inline-block;margin-top:1rem;padding:.8rem 1.2rem;border-radius:10px;background:linear-gradient(90deg,#4493f8,#ab7df8);color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main><img src="brand/web-horizontal.png" alt="OutOfBook" />
<h1>Please update Android System WebView</h1>
<p>OutOfBook runs its chess engines inside Android System WebView, and the version on this phone is too old for them.
Update it from the Play Store (it is free and also makes other apps safer), then open OutOfBook again.</p>
<a class="b" href="market://details?id=com.google.android.webview">Update Android System WebView</a>
<p style="color:#8b949e;font-size:.9rem">If the button does nothing, open the Play Store and search for "Android System WebView".</p>
</main></body></html>
`,
);
