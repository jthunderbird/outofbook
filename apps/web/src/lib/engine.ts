// Pool of single-threaded Stockfish 18 lite (wasm) workers. Many shallow
// searches in parallel beat one multi-threaded engine for bulk analysis.
// Engine build copied from Chesskit's public/engines (Stockfish.js, GPL-3.0).
import type { Line, PosEval } from "@outofbook/core/types";

const ENGINE_URL = "/engines/stockfish-18/stockfish-18-lite-single.js";

class Engine {
  private w = new Worker(ENGINE_URL);
  private ready: Promise<void>;
  busy = false;
  constructor() {
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
  async analyse(fen: string, depth: number, multiPv: number): Promise<PosEval> {
    await this.ready;
    const white = fen.split(" ")[1] === "w";
    const lines: Line[] = [];
    let reached = 0;
    await this.send(["ucinewgame", `setoption name MultiPV value ${multiPv}`, `position fen ${fen}`, `go depth ${depth}`], "bestmove", (l) => {
      if (!l.startsWith("info") || !l.includes(" pv ")) return;
      const t = l.split(" ");
      const d = +t[t.indexOf("depth") + 1];
      const mpv = t.includes("multipv") ? +t[t.indexOf("multipv") + 1] : 1;
      const si = t.indexOf("score");
      const kind = t[si + 1];
      const val = +t[si + 2] * (white ? 1 : -1); // to white POV
      const pv = t.slice(t.indexOf("pv") + 1);
      if (d < reached && mpv === 1) return;
      reached = d;
      lines[mpv - 1] = kind === "cp" ? { cp: val, pv } : { mate: val, pv };
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
  constructor(public size: number) {
    this.engines = Array.from({ length: size }, () => new Engine());
  }
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
  async analyse(fen: string, depth: number, multiPv = 2) {
    const e = await this.acquire();
    try {
      return await e.analyse(fen, depth, multiPv);
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
