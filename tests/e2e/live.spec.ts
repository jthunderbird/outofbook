// The live Lichess game screen, through its offline demo (shown with ?demo).
import { expect, test, type Page } from "@playwright/test";
import { move, nav, pageErrors } from "./helpers";

async function openDemo(page: Page) {
  await nav(page, "lichess");
  await page.getByTestId("live-demo").first().click();
  await expect(page.getByTestId("live-game")).toBeVisible();
}

test("demo: move, opponent leaves, claim the win @phone", async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto("/?demo");
  await openDemo(page);
  await expect(page.getByTestId("clock")).toHaveCount(2);
  // Before any move: the demo opponent's reply would (rightly) clear the notice.
  await page.evaluate(() => (window as unknown as { demoOpponentGone: (s: number) => void }).demoOpponentGone(1));
  await expect(page.getByTestId("opponent-gone")).toContainText("Opponent left the game");
  await page.getByRole("button", { name: "Claim victory" }).click();
  await expect(page.getByTestId("live-result")).toContainText("You won by abandonment");
  expect(errors).toEqual([]);
});

test("demo: a move plays and the opponent replies @phone", async ({ page }) => {
  await page.goto("/?demo");
  await openDemo(page);
  await move(page, "e2", "e4");
  // The opponent's reply starts our clock: it drops below 1:00.
  await expect(page.getByTestId("clock").last()).not.toHaveText("1:00", { timeout: 15_000 });
});

test("demo: the clocks and buttons switch sides, and the choice is kept", async ({ page }) => {
  await page.goto("/?demo");
  await openDemo(page);
  const side = async () => ((await page.getByTestId("clock").first().boundingBox())!.x < (await page.locator(".board-wrap:visible").first().boundingBox())!.x ? "left" : "right");
  expect(await side()).toBe("right");
  await page.getByTestId("switch-side").click();
  expect(await side()).toBe("left");
  await page.getByRole("button", { name: "Exit demo" }).click();
  await page.reload();
  await openDemo(page);
  expect(await side()).toBe("left");
  await page.getByTestId("switch-side").click(); // leave the profile as found
});

test("demo: my clock stops at once when I move and does not flash back on", async ({ page }) => {
  await page.goto("/?demo");
  await openDemo(page);
  const mine = page.getByTestId("clock").last();
  await move(page, "e2", "e4");
  await expect(mine).toHaveAttribute("data-active", "false");
  await expect(mine).toHaveAttribute("data-active", "true", { timeout: 15_000 }); // the demo replied
  // Record every change of my clock's state from our second move until the
  // demo's echo (150 ms) has come and gone; its reply comes 500 ms later at the earliest.
  await mine.evaluate((el) => {
    const w = window as unknown as { seen: string[] };
    w.seen = [];
    new MutationObserver(() => w.seen.push(el.getAttribute("data-active") ?? "")).observe(el, { attributes: true, attributeFilter: ["data-active"] });
  });
  await move(page, "d2", "d4");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["false"]);
});

test("demo: the rating change shows when the game ends", async ({ page }) => {
  await page.goto("/?demo");
  await openDemo(page);
  await page.evaluate(() => (window as unknown as { demoOpponentGone: (s: number) => void }).demoOpponentGone(0));
  await page.getByRole("button", { name: "Claim victory" }).click();
  await page.getByRole("button", { name: "Show the board" }).click();
  const diffs = page.getByTestId("rating-diff");
  await expect(diffs).toHaveCount(2);
  await expect(diffs.last()).toHaveText("+7");
  await expect(diffs.first()).toHaveText("-7");
});
