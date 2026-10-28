// Launcher icons and splash screens for the Android project, from the game's
// own icon (../legions/public/icon.svg), drawn by Chromium (Playwright, from the
// repository's dev dependencies). Run from this folder: node make-icons.mjs
// (E2E_CHROMIUM may name the Chromium binary).
import { chromium } from "@playwright/test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const svg = readFileSync("../legions/public/icon.svg", "utf8");
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const defs = inner.match(/<defs>[\s\S]*?<\/defs>/)[0];
const art = inner.replace(defs, "").replace(/<rect[^>]*\/>/, "");
const res = "android/app/src/main/res";
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const page = await browser.newPage();
async function draw(file, size, body, bg = "transparent") {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:${bg}"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${defs}${body}</svg></body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: bg === "transparent" });
}
const full = `<rect width="512" height="512" fill="url(#g)"/>`;
for (const [d, k] of Object.entries(DENS)) {
  const dir = join(res, `mipmap-${d}`);
  // Adaptive icon: the gradient full bleed behind; the king and swords in the middle 60%, inside the mask's safe zone.
  await draw(join(dir, "ic_launcher_background.png"), 108 * k, full);
  await draw(join(dir, "ic_launcher_foreground.png"), 108 * k, `<g transform="translate(102 102) scale(0.6)">${art}</g>`);
  // Older launchers: the whole icon, rounded square and circle.
  await draw(join(dir, "ic_launcher.png"), 48 * k, `<rect width="512" height="512" rx="112" fill="url(#g)"/>${art}`);
  await draw(join(dir, "ic_launcher_round.png"), 48 * k, `<circle cx="256" cy="256" r="256" fill="url(#g)"/><g transform="translate(51 51) scale(0.8)">${art}</g>`);
}
// Splash screens: the icon in the middle of the game's dark violet, at each existing splash's size.
for (const dir of readdirSync(res).filter((n) => n.startsWith("drawable"))) {
  const f = join(res, dir, "splash.png");
  if (!existsSync(f)) continue;
  const b = readFileSync(f);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const s = Math.round(Math.min(w, h) * 0.4);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:#120d22;display:flex;align-items:center;justify-content:center;height:100vh"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">${defs}<rect width="512" height="512" rx="112" fill="url(#g)"/>${art}</svg></body></html>`,
  );
  await page.screenshot({ path: f });
}
await browser.close();
