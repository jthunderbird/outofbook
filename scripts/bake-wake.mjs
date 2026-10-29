// Bakes The Wake: builds the court once in a headless browser with recording on and saves
// its pieces (scene graphs and geometry in one binary, every texture as WebP) to
// packages/legions/courts/wake/baked/, which the game loads instead of building them
// (packages/legions/src/wakeBake.ts). Run it after changing how the court is made.
//   (dev server up) NODE_PATH=$PWD/node_modules E2E_CHROMIUM=<chrome> node scripts/bake-wake.mjs [url]
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "https://localhost:7445/mockups/bake.html";
const out = new URL("../packages/legions/courts/wake/baked/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 400, height: 250 } })).newPage();
let built = false;
page.on("console", (m) => {
  if (/the Wake built/.test(m.text())) built = true;
});
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(url);
for (let i = 0; i < 600 && !built; i++) await page.waitForTimeout(500);
if (!built) throw new Error("the court never finished building");
const pack = await page.evaluate(() => window.collect());
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(out + f);
writeFileSync(out + "index.json", JSON.stringify(pack.index));
writeFileSync(out + "geometry.bin", Buffer.concat(pack.chunks.map((c) => Buffer.from(c, "base64"))));
for (const [key, data] of Object.entries(pack.textures)) writeFileSync(`${out}${key}.webp`, Buffer.from(data.split(",")[1], "base64"));
const bytes = readdirSync(out).length;
console.log("baked", bytes, "files:", Object.keys(pack.index.nodes).length, "pieces,", Object.keys(pack.index.geos).length, "geometries,", Object.keys(pack.textures).length, "textures");
await browser.close();
