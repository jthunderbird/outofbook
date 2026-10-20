// Small chess helpers. Win-percentage, material and sacrifice logic ported from
// Chesskit (GPL-3.0, src/lib/chess.ts, src/lib/engine/helpers/winPercentage.ts),
// which takes the win-percentage curve from Lichess.
import { Chess, type PieceSymbol } from "chess.js";
import type { Line } from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Position key: FEN without the move counters, so transpositions merge. */
export const posKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

export const uciParams = (uci: string) => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci.length > 4 ? uci[4] : undefined,
});

/**
 * Lichess's cloud eval writes castling as king-takes-rook (e1h1, the Chess960
 * form); chess.js, the engine and our games use king-two-squares (e1g1).
 * Rewrites a PV to the standard form. `fen` may lack the move counters.
 */
export function standardPv(fen: string, pv: string[]): string[] {
  if (!pv.some((u) => /^e[18][ah][18]$/.test(u))) return pv;
  try {
    const c = new Chess(fen.split(" ").length < 6 ? `${fen} 0 1` : fen);
    return pv.map((u) => {
      const from = u.slice(0, 2),
        to = u.slice(2, 4);
      const p = c.get(from as never),
        target = c.get(to as never);
      let v = u;
      if (p?.type === "k" && target?.type === "r" && target.color === p.color) v = from + (to[0] === "h" ? "g" : "c") + to[1];
      try {
        c.move(uciParams(v));
      } catch {
        /* rest of the PV kept as is */
      }
      return v;
    });
  } catch {
    return pv;
  }
}

export const uciToSan = (fen: string, uci: string): string => {
  try {
    return new Chess(fen).move(uciParams(uci)).san;
  } catch {
    return uci;
  }
};

export const winPctFromCp = (cp: number) => {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
};

export const lineWinPct = (l: { cp?: number; mate?: number }) => (l.cp !== undefined ? winPctFromCp(l.cp) : l.mate !== undefined ? (l.mate > 0 ? 100 : 0) : 50);

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const materialDiff = (fen: string) =>
  new Chess(fen)
    .board()
    .flat()
    .reduce((acc, sq) => (sq ? acc + (sq.color === "w" ? 1 : -1) * PIECE_VALUE[sq.type] : acc), 0);

export const isSimplePieceRecapture = (fenTwoAgo: string, ucis: [string, string]) => {
  const [a, b] = ucis.map(uciParams);
  if (a.to !== b.to) return false;
  return !!new Chess(fenTwoAgo).get(a.to as never);
};

export const isPieceSacrifice = (fen: string, played: string, bestPv: string[]) => {
  if (!bestPv.length) return false;
  const game = new Chess(fen);
  const whiteToPlay = game.turn() === "w";
  const start = materialDiff(fen);
  let moves = [played, ...bestPv];
  if (moves.length % 2 === 1) moves = moves.slice(0, -1);
  let quiet = 1;
  const captured: Record<"w" | "b", PieceSymbol[]> = { w: [], b: [] };
  for (const m of moves) {
    try {
      const full = game.move(uciParams(m));
      if (full.captured) {
        captured[full.color].push(full.captured);
        quiet = 1;
      } else if (--quiet < 0) break;
    } catch {
      return false;
    }
  }
  for (const p of captured.w.slice()) {
    const i = captured.b.indexOf(p);
    if (i >= 0) {
      captured.b.splice(i, 1);
      captured.w.splice(captured.w.indexOf(p), 1);
    }
  }
  if (Math.abs(captured.w.length - captured.b.length) <= 1 && [...captured.w, ...captured.b].every((p) => p === "p")) return false;
  const diff = materialDiff(game.fen()) - start;
  return (whiteToPlay ? diff : -diff) < 0;
};

export const fmtEval = (l?: Line | { cp?: number; mate?: number }) => (!l ? "" : l.mate !== undefined ? `#${l.mate}` : l.cp !== undefined ? (l.cp / 100).toFixed(2) : "");

/** Move-number label for the move at ply index `ply` (0 = White's first move): "5. e4" or "5… Nxd4". */
export const plyLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? "." : "…"} ${san}`;

/** UCI principal variation to SAN, stopping at the first illegal move. */
export const pvToSan = (fen: string, pv: string[], max = 8) => {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move(uciParams(u)).san);
    } catch {
      break;
    }
  }
  return out;
};
