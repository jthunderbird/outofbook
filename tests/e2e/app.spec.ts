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

for (const [w, h] of [
  [412, 915],
  [840, 760],
  [1024, 768],
  [1180, 820],
] as const)
  test(`welcome form fits its panel at ${w}x${h}, with a roomy username box`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const user = page.getByRole("textbox", { name: "Username" }).first();
    await expect(user).toBeVisible();
    const card = (await page.locator(".ui-card", { has: user }).last().boundingBox())!;
    for (const el of await page.locator(".ui-card", { has: user }).last().locator("input, select, button").all()) {
      const b = await el.boundingBox();
      if (!b) continue;
      expect(b.x).toBeGreaterThanOrEqual(card.x);
      expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    }
    expect((await user.boundingBox())!.width).toBeGreaterThan(200);
    await ctx.close();
  });
