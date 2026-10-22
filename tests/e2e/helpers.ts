import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const FIXTURE = new URL("../../packages/core/test/fixtures/local/games300.json", import.meta.url);
export const hasGames = existsSync(FIXTURE);
export const games300 = () => JSON.parse(readFileSync(FIXTURE, "utf8")) as { id: string }[];

/** Collects uncaught page errors so a test can assert there were none. */
export function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Puts games in this browser's IndexedDB as a returning user would have them, then reloads. */
export async function seedGames(page: Page, games: unknown[]) {
  await page.goto("/");
  await page.evaluate(async (g) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open("outofbook", 1);
      q.onupgradeneeded = () => {
        q.result.createObjectStore("evals");
        q.result.createObjectStore("kv");
      };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(g, "lastGames");
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  }, games);
  await page.reload();
}

/** Waits for the app's startup marks (App.tsx): model ready, analysis complete. */
export const analyzed = (page: Page) => page.waitForFunction(() => performance.getEntriesByName("oob-analyzed").length > 0, null, { timeout: 170_000, polling: 250 });

export const nav = async (page: Page, id: string) => {
  // The shell first: before it renders, every item counts as hidden.
  await page
    .getByRole("button", { name: /^(Menu|Toggle navigation)$/ })
    .first()
    .waitFor();
  const item = page.locator(`[data-testid=nav-${id}]:visible`).first();
  if (!(await item.isVisible())) {
    // Closed nav: the phone menu, or the pane's toggle (board pages close it).
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    else await page.getByRole("button", { name: "Toggle navigation" }).click();
  }
  await item.click();
};
/** Closes the reviewed game with the X on its nav item. */
export const closeReview = async (page: Page) => {
  const x = page.locator("[data-testid=close-review]:visible").first();
  if (!(await x.isVisible())) {
    const menu = page.getByRole("button", { name: "Menu" });
    if (await menu.isVisible()) await menu.click();
    else await page.getByRole("button", { name: "Toggle navigation" }).click();
  }
  await x.click();
};

/** Clicks a square on the visible board (white at the bottom unless `flip`). */
export async function clickSquare(page: Page, sq: string, flip = false, scope = "") {
  const box = (await page.locator(`${scope} .board-wrap:visible`.trim()).first().boundingBox())!;
  let f = sq.charCodeAt(0) - 97;
  let r = +sq[1] - 1;
  if (flip) [f, r] = [7 - f, 7 - r];
  const s = box.width / 8;
  await page.mouse.click(box.x + f * s + s / 2, box.y + (7 - r) * s + s / 2);
}
export const move = async (page: Page, from: string, to: string) => {
  await clickSquare(page, from);
  await clickSquare(page, to);
};
