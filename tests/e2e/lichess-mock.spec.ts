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

async function fakeLichess(page: Page, opts: { finishAfter?: number; games?: object[] } = {}) {
  const calls = { events: 0, game: 0, account: 0, seeks: [] as string[] };
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
    if (p === "/api/account") {
      calls.account++;
      // The rapid rating goes up once a game has finished.
      const rapid = opts.finishAfter && calls.events > opts.finishAfter ? 1512 : 1500;
      return r.fulfill({ json: { id: "tester", username: "tester", perfs: { rapid: { rating: rapid, games: 20 }, classical: { rating: 1600, games: 3, prov: true } } } });
    }
    if (p === "/api/account/preferences") return r.fulfill({ json: { prefs: { premove: false, soundSet: "piano", autoQueen: 3, clockTenths: 2, animation: 0, rookCastle: 0, ratings: 2 } } });
    // Each stream response ends at once: to the app that is a dropped connection.
    if (p === "/api/stream/event") {
      calls.events++;
      const finish = opts.finishAfter !== undefined && calls.events === opts.finishAfter + 1;
      return r.fulfill({ contentType: "application/x-ndjson", body: finish ? JSON.stringify({ type: "gameFinish", game: { id: "x" } }) + "\n" : "\n" });
    }
    if (p === "/api/challenge/ai") return r.fulfill({ json: { id: "aigame01" } });
    if (p === "/api/games/user/tester") return r.fulfill({ contentType: "application/x-ndjson", body: (opts.games ?? []).map((g) => JSON.stringify(g) + "\n").join("") });
    // A seek stays open until a game starts or it is cancelled.
    if (p === "/api/board/seek") {
      calls.seeks.push(r.request().postData() ?? "");
      return;
    }
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

test("ratings: rapid and classical above the game types, updated when a game ends", async ({ page }) => {
  await fakeLichess(page, { finishAfter: 3 });
  await page.goto("/");
  await nav(page, "lichess");
  const ratings = page.getByTestId("ratings");
  await expect(ratings).toContainText(/rapid\s*1500/i);
  await expect(ratings).toContainText(/classical\s*1600\?/i);
  // The fourth event stream (a few seconds in) carries a gameFinish; the ratings are read again.
  await expect(ratings).toContainText(/rapid\s*1512/i, { timeout: 30_000 });
});

test("Lichess settings: imported ones are shown and locked; set here, they are editable and kept apart", async ({ page }) => {
  await fakeLichess(page);
  await page.goto("/");
  await nav(page, "lichess");
  const box = page.getByTestId("lichess-settings");
  const sound = box.getByRole("combobox", { name: "Sound" });
  await expect(sound).toHaveValue("piano");
  await expect(sound).toBeDisabled();
  await expect(box.getByRole("switch", { name: /Premoves/ })).not.toBeChecked();
  await expect(box.getByRole("switch", { name: /Premoves/ })).toBeDisabled();
  // Set here instead: starts from the imported values, now editable.
  await box.getByRole("switch", { name: /Import from my Lichess account/ }).click();
  await expect(sound).toBeEnabled();
  await expect(sound).toHaveValue("piano");
  await sound.selectOption("robot");
  await box.getByRole("switch", { name: /Premoves/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("liveSettings") ?? "{}"));
  expect(saved).toMatchObject({ useLichessPrefs: false, lichess: { soundSet: "robot", premove: true } });
  // Back to importing: the account's values again, locked.
  await box.getByRole("switch", { name: /Import from my Lichess account/ }).click();
  await expect(sound).toHaveValue("piano");
  await expect(sound).toBeDisabled();
  // Our own settings are a separate panel.
  await expect(page.getByTestId("oob-settings").getByRole("switch", { name: /Multiple premoves/ })).toBeEnabled();
});

/** The board image every board gets ("" for OutOfBook's own), and the piece-set rules. */
const look = (page: Page) =>
  page.evaluate(() => ({
    board: getComputedStyle(document.documentElement).getPropertyValue("--board-image") || "ours",
    pieces: document.getElementById("piece-set")?.textContent ?? "",
  }));

test("board look: Lichess's default brown shows as OutOfBook blue; another imported board and piece set show; our board choice wins", async ({ page }) => {
  let theme = "brown";
  await page.addInitScript(() => localStorage.setItem("lichessToken", "fake-token"));
  await page.route("https://lichess.org/**", async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/token/test") return r.fulfill({ json: { "fake-token": { scopes: "board:play preference:read", userId: "tester" } } });
    if (p === "/api/account") return r.fulfill({ json: { id: "tester", username: "tester" } });
    if (p === "/api/account/preferences") return r.fulfill({ json: { prefs: { theme, pieceSet: "merida" } } });
    if (p === "/api/stream/event") return r.fulfill({ contentType: "application/x-ndjson", body: "\n" });
    return r.fulfill({ json: {} });
  });
  await page.goto("/");
  await nav(page, "lichess");
  await expect.poll(async () => (await look(page)).pieces).toContain("/piece/merida/wK.svg");
  expect((await look(page)).board).toBe("ours");
  theme = "wood4";
  await page.reload();
  await nav(page, "lichess");
  await expect.poll(async () => (await look(page)).board).toContain("/images/board/wood4.jpg");
  // Our own board setting takes precedence over the imported one.
  await page.getByTestId("board-choice").selectOption("green");
  await expect.poll(async () => (await look(page)).board).toContain("/images/board/green.png");
  await page.getByTestId("board-choice").selectOption("outofbook");
  await expect.poll(async () => (await look(page)).board).toBe("ours");
  // The look holds on other boards and after a reload.
  await page.getByTestId("board-choice").selectOption("blue3");
  await page.reload();
  await nav(page, "play");
  await expect.poll(async () => (await look(page)).board).toContain("/images/board/blue3.jpg");
  expect(
    await page
      .locator("cg-board")
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundImage),
  ).toContain("blue3.jpg");
});

