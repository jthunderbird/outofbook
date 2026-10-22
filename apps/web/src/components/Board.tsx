// Chessground (Lichess's own board, GPL-3.0): click-to-move with destination
// dots, drag, last-move and check highlights, premoves, right-click arrows.
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key, Piece, Pieces } from "chessground/types";
import { read as readFen, write as writeFen } from "chessground/fen";
import { premove as premoveSquares } from "chessground/premove";
import { Chess } from "chess.js";
import { fmtEval, lineWinPct } from "@outofbook/core/chess";
import type { Line, Side } from "@outofbook/core/types";

export type Brush = "green" | "red" | "blue" | "yellow" | "orange";
export type Arrow = [string, string, Brush];
export const uciArrow = (uci: string, brush: Brush): Arrow => [uci.slice(0, 2), uci.slice(2, 4), brush];

const BRUSHES = {
  green: { key: "g", color: "#15781B", opacity: 0.85, lineWidth: 10 },
  red: { key: "r", color: "#d42a2a", opacity: 0.85, lineWidth: 10 },
  blue: { key: "b", color: "#1f6fd1", opacity: 0.85, lineWidth: 10 },
  yellow: { key: "y", color: "#e6b000", opacity: 0.9, lineWidth: 10 },
  orange: { key: "o", color: "#ef7d14", opacity: 0.85, lineWidth: 10 },
  paleBlue: { key: "pb", color: "#003088", opacity: 0.4, lineWidth: 15 },
  paleGreen: { key: "pg", color: "#15781B", opacity: 0.4, lineWidth: 15 },
  paleRed: { key: "pr", color: "#882020", opacity: 0.4, lineWidth: 15 },
  paleGrey: { key: "pgr", color: "#4a4a4a", opacity: 0.35, lineWidth: 15 },
  purple: { key: "purple", color: "#68217a", opacity: 0.65, lineWidth: 10 },
  pink: { key: "pink", color: "#ee2080", opacity: 0.5, lineWidth: 10 },
  white: { key: "white", color: "white", opacity: 1, lineWidth: 10 },
};

/** Vertical eval bar (white share = win% from white's side). `big`: wider, with a readable number. */
export function EvalBar({ line, orientation, big }: { line?: Line | { cp?: number; mate?: number }; orientation: Side; big?: boolean }) {
  const wp = line ? lineWinPct(line) : 50;
  const whiteBottom = orientation === "w";
  const whiteAhead = wp >= 50;
  return (
    <div
      data-testid="eval-bar"
      className={`relative flex shrink-0 overflow-hidden rounded-[4px] ${big ? "w-[38px]" : "w-[22px]"}`}
      style={{ flexDirection: whiteBottom ? "column" : "column-reverse", background: "#f2f2f2", outline: "1px solid color-mix(in oklab, var(--fg) 25%, transparent)" }}
    >
      <div style={{ flex: `0 0 ${100 - wp}%`, background: "#3a3a3a", transition: "flex-basis 0.35s" }} />
      <span
        className={`num absolute right-0 left-0 text-center font-bold ${big ? "text-[14px]" : "text-[9px]"}`}
        style={{ color: whiteAhead ? "#222" : "#eee", ...(whiteAhead === whiteBottom ? { bottom: big ? 6 : 3 } : { top: big ? 6 : 3 }) }}
      >
        {!line ? "" : big && line.cp !== undefined ? Math.abs(line.cp / 100).toFixed(1) : fmtEval(line).replace(/^-/, "")}
      </span>
    </div>
  );
}

/** Several premoves (as on chess.com): during the opponent's turn the board shows
 * the position with the queued moves made, shaded darker the later they come. */
export interface PremoveQueue {
  color: Side;
  moves: string[]; // uci, e1g1 for castling
  onAdd: (uci: string) => void;
  onClear: () => void;
}

const ROLES: Record<string, Piece["role"]> = { q: "queen", r: "rook", b: "bishop", n: "knight" };
const fileOf = (k: string) => k.charCodeAt(0) - 97;

