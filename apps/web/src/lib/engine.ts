// Pool of single-threaded Stockfish 18 (wasm) workers. Many shallow searches
// in parallel beat one multi-threaded engine for bulk analysis. Two builds, as
// in Chesskit: lite (7 MB, small net) and full (113 MB, full-strength net).
// Stockfish.js, GPL-3.0.
import type { Line, PosEval } from "@outofbook/core/types";

export type EngineBuild = "lite" | "full";
export const ENGINE_BUILDS: Record<EngineBuild, { label: string; url: string; wasm: string; mb: number }> = {
  lite: { label: "Stockfish 18 lite", url: "/engines/stockfish-18/stockfish-18-lite-single.js", wasm: "/engines/stockfish-18/stockfish-18-lite-single.wasm", mb: 7 },
  full: { label: "Stockfish 18", url: "/engines/stockfish-18/stockfish-18-single.js", wasm: "/engines/stockfish-18/stockfish-18-single.wasm", mb: 113 },
};
const ENGINE_URL = ENGINE_BUILDS.lite.url;

/**
 * Downloads a build's wasm into the browser cache, reporting progress, so the
 * workers that load it next start from the cache. Lite needs no progress.
 */
const preloaded = new Map<EngineBuild, Promise<void>>();
export function preloadBuild(build: EngineBuild, onProgress?: (frac: number) => void): Promise<void> {
  const hit = preloaded.get(build);
  if (hit) return hit;
  const p = (async () => {
    const r = await fetch(ENGINE_BUILDS[build].wasm);
    const total = Number(r.headers.get("content-length")) || ENGINE_BUILDS[build].mb * 1e6;
    const reader = r.body?.getReader();
    if (!reader) return;
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      onProgress?.(Math.min(1, got / total));
    }
  })();
  preloaded.set(build, p);
  p.catch(() => preloaded.delete(build));
  return p;
}

/** Parses one `info ... pv ...` line into its depth, MultiPV slot and line (white's point of view). */
function parseInfo(l: string, white: boolean): { depth: number; mpv: number; line: Line } | null {
  if (!l.startsWith("info") || !l.includes(" pv ")) return null;
  const t = l.split(" ");
  const depth = +t[t.indexOf("depth") + 1];
  const mpv = t.includes("multipv") ? +t[t.indexOf("multipv") + 1] : 1;
  const si = t.indexOf("score");
  const kind = t[si + 1];
  const val = +t[si + 2] * (white ? 1 : -1);
  const pv = t.slice(t.indexOf("pv") + 1);
  return { depth, mpv, line: kind === "cp" ? { cp: val, pv } : { mate: val, pv } };
}

class Engine {
  private w: Worker;
  private ready: Promise<void>;
  busy = false;
  constructor(build: EngineBuild = "lite") {
    this.w = new Worker(ENGINE_BUILDS[build].url);
    this.ready = this.send(["uci"], "uciok")
      .then(() => this.send(["setoption name Hash value 32", "isready"], "readyok"))
      .then(() => {});
  }
  private send(cmds: string[], until: string, onLine?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      this.w.onmessage = (ev: MessageEvent<string>) => {
        const line = String(ev.data);
        onLine?.(line);
        if (line.startsWith(until)) resolve(line);
      };
      for (const c of cmds) this.w.postMessage(c);
    });
  }
  async analyze(fen: string, depth: number, multiPv: number): Promise<PosEval> {
    await this.ready;
    const white = fen.split(" ")[1] === "w";
    const lines: Line[] = [];
    let reached = 0;
    await this.send(["ucinewgame", `setoption name MultiPV value ${multiPv}`, `position fen ${fen}`, `go depth ${depth}`], "bestmove", (l) => {
      const i = parseInfo(l, white);
      if (!i || (i.depth < reached && i.mpv === 1)) return;
      reached = i.depth;
      lines[i.mpv - 1] = i.line;
    });
    return { lines: lines.filter(Boolean), depth: reached, source: "engine" };
  }
  terminate() {
    this.w.terminate();
  }
}

