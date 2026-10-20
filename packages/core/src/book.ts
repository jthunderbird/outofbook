// Named-opening book (lichess-org/chess-openings) for browsing: children of a
// position, line names, and how many named lines lie below a position.
import { Chess } from "chess.js";
import bookData from "./data/book.json";
import { posKey, uciParams } from "./chess";

type BookNode = { n?: [string, string]; c: Record<string, string> };
export const BOOK = bookData as unknown as Record<string, BookNode>;

export interface BookChild {
  uci: string;
  san: string;
  fen: string;
  key: string;
  name?: string;
  eco?: string;
  namedBelow: number;
}

const below = new Map<string, number>();
export function namedBelow(key: string, seen = new Set<string>()): number {
  const hit = below.get(key);
  if (hit !== undefined) return hit;
  if (seen.has(key)) return 0;
  seen.add(key);
  const n = BOOK[key];
  if (!n) return 0;
  let total = 0;
  for (const k of Object.values(n.c)) total += (BOOK[k]?.n ? 1 : 0) + namedBelow(k, seen);
  below.set(key, total);
  return total;
}

export function bookChildren(fen: string): BookChild[] {
  const node = BOOK[posKey(fen)];
  if (!node) return [];
  return Object.keys(node.c).map((uci) => {
    const c = new Chess(fen);
    const m = c.move(uciParams(uci));
    const key = posKey(c.fen());
    const n = BOOK[key]?.n;
    return { uci, san: m.san, fen: c.fen(), key, name: n?.[1], eco: n?.[0], namedBelow: namedBelow(key) };
  });
}

export const bookName = (fen: string) => BOOK[posKey(fen)]?.n;

export interface Step {
  uci: string;
  san: string;
  fen: string; // after the move
}

/**
 * The main named line from a position: follow the book move with the most named
 * lines below it until the book ends. Returns the steps and the deepest name.
 */
export function bookMainLine(fen: string, maxPlies = 20): { steps: Step[]; name?: [string, string] } {
  const steps: Step[] = [];
  let name = BOOK[posKey(fen)]?.n;
  let cur = fen;
  const seen = new Set<string>();
  while (steps.length < maxPlies) {
    const kids = bookChildren(cur);
    if (!kids.length) break;
    const next = kids.sort((a, b) => b.namedBelow + (b.name ? 1 : 0) - (a.namedBelow + (a.name ? 1 : 0)))[0];
    if (seen.has(next.key)) break;
    seen.add(next.key);
    steps.push({ uci: next.uci, san: next.san, fen: next.fen });
    if (next.name) name = [next.eco!, next.name];
    cur = next.fen;
  }
  return { steps, name };
}
