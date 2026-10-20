// Chessground (Lichess's own board, GPL-3.0): click-to-move with destination
// dots, drag, last-move and check highlights, premoves, right-click arrows.
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
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

export function Board({ fen, orientation, arrows = NO_ARROWS, lastMove, evalLine, hideEval, bigEval, movable, onMove, premove, onApi, className, coordinates = true, feel = NO_FEEL }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
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
  const arrowsKey = arrows.map((a) => a.join()).join("|");
  const config = useMemo<Config>(() => {
    const turn = (chess?.turn() ?? "w") as Side;
    const dests = new Map<Key, Key[]>();
    if (chess && movable && (movable === "both" || movable === turn)) {
      for (const m of chess.moves({ verbose: true })) dests.set(m.from as Key, [...(dests.get(m.from as Key) ?? []), m.to as Key]);
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
      highlight: { lastMove: feel.highlight ?? true, check: feel.highlight ?? true },
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
      drawable: {
        enabled: true,
        visible: true,
        autoShapes: arrows.map(([o, d, b]): DrawShape => ({ orig: o as Key, dest: d as Key, brush: b })),
      },
    };
  }, [fen, orientation, lastMove, chess, movable, hasOnMove, premove, arrowsKey, coordinates, feel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!el.current) return;
    const api = Chessground(el.current, {
      ...config,
      drawable: { ...config.drawable, brushes: BRUSHES as never, defaultSnapToValidMove: true, eraseOnClick: true },
      movable: {
        ...config.movable,
        events: {
          after: (from, to, meta) => {
            const c = cg.current;
            const pos = c?.state.pieces.get(to);
            const rank = to[1];
            const promotes = pos?.role === "pawn" && (rank === "8" || rank === "1");
            const queen = autoQueen.current === 3 || (autoQueen.current === 2 && meta?.premove);
            if (promotes && queen) onMoveRef.current?.(from + to + "q");
            else if (promotes) setPromo({ from, to });
            else onMoveRef.current?.(from + to);
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
    const host = el.current;
    host.addEventListener("mousedown", remeasure, true);
    host.addEventListener("touchstart", remeasure, { capture: true, passive: true });
    return () => {
      host.removeEventListener("mousedown", remeasure, true);
      host.removeEventListener("touchstart", remeasure, true);
      ro.disconnect();
      api.destroy();
      cg.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cg.current?.set(config);
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
      <div className="board-wrap min-w-0 flex-1">
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
