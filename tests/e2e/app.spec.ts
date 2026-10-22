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

test("logos: the header logo, the large logo while no games are loaded, and the favicon @phone", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("img[alt=OutOfBook]:visible").first()).toBeVisible();
  const welcome = page.getByTestId("welcome-logo").locator("img:visible");
  await expect(welcome).toBeVisible();
  expect((await welcome.boundingBox())!.height).toBeGreaterThan(200);
  // The image matches the theme: the light page shows the dark-ink logo.
  // (The theme toggle is in the header on desktop; on a phone it is in the menu.)
  const light = page.getByRole("radio", { name: "Light" }).first();
  if (await light.isVisible()) {
    await light.click();
    await expect(page.getByTestId("welcome-logo").locator("img:visible")).toHaveAttribute("src", /light/);
  }
  for (const path of ["/favicon.ico", "/favicon-32.png", "/apple-touch-icon.png", "/site.webmanifest", "/brand/web-horizontal.png"]) expect((await request.get(path)).ok(), path).toBe(true);
});
