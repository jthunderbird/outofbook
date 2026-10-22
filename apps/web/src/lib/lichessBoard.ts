// Lichess Board API client: play a real Lichess game from our own board.
// Officially supported for third-party clients (OAuth scope board:play).
// Fair play: the app shows no engine, eval, book or repertoire help while a
// game is in progress (enforced in the UI, see LichessPlay).
const API = "https://lichess.org/api";

export interface GameFull {
  id: string;
  white: { id?: string; name?: string; aiLevel?: number; rating?: number };
  black: { id?: string; name?: string; aiLevel?: number; rating?: number };
  clock?: { initial: number; increment: number };
  speed: string;
  rated: boolean;
  state: GameState;
}
export interface GameState {
  moves: string; // uci, space separated
  wtime: number;
  btime: number;
  status: string; // started, mate, resign, outoftime, draw, aborted, ...
  winner?: "white" | "black";
}
/** The opponent left (gone) or came back; the claim opens after claimWinInSeconds. */
export interface OpponentGone {
  gone: boolean;
  claimWinInSeconds?: number;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

class HttpError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`${what}: HTTP ${status}`);
  }
}

// Lichess sends a keep-alive line every few seconds on its streams, so this
// long a silence means the connection died (a phone asleep, a network change)
// without the browser noticing.
const STALL_MS = 20_000;

/** One NDJSON stream, read line by line until it ends, stalls or is aborted. */
async function readStream(url: string, token: string, what: string, onLine: (o: Record<string, unknown>) => void, signal: AbortSignal) {
  const ac = new AbortController();
  const stop = () => ac.abort();
  signal.addEventListener("abort", stop);
  let timer = setTimeout(stop, STALL_MS);
  const alive = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, STALL_MS);
  };
  try {
    const res = await fetch(url, { headers: auth(token), signal: ac.signal });
    if (!res.ok) throw new HttpError(res.status, what);
    alive();
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      alive();
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) onLine(JSON.parse(line));
      }
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/** Waits `ms`, or less if the page comes back to the foreground or the network returns. */
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const onVis = () => document.visibilityState === "visible" && done();
    const t = setTimeout(done, ms);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}

/**
 * Keeps a Lichess stream open until aborted or `finished()` says it is over:
 * a dropped or stalled connection is opened again at once when the page comes
 * back, else after 1 s, 2 s, 4 s… (at most 10 s; a minute after a 429, as
 * Lichess asks). `onLink` reports whether the stream is up. Only a refused
 * login or a missing game ends it with an error.
 */
async function keepOpen(
  url: string,
  token: string,
  what: string,
  onLine: (o: Record<string, unknown>) => void,
  signal: AbortSignal,
  onLink?: (up: boolean) => void,
  finished: () => boolean = () => false,
) {
  let wait = 1000;
  while (!signal.aborted) {
    try {
      await readStream(
        url,
        token,
        what,
        (o) => {
          wait = 1000;
          onLink?.(true);
          onLine(o);
        },
        signal,
      );
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof HttpError && [400, 401, 403, 404].includes(e.status)) throw e;
      if (e instanceof HttpError && e.status === 429) wait = 60_000;
    }
    if (signal.aborted || finished()) return;
    onLink?.(false);
    await pause(wait, signal);
    wait = Math.min(wait * 2, 10_000);
  }
}

/** Incoming events (gameStart, gameFinish, challenge…). */
export function streamEvents(token: string, onEvent: (e: Record<string, unknown>) => void, signal: AbortSignal, onLink?: (up: boolean) => void) {
  return keepOpen(`${API}/stream/event`, token, "Event stream", onEvent, signal, onLink);
}

/** The game's moves and clocks. Each reconnect starts with a fresh gameFull, so nothing is missed. */
export function streamGame(
  token: string,
  id: string,
  onFull: (g: GameFull) => void,
  onState: (s: GameState) => void,
  onGone: (o: OpponentGone) => void,
  signal: AbortSignal,
  onLink?: (up: boolean) => void,
) {
  let status = "started";
  return keepOpen(
    `${API}/board/game/stream/${id}`,
    token,
    "Game stream",
    (o) => {
      if (o.type === "gameFull") {
        onFull(o as unknown as GameFull);
        status = (o as unknown as GameFull).state.status;
      } else if (o.type === "gameState") {
        onState(o as unknown as GameState);
        status = (o as unknown as GameState).status;
      } else if (o.type === "opponentGone") onGone(o as unknown as OpponentGone);
    },
    signal,
    onLink,
    // Lichess closes the stream once the game is over.
    () => !["created", "started"].includes(status),
  );
}

