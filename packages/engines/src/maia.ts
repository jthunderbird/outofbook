// Maia 3 (human-like move prediction by rating) in the browser via onnxruntime-web.
// Pre/post-processing ported from CSSLab/maia-platform-frontend (GPL-3.0),
// src/lib/engine/{maia.ts,tensor.ts}; the worker and model are theirs too.
import { Chess } from "chess.js";
import movesData from "./data/all_moves_maia3.json";

const MOVES = movesData as Record<string, number>;
const REVERSED: string[] = [];
for (const [m, i] of Object.entries(MOVES)) REVERSED[i] = m;
const MODEL_URL = "/maia3/maia3_simplified.onnx";
const MODEL_VERSION = "maia3-simplified-2026-06";

const swapCase = (r: string) => [...r].map((c) => (/[A-Z]/.test(c) ? c.toLowerCase() : /[a-z]/.test(c) ? c.toUpperCase() : c)).join("");
const mirrorSq = (sq: string) => sq[0] + (9 - +sq[1]);
const mirrorMove = (m: string) => mirrorSq(m.slice(0, 2)) + mirrorSq(m.slice(2, 4)) + m.slice(4);
function mirrorFen(fen: string) {
  const [pos, side, castling, ep, half, full] = fen.split(" ");
  const c = castling === "-" ? "-" : ["K", "Q", "k", "q"].filter((x) => castling.includes(x === x.toUpperCase() ? x.toLowerCase() : x.toUpperCase())).join("") || "-";
  return `${pos.split("/").reverse().map(swapCase).join("/")} ${side === "w" ? "b" : "w"} ${c} ${ep === "-" ? "-" : mirrorSq(ep)} ${half} ${full}`;
}

const PIECES = ["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];
function preprocess(fen: string) {
  const black = fen.split(" ")[1] === "b";
  const board = new Chess(black ? mirrorFen(fen) : fen);
  const tokens = new Float32Array(64 * 12);
  board
    .fen()
    .split(" ")[0]
    .split("/")
    .forEach((row, rank) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) file += +ch;
        else {
          tokens[((7 - rank) * 8 + file) * 12 + PIECES.indexOf(ch)] = 1;
          file++;
        }
      }
    });
  const legal: number[] = [];
  for (const m of board.moves({ verbose: true })) {
    const i = MOVES[m.from + m.to + (m.promotion ?? "")];
    if (i !== undefined) legal.push(i);
  }
  return { tokens, legal, black };
}

type Pending = { resolve: (r: { move: Float32Array; value: Float32Array }) => void; reject: (e: Error) => void };

export class Maia {
  private worker = new Worker("/maia-worker.js");
  private pending = new Map<number, Pending>();
  private nextId = 1;
  status: "loading" | "no-cache" | "downloading" | "ready" | "error" = "loading";
  progress = 0;
  ready: Promise<void>;

  constructor(onStatus?: (s: Maia["status"], progress: number) => void) {
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "status") {
          this.status = m.status;
          onStatus?.(this.status, this.progress);
          if (m.status === "no-cache") this.worker.postMessage({ type: "download" });
          if (m.status === "ready") resolve();
        } else if (m.type === "progress") {
          this.progress = m.progress;
          onStatus?.(this.status, this.progress);
        } else if (m.type === "inference-result") {
          this.pending.get(m.id)?.resolve({ move: new Float32Array(m.logitsMove), value: new Float32Array(m.logitsValue) });
          this.pending.delete(m.id);
        } else if (m.type === "error") {
          if (m.id) {
            this.pending.get(m.id)?.reject(new Error(m.message));
            this.pending.delete(m.id);
          } else {
            this.status = "error";
            onStatus?.("error", 0);
            reject(new Error(m.message));
          }
        }
      };
    });
    this.worker.postMessage({ type: "init", modelUrl: MODEL_URL, modelVersion: MODEL_VERSION });
  }

  /** Move probabilities for the side to move, playing at `elo` against `oppElo`; plus win prob for White. */
  async predict(fen: string, elo: number, oppElo: number): Promise<{ policy: [string, number][]; whiteWin: number }> {
    await this.ready;
    const { tokens, legal, black } = preprocess(fen);
    const id = this.nextId++;
    const out = await new Promise<{ move: Float32Array; value: Float32Array }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "inference", id, tokens: tokens.buffer, eloSelfs: Float32Array.from([elo]).buffer, eloOppos: Float32Array.from([oppElo]).buffer, batchSize: 1 }, [tokens.buffer]);
    });
    const max = Math.max(...legal.map((i) => out.move[i]));
    const exps = legal.map((i) => Math.exp(out.move[i] - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const policy = legal.map((i, k) => [black ? mirrorMove(REVERSED[i]) : REVERSED[i], exps[k] / sum] as [string, number]).sort((a, b) => b[1] - a[1]);
    const [l, d, w] = out.value;
    const vm = Math.max(l, d, w);
    const [el, ed, ew] = [l, d, w].map((x) => Math.exp(x - vm));
    let win = (ew + 0.5 * ed) / (el + ed + ew);
    if (black) win = 1 - win;
    return { policy, whiteWin: win };
  }

  terminate() {
    this.worker.terminate();
  }
}
