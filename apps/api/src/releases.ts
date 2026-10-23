// Public downloads of the Android apps at /releases: a page listing the APKs
// in RELEASES_DIR (newest first, older builds from its old/ folder), the files
// themselves, and /releases/latest.apk for the newest offline app. The folder
// is the build output folder on the host, mounted read-only; Play bundles and
// listing images beside the APKs are never served.
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const APK = /^outofbook-([a-z]+)-(\d+(?:\.\d+)*)\.apk$/;

const APPS: Record<string, { name: string; about: string }> = {
  offline: {
    name: "OutOfBook (offline app)",
    about: "Everything is inside the app, so the bots play with no connection at all. Updates come as new downloads.",
  },
  twa: {
    name: "OutOfBook (web app)",
    about: "A small app that opens outofbook.net full screen. Always up to date; needs one start online, then the bots work offline too.",
  },
};

export interface Release {
  file: string;
  app: string;
  version: string;
  size: number;
  date: Date;
  old: boolean;
}

const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
};

/** The APKs in the folder and its old/ folder, newest version first within each app. */
export async function listReleases(dir: string): Promise<Release[]> {
  const out: Release[] = [];
  for (const [sub, old] of [
    ["", false],
    ["old", true],
  ] as const) {
    const names = await readdir(join(dir, sub)).catch(() => [] as string[]);
    for (const file of names) {
      const m = APK.exec(file);
      if (!m) continue;
      const s = await stat(join(dir, sub, file)).catch(() => null);
      if (s?.isFile()) out.push({ file, app: m[1], version: m[2], size: s.size, date: s.mtime, old });
    }
  }
  return out.sort((a, b) => a.app.localeCompare(b.app) || newer(a.version, b.version));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const day = (d: Date) => d.toISOString().slice(0, 10);

function page(releases: Release[]) {
  const apps = [...new Set(releases.map((r) => r.app))].sort((a, b) => (a === "offline" ? -1 : b === "offline" ? 1 : a.localeCompare(b)));
  const card = (app: string) => {
    const all = releases.filter((r) => r.app === app);
    const [latest, ...rest] = all;
    const info = APPS[app] ?? { name: `OutOfBook (${app})`, about: "" };
    return `<section class="card">
  <h2>${esc(info.name)}</h2>
  <p class="muted">${esc(info.about)}</p>
  <a class="btn" href="/releases/${esc(latest.file)}" download>Download ${esc(latest.version)} <span>· ${mb(latest.size)} · ${day(latest.date)}</span></a>
  ${rest.length ? `<details><summary>Older versions (${rest.length})</summary><ul>${rest.map((r) => `<li><a href="/releases/${esc(r.file)}" download>${esc(r.version)}</a> <span class="muted">${mb(r.size)} · ${day(r.date)}</span></li>`).join("")}</ul></details>` : ""}
</section>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OutOfBook releases</title>
<link rel="icon" href="/favicon.ico">
<style>
:root { --bg: #f6f7fb; --fg: #161a26; --muted: #5d6478; --card: #fff; --border: #dde1ea; --accent: #5865f2; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d111a; --fg: #e7eaf2; --muted: #98a0b3; --card: #161b27; --border: #262d3d; --accent: #7c86ff; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 680px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { margin: 0 0 4px; font-size: 18px; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-top: 16px; }
.btn { display: inline-block; margin-top: 6px; padding: 10px 16px; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
.btn span { font-weight: 400; opacity: 0.85; }
details { margin-top: 12px; } summary { cursor: pointer; color: var(--muted); }
ul { margin: 8px 0 0; padding-left: 20px; } li { margin: 4px 0; }
a { color: var(--accent); }
.note { margin-top: 24px; font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>OutOfBook for Android</h1>
<p class="muted">Free and open source (<a href="https://github.com/jthunderbird/outofbook">GitHub</a>, AGPL-3.0). Or just use <a href="/">outofbook.net</a> in any browser.</p>
${apps.length ? apps.map(card).join("\n") : `<section class="card"><p>No builds yet.</p></section>`}
<div class="note muted">
<p><b>Installing:</b> open the downloaded file on your phone. Android asks once to allow installs from your browser or file manager. To switch between a downloaded copy and one from Google Play, uninstall first: they are signed with different keys.</p>
</div>
</main>
</body>
</html>`;
}

export function registerReleases(app: FastifyInstance, dir: string) {
  app.get("/releases", async (_req, reply) =>
    reply
      .type("text/html")
      .header("Cache-Control", "no-cache")
      .send(page(await listReleases(dir))),
  );
  // The newest offline app, for a short link to share.
  app.get("/releases/latest.apk", async (_req, reply) => {
    const r = (await listReleases(dir)).find((x) => x.app === "offline" && !x.old);
    return r ? reply.header("Cache-Control", "no-cache").redirect(`/releases/${r.file}`) : reply.code(404).send({ error: "no release" });
  });
  app.get<{ Params: { file: string } }>("/releases/:file", { compress: false }, async (req, reply) => {
    // Only names from the listing: no paths, nothing but the APKs.
    const r = (await listReleases(dir)).find((x) => x.file === req.params.file);
    if (!r) return reply.code(404).send({ error: "not found" });
    return reply
      .type("application/vnd.android.package-archive")
      .header("Content-Length", r.size)
      .header("Content-Disposition", `attachment; filename="${r.file}"`)
      .header("Cache-Control", "public, max-age=3600")
      .send(createReadStream(join(dir, r.old ? "old" : "", r.file)));
  });
}
