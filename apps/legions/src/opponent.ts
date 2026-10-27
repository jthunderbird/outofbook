// The opponent (Maia at a rating, sampling among the moves a player of that
// rating would make, like a human) and the hint engine (Stockfish lite).
import { Maia } from "@outofbook/engines/maia";
import { EnginePool } from "@outofbook/engines/engine";

export type MaiaStatus = { state: "loading" | "downloading" | "ready" | "error"; progress: number };

let maia: Maia | null = null;
let status: MaiaStatus = { state: "loading", progress: 0 };
const watchers = new Set<(s: MaiaStatus) => void>();

/** The one Maia for the app, started on first use; watch follows its loading. */
export function getMaia(watch?: (s: MaiaStatus) => void) {
  if (watch) {
    watchers.add(watch);
    watch(status);
  }
  maia ??= new Maia((s, progress) => {
    status = { state: s === "no-cache" ? "downloading" : s, progress };
    watchers.forEach((w) => w(status));
  });
  return maia;
}
export const unwatchMaia = (watch: (s: MaiaStatus) => void) => watchers.delete(watch);

function pick(moves: [string, number][]) {
  const total = moves.reduce((s, [, p]) => s + p, 0);
  let r = Math.random() * total;
  for (const [m, p] of moves) if ((r -= p) <= 0) return m;
  return moves[0][0];
}

/** Maia's move at elo, against a player of playerElo. */
export async function maiaMove(fen: string, elo: number, playerElo: number) {
  const { policy } = await getMaia().predict(fen, elo, playerElo);
  const plausible = policy.filter(([, p]) => p >= 0.05);
  return pick(plausible.length ? plausible : policy.slice(0, 1));
}

let pool: EnginePool | null = null;
/** The best move here (Stockfish lite, a short search). */
export async function bestMove(fen: string) {
  pool ??= new EnginePool(1);
  const ev = await pool.analyze(fen, 14, 1);
  return ev.lines[0]?.pv[0] ?? null;
}
