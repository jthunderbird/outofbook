// Builds the repertoire model from imported games: one position graph per user
// color (transpositions merge on the position key), the book walk per game
// (who left the named lines, where), and the user's moves inside the analysis
// scope (book end + N plies), aggregated by (position, move).
import { Chess } from "chess.js";
import bookData from "./data/book.json";
import { posKey, START_FEN } from "./chess";
import type { BookStatus, Edge, GameSummary, MoveStat, OpeningStat, RawGame, RepertoireModel, RepNode, Side } from "./types";

type BookNode = { n?: [string, string]; c: Record<string, string> };
const BOOK = bookData as unknown as Record<string, BookNode>;

export interface BuildOptions {
  pliesAfterBook: number; // N (default 10)
  treeMaxPly: number; // hard cap on graph depth
}

export const bookStatus = (fromKey: string, uci: string, toKey: string): BookStatus => {
  const b = BOOK[fromKey];
  if (!b) return "after";
  const kids = Object.keys(b.c);
  if (!kids.length) return "exhausted";
  return b.c[uci] || BOOK[toKey] ? "in" : "left";
};

export function buildRepertoire(games: RawGame[], opts: BuildOptions): RepertoireModel {
  const t0 = performance.now();
  const graphs: Record<Side, Record<string, RepNode>> = { w: {}, b: {} };
  const parents: Record<Side, Map<string, Set<string>>> = { w: new Map(), b: new Map() };
  const moves = new Map<string, MoveStat>();
  const summaries: Record<string, GameSummary> = {};
  const openings = new Map<string, OpeningStat>();
  const rootKey = posKey(START_FEN);
  let plies = 0;

  for (const g of games) {
    const color = g.userColor;
    const graph = graphs[color];
    const chess = new Chess();
    const ucis: string[] = [];
    const fens: string[] = [chess.fen()];
    let key = rootKey;
    let opening: [string, string] = ["", "Starting position"];
    let deviation: GameSummary["deviation"] = { ply: -1, by: "none" };
    let exit: { fromKey: string; fen: string; uci: string; san: string } | undefined;
    const res = g.result;
    const visited = new Set<string>(); // count each position once per game

    const node = (k: string, fen: string) => {
      let n = graph[k];
      if (!n) {
        const b = BOOK[k];
        n = graph[k] = { key: k, fen, count: 0, inBook: !!b, edges: [], book: b?.n ? { eco: b.n[0], name: b.n[1] } : undefined };
      }
      return n;
    };
    const root = node(key, chess.fen());
    root.count++;
    visited.add(key);

    for (let ply = 0; ply < g.sans.length; ply++) {
      const scopeEnd = deviation.ply >= 0 ? deviation.ply + opts.pliesAfterBook : Infinity;
      if (ply >= opts.treeMaxPly && ply > scopeEnd) break;
      const fenBefore = chess.fen();
      let m;
      try {
        m = chess.move(g.sans[ply]);
      } catch {
        break; // bad SAN from a source: stop this game
      }
      plies++;
      const uci = m.from + m.to + (m.promotion ?? "");
      const fenAfter = chess.fen();
      const toKey = posKey(fenAfter);
      const status = bookStatus(key, uci, toKey);
      const mover: Side = ply % 2 === 0 ? "w" : "b";
      const isUser = mover === color;

      if (deviation.ply < 0 && (status === "left" || status === "exhausted" || status === "after")) {
        deviation = {
          ply,
          by: status === "exhausted" || status === "after" ? "exhausted" : isUser ? "user" : "opponent",
          san: m.san,
        };
        if (status === "left") exit = { fromKey: key, fen: fenBefore, uci, san: m.san };
      }
      if (BOOK[toKey]?.n && deviation.ply < 0) opening = BOOK[toKey].n!;

      if (ply < opts.treeMaxPly) {
        const from = graph[key];
        let e = from.edges.find((x) => x.uci === uci);
        if (!e) {
          e = { uci, san: m.san, to: toKey, count: 0, w: 0, d: 0, b: 0, book: status };
          from.edges.push(e);
        }
        e.count++;
        if (res === "1-0") e.w++;
        else if (res === "0-1") e.b++;
        else e.d++;
        const to = node(toKey, fenAfter);
        if (!visited.has(toKey)) {
          to.count++;
          visited.add(toKey);
        }
        let ps = parents[color].get(toKey);
        if (!ps) parents[color].set(toKey, (ps = new Set()));
        ps.add(key);
      }

      const inScope = deviation.ply < 0 || ply <= deviation.ply + opts.pliesAfterBook;
      if (isUser && inScope) {
        const id = `${color}|${key}|${uci}`;
        let s = moves.get(id);
        if (!s) {
          s = {
            id,
            color,
            fromKey: key,
            fen: fenBefore,
            uci,
            san: m.san,
            toKey,
            toFen: fenAfter,
            count: 0,
            gameIds: [],
            book: status,
            opening: opening[1],
            ply,
            prevFen: ply > 0 ? fens[ply - 1] : undefined,
            prevUci: ply > 0 ? ucis[ply - 1] : undefined,
          };
          moves.set(id, s);
        }
        s.count++;
        s.gameIds.push(g.id);
      }
      ucis.push(uci);
      fens.push(fenAfter);
      key = toKey;
    }

    const scopeEnd = deviation.ply >= 0 ? deviation.ply + opts.pliesAfterBook : ucis.length;
    summaries[g.id] = { id: g.id, date: g.date, color, opening: opening[1], eco: opening[0], deviation, scopeEnd, ucis, fens };

    const oKey = `${color}|${opening[1]}`;
    let o = openings.get(oKey);
    if (!o) openings.set(oKey, (o = { exits: [], name: opening[1], eco: opening[0], color, games: 0, userLeft: 0, opponentLeft: 0, exhausted: 0, w: 0, d: 0, b: 0 }));
    o.games++;
    if (exit && (deviation.by === "user" || deviation.by === "opponent")) {
      const by = deviation.by;
      const x = o.exits.find((e) => e.fromKey === exit!.fromKey && e.uci === exit!.uci);
      if (x) x.count++;
      else o.exits.push({ by, ...exit, count: 1 });
    }
    if (deviation.by === "user") o.userLeft++;
    else if (deviation.by === "opponent") o.opponentLeft++;
    else if (deviation.by === "exhausted") o.exhausted++;
    if (res === "1-0") o.w++;
    else if (res === "0-1") o.b++;
    else o.d++;
  }

  for (const c of ["w", "b"] as Side[]) {
    for (const n of Object.values(graphs[c])) {
      n.edges.sort((a, b) => b.count - a.count);
      for (const e of n.edges) e.transposition = (parents[c].get(e.to)?.size ?? 0) > 1;
    }
  }
  const all = [...moves.values()];
  return {
    graphs,
    rootKey,
    moves: all,
    games: summaries,
    openings: [...openings.values()].map((o) => ({ ...o, exits: o.exits.sort((a, b) => b.count - a.count) })).sort((a, b) => b.games - a.games),
    metrics: {
      games: games.length,
      plies,
      ms: performance.now() - t0,
      uniquePositions: new Set(all.flatMap((m) => [m.fromKey, m.toKey])).size,
    },
  };
}

/** Most-played path from the root to `target` (breadth first, busiest edges first). */
export function findPath(g: Record<string, RepNode>, root: string, target: string): Edge[] | null {
  const prev = new Map<string, Edge & { from: string }>();
  const seen = new Set([root]);
  let frontier = [root];
  while (frontier.length) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const e of g[k]?.edges ?? []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        prev.set(e.to, { ...e, from: k });
        if (e.to === target) {
          const path: Edge[] = [];
          for (let cur = target; cur !== root; cur = prev.get(cur)!.from) path.unshift(prev.get(cur)!);
          return path;
        }
        next.push(e.to);
      }
    }
    frontier = next;
  }
  return null;
}

export type { Edge };
