// A new user's first analysis: the note that it only happens once.
import { expect, test } from "@playwright/test";
import { analyzed, games300, hasGames, seedGames } from "./helpers";

test.skip(!hasGames, "needs packages/core/test/fixtures/local/games300.json");

test("a first analysis says it only happens the first time, with the time left", async ({ page }) => {
  // A new user: no shared evals on the server, none from the Lichess cloud.
  await page.route("**/api/evals/get", (r) => r.fulfill({ json: {} }));
  await page.route("https://lichess.org/api/cloud-eval**", (r) => r.fulfill({ status: 404, json: {} }));
  await seedGames(page, games300());
  const note = page.getByTestId("first-analysis");
  await expect(note).toContainText("Only the first time", { timeout: 60_000 });
  await expect(note).toContainText(/minute/, { timeout: 60_000 });
  // Ten minutes' work on this host: stop at the note, the rest is the existing flow.
});

test("a returning user, whose evals the server has, gets no such note", async ({ page }) => {
  await seedGames(page, games300());
  await analyzed(page);
  await expect(page.getByTestId("first-analysis")).toHaveCount(0);
});
