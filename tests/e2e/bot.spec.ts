import { expect, test, type Page } from "@playwright/test";
import { move, nav, pageErrors } from "./helpers";

async function start(page: Page, engine: "Stockfish" | "Maia (human-like)") {
  await page.goto("/");
  await nav(page, "play");
  await page.getByRole("radio", { name: "White", exact: true }).click();
  await page.getByRole("radio", { name: engine }).click();
  await page.getByRole("button", { name: /Start game/ }).click();
}

test("Stockfish game: move, reply, top moves, eval bar, browsing, resign", async ({ page }) => {
  const errors = pageErrors(page);
  await start(page, "Stockfish");
  await move(page, "e2", "e4");
  await expect(page.getByTestId("bot-move")).toBeVisible({ timeout: 60_000 });
  // Top moves for our next move, with the engine's evals.
  await expect(page.getByTestId("top-move").first()).toBeVisible({ timeout: 60_000 });

  // The eval bar can be switched on during the game.
  const controls = page.getByTestId("bot-controls");
  await expect(page.getByTestId("eval-bar")).toHaveCount(0);
  await controls.getByText("Eval bar").click();
  await expect(page.getByTestId("eval-bar")).toBeVisible();

  // Arrows under the board browse the game; the last arrow returns to it.
  await controls.getByRole("button", { name: "Previous move" }).click();
  await expect(page.getByText(/Move 1\/2/)).toBeVisible();
  await controls.getByRole("button", { name: "Last move" }).click();
  await expect(page.getByText(/· → returns/)).toHaveCount(0);

  await controls.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByTestId("bot-result")).toContainText("You lost");
  expect(errors).toEqual([]);
});

test("Maia: the loading bubble covers the board until Maia is ready, then it plays", async ({ page }) => {
  test.setTimeout(240_000);
  await start(page, "Maia (human-like)");
  await expect(page.getByTestId("maia-loading")).toBeVisible();
  await expect(page.getByTestId("maia-loading")).toHaveCount(0, { timeout: 180_000 });
  await move(page, "e2", "e4");
  await expect(page.getByTestId("bot-move")).toBeVisible({ timeout: 60_000 });
});
