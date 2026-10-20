import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { BOOK, bookChildren, bookName } from "../src/book";
import { bookStatus } from "../src/repertoire";
import { posKey, START_FEN } from "../src/chess";

const after = (...sans: string[]) => {
  const c = new Chess();
  sans.forEach((s) => c.move(s));
  return c.fen();
};

describe("book (lichess-org/chess-openings)", () => {
  it("has the full set of named positions", () => expect(Object.keys(BOOK).length).toBe(7983));
  it("names a known line", () => expect(bookName(after("e4", "c6"))).toEqual(["B10", "Caro-Kann Defense"]));
  it("lists the book moves from the start, e4 among them", () => expect(bookChildren(START_FEN).map((c) => c.san)).toContain("e4"));
  it("a transposition reaches the same named position", () => expect(bookName(after("Nf3", "d5", "d4"))).toEqual(bookName(after("d4", "d5", "Nf3"))));
});

describe("bookStatus", () => {
  it("a named move stays in book", () => {
    const from = after("e4");
    expect(bookStatus(posKey(from), "c7c6", posKey(after("e4", "c6")))).toBe("in");
  });
  it("an unnamed move from a book position leaves it", () => {
    const from = after("e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3");
    const c = new Chess(from);
    const m = c.move("Qe8");
    expect(bookStatus(posKey(from), m.from + m.to, posKey(c.fen()))).toBe("left");
  });
});
