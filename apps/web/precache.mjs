// After `vite build`: writes dist/precache.json, the files the Android app
// (TWA) downloads ahead of time so it works offline: the built app, the lite
// engine, Maia and onnxruntime. The full engine (113 MB) and the pages that
// are not part of the app are left out.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const dist = new URL("./dist/", import.meta.url).pathname;
const skip = [/stockfish-18-single\./, /^\.well-known\//, /^sw\.js$/, /\.html$/, /^precache\.json$/, /^icon-(192|512|maskable-512)\.png$/, /^brand\/(?!web-)/];
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p));
  }
};
walk(dist);
const list = files.filter((f) => !skip.some((r) => r.test(f))).map((f) => `/${f}`);
writeFileSync(join(dist, "precache.json"), JSON.stringify(["/", ...list]));
console.log(`precache.json: ${list.length + 1} files`);
