// Follows a game move by move against the named book: the deepest named line
// reached, and where (and by whom) the game left it or the line ran out.
import { Chess } from "chess.js";
import { BOOK } from "./book";
import { posKey, uciParams } from "./chess";
import { bookStatus } from "./repertoire";
import type { BookStatus, Side } from "./types";

export interface TrackedPly {
  ply: number;
  mover: Side;
  fenBefore: string;
  fenAfter: string;
  fromKey: string;
  toKey: string;
  uci: string;
  san: string;
  book: BookStatus;
}

export interface LineState {
  plies: TrackedPly[];
  name?: [string, string]; // deepest named line reached
  exit?: { ply: number; by: Side; kind: "left" | "exhausted"; san: string };
}

export function trackLine(ucis: string[]): LineState {
  const c = new Chess();
  const plies: TrackedPly[] = [];
  let name: [string, string] | undefined;
  let exit: LineState["exit"];
  for (const [i, uci] of ucis.entries()) {
    const fenBefore = c.fen();
    const mover = c.turn() as Side;
    let san: string;
    try {
      san = c.move(uciParams(uci)).san;
    } catch {
      break;
    }
    const fenAfter = c.fen();
    const fromKey = posKey(fenBefore);
    const toKey = posKey(fenAfter);
    const book = exit ? "after" : bookStatus(fromKey, uci, toKey);
    if (!exit && (book === "left" || book === "exhausted")) exit = { ply: i, by: mover, kind: book, san };
    if (!exit && BOOK[toKey]?.n) name = BOOK[toKey].n;
    plies.push({ ply: i, mover, fenBefore, fenAfter, fromKey, toKey, uci, san, book });
  }
  return { plies, name, exit };
}
