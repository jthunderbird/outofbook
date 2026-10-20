import { expect, test } from "@playwright/test";
import { pageErrors } from "./helpers";

test("loads cross-origin isolated, with the import panel and no errors @phone", async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Load games" }).last()).toBeVisible();
  // COOP/COEP: needed for SharedArrayBuffer (engines).
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(errors).toEqual([]);
});

test("the API is up", async ({ request }) => {
  expect((await request.get("/api/health")).ok()).toBe(true);
});
