export type Site = "lichess" | "chesscom";
export type Side = "w" | "b";

/** A game as imported, before any chess logic runs on it. */
export interface RawGame {
  id: string;
  site: Site;
  url: string;
  white: string;
  black: string;
  userColor: Side;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  date: number; // ms epoch
  speed: string;
  rated: boolean;
  sans: string[];
  /** Lichess server analysis, one entry per ply (eval after that ply), white POV. */
  evals?: ({ cp?: number; mate?: number } | null)[];
}

/** One engine line, white POV. */
export interface Line {
  cp?: number;
  mate?: number;
  pv: string[];
}

export interface PosEval {
  lines: Line[]; // best first
  depth: number;
  source: "engine" | "cloud" | "cache" | "server";
}

export type BookStatus = "in" | "left" | "exhausted" | "after";

export type Verdict = "splendid" | "perfect" | "best" | "excellent" | "okay" | "inaccuracy" | "mistake" | "blunder" | "forced";

export const VERDICT_RANK: Record<Verdict, number> = {
  splendid: 8,
  perfect: 7,
  best: 6,
  excellent: 5,
  forced: 5,
  okay: 4,
  inaccuracy: 3,
  mistake: 2,
  blunder: 1,
};

export const BAD_VERDICTS: Verdict[] = ["inaccuracy", "mistake", "blunder"];

export interface Edge {
  uci: string;
  san: string;
  to: string;
  count: number;
  w: number; // white wins
  d: number;
  b: number; // black wins
  book: BookStatus;
  /** True when `to` is reached from more than one parent position. */
  transposition?: boolean;
}

export interface RepNode {
  key: string;
  fen: string;
  count: number;
  book?: { eco: string; name: string };
  inBook: boolean;
  edges: Edge[]; // sorted by count desc
}

/** A user move, aggregated over all games by (position, move). */
export interface MoveStat {
  id: string; // fromKey|uci
  color: Side;
  fromKey: string;
  fen: string;
  uci: string;
  san: string;
  toKey: string;
  toFen: string;
  count: number;
  gameIds: string[];
  book: BookStatus;
  opening: string; // deepest named line before this move
  ply: number; // ply of first occurrence
  /** First occurrence context, for Chesskit's recapture check. */
  prevFen?: string;
  prevUci?: string;
}

export interface GameSummary {
  id: string;
  date: number;
  color: Side;
  opening: string;
  eco: string;
  deviation: { ply: number; by: "user" | "opponent" | "exhausted" | "none"; san?: string };
  scopeEnd: number;
  ucis: string[];
  fens: string[];
}

export interface BookExit {
  by: "user" | "opponent";
  fromKey: string;
  fen: string;
  uci: string;
  san: string;
  count: number;
}

export interface OpeningStat {
  exits: BookExit[];
  name: string;
  eco: string;
  color: Side;
  games: number;
  userLeft: number;
  opponentLeft: number;
  exhausted: number;
  w: number;
  d: number;
  b: number;
}

export interface RepertoireModel {
  graphs: Record<Side, Record<string, RepNode>>;
  rootKey: string;
  moves: MoveStat[];
  games: Record<string, GameSummary>;
  openings: OpeningStat[];
  metrics: { games: number; plies: number; ms: number; uniquePositions: number };
}