export class EnginePool {
  private engines: Engine[];
  private waiters: ((e: Engine) => void)[] = [];
  constructor(size: number, build: EngineBuild = "lite") {
    this.size = maxWorkers(build, size);
    this.engines = Array.from({ length: this.size }, () => new Engine(build));
  }
  size: number;
  private acquire(): Promise<Engine> {
    const free = this.engines.find((e) => !e.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    return new Promise((r) => this.waiters.push(r));
  }
  private release(e: Engine) {
    const next = this.waiters.shift();
    if (next) next(e);
    else e.busy = false;
  }
  async analyze(fen: string, depth: number, multiPv = 2) {
    const e = await this.acquire();
    try {
      return await e.analyze(fen, depth, multiPv);
    } finally {
      this.release(e);
    }
  }
  terminate() {
    this.engines.forEach((e) => e.terminate());
  }
}

export const defaultPoolSize = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

/**
 * Each worker holds its own engine: measured (2026-10-22, Chromium) at about
 * 100 MB for lite and 600 MB for full. Full gets one worker per 2 GB of device
 * memory (navigator.deviceMemory, which browsers report up to 8; 4 when unknown).
 */
export function maxWorkers(build: EngineBuild, wanted: number) {
  if (build === "lite") return wanted;
  const gb = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  return Math.max(1, Math.min(wanted, Math.floor(gb / 2)));
}

/**
 * The engine on the review page's current position: one worker, MultiPV, and
 * the lines as they deepen. A new position stops the search in progress.
 * Depth 0 searches until stopped.
 */
export class LiveEngine {
  private w: Worker;
  private ready: Promise<void>;
  private run = 0;
  private searching: Promise<void> = Promise.resolve();
  constructor(public build: EngineBuild) {
    this.w = new Worker(ENGINE_BUILDS[build].url);
    this.ready = this.wait(["uci"], "uciok").then(() => this.wait(["setoption name Hash value 64", "isready"], "readyok"));
  }
  private wait(cmds: string[], until: string, onLine?: (l: string) => void): Promise<void> {
    return new Promise((resolve) => {
      this.w.onmessage = (ev: MessageEvent<string>) => {
        const line = String(ev.data);
        onLine?.(line);
        if (line.startsWith(until)) resolve();
      };
      for (const c of cmds) this.w.postMessage(c);
    });
  }
  /** Calls onUpdate whenever every line has reached a new depth; resolves with the last eval (or null when replaced). */
  async analyze(fen: string, depth: number, multiPv: number, onUpdate: (e: PosEval) => void): Promise<PosEval | null> {
    const run = ++this.run;
    this.w.postMessage("stop");
    await this.searching;
    await this.ready;
    if (run !== this.run) return null;
    const white = fen.split(" ")[1] === "w";
    const lines: Line[] = [];
    const at: number[] = [];
    let shown = 0;
    let last: PosEval | null = null;
    this.searching = this.wait(["ucinewgame", `setoption name MultiPV value ${multiPv}`, `position fen ${fen}`, depth ? `go depth ${depth}` : "go infinite"], "bestmove", (l) => {
      const i = parseInfo(l, white);
      if (!i || run !== this.run) return;
      lines[i.mpv - 1] = i.line;
      at[i.mpv - 1] = i.depth;
      // Report a depth once every line has it (fewer lines when fewer moves are legal).
      const full = lines.filter(Boolean).length;
      const d = Math.min(...at.slice(0, full));
      if (full && d > shown && at.slice(0, full).every((x) => x >= d)) {
        shown = d;
        last = { lines: lines.slice(0, full).map((x) => ({ ...x })), depth: d, source: "engine" };
        onUpdate(last);
      }
    });
    await this.searching;
    return run === this.run ? last : null;
  }
  stop() {
    this.run++;
    this.w.postMessage("stop");
  }
  terminate() {
    this.w.terminate();
  }
}

/**
 * Stockfish as an opponent. Above 1320 Elo it uses UCI_LimitStrength/UCI_Elo;
 * below that, Skill Level with a short search (Stockfish's Elo floor is 1320).
 */
export class StockfishBot {
  private w = new Worker(ENGINE_URL);
  private ready: Promise<unknown>;
  constructor() {
    this.ready = this.cmd(["uci"], "uciok");
  }
  private cmd(cmds: string[], until: string): Promise<string> {
    return new Promise((resolve) => {
      this.w.onmessage = (ev: MessageEvent<string>) => {
        const l = String(ev.data);
        if (l.startsWith(until)) resolve(l);
      };
      cmds.forEach((c) => this.w.postMessage(c));
    });
  }
  /** `only` limits the search to these moves (UCI searchmoves), e.g. to find a different reply. */
  async move(fen: string, elo: number, movetime = 600, only?: string[]): Promise<string> {
    await this.ready;
    const strength =
      elo >= 1320
        ? ["setoption name Skill Level value 20", "setoption name UCI_LimitStrength value true", `setoption name UCI_Elo value ${Math.min(3190, elo)}`]
        : ["setoption name UCI_LimitStrength value false", `setoption name Skill Level value ${Math.max(0, Math.round((elo - 600) / 120))}`];
    await this.cmd([...strength, "isready"], "readyok");
    const best = await this.cmd(
      [`position fen ${fen}`, `${elo >= 1320 ? `go movetime ${movetime}` : `go depth ${elo < 900 ? 1 : 3}`}${only?.length ? ` searchmoves ${only.join(" ")}` : ""}`],
      "bestmove",
    );
    return best.split(" ")[1];
  }
  terminate() {
    this.w.terminate();
  }
}
