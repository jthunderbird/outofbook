import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { isRecapture, whoCaresEligible } from "../src/whoCares";
import { trackLine } from "../src/lineTracker";
import type { MoveStat } from "../src/types";

/** A MoveStat for the last of `sans`, as the repertoire builder records it. */
function stat(sans: string[]): MoveStat {
  const c = new Chess();
  sans.slice(0, -2).forEach((s) => c.move(s));
  const prev = c.move(sans[sans.length - 2]);
  const fen = c.fen();
  const m = c.move(sans[sans.length - 1]);
  return {
    id: "x",
    color: "w",
    fromKey: "",
    fen,
    uci: m.from + m.to,
    san: m.san,
    toKey: "",
    toFen: c.fen(),
    count: 1,
    gameIds: [],
    book: "left",
    opening: "",
    ply: sans.length - 1,
    prevUci: prev.from + prev.to,
  };
}

describe("who cares", () => {
  it("an early move does not count", () => expect(whoCaresEligible(stat(["e4", "e5", "Nf3", "Nc6", "Bc4"]), 5)).toBe(false));
  it("a later move counts", () => expect(whoCaresEligible(stat(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Be7", "O-O", "O-O", "Re1"]), 5)).toBe(true));
  it("taking back on the square just captured on is a recapture", () => expect(isRecapture(stat(["e4", "d5", "exd5", "Qxd5"]))).toBe(true));
  it("a capture elsewhere is not", () => expect(isRecapture(stat(["e4", "d5", "Nc3", "Nf6", "exd5"]))).toBe(false));
});

describe("trackLine", () => {
  it("names the line and stays in book", () => {
    const t = trackLine(["e2e4", "c7c6"]);
    expect(t.name?.[1]).toBe("Caro-Kann Defense");
    expect(t.exit).toBeFalsy();
  });
});
