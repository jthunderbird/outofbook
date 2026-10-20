import { describe, expect, it } from "vitest";
import { classify } from "../src/classify";
import { START_FEN, winPctFromCp } from "../src/chess";
import type { PosEval } from "../src/types";

const ev = (...lines: [number, string][]): PosEval => ({ depth: 20, source: "engine", lines: lines.map(([cp, m]) => ({ cp, pv: [m] })) });

// White to move at the start. Before: e4 is best at +0.30, d4 second at +0.25.
const before = ev([30, "e2e4"], [25, "d2d4"]);
/** The cp after a move that loses `loss` win-percentage points from +0.30. */
const cpForLoss = (loss: number) => {
  const target = winPctFromCp(30) - loss;
  let cp = 30;
  while (winPctFromCp(cp) > target) cp -= 1;
  return cp;
};
const verdictFor = (played: string, cpAfter: number) => classify({ fenBefore: START_FEN, played, before, after: ev([cpAfter, "e7e5"]), legalCount: 20 });

describe("classify (Chesskit's win% thresholds)", () => {
  it("the engine's first choice is best", () => expect(verdictFor("e2e4", 30)).toBe("best"));
  it("a tiny loss is excellent", () => expect(verdictFor("d2d4", cpForLoss(1))).toBe("excellent"));
  it("2-5 points is okay", () => expect(verdictFor("g1f3", cpForLoss(3.5))).toBe("okay"));
  it("5-10 points is an inaccuracy", () => expect(verdictFor("g1f3", cpForLoss(7))).toBe("inaccuracy"));
  it("10-20 points is a mistake", () => expect(verdictFor("g1f3", cpForLoss(15))).toBe("mistake"));
  it("over 20 points is a blunder", () => expect(verdictFor("g1f3", cpForLoss(30))).toBe("blunder"));
  it("the only legal move is forced", () => expect(classify({ fenBefore: START_FEN, played: "e2e4", before, after: ev([30, "e7e5"]), legalCount: 1 })).toBe("forced"));
});
