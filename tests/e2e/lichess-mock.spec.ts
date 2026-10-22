// Play on Lichess against a fake Lichess: streams that drop must reopen on
// their own, and a game against the AI opens as soon as Lichess answers.
import { expect, test, type Page } from "@playwright/test";
import { nav, pageErrors } from "./helpers";

const FULL = (id: string, status = "started") => ({
  type: "gameFull",
  id,
  white: { id: "tester", name: "tester", rating: 1500 },
  black: { aiLevel: 3 },
  clock: { initial: 600000, increment: 5000 },
  speed: "rapid",
  rated: false,
  state: { type: "gameState", moves: "", wtime: 600000, btime: 600000, status },
});

async function fakeLichess(page: Page) {
  const calls = { events: 0, game: 0 };
  await page.addInitScript(() => localStorage.setItem("lichessToken", "fake-token"));
  await page.route("https://lichess.org/**", async (r) => {
    const url = new URL(r.request().url());
    const p = url.pathname;
    if (p === "/api/token/test") return r.fulfill({ json: { "fake-token": { scopes: "board:play preference:read", userId: "tester" } } });
    if (p === "/api/account") return r.fulfill({ json: { id: "tester", username: "tester" } });
    // Each stream response ends at once: to the app that is a dropped connection.
    if (p === "/api/stream/event") {
      calls.events++;
      return r.fulfill({ contentType: "application/x-ndjson", body: "\n" });
    }
    if (p === "/api/challenge/ai") return r.fulfill({ json: { id: "aigame01" } });
    if (p.startsWith("/api/board/game/stream/")) {
      calls.game++;
      return r.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify(FULL("aigame01")) + "\n" });
    }
    return r.fulfill({ json: {} });
  });
  return calls;
}

test("the event stream reopens after drops, with no error shown", async ({ page }) => {
  const errors = pageErrors(page);
  const calls = await fakeLichess(page);
  await page.goto("/");
  await nav(page, "lichess");
  await expect(page.getByTestId("play-ai")).toBeVisible();
  await expect.poll(() => calls.events, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.getByText(/network error|Event stream/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Play against the AI opens the game at once, and a dropped game stream reconnects", async ({ page }) => {
  const calls = await fakeLichess(page);
  await page.goto("/");
  await nav(page, "lichess");
  await page.getByTestId("play-ai").click();
  await expect(page.getByTestId("live-game")).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId("clock")).toHaveCount(2);
  // Each game stream ends at once: the screen says so while it reopens it.
  await expect(page.getByTestId("reconnecting")).toBeVisible({ timeout: 5_000 });
  await expect.poll(() => calls.game, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});

test("a stream that goes silent (a phone asleep) is dropped after 20 s and reopened", async ({ page }) => {
  test.setTimeout(60_000);
  let events = 0;
  await page.addInitScript(() => localStorage.setItem("lichessToken", "fake-token"));
  await page.route("https://lichess.org/**", async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/token/test") return r.fulfill({ json: { "fake-token": { scopes: "board:play", userId: "tester" } } });
    if (p === "/api/account") return r.fulfill({ json: { id: "tester", username: "tester" } });
    // The first event stream never answers; the second does.
    if (p === "/api/stream/event") return ++events === 1 ? new Promise(() => {}) : r.fulfill({ contentType: "application/x-ndjson", body: "\n" });
    return r.fulfill({ json: {} });
  });
  await page.goto("/");
  await nav(page, "lichess");
  await expect.poll(() => events, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
});
