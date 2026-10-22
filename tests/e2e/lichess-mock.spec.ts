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
  // Logged in once, on the first load only, so logging out sticks.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("lichessToken", "fake-token");
  });
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

test("logging out stops the analysis and removes the games from this device", async ({ page }) => {
  await fakeLichess(page);
  await page.goto("/");
  await page.evaluate(() => {
    // A returning user's games, as the app keeps them.
    const games = [
      { id: "li:x1", site: "lichess", url: "", white: "tester", black: "someone", userColor: "w", result: "1-0", date: Date.now(), speed: "rapid", rated: true, sans: ["e4", "e5", "Nf3", "Nc6"] },
    ];
    return new Promise<void>((done) => {
      const q = indexedDB.open("outofbook", 1);
      q.onupgradeneeded = () => {
        q.result.createObjectStore("evals");
        q.result.createObjectStore("kv");
      };
      q.onsuccess = () => {
        const tx = q.result.transaction("kv", "readwrite");
        tx.objectStore("kv").put(games, "lastGames");
        tx.oncomplete = () => (q.result.close(), done());
      };
    });
  });
  await page.reload();
  await expect(page.getByTestId("account-btn").first()).toBeVisible();
  await expect(page.getByTestId("build-metrics").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("account-btn").first().click();
  await expect(page.getByRole("button", { name: /Log in with Lichess/ }).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username" }).first()).toBeVisible();
  await expect(page.getByTestId("build-metrics")).toHaveCount(0);
  const left = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const q = indexedDB.open("outofbook", 1);
        q.onsuccess = () => {
          const c = q.result.transaction("kv").objectStore("kv").count();
          c.onsuccess = () => done(c.result);
        };
      }),
  );
  expect(left).toBe(0);
});
