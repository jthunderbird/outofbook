// The live Lichess game screen, through its offline demo (shown with ?demo).
import { expect, test, type Page } from "@playwright/test";
import { clickSquare, move, nav, pageErrors } from "./helpers";

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

/** Squares holding pieces of a chessground class (e.g. "white knight"), white at the bottom. */
async function squaresOf(page: Page, cls: string) {
  const board = (await page.locator(".board-wrap:visible").first().boundingBox())!;
  const boxes = await page.locator(`.board-wrap:visible piece.${cls.split(" ").join(".")}`).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  const s = board.width / 8;
  return boxes.map((b) => "abcdefgh"[Math.floor((b.x - board.x) / s)] + (8 - Math.floor((b.y - board.y) / s))).sort();
}

test("demo: multiple premoves are shaded darker in turn and played one by one", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("liveSettings", JSON.stringify({ multiPremove: true, premove: true, useLichessPrefs: false })));
  await page.goto("/?demo");
  await openDemo(page);
  await move(page, "e2", "e4");
  // While the demo thinks (at least 650 ms): two more moves, queued.
  const queued = page.locator(".board-wrap[data-premoves]");
  await expect(queued).toHaveAttribute("data-premoves", "0");
  await move(page, "d2", "d4");
  await expect(queued).toHaveAttribute("data-premoves", "1");
  await move(page, "g1", "f3");
  await expect(queued).toHaveAttribute("data-premoves", "2");
  await expect(page.locator("cg-board square.premove-1")).toHaveCount(2);
  await expect(page.locator("cg-board square.premove-2")).toHaveCount(2);
  // The queue empties as the demo replies, each premove played on its turn.
  await expect(page.locator("cg-board square[class*=premove-]")).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => squaresOf(page, "white knight"), { timeout: 10_000 }).toContain("f3");
  expect(await squaresOf(page, "white pawn")).toEqual(expect.arrayContaining(["d4", "e4"]));
});

test("demo: a tap on an empty square cancels the queued premoves", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("liveSettings", JSON.stringify({ multiPremove: true, premove: true, useLichessPrefs: false })));
  await page.goto("/?demo");
  await openDemo(page);
  await move(page, "e2", "e4");
  await expect(page.locator(".board-wrap[data-premoves]")).toHaveCount(1);
  await move(page, "d2", "d4");
  await expect(page.locator("cg-board square.premove-1")).toHaveCount(2);
  await clickSquare(page, "a5");
  await expect(page.locator("cg-board square[class*=premove-]")).toHaveCount(0);
});

for (const [w, h] of [
  [412, 860],
  [1600, 1000],
] as const)
  test(`demo: with the result put away at ${w}x${h}, its choices fit their buttons; no full-screen button`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto("/?demo");
    await openDemo(page);
    await expect(page.getByRole("button", { name: /full screen/i })).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { demoOpponentGone: (s: number) => void }).demoOpponentGone(0));
    await page.getByRole("button", { name: "Claim victory" }).click();
    await page.getByRole("button", { name: "Show the board" }).click();
    const bar = page.getByTestId("end-again");
    await expect(bar).toBeInViewport({ ratio: 1 });
    for (const b of await bar.getByRole("button").all()) expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await bar.getByRole("button", { name: "You won by abandonment" }).click();
    await expect(page.getByTestId("live-result")).toBeVisible();
    await ctx.close();
  });

for (const oppWarn of [true, false])
  test(`demo: the opponent's clock ${oppWarn ? "changes" : "keeps its"} color when low, as set`, async ({ page }) => {
    await page.addInitScript((w) => localStorage.setItem("liveSettings", JSON.stringify({ oppClockWarn: w })), oppWarn);
    await page.goto("/?demo");
    await openDemo(page);
    // You are White: the first clock is the opponent's.
    await page.evaluate(() => (window as unknown as { demoClocks: (w: number, b: number) => void }).demoClocks(3000, 3000));
    await expect(page.getByTestId("clock").last()).toHaveAttribute("data-level", "2");
    await expect(page.getByTestId("clock").first()).toHaveAttribute("data-level", oppWarn ? "2" : "0");
  });
