// The Play app (a TWA opening the site at /?app=android) works with no connection:
// the service worker downloads the app, the lite engine and Maia up front.
// Production builds only (the dev server has no service worker): run with
// E2E_BASE_URL set to a production deployment.
import { expect, test } from "@playwright/test";
import { move, nav, pageErrors } from "./helpers";

test.skip(!process.env.E2E_BASE_URL, "needs a production build (E2E_BASE_URL)");

test("offline: the Android app opens and plays Maia and Stockfish with no connection", async ({ page, context }) => {
  test.setTimeout(400_000);
  const errors = pageErrors(page);
  await page.goto("/?app=android");
  // Wait until the service worker reports everything downloaded.
  const files = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        navigator.serviceWorker.addEventListener("message", (e) => e.data?.type === "precached" && resolve(e.data.files));
        navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "precache" }));
      }),
  );
  expect(files).toBeGreaterThan(20);

  await context.setOffline(true);
  await page.reload();
  for (const engine of ["Maia (human-like)", "Stockfish"]) {
    await page.reload(); // still offline: the app comes from the service worker each time
    await nav(page, "play");
    await page.getByRole("radio", { name: "White", exact: true }).click();
    await page.getByRole("radio", { name: engine }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await expect(page.getByTestId("maia-loading")).toHaveCount(0, { timeout: 180_000 });
    await move(page, "e2", "e4");
    await expect(page.getByTestId("bot-move")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("bot-controls").getByRole("button", { name: "Resign" }).click();
    await expect(page.getByTestId("bot-result")).toContainText("You lost");
  }
  expect(errors).toEqual([]);
});
