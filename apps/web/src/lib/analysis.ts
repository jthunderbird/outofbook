// Background analysis of the positions the verdicts need: for every user move in
// scope, the position before it and the one after. Most frequent moves go first,
// so repeated mistakes show up early. Sources, cheapest first: IndexedDB cache,
// Lichess cloud eval (shallow plies only), Stockfish wasm pool.
import { Chess } from "chess.js";
import { cloudEval, getEvals, putEval, putEvals } from "./evalCache";
import { serverEvals, shareEval } from "./server";
import { EnginePool, type EngineBuild } from "@outofbook/engines/engine";
import type { MoveStat, PosEval } from "@outofbook/core/types";

export interface AnalysisOptions {
  depth: number;
  poolSize: number;
  build: EngineBuild;
  useCloud: boolean;
  cloudMaxPly: number;
  share: boolean; // logged in: read and write the shared server cache
}

export interface AnalysisProgress {
  done: number;
  total: number;
  cache: number;
  server: number;
  cloud: number;
  engine: number;
  ms: number;
  running: boolean;
  /** Positions neither cache had, so analyzed here; set once both caches were read. */
  todo?: number;
  /** When `todo` was set (ms from the start). */
  todoAt?: number;
}

export function planPositions(moves: MoveStat[]) {
  // Tier 1: moves played at least twice and the moves with which you left the
  // named lines (what the default lists show). Tier 2: everything else.
  const tier = (m: MoveStat) => (m.count >= 2 || m.book === "left" || m.book === "exhausted" ? 0 : 1);
  const order = [...moves].sort((a, b) => tier(a) - tier(b) || b.count - a.count || a.ply - b.ply);
  const seen = new Set<string>();
  const out: { key: string; fen: string; ply: number }[] = [];
  for (const m of order) {
    for (const [key, fen, ply] of [
      [m.fromKey, m.fen, m.ply],
      [m.toKey, m.toFen, m.ply + 1],
    ] as const) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, fen, ply });
      }
    }
  }
  return out;
}

export function runAnalysis(moves: MoveStat[], opts: AnalysisOptions, onEval: (key: string, e: PosEval) => void, onProgress: (p: AnalysisProgress) => void) {
  const queue = planPositions(moves);
  const p: AnalysisProgress = { done: 0, total: queue.length, cache: 0, server: 0, cloud: 0, engine: 0, ms: 0, running: true };
  const t0 = performance.now();
  // Started only when a position needs the engine: loading Stockfish (several MB)
  // competed with the eval download on slow connections even when every eval was cached.
  let pool: EnginePool | null = null;
  let stopped = false;
  let lastReport = 0;

  const report = (force = false) => {
    p.ms = performance.now() - t0;
    if (force || p.ms - lastReport > 250) {
      lastReport = p.ms;
      onProgress({ ...p });
    }
  };
  const finish = async (key: string, e: PosEval) => {
    if (e.source !== "cache" && e.source !== "server") await putEval(key, e);
    if (e.source === "engine" || e.source === "cloud") shareEval(key, e, opts.share);
    onEval(key, e);
    p.done++;
    report();
  };

  // Cache hits first, then split: shallow positions go to one serial cloud lane
  // (Lichess asks for one request at a time), the rest to the engine lanes.
  // Cloud misses jump to the front of the engine queue; idle engine lanes steal
  // from the back of the cloud queue.
  type Item = (typeof queue)[number];
  const cloudQ: Item[] = [];
  const engineQ: Item[] = [];
  const prepared = (async () => {
    const misses: Item[] = [];
    const cached = await getEvals(
      queue.map((q) => q.key),
      opts.depth,
    );
    for (const item of queue) {
      const e = cached.get(item.key);
      if (e) {
        p.cache++;
        await finish(item.key, e);
      } else if (new Chess(item.fen).isGameOver()) {
        // Mate or stalemate: nothing to analyze (the engine returns no lines, so it was never cached).
        p.cache++;
        await finish(item.key, { lines: [], depth: opts.depth, source: "cache" });
      } else misses.push(item);
    }
    // Then the shared server cache (one batched request per 1000 positions).
    const shared = await serverEvals(
      misses.map((m) => m.key),
      opts.depth,
    );
    await putEvals(Object.entries(shared)).catch(() => {});
    for (const item of misses) {
      const e = shared[item.key];
      if (e) {
        p.server++;
        await finish(item.key, { ...e, source: "server" });
      } else if (opts.useCloud && item.ply <= opts.cloudMaxPly) cloudQ.push(item);
      else engineQ.push(item);
    }
    p.todo = cloudQ.length + engineQ.length;
    p.todoAt = performance.now() - t0;
    report(true);
  })();

  const cloudLane = prepared.then(async () => {
    while (!stopped && cloudQ.length) {
      const item = cloudQ.shift()!;
      const c = await cloudEval(item.fen).catch(() => undefined);
      if (c === "busy") {
        engineQ.unshift(item, ...cloudQ.splice(0));
        break;
      }
      if (c && c.lines.length >= 2) {
        p.cloud++;
        await finish(item.key, c);
      } else engineQ.unshift(item);
    }
  });
  let cloudDone = false;
  cloudLane.then(() => (cloudDone = true));

  const engineLanes = Array.from({ length: opts.poolSize }, () =>
    prepared.then(async () => {
      while (!stopped) {
        const item = engineQ.shift() ?? cloudQ.pop();
        if (!item) {
          if (cloudDone) break;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        const e = await (pool ??= new EnginePool(opts.poolSize, opts.build)).analyze(item.fen, opts.depth, 2);
        p.engine++;
        await finish(item.key, e);
      }
    }),
  );
  const finished = Promise.all([cloudLane, ...engineLanes]).then(() => {
    p.running = false;
    report(true);
    pool?.terminate();
  });

  return {
    stop() {
      stopped = true;
    },
    finished,
  };
}
