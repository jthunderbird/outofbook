// How the bot chooses its move: opening behavior first (stay in the named book,
// copy what your opponents played, follow one named line), then the engine
// (Stockfish limited to an Elo, or Maia at a rating).
import { Chess } from "chess.js";
import { BOOK, bookChildren } from "@outofbook/core/book";
import { posKey, START_FEN, uciParams } from "@outofbook/core/chess";
import { StockfishBot } from "@outofbook/engines/engine";
import { Maia } from "@outofbook/engines/maia";
import type { RepNode } from "@outofbook/core/types";

export type BookMode = "free" | "book" | "opponents" | "line";

export interface BotConfig {
  engine: "stockfish" | "maia";
  elo: number;
  bookMode: BookMode;
  line?: string[]; // uci moves from the start for "line" mode
}

export interface NamedLine {
  eco: string;
  name: string;
  ucis: string[];
  sans: string[];
}

/** Every named line with its moves (shortest path in the book graph). */
export function allNamedLines(): NamedLine[] {
  const out: NamedLine[] = [];
  const start = posKey(START_FEN);
  const seen = new Set([start]);
  let frontier: { key: string; fen: string; ucis: string[]; sans: string[] }[] = [{ key: start, fen: START_FEN, ucis: [], sans: [] }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const c of bookChildren(f.fen)) {
        if (seen.has(c.key)) continue;
        seen.add(c.key);
        const item = { key: c.key, fen: c.fen, ucis: [...f.ucis, c.uci], sans: [...f.sans, c.san] };
        if (c.name) out.push({ eco: c.eco!, name: c.name, ucis: item.ucis, sans: item.sans });
        next.push(item);
      }
    }
    frontier = next;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const norm = (x: string) =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Named lines matching a search, best match first: the exact name, then names
 * starting with the query, then names where the query is a whole part
 * ("King's Indian Defense: Fianchetto"), then other matches. Ties go to the
 * shorter line (the parent before its variations). An ECO code also matches.
 */
export function searchLines(lines: NamedLine[], query: string, limit = 50): NamedLine[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  const scored: [number, NamedLine][] = [];
  for (const l of lines) {
    const name = norm(l.name);
    const eco = l.eco.toLowerCase();
    let score: number;
    if (name === q || eco === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (eco.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (words.every((w) => name.includes(w) || eco.startsWith(w))) score = 4;
    else continue;
    scored.push([score, l]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].ucis.length - b[1].ucis.length || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, l]) => l);
}

const pickWeighted = <T>(items: [T, number][]): T | undefined => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (!total) return undefined;
  let r = Math.random() * total;
  for (const [x, w] of items) if ((r -= w) <= 0) return x;
  return items[items.length - 1][0];
};

export class Bot {
  private sf?: StockfishBot;
  maia?: Maia;
  constructor(
    public cfg: BotConfig,
    onMaiaStatus?: (s: string, p: number) => void,
  ) {
    if (cfg.engine === "stockfish") this.sf = new StockfishBot();
    else this.maia = new Maia(onMaiaStatus);
  }

  /** Returns [uci, why]. `history` is the uci list from the start; `graph` is the user's repertoire for their color.
   * `exclude` lists moves not to play ("Other reply"): each source skips them, falling through to the next. */
  async move(fen: string, history: string[], userElo: number, graph?: Record<string, RepNode>, exclude: string[] = []): Promise<[string, string]> {
    const { bookMode, line } = this.cfg;
    const key = posKey(fen);
    const ok = (u: string) => !exclude.includes(u);
    const other = exclude.length ? "another " : "";
    if (bookMode === "line" && line && history.length < line.length && history.every((u, i) => u === line[i]) && ok(line[history.length])) return [line[history.length], "following the chosen line"];
    if (bookMode === "opponents" && graph) {
      const edges = (graph[key]?.edges ?? []).filter((e) => ok(e.uci));
      const pick = pickWeighted(edges.map((e) => [e.uci, e.count] as [string, number]));
      if (pick) {
        const n = edges.find((e) => e.uci === pick)!.count;
        return [pick, `${other}move your opponents played here (${n} ${n === 1 ? "game" : "games"})`];
      }
    }
    if ((bookMode === "book" || bookMode === "opponents") && BOOK[key]) {
      const kids = bookChildren(fen).filter((c) => ok(c.uci));
      const pick = pickWeighted(kids.map((c) => [c.uci, 1 + c.namedBelow] as [string, number]));
      if (pick) return [pick, `${other}named book move`];
    }
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ""));
    const allowed = legal.filter(ok);
    const only = exclude.length && allowed.length ? allowed : undefined;
    if (this.sf) return [await this.sf.move(fen, this.cfg.elo, 600, only), `${other ? "another move from " : ""}Stockfish ~${this.cfg.elo}`];
    const { policy } = await this.maia!.predict(fen, this.cfg.elo, userElo);
    const pool = only ? policy.filter(([u]) => only.includes(u)) : policy;
    // Sample among plausible moves so Maia varies like a human of that rating.
    const plausible = pool.filter(([, p]) => p >= 0.05);
    return [pickWeighted(plausible.length ? plausible : pool.slice(0, 1)) ?? policy[0][0], `${other ? "another move from " : ""}Maia ${this.cfg.elo}`];
  }

  terminate() {
    this.sf?.terminate();
    this.maia?.terminate();
  }
}

export const applyMoves = (ucis: string[]) => {
  const c = new Chess();
  for (const u of ucis) c.move(uciParams(u));
  return c;
};
