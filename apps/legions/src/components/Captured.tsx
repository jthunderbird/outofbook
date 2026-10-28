// What a side has taken, and by how much it is ahead in material: the taken
// pieces as icons (pawns first, as Lichess shows them), then "+N".
import type { Side } from "@outofbook/legions/figures";
import { PieceIcon } from "./PieceIcon";

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ["p", "n", "b", "r", "q"] as const;

/** Pieces of each kind still on the board, per side, from a FEN. */
function onBoard(fen: string) {
  const n: Record<Side, Record<string, number>> = { w: {}, b: {} };
  for (const c of fen.split(" ")[0]) {
    if (!/[a-z]/i.test(c)) continue;
    const side: Side = c === c.toUpperCase() ? "w" : "b";
    const k = c.toLowerCase();
    n[side][k] = (n[side][k] ?? 0) + 1;
  }
  return n;
}

export function Captured({ fen, side }: { fen: string; side: Side }) {
  const n = onBoard(fen);
  const them: Side = side === "w" ? "b" : "w";
  // Promotions can leave more of a kind than the start: never below zero taken.
  const taken = ORDER.flatMap((k) => Array<string>(Math.max(0, START[k] - (n[them][k] ?? 0))).fill(k));
  const material = (s: Side) => ORDER.reduce((t, k) => t + (n[s][k] ?? 0) * VALUE[k], 0);
  const lead = material(side) - material(them);
  return (
    <div className="captured" aria-label={`Taken: ${taken.join(" ") || "nothing"}`}>
      {taken.map((k, i) => (
        <span key={i} className={i > 0 && taken[i - 1] === k ? "stack" : ""}>
          <PieceIcon kind={k as "p"} side={them} />
        </span>
      ))}
      {lead > 0 && <span className="lead">+{lead}</span>}
    </div>
  );
}
