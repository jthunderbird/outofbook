// Server as the source of truth, browser copy first (needs DEV_AUTH=1 on the API).
import { expect, test, type Browser } from "@playwright/test";
import { analyzed, games300, hasGames } from "./helpers";

const user = `e2e${Date.now()}`;
const H = { "x-dev-user": user };

test.skip(!hasGames, "needs packages/core/test/fixtures/local/games300.json");

test.beforeAll(async ({ request }) => {
  test.skip((await request.get("/api/me", { headers: H })).status() === 401, "the API runs without DEV_AUTH=1");
  // 150 games: under the normal 200-game limit.
  expect((await request.put("/api/games", { headers: H, data: games300().slice(0, 150) })).ok()).toBe(true);
});

/** A fresh browser profile logged in as the test user: a "new device". */
async function device(browser: Browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript((u) => localStorage.setItem("devUser", u), user);
  return ctx;
}
const modelSource = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __oob: { model: { source: string; ms: number } } }).__oob.model);

test("first device builds the model; another device gets it from the server; a refresh uses the browser copy", async ({ browser, request }) => {
  const first = await device(browser);
  const p1 = await first.newPage();
  await p1.goto("/");
  await analyzed(p1);
  expect((await modelSource(p1)).source).toBe("built");
  await expect(p1.getByTestId("build-metrics").first()).toContainText("150 games");
  // The upload happens after the build; wait for it.
  await expect.poll(async () => (await request.get("/api/model", { headers: H })).status(), { timeout: 30_000 }).toBe(200);

  const second = await device(browser);
  const p2 = await second.newPage();
  await p2.goto("/");
  await analyzed(p2);
  expect((await modelSource(p2)).source).toBe("server");

  await p2.reload();
  await analyzed(p2);
  const m = await modelSource(p2);
  expect(m.source).toBe("browser");
  expect(m.ms).toBeLessThan(1000);
  await first.close();
  await second.close();
});
