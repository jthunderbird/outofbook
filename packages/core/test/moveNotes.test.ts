import { describe, expect, it } from "vitest";
import { betterMoveAvailable, compareText, moveNotes, usualMove, type MoveNoteInput } from "../src/moveNotes";
import { START_FEN } from "../src/chess";
import type { Edge, PosEval, RepNode } from "../src/types";

const edge = (uci: string, san: string, count: number): Edge => ({ uci, san, to: "", count, w: 0, d: 0, b: 0, book: "in" });
const node = (...edges: Edge[]): RepNode => ({ key: START_FEN, fen: START_FEN, count: edges.reduce((n, e) => n + e.count, 0), inBook: true, edges });
const ev = (cp: number, ...pv: string[]): PosEval => ({ depth: 20, source: "engine", lines: [{ cp, pv }] });
// White's first move: the user (White) usually plays e4 (12 games), sometimes d4 (3).
const usualNode = node(edge("e2e4", "e4", 12), edge("d2d4", "d4", 3));
const base: MoveNoteInput = { me: "w", mover: "w", san: "d4", uci: "d2d4", book: "in", leftBook: false, bookSans: [], node: usualNode, thisGame: 0 };
const kinds = (i: Partial<MoveNoteInput>) => moveNotes({ ...base, ...i }).notes.map((n) => n.kind);

describe("usualMove", () => {
  it("is the most played other move, when played at least twice", () => expect(usualMove(usualNode, "d2d4", 0)?.san).toBe("e4"));
  it("is none when this move is the usual one", () => expect(usualMove(usualNode, "e2e4", 0)).toBeUndefined());
  it("leaves this game out of the counts", () => expect(usualMove(node(edge("d2d4", "d4", 3), edge("e2e4", "e4", 3)), "d2d4", 1)?.san).toBe("e4"));
  it("needs two other games", () => expect(usualMove(node(edge("e2e4", "e4", 1), edge("d2d4", "d4", 1)), "d2d4", 1)).toBeUndefined());
});

describe("betterMoveAvailable (the bot page's rule)", () => {
  const o = { timesPlayed: 3, verdict: "excellent" as const, best: { cp: 60, pv: ["e2e4"] }, after: { cp: 40, pv: [] }, playedUci: "d2d4", me: "w" as const };
  it("a repertoire move 0.20 below the best", () => expect(betterMoveAvailable(o)).toBe(true));
  it("not under 0.15", () => expect(betterMoveAvailable({ ...o, after: { cp: 50, pv: [] } })).toBe(false));
  it("always for an okay move", () => expect(betterMoveAvailable({ ...o, verdict: "okay", after: { cp: 55, pv: [] } })).toBe(true));
  it("not for a move played once", () => expect(betterMoveAvailable({ ...o, timesPlayed: 1 })).toBe(false));
  it("not for a mistake (that has its own alert)", () => expect(betterMoveAvailable({ ...o, verdict: "mistake" })).toBe(false));
  it("not when the move is the best", () => expect(betterMoveAvailable({ ...o, playedUci: "e2e4" })).toBe(false));
  it("from Black's side", () => expect(betterMoveAvailable({ ...o, me: "b", best: { cp: -60, pv: ["e7e5"] }, after: { cp: -40, pv: [] }, playedUci: "d7d5" })).toBe(true));
});

describe("compareText", () => {
  it("says how much worse, from the user's side", () =>
    expect(compareText({ cp: 20, pv: [] }, { cp: 60, pv: [] }, "w", "d4", "your usual e4")).toBe("Your eval is 0.40 worse than your usual e4 (d4 +0.20 vs +0.60)."));
  it("Black's point of view flips the sign", () =>
    expect(compareText({ cp: 20, pv: [] }, { cp: 60, pv: [] }, "b", "d5", "your usual e5")).toBe("Your eval is 0.40 better than your usual e5 (d5 -0.20 vs -0.60)."));
});

describe("moveNotes", () => {
  it("off the usual move, with the comparison", () => {
    const r = moveNotes({ ...base, after: ev(20), usualAfter: ev(60) });
    expect(r.offUsual).toBe(true);
    expect(r.notes[0].text).toContain("You usually play e4 here (12×); you played d4 (3× before). Your eval is 0.40 worse");
  });
  it("leaving the book comes first and lists the book's moves", () => {
    const r = moveNotes({ ...base, uci: "a2a3", san: "a3", book: "left", leftBook: true, bookSans: ["e4", "d4"] });
    expect(r.notes[0]).toMatchObject({ kind: "left-book", tone: "bad" });
    expect(r.notes[0].text).toContain("Book: e4, d4.");
  });
  it("the opponent leaving the book is a warning", () => expect(kinds({ mover: "b", leftBook: true })[0]).toBe("opp-left-book"));
  it("a bad move names the engine's move", () => {
    const r = moveNotes({ ...base, uci: "e2e4", san: "e4", verdict: "mistake", before: ev(80, "d2d4"), after: ev(-40), bestSan: "d4" });
    expect(r.bad).toBe(true);
    expect(r.notes[0].text).toBe("e4 (you have played it 12× here before). Best was d4, 1.20 pawns better.");
  });
  it("better move available on the usual move", () => {
    const r = moveNotes({ ...base, uci: "e2e4", san: "e4", verdict: "excellent", before: ev(60, "d2d4"), after: ev(35), bestSan: "d4" });
    expect(r.better).toBe(true);
    expect(r.notes.map((n) => n.kind)).toEqual(["better"]);
  });
  it("a new move off the usual one is one note", () => expect(kinds({ uci: "c2c4", san: "c4" })).toEqual(["off-usual"]));
  it("a new move where there is no usual one", () => expect(kinds({ node: node(edge("e2e4", "e4", 1), edge("d2d4", "d4", 1)), uci: "c2c4", san: "c4" })).toEqual(["new-move"]));
  it("only this game reached the position", () => expect(kinds({ node: node(edge("d2d4", "d4", 1)), thisGame: 1 })).toEqual(["unreached"]));
  it("an opponent's surprise names their usual reply", () => {
    const r = moveNotes({ ...base, mover: "b", node: node(edge("e7e5", "e5", 8), edge("c7c5", "c5", 2)), uci: "a7a6", san: "a6" });
    expect(r.notes[0]).toMatchObject({ kind: "opp-new", text: "Your opponents never played a6 here; they usually play e5 (80%)." });
  });
  it("an opponent's known move gives how often", () =>
    expect(moveNotes({ ...base, mover: "b", node: node(edge("e7e5", "e5", 8), edge("c7c5", "c5", 2)), uci: "c7c5", san: "c5" }).notes[0].text).toBe("Your opponents chose c5 2× here (20%)."));
  it("opponents' moves are never flagged as off your usual", () => expect(moveNotes({ ...base, mover: "b" }).offUsual).toBe(false));
});