export async function challengeAi(token: string, level: number, minutes: number, increment: number, color: "white" | "black" | "random") {
  const res = await fetch(`${API}/challenge/ai`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ level: String(level), "clock.limit": String(minutes * 60), "clock.increment": String(increment), color, variant: "standard" }),
  });
  if (!res.ok) throw new Error(`Challenge AI: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).id as string;
}

/**
 * Seek a random opponent (Board API: rapid, classical or correspondence only).
 * Resolves when the seek ends (a game starts or it is cancelled via abort).
 */
export async function seek(token: string, minutes: number, increment: number, rated: boolean, signal: AbortSignal) {
  const res = await fetch(`${API}/board/seek`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ rated: String(rated), time: String(minutes), increment: String(increment), variant: "standard", color: "random" }),
    signal,
  });
  if (!res.ok) throw new Error(`Seek: HTTP ${res.status} ${await res.text()}`);
  await res.text().catch(() => {});
}

/**
 * Challenge a named player (blitz allowed for direct challenges). The request
 * stays open until the challenge is accepted, declined or cancelled (abort).
 */
export async function challengeUser(
  token: string,
  username: string,
  o: { minutes: number; increment: number; rated: boolean; color: "white" | "black" | "random" },
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API}/challenge/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ rated: String(o.rated), "clock.limit": String(o.minutes * 60), "clock.increment": String(o.increment), color: o.color, variant: "standard", keepAliveStream: "true" }),
    signal,
  });
  if (!res.ok) throw new Error(`Challenge: HTTP ${res.status} ${await res.text()}`);
  let result = "sent";
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) result = String((JSON.parse(line) as { done?: string }).done ?? result);
    }
  }
  return result; // "accepted", "declined", "canceled", …
}

export const acceptChallenge = async (token: string, id: string) => {
  const res = await fetch(`${API}/challenge/${id}/accept`, { method: "POST", headers: auth(token) });
  if (!res.ok) throw new Error(`Accept: HTTP ${res.status} ${await res.text()}`);
};
export const declineChallenge = async (token: string, id: string) => {
  await fetch(`${API}/challenge/${id}/decline`, { method: "POST", headers: auth(token) });
};

const post = async (token: string, path: string) => {
  const res = await fetch(`${API}/board/game/${path}`, { method: "POST", headers: auth(token) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
};
/** A move; sent once more if the network dropped the first try (Lichess refuses a duplicate harmlessly). */
export const sendMove = (token: string, id: string, uci: string) =>
  post(token, `${id}/move/${uci}`).catch(async (e) => {
    if (!(e instanceof TypeError)) throw e;
    await new Promise((r) => setTimeout(r, 800));
    // A 400 now most likely means the first try did arrive; the stream shows the move.
    return post(token, `${id}/move/${uci}`).catch((e2) => {
      if (!/HTTP 400/.test(String(e2))) throw e2;
    });
  });
export const resign = (token: string, id: string) => post(token, `${id}/resign`);
export const abort = (token: string, id: string) => post(token, `${id}/abort`);
export const offerDraw = (token: string, id: string) => post(token, `${id}/draw/yes`);
// Only once Lichess says the opponent has been gone long enough (opponentGone event).
export const claimVictory = (token: string, id: string) => post(token, `${id}/claim-victory`);
export const claimDraw = (token: string, id: string) => post(token, `${id}/claim-draw`);

/** The finished game as our RawGame-compatible JSON. */
export async function exportGame(id: string) {
  const res = await fetch(`https://lichess.org/game/export/${id}?moves=true&clocks=false&evals=false&opening=false`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Export: HTTP ${res.status}`);
  return res.json();
}
