// The analysis views on the user's real games (local fixture, 300 games).
import { expect, test } from "@playwright/test";
import { Chess } from "chess.js";
import { analyzed, clickSquare, games300, hasGames, move, nav, pageErrors, seedGames } from "./helpers";

test.skip(!hasGames, "needs packages/core/test/fixtures/local/games300.json");

test.beforeEach(async ({ page }) => {
  await seedGames(page, games300());
  await analyzed(page);
});

test("overview counts games and positions", async ({ page }) => {
  const errors = pageErrors(page);
  await expect(page.getByTestId("main")).toContainText("2828 positions in scope");
  await expect(page.getByTestId("build-metrics").first()).toHaveText("300 games · 2828 positions");
  expect(errors).toEqual([]);
});

test("every analysis view renders, and min games filters the lists", async ({ page }) => {
  const errors = pageErrors(page);
  await nav(page, "repertoire");
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  await nav(page, "mistakes");
  const rows = page.getByTestId("rows-mistakes");
  const at = async () => parseInt((await rows.textContent()) ?? "0");
  const stepper = page.locator("[data-testid=min-games]:visible");
  const atFive = await at();
  for (let i = 0; i < 4; i++) await stepper.getByRole("button", { name: "Fewer games" }).click();
  await expect(stepper.locator("input")).toHaveValue("1");
  expect(await at()).toBeGreaterThan(atFive);

  await nav(page, "outofbook");
  await expect(page.getByTestId("rows-outofbook")).toBeVisible();

  // Who cares shows every great move (no game count) and hides the stepper.
  await nav(page, "whocares");
  expect(parseInt((await page.getByTestId("rows-whocares").textContent()) ?? "0")).toBeGreaterThan(0);
  await expect(page.locator("[data-testid=min-games]:visible")).toHaveCount(0);

  await nav(page, "openings");
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("the book explorer opens from a list row, and its board explores freely", async ({ page }) => {
  await nav(page, "repertoire");
  await page.getByTestId("explore-btn").first().click();
  await expect(page.getByTestId("explorer-history")).toBeVisible();
  const dialog = "[role=dialog]";
  const board = page.locator(`${dialog} [data-testid=explore-board]`);
  const fen = (await board.getAttribute("data-fen"))!;
  const flip = await page
    .locator(`${dialog} .cg-wrap`)
    .first()
    .evaluate((e) => e.classList.contains("orientation-black"));
  const m = new Chess(fen).moves({ verbose: true })[0];
  await clickSquare(page, m.from, flip, dialog);
  await clickSquare(page, m.to, flip, dialog);
  await expect(page.locator(`${dialog} [data-testid=explore-line]`)).toContainText(m.san);
  await expect(page.locator(`${dialog} [data-testid=explore-eval]`)).toContainText(/best|game over/, { timeout: 60_000 });
  await page.locator(`${dialog} [data-testid=explore-back]`).click();
  await expect(board).toHaveAttribute("data-fen", fen);
});

test("a game opens in review with accuracy and the eval graph", async ({ page }) => {
  await nav(page, "games");
  await page.locator("table tbody tr").first().click();
  await expect(page.getByTestId("accuracy")).toBeVisible();
  await expect(page.getByTestId("eval-graph")).toBeVisible();
  await expect(page.getByTestId("review-moves")).toBeVisible();
});

test("the analysis board: moves on it explore, with the engine and your games there; Back returns", async ({ page }) => {
  const errors = pageErrors(page);
  await nav(page, "repertoire");
  const board = page.getByTestId("explore-board").first();
  await expect(board).toBeVisible();
  await move(page, "e2", "e4");
  const line = page.getByTestId("explore-line");
  await expect(line).toContainText("1. e4");
  await expect(page.getByTestId("explore-eval")).toContainText(/best/, { timeout: 60_000 });
  await expect(page.getByTestId("explore-games")).toContainText(/Your games here|never reached/);
  await move(page, "e7", "e5");
  await expect(line).toContainText("1… e5");
  await page.getByTestId("explore-back").click();
  await expect(line).toHaveCount(0);
  expect(errors).toEqual([]);
});
