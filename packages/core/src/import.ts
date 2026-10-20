// Game import straight from the browser: Lichess NDJSON stream and chess.com
// monthly archives. Both sites allow CORS, so no server is involved.
import type { RawGame } from "./types";

export interface ImportFilters {
  site: "lichess" | "chesscom";
  username: string;
  max: number;
  since?: number; // ms epoch
  speeds: string[]; // bullet, blitz, rapid, classical, correspondence
  rated: "all" | "rated" | "casual";
}

export interface ImportProgress {
  games: number;
  ms: number;
  done: boolean;
}

const lichessResult = (g: { winner?: string; status: string }): RawGame["result"] =>
  g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : ["draw", "stalemate"].includes(g.status) || !g.winner ? "1/2-1/2" : "*";

export async function importLichess(f: ImportFilters, token: string | null, onGames: (batch: RawGame[], p: ImportProgress) => void, signal?: AbortSignal) {
  const q = new URLSearchParams({
    max: String(f.max),
    moves: "true",
    evals: "true",
    opening: "false",
    clocks: "false",
    pgnInJson: "false",
  });
  if (f.since) q.set("since", String(f.since));
  if (f.speeds.length) q.set("perfType", f.speeds.join(","));
  if (f.rated !== "all") q.set("rated", String(f.rated === "rated"));
  const headers: Record<string, string> = { Accept: "application/x-ndjson" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = performance.now();
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(f.username)}?${q}`, { headers, signal });
  if (!res.ok) throw new Error(`Lichess export failed: HTTP ${res.status}`);
  const user = f.username.toLowerCase();
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let count = 0;
  let batch: RawGame[] = [];
  const flush = (done: boolean) => {
    onGames(batch, { games: count, ms: performance.now() - t0, done });
    batch = [];
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const g = JSON.parse(line);
      if (g.variant !== "standard" || !g.moves) continue;
      const white = g.players.white.user?.name ?? "AI";
      const black = g.players.black.user?.name ?? "AI";
      batch.push({
        id: `li:${g.id}`,
        site: "lichess",
        url: `https://lichess.org/${g.id}`,
        white,
        black,
        userColor: white.toLowerCase() === user ? "w" : "b",
        result: lichessResult(g),
        date: g.createdAt,
        speed: g.speed,
        rated: g.rated,
        sans: g.moves.split(" "),
        evals: g.analysis?.map((a: { eval?: number; mate?: number }) => (a.eval !== undefined ? { cp: a.eval } : a.mate !== undefined ? { mate: a.mate } : null)),
      });
      count++;
      if (batch.length >= 10) flush(false);
    }
  }
  flush(true);
}

// chess.com: newest archive first until `max` games are collected.
const PGN_TAG = /^\[(\w+) "(.*)"\]$/gm;
const sansFromPgn = (pgn: string) =>
  pgn
    .replace(/^\[.*\]$/gm, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\$\d+/g, "")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const chesscomSpeed = (tc: string) => {
  if (tc.includes("/")) return "correspondence";
  const [base, inc] = tc.split("+").map(Number);
  const total = base + 40 * (inc || 0);
  return total < 180 ? "bullet" : total < 480 ? "blitz" : total < 1500 ? "rapid" : "classical";
};

export async function importChessCom(f: ImportFilters, onGames: (batch: RawGame[], p: ImportProgress) => void, signal?: AbortSignal) {
  const t0 = performance.now();
  const user = f.username.toLowerCase();
  const arch = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`, { signal });
  if (!arch.ok) throw new Error(`chess.com archives failed: HTTP ${arch.status}`);
  const urls: string[] = (await arch.json()).archives.reverse();
  let count = 0;
  for (const url of urls) {
    if (count >= f.max) break;
    const month = await (await fetch(url, { signal })).json();
    const games = (month.games as { pgn?: string; rules: string; url: string; time_class: string; rated: boolean; end_time: number; white: { username: string }; black: { username: string } }[])
      .filter((g) => g.rules === "chess" && g.pgn)
      .reverse();
    const batch: RawGame[] = [];
    for (const g of games) {
      if (count >= f.max) break;
      if (f.since && g.end_time * 1000 < f.since) {
        count = f.max; // archives are chronological; stop
        break;
      }
      const speed = g.time_class === "daily" ? "correspondence" : g.time_class;
      if (f.speeds.length && !f.speeds.includes(speed)) continue;
      if (f.rated !== "all" && g.rated !== (f.rated === "rated")) continue;
      const tags: Record<string, string> = {};
      for (const m of g.pgn!.matchAll(PGN_TAG)) tags[m[1]] = m[2];
      batch.push({
        id: `cc:${g.url.split("/").pop()}`,
        site: "chesscom",
        url: g.url,
        white: g.white.username,
        black: g.black.username,
        userColor: g.white.username.toLowerCase() === user ? "w" : "b",
        result: (tags.Result as RawGame["result"]) ?? "*",
        date: g.end_time * 1000,
        speed: speed || chesscomSpeed(tags.TimeControl ?? ""),
        rated: g.rated,
        sans: sansFromPgn(g.pgn!),
      });
      count++;
    }
    onGames(batch, { games: count, ms: performance.now() - t0, done: false });
  }
  onGames([], { games: count, ms: performance.now() - t0, done: true });
}