/** The queued move as it would land, by geometry alone (what it captures is not known yet). */
function applyPremove(pieces: Pieces, uci: string) {
  const from = uci.slice(0, 2) as Key;
  const to = uci.slice(2, 4) as Key;
  const p = pieces.get(from);
  if (!p) return;
  pieces.delete(from);
  if (p.role === "king" && Math.abs(fileOf(from) - fileOf(to)) === 2) {
    const kside = fileOf(to) > fileOf(from);
    const rank = from[1];
    const rook = pieces.get(`${kside ? "h" : "a"}${rank}` as Key);
    if (rook) {
      pieces.delete(`${kside ? "h" : "a"}${rank}` as Key);
      pieces.set(`${kside ? "f" : "d"}${rank}` as Key, rook);
    }
  }
  pieces.set(to, uci[4] && p.role === "pawn" ? { role: ROLES[uci[4]], color: p.color } : p);
}

export interface BoardProps {
  fen: string;
  orientation: Side;
  arrows?: Arrow[];
  lastMove?: string; // uci
  evalLine?: Line;
  hideEval?: boolean;
  bigEval?: boolean;
  /** Which side the user may move; omit for a view-only board. */
  movable?: Side | "both";
  /** Called with the uci (promotion included) of a legal user move. */
  onMove?: (uci: string) => void;
  premove?: boolean;
  onApi?: (api: Api) => void;
  className?: string;
  coordinates?: boolean;
  /** Board feel, as the Lichess prefs of the same names (see lib/lichessPrefs). */
  feel?: BoardFeel;
  /** Set during the opponent's turn to queue premoves instead of chessground's single one. */
  premoveQueue?: PremoveQueue;
}

export interface BoardFeel {
  autoQueen?: 1 | 2 | 3; // 1 never, 2 when premoving, 3 always
  animationMs?: number;
  showDests?: boolean;
  highlight?: boolean;
  coords?: 0 | 1 | 2 | 3; // 0 none, 3 on every square
  rookCastle?: boolean;
  moveEvent?: 0 | 1 | 2; // 0 click, 1 drag, 2 both
}
const NO_FEEL: BoardFeel = {};

const color = (s: Side) => (s === "w" ? "white" : "black");

const NO_ARROWS: Arrow[] = [];

