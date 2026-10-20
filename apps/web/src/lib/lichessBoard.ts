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

/** Reads an NDJSON stream line by line until aborted. */
async function ndjson(res: Response, onLine: (o: Record<string, unknown>) => void, signal?: AbortSignal) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onLine(JSON.parse(line));
    }
  }
}

/** Incoming events (gameStart, gameFinish, challenge…). */
export async function streamEvents(token: string, onEvent: (e: Record<string, unknown>) => void, signal: AbortSignal) {
  const res = await fetch(`${API}/stream/event`, { headers: auth(token), signal });
  if (!res.ok) throw new Error(`Event stream: HTTP ${res.status}`);
  await ndjson(res, onEvent, signal);
}

export async function streamGame(token: string, id: string, onFull: (g: GameFull) => void, onState: (s: GameState) => void, onGone: (o: OpponentGone) => void, signal: AbortSignal) {
  const res = await fetch(`${API}/board/game/stream/${id}`, { headers: auth(token), signal });
  if (!res.ok) throw new Error(`Game stream: HTTP ${res.status}`);
  await ndjson(
    res,
    (o) => {
      if (o.type === "gameFull") onFull(o as unknown as GameFull);
      else if (o.type === "gameState") onState(o as unknown as GameState);
      else if (o.type === "opponentGone") onGone(o as unknown as OpponentGone);
    },
    signal,
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
  await ndjson(res, (o2) => (result = String((o2 as { done?: string }).done ?? result)), signal);
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
export const sendMove = (token: string, id: string, uci: string) => post(token, `${id}/move/${uci}`);
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
