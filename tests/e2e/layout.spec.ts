// Board pages on any screen: the nav opens over the page (one layout per
// page), the bot's prompt and side column stay on screen, and a review is
// closed from its nav item.
import { expect, test, type Browser } from "@playwright/test";
import { analyzed, closeReview, games300, hasGames, move, nav, seedGames } from "./helpers";

test.skip(!hasGames, "needs packages/core/test/fixtures/local/games300.json");

const SIZES = [
  ["phone", 412, 860],
  ["foldable", 840, 700],
  ["tablet", 1024, 700],
  ["desktop", 1600, 1000],
] as const;

async function open(browser: Browser, w: number, h: number) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true, hasTouch: w < 1000 });
  const page = await ctx.newPage();
  await seedGames(page, games300());
  await analyzed(page);
  return page;
}

for (const [name, w, h] of SIZES)
  test(`bot, ${name}: the nav starts closed, and the take-back prompt and current line are on screen`, async ({ browser }) => {
    const page = await open(browser, w, h);
    await nav(page, "play");
    await page.getByRole("radio", { name: "White", exact: true }).click();
    await page.getByRole("radio", { name: "Stockfish" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await expect(page.getByTestId("nav-pane")).toHaveCount(0);
    await move(page, "d2", "d4"); // not the usual 1.e4
    const prompt = page.getByTestId("pause-prompt");
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(prompt).toBeInViewport({ ratio: 1 });
    if (w >= 600) await expect(page.getByTestId("line-status")).toBeInViewport({ ratio: 1 });
    // Below 1024 px the nav opens over the page, leaving the board where it was.
    const before = await page.locator(".board-wrap:visible").first().boundingBox();
    if (w >= 768 && w < 1024) {
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await expect(page.getByTestId("nav-pane")).toBeVisible();
      expect(await page.locator(".board-wrap:visible").first().boundingBox()).toEqual(before);
    }
    await page.context().close();
  });

test("review: progress over the board, no header box, closed from the nav item", async ({ browser }) => {
  const page = await open(browser, 840, 700);
  await nav(page, "games");
  await page.locator("table tbody tr").first().click();
  await expect(page.getByTestId("review-repertoire")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await closeReview(page);
  await expect(page.getByTestId("review-repertoire")).toHaveCount(0);
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await page.context().close();
});