export function Board({
  fen,
  orientation,
  arrows = NO_ARROWS,
  lastMove,
  evalLine,
  hideEval,
  bigEval,
  movable,
  onMove,
  premove,
  onApi,
  className,
  coordinates = true,
  feel = NO_FEEL,
  premoveQueue,
}: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const pq = useRef(premoveQueue);
  pq.current = premoveQueue;
  // The position the queued premoves lead to, for reading the next one.
  const virtual = useRef<Pieces | null>(null);
  const autoQueen = useRef(feel.autoQueen ?? 1);
  autoQueen.current = feel.autoQueen ?? 1;
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const hasOnMove = !!onMove;
  // King onto its own rook (Lichess's rookCastle pref) arrives as e1h1; the
  // rest of the app speaks e1g1.
  const castles = useRef(new Map<string, string>());
  const arrowsKey = arrows.map((a) => a.join()).join("|");
  const queueKey = premoveQueue ? `${premoveQueue.color}:${premoveQueue.moves.join(",")}` : "";
  const config = useMemo<Config>(() => {
    const drawable = {
      enabled: true,
      visible: true,
      autoShapes: arrows.map(([o, d, b]): DrawShape => ({ orig: o as Key, dest: d as Key, brush: b })),
    };
    if (premoveQueue) {
      const pieces = readFen(fen);
      for (const u of premoveQueue.moves) applyPremove(pieces, u);
      virtual.current = pieces;
      const mine = color(premoveQueue.color);
      const dests = new Map<Key, Key[]>();
      for (const [k, p] of pieces) if (p.color === mine) dests.set(k, premoveSquares(pieces, k, true));
      const custom = new Map<Key, string>();
      premoveQueue.moves.forEach((u, i) => {
        const cls = `premove-${Math.min(i + 1, 4)}`;
        custom.set(u.slice(0, 2) as Key, cls);
        custom.set(u.slice(2, 4) as Key, cls);
      });
      return {
        fen: writeFen(pieces),
        orientation: color(orientation),
        turnColor: mine,
        check: false,
        lastMove: lastMove ? ([lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[]) : undefined,
        coordinates: coordinates && feel.coords !== 0,
        coordinatesOnSquares: feel.coords === 3,
        viewOnly: false,
        animation: { enabled: feel.animationMs !== 0, duration: feel.animationMs ?? 180 },
        highlight: { lastMove: feel.highlight ?? true, check: false, custom },
        movable: { free: false, color: mine, dests, showDests: feel.showDests ?? true, rookCastle: true },
        premovable: { enabled: false },
        draggable: { enabled: feel.moveEvent !== 0, showGhost: true },
        selectable: { enabled: feel.moveEvent !== 1 },
        drawable,
      };
    }
    virtual.current = null;
    const turn = (chess?.turn() ?? "w") as Side;
    const dests = new Map<Key, Key[]>();
    castles.current.clear();
    if (chess && movable && (movable === "both" || movable === turn)) {
      for (const m of chess.moves({ verbose: true })) {
        dests.set(m.from as Key, [...(dests.get(m.from as Key) ?? []), m.to as Key]);
        const side = m.flags.includes("k") ? "h" : m.flags.includes("q") ? "a" : null;
        if (side && (feel.rookCastle ?? true)) {
          const rook = (side + m.from[1]) as Key;
          dests.get(m.from as Key)!.push(rook);
          castles.current.set(m.from + rook, m.from + m.to);
        }
      }
    }
    const canMove = !!movable && hasOnMove;
    return {
      fen,
      orientation: color(orientation),
      turnColor: color(turn),
      check: chess?.inCheck() ?? false,
      lastMove: lastMove ? ([lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[]) : undefined,
      coordinates: coordinates && feel.coords !== 0,
      coordinatesOnSquares: feel.coords === 3,
      viewOnly: false,
      animation: { enabled: feel.animationMs !== 0, duration: feel.animationMs ?? 180 },
      movable: {
        free: false,
        color: canMove ? (movable === "both" ? "both" : color(movable as Side)) : undefined,
        dests,
        showDests: feel.showDests ?? true,
        rookCastle: feel.rookCastle ?? true,
      },
      premovable: { enabled: !!premove && canMove, showDests: feel.showDests ?? true, castle: true },
      draggable: { enabled: canMove && feel.moveEvent !== 0, showGhost: true },
      selectable: { enabled: canMove && feel.moveEvent !== 1 },
      highlight: { lastMove: feel.highlight ?? true, check: feel.highlight ?? true, custom: new Map() },
      drawable,
    };
  }, [fen, orientation, lastMove, chess, movable, hasOnMove, premove, arrowsKey, coordinates, feel, queueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!el.current) return;
    const api = Chessground(el.current, {
      ...config,
      drawable: { ...config.drawable, brushes: BRUSHES as never, defaultSnapToValidMove: true, eraseOnClick: true },
      movable: {
        ...config.movable,
        events: {
          after: (from, to, meta) => {
            const q = pq.current;
            const v = virtual.current;
            if (q && v) {
              // A king put on its own rook or moved two files castles.
              const king = v.get(from)?.role === "king";
              const onRook = king && v.get(to)?.role === "rook" && v.get(to)?.color === v.get(from)?.color;
              const uci = king && (onRook || Math.abs(fileOf(from) - fileOf(to)) === 2) ? `${from}${fileOf(to) > fileOf(from) ? "g" : "c"}${from[1]}` : from + to;
              const promotes = v.get(from)?.role === "pawn" && (to[1] === "8" || to[1] === "1");
              q.onAdd(promotes ? uci + "q" : uci);
              return;
            }
            const c = cg.current;
            const pos = c?.state.pieces.get(to);
            const rank = to[1];
            const promotes = pos?.role === "pawn" && (rank === "8" || rank === "1");
            const queen = autoQueen.current === 3 || (autoQueen.current === 2 && meta?.premove);
            if (promotes && queen) onMoveRef.current?.(from + to + "q");
            else if (promotes) setPromo({ from, to });
            else onMoveRef.current?.(castles.current.get(from + to) ?? from + to);
          },
        },
      },
    });
    cg.current = api;
    onApi?.(api);
    const ro = new ResizeObserver(() => api.redrawAll());
    ro.observe(el.current);
    // Chessground caches the board's screen position and refreshes it only on
    // window scroll/resize. When the page moves the board without either (a
    // banner above it closes), clicks land on the wrong squares; re-measure
    // before each press.
    const remeasure = () => api.state.dom.bounds.clear();
    // A press on an empty square with nothing selected drops the queued
    // premoves. Read before chessground handles the press, so a move being
    // made never counts as one.
    const press = (e: MouseEvent | TouchEvent) => {
      remeasure();
      const q = pq.current;
      if (!q?.moves.length || api.state.selected) return;
      const t = "touches" in e ? e.touches[0] : e;
      if (!t || ("button" in e && e.button !== 0)) return;
      const key = api.getKeyAtDomPos([t.clientX, t.clientY]);
      if (key && !api.state.pieces.has(key)) q.onClear();
    };
    const host = el.current;
    // Right-click drops the queued premoves, as on chess.com.
    const clearQueue = () => pq.current?.moves.length && pq.current.onClear();
    host.addEventListener("contextmenu", clearQueue);
    host.addEventListener("mousedown", press, true);
    host.addEventListener("touchstart", press, { capture: true, passive: true });
    return () => {
      host.removeEventListener("contextmenu", clearQueue);
      host.removeEventListener("mousedown", press, true);
      host.removeEventListener("touchstart", press, true);
      ro.disconnect();
      api.destroy();
      cg.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = cg.current;
    if (!c) return;
    // Chessground already shows the position right after a move made on it;
    // replacing its pieces anyway would drop a selection or a press in progress.
    if (config.fen && c.getFen() === config.fen.split(" ")[0]) {
      const { fen: _fen, ...rest } = config;
      c.set(rest);
    } else c.set(config);
  }, [config]);

  const pickPromo = (role: string | null) => {
    const p = promo;
    setPromo(null);
    if (!p) return;
    if (role) onMoveRef.current?.(p.from + p.to + role);
    else cg.current?.set({ fen }); // cancelled: put the pawn back
  };

  const promoSide: Side = promo?.to[1] === "8" ? "w" : "b";
  const fileIdx = promo ? promo.to.charCodeAt(0) - 97 : 0;
  const col = orientation === "w" ? fileIdx : 7 - fileIdx;
  const fromTop = promo ? (orientation === "w") === (promo.to[1] === "8") : true;

  return (
    <div className={`flex gap-1.5 ${className ?? ""}`}>
      {!hideEval && <EvalBar line={evalLine} orientation={orientation} big={bigEval} />}
      <div className="board-wrap min-w-0 flex-1" data-premoves={premoveQueue ? premoveQueue.moves.length : undefined}>
        <div ref={el} className="h-full w-full" />
        {promo && (
          <div className="absolute inset-0 z-20 bg-black/40" onClick={() => pickPromo(null)}>
            <div className="absolute flex w-[12.5%]" style={{ left: `${col * 12.5}%`, flexDirection: fromTop ? "column" : "column-reverse", ...(fromTop ? { top: 0 } : { bottom: 0 }) }}>
              {["q", "n", "r", "b"].map((r) => (
                <button
                  key={r}
                  className={`cg-wrap aspect-square w-full rounded-full bg-white/90 hover:bg-white`}
                  onClick={(e) => {
                    e.stopPropagation();
                    pickPromo(r);
                  }}
                >
                  <piece
                    className={`${color(promoSide)} ${{ q: "queen", n: "knight", r: "rook", b: "bishop" }[r]}`}
                    style={{ position: "relative", display: "block", width: "100%", height: "100%" }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
