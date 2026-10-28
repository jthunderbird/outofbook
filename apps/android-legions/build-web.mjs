// Builds Chess Legions for the bundled Android app into www/: the whole game,
// with Maia's model and runtime, so it plays offline. Copied from
// ../android-capacitor/build-web.mjs (OutOfBook's offline app).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "www");
execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { cwd: join(here, "../legions"), stdio: "inherit" });

// Shown instead of the game when the phone's Android System WebView is older than
// capacitor.config.json's minWebViewVersion: Maia needs WebAssembly SIMD (Chrome 91+).
writeFileSync(
  join(out, "webview-too-old.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Chess Legions</title><style>body{margin:0;background:#120d22;color:#f4efe2;font:17px/1.6 system-ui,sans-serif}main{max-width:30rem;margin:0 auto;padding:3rem 1.5rem}
a.b{display:inline-block;margin-top:1rem;padding:.8rem 1.2rem;border-radius:10px;background:linear-gradient(90deg,#6d3bd8,#e0a93b);color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>Please update Android System WebView</h1>
<p>Chess Legions runs its 3D board and its opponent inside Android System WebView, and the version on this phone is too old for them.
Update it from the Play Store (it is free and also makes other apps safer), then open Chess Legions again.</p>
<a class="b" href="market://details?id=com.google.android.webview">Update Android System WebView</a>
<p style="color:#a99fc4;font-size:.9rem">If the button does nothing, open the Play Store and search for "Android System WebView".</p>
</main></body></html>
`,
);
