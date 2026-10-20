import { describe, expect, it } from "vitest";
import { fmtEval, lineWinPct, posKey, pvToSan, standardPv, START_FEN, uciToSan, winPctFromCp } from "../src/chess";

describe("standardPv", () => {
  const italian = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -";

  it("rewrites Lichess cloud castling (king takes rook) to e1g1 / e8g8", () => {
    expect(standardPv(italian, "e1h1 g8f6 d2d3 e8h8 c2c3".split(" "))).toEqual("e1g1 g8f6 d2d3 e8g8 c2c3".split(" "));
  });

  it("keeps a real rook move from e1 to h1", () => {
    expect(standardPv("4k3/8/8/8/8/8/8/4R1K1 w - -", ["e1h1"])).toEqual(["e1h1"]);
  });

  it("rewrites queenside castling to e1c1", () => {
    expect(standardPv("r3k2r/8/8/8/8/8/8/R3K2R w KQkq -", ["e1a1"])).toEqual(["e1c1"]);
  });

  it("returns PVs without castling-like moves untouched", () => {
    const pv = ["e2e4", "e7e5"];
    expect(standardPv(START_FEN, pv)).toBe(pv);
  });
});

describe("helpers", () => {
  it("posKey drops the move counters", () => expect(posKey(START_FEN)).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"));
  it("uciToSan converts, and returns the uci when illegal", () => {
    expect(uciToSan(START_FEN, "g1f3")).toBe("Nf3");
    expect(uciToSan(START_FEN, "e2e5")).toBe("e2e5");
  });
  it("pvToSan stops at the first illegal move", () => expect(pvToSan(START_FEN, ["e2e4", "e7e5", "e1e3"])).toEqual(["e4", "e5"]));
  it("win% is 50 at 0, rises with cp, and mate is 0 or 100", () => {
    expect(winPctFromCp(0)).toBeCloseTo(50);
    expect(winPctFromCp(100)).toBeGreaterThan(winPctFromCp(50));
    expect(lineWinPct({ mate: 3 })).toBe(100);
    expect(lineWinPct({ mate: -2 })).toBe(0);
  });
  it("fmtEval", () => {
    expect(fmtEval({ cp: 37 })).toBe("0.37");
    expect(fmtEval({ mate: -4 })).toBe("#-4");
  });
});
