// Which out-of-book moves count for "Book? Who cares": a strong move with which
// you left the named lines, but not
//  - an early move (before `minMove`): those are mostly move-order tricks and
//    transpositions, not discoveries;
//  - a plain recapture, unless the book itself recaptures on that square and you
//    took back with something else (two pieces that can take back is not news).
import { bookChildren } from "./book";
import { uciParams } from "./chess";
import type { MoveStat } from "./types";

export const moveNumber = (fen: string) => +fen.split(" ")[5] || 1;

export function isRecapture(m: Pick<MoveStat, "uci" | "prevUci" | "fen">) {
  if (!m.prevUci) return false;
  const to = uciParams(m.uci).to;
  if (uciParams(m.prevUci).to !== to) return false;
  const board = m.fen.split(" ")[0];
  // A piece stands on the target square: this move captures it.
  return squareOccupied(board, to);
}

function squareOccupied(placement: string, sq: string) {
  const file = sq.charCodeAt(0) - 97;
  const rank = +sq[1];
  const row = placement.split("/")[8 - rank];
  let f = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) f += +ch;
    else {
      if (f === file) return true;
      f++;
    }
    if (f > file) return false;
  }
  return false;
}

export function whoCaresEligible(m: MoveStat, minMove: number) {
  if (moveNumber(m.fen) < minMove) return false;
  if (isRecapture(m)) {
    const to = uciParams(m.uci).to;
    return bookChildren(m.fen).some((c) => uciParams(c.uci).to === to && c.uci !== m.uci);
  }
  return true;
}
