import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRepertoire } from "../src/repertoire";
import { posKey } from "../src/chess";
import { Chess } from "chess.js";
import type { RawGame } from "../src/types";

const OPTS = { pliesAfterBook: 10, treeMaxPly: 30 };
let n = 0;
const game = (sans: string, userColor: "w" | "b" = "w", result: RawGame["result"] = "1-0"): RawGame => ({
  id: `g${++n}`,
  site: "lichess",
  url: "",
  white: userColor === "w" ? "me" : "them",
  black: userColor === "b" ? "me" : "them",
  userColor,
  result,
  date: Date.UTC(2026, 0, n),
  speed: "blitz",
  rated: true,
  sans: sans.split(" "),
});
const keyAfter = (sans: string) => {
  const c = new Chess();
  sans.split(" ").forEach((s) => c.move(s));
  return posKey(c.fen());
};

describe("buildRepertoire", () => {
  const m = buildRepertoire([game("e4 c6 d4 d5 e5"), game("e4 c6 d4 d5 Nc3"), game("Nf3 d5 d4 Nf6"), game("d4 d5 Nf3 Nf6"), game("e4 e5 Nf3", "b", "0-1")], OPTS);

  it("counts the user's moves per position, per color", () => {
    const root = m.graphs.w[m.rootKey];
    expect(root.edges.find((e) => e.san === "e4")?.count).toBe(2);
    expect(m.graphs.b[m.rootKey].edges.find((e) => e.san === "e4")?.count).toBe(1);
  });

  it("merges transpositions into one position", () => {
    const k = keyAfter("Nf3 d5 d4");
    expect(k).toBe(keyAfter("d4 d5 Nf3"));
    expect(m.graphs.w[k].count).toBe(2);
  });

  it("records each game and the metrics", () => {
    expect(Object.keys(m.games)).toHaveLength(5);
    expect(m.metrics.games).toBe(5);
    expect(m.metrics.uniquePositions).toBeGreaterThan(0);
  });
});

// The user's real games, measured in the PoC (2026-10-20). Kept out of git;
// these run only where the fixtures exist.
const local = (f: string) => new URL(`./fixtures/local/${f}`, import.meta.url);
describe.runIf(existsSync(local("games300.json")))("the user's games (PoC numbers)", () => {
  it("300 games build 2,828 positions", () => {
    const games = JSON.parse(readFileSync(local("games300.json"), "utf8"));
    expect(buildRepertoire(games, OPTS).metrics.uniquePositions).toBe(2828);
  }, 30_000);
  it.runIf(existsSync(local("games1020.json")))(
    "1,020 games build 8,094 positions",
    () => {
      const games = JSON.parse(readFileSync(local("games1020.json"), "utf8"));
      expect(buildRepertoire(games, OPTS).metrics.uniquePositions).toBe(8094);
    },
    30_000,
  );
});
