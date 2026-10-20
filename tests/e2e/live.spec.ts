// The live Lichess game screen, through its offline demo.
import { expect, test, type Page } from "@playwright/test";
import { move, nav, pageErrors } from "./helpers";

async function openDemo(page: Page) {
  await nav(page, "lichess");
  await page.getByTestId("live-demo").first().click();
  await expect(page.getByTestId("live-game")).toBeVisible();
}

test("demo: move, opponent leaves, claim the win @phone", async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto("/");
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
  await page.goto("/");
  await openDemo(page);
  await move(page, "e2", "e4");
  // The opponent's reply starts our clock: it drops below 1:00.
  await expect(page.getByTestId("clock").last()).not.toHaveText("1:00", { timeout: 15_000 });
});

test("demo: the clocks and buttons switch sides, and the choice is kept", async ({ page }) => {
  await page.goto("/");
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
