// The game review page: layout, repertoire alerts, the live engine and its choices.
import { expect, test, type Page } from "@playwright/test";
import { analyzed, clickSquare, closeReview, games300, hasGames, nav, pageErrors, seedGames } from "./helpers";

test.skip(!hasGames, "needs packages/core/test/fixtures/local/games300.json");

test.beforeEach(async ({ page }) => {
  await seedGames(page, games300());
  await analyzed(page);
});

/** Opens the n-th game of the Games list in review. */
async function openGame(page: Page, n = 0) {
  await nav(page, "games");
  await page.locator("table tbody tr").nth(n).click();
  await expect(page.getByTestId("review-repertoire")).toBeVisible();
}
const box = async (page: Page, id: string) => (await page.getByTestId(id).first().boundingBox())!;

test("layout: repertoire on top left, graph and engine side by side, summary and moves under the board", async ({ page }) => {
  const errors = pageErrors(page);
  await openGame(page);
  const rep = await box(page, "review-repertoire");
  const graph = await box(page, "eval-graph");
  const engine = await box(page, "review-engine");
  const board = await box(page, "review-board");
  expect(rep.x + rep.width).toBeLessThanOrEqual(board.x);
  expect(graph.y).toBeGreaterThan(rep.y);
  expect(Math.abs(graph.y - engine.y)).toBeLessThan(30);
  expect(engine.x).toBeGreaterThan(graph.x + graph.width - 1);
  const summary = await box(page, "accuracy");
  const moves = await box(page, "review-moves");
  expect(summary.y).toBeGreaterThan(board.y + 300);
  expect(Math.abs(summary.x - board.x)).toBeLessThan(5);
  expect(moves.y).toBeGreaterThan(summary.y);
  // The repertoire box has the board's height on every move.
  const card = await box(page, "review-board-card");
  const boardEl = (await page.getByTestId("review-board-card").locator(".board-wrap").boundingBox())!;
  const heights = new Set<number>();
  for (let i = 0; i < 12; i++) {
    heights.add(Math.round((await box(page, "review-repertoire")).height));
    await page.getByRole("button", { name: "Next move" }).click();
  }
  expect([...heights]).toEqual([Math.round(boardEl.height)]);
  expect(Math.abs(rep.y - card.y)).toBeLessThan(2);
  await page.screenshot({ path: "test-results/review-layout.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("engine: five lines with the played move highlighted; choices are remembered", async ({ page }) => {
  const errors = pageErrors(page);
  await openGame(page);
  await page.getByRole("button", { name: "Next move" }).click();
  const lines = page.getByTestId("engine-line");
  await expect(lines)
    .toHaveCount(5, { timeout: 60_000 })
    .catch(async () => expect(await lines.count()).toBeGreaterThanOrEqual(5));
  await expect(page.locator("[data-testid=engine-line][data-played]")).toHaveCount(1);

  await page.getByLabel("Engine lines").selectOption("3");
  await expect.poll(async () => await lines.count()).toBeLessThanOrEqual(4);
  await page.getByLabel("Engine depth").selectOption("12");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings") ?? "{}"));
  expect(saved).toMatchObject({ reviewLines: 3, reviewDepth: 12 });
  expect(errors).toEqual([]);
});

test("the game is analyzed once; browsing it then only reads the results", async ({ page }) => {
  test.setTimeout(400_000);
  const errors = pageErrors(page);
  // A game of 40 plies or more.
  for (let n = 0; n < 20; n++) {
    await openGame(page, n);
    if ((await page.locator("[data-testid=review-moves] [data-ply]").count()) >= 40) break;
    await closeReview(page);
  }
  const t0 = Date.now();
  await expect(page.getByText(/Analyzing the game at depth 14, 5 lines/)).toBeHidden({ timeout: 300_000 });
  console.log(`game pass: ${((Date.now() - t0) / 1000).toFixed(1)} s for ${await page.locator("[data-testid=review-moves] [data-ply]").count()} plies`);
  const status = page.getByTestId("engine-status");
  for (let i = 0; i < 40; i++) {
    await page.getByRole("button", { name: "Next move" }).click();
    await expect(status).toHaveText(/^(cache|cloud|server) · depth \d+/);
    await expect(page.getByTestId("engine-line").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the full engine downloads once, then analyzes", async ({ page }) => {
  const errors = pageErrors(page);
  await openGame(page);
  await page.getByTestId("review-engine").getByRole("radio", { name: "Full" }).click();
  // Depth ∞: no cache or cloud eval is ever enough, so the engine itself runs.
  await page.getByLabel("Engine depth").selectOption("0");
  await page.getByRole("button", { name: "Next move" }).click();
  await expect(page.getByTestId("engine-status")).toContainText(/^Stockfish 18 · depth \d+/, { timeout: 120_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings") ?? "{}"));
  expect(saved.engineBuild).toBe("full");
  await page.screenshot({ path: "test-results/review-full.png" });
  expect(errors).toEqual([]);
});

test("repertoire alerts follow the current move, with jump buttons and move-list marks", async ({ page }) => {
  const errors = pageErrors(page);
  // The first games with a change from the user's usual moves.
  for (let n = 0; n < 12; n++) {
    await openGame(page, n);
    if (
      await page
        .getByTestId("review-jumps")
        .getByRole("button", { name: /Off your usual/ })
        .count()
    )
      break;
    await closeReview(page);
  }
  await page
    .getByTestId("review-jumps")
    .getByRole("button", { name: /Off your usual/ })
    .click();
  await expect(page.locator("[data-testid=review-note][data-kind=off-usual]")).toContainText("You usually play");
  await expect(page.getByTestId("mark-off-usual").first()).toBeVisible();
  await page.screenshot({ path: "test-results/review-alerts.png", fullPage: true });

  // Games where a named line simply ran out have no book exit.
  const exit = page.getByTestId("review-jumps").getByRole("button", { name: /Book exit/ });
  if (await exit.count()) {
    await exit.click();
    await expect(page.locator("[data-testid=review-note]").first()).toHaveAttribute("data-kind", /left-book|opp-left-book/);
  }
  expect(errors).toEqual([]);
});

test("practice from here opens the bot at this position", async ({ page }) => {
  await openGame(page);
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Next move" }).click();
  await page.getByRole("button", { name: "Practice from here" }).click();
  await expect(page.getByRole("button", { name: /Start game/ })).toBeVisible();
  await expect(page.getByTestId("main")).toContainText("1.");
});

test("phone: the board first, then the repertoire @phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout only");
  await openGame(page);
  const board = await box(page, "review-board");
  const rep = await box(page, "review-repertoire");
  expect(rep.y).toBeGreaterThan(board.y);
});

test("free moves: a move off the game starts a side line that the engine and repertoire follow; back to the game drops it", async ({ page }) => {
  const errors = pageErrors(page);
  await openGame(page);
  const flip = await page
    .locator("[data-testid=review-board] .cg-wrap")
    .first()
    .evaluate((e) => e.classList.contains("orientation-black"));
  const first = (await page.locator("[data-testid=review-moves] [data-ply='1']").first().textContent()) ?? "";
  const [from, to, san] = first.includes("e4") ? ["d2", "d4", "d4"] : ["e2", "e4", "e4"];
  await clickSquare(page, from, flip);
  await clickSquare(page, to, flip);
  const sideLine = page.getByTestId("side-line");
  await expect(sideLine).toContainText(`1. ${san}`);
  await expect(page.getByTestId("review-alerts")).toContainText("side line");
  // The engine analyzes the new position: its lines start with a Black move.
  await expect(page.getByTestId("engine-line").first()).toBeVisible({ timeout: 60_000 });
  // A reply extends the side line; the arrows step along it.
  await clickSquare(page, "g8", flip);
  await clickSquare(page, "f6", flip);
  await expect(sideLine).toContainText("1… Nf6");
  await page.getByRole("button", { name: "Previous move" }).click();
  await expect(page.getByTestId("review-alerts")).toContainText(`1. ${san}`);
  // Back to the game: the side line is gone, the board is where it branched.
  await page.getByTestId("back-to-game").click();
  await expect(sideLine).toHaveCount(0);
  await expect(page.getByTestId("review-alerts")).toContainText("Step through the game");
  // Playing the game's own move just follows the game.
  if (first.includes("e4")) {
    await clickSquare(page, "e2", flip);
    await clickSquare(page, "e4", flip);
    await expect(page.getByTestId("review-alerts")).toContainText("1. e4");
    await expect(sideLine).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