test("quick play seeks the last rapid or classical game's type against a person", async ({ page }) => {
  const calls = await fakeLichess(page, {
    games: [
      { id: "g1", rated: false, variant: "standard", clock: { initial: 600, increment: 5 }, players: { white: { user: { id: "tester" } }, black: { aiLevel: 4 } } },
      { id: "g2", rated: true, variant: "standard", clock: { initial: 900, increment: 10 }, players: { white: { user: { id: "tester" } }, black: { user: { id: "someone" } } } },
    ],
  });
  await page.goto("/");
  const quick = page.locator("[data-testid=quick-play]:visible");
  await expect(quick).toHaveText(/15\+10 rated/);
  // The button itself seeks, on the page the user is on, and cancels on a second press.
  await quick.click();
  await expect(quick).toHaveAttribute("data-seeking", "");
  await expect(quick).toContainText("15+10 · cancel");
  await expect(page.getByTestId("play-ai")).toBeHidden();
  await expect.poll(() => calls.seeks.length).toBe(1);
  const body = new URLSearchParams(calls.seeks[0]);
  expect([body.get("time"), body.get("increment"), body.get("rated")]).toEqual(["15", "10", "true"]);
  await quick.click();
  await expect(quick).not.toHaveAttribute("data-seeking");
  await expect(quick).toHaveText(/15\+10 rated/);
});

test("quick play defaults to 10+0 casual with no last game", async ({ page }) => {
  const calls = await fakeLichess(page);
  await page.goto("/");
  const quick = page.locator("[data-testid=quick-play]:visible");
  await expect(quick).toHaveText(/10\+0 casual/);
  await quick.click();
  await expect.poll(() => calls.seeks.length).toBe(1);
  const body = new URLSearchParams(calls.seeks[0]);
  expect([body.get("time"), body.get("increment"), body.get("rated")]).toEqual(["10", "0", "false"]);
});

for (const width of [280, 412])
  test(`quick play fits the title bar at ${width} px, so the page never runs wider than the screen`, async ({ page }) => {
    await fakeLichess(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator("[data-testid=quick-play]:visible")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
