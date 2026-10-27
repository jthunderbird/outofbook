// A board you can move on freely ("what if I play this here?"), as the review
// board is: moves from the position shown start an exploration with the engine
// on the explored position and your games' moves there. Purely exploratory:
// the moves live in this component while the position is shown and are never
// saved (nor are the engine's evals). A new position from outside starts over.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { fmtEval, plyLabel, posKey, uciParams, uciToSan } from "@outofbook/core/chess";
import type { Line, PosEval, RepNode, Side } from "@outofbook/core/types";
import { LiveEngine, type EngineBuild } from "@outofbook/engines/engine";
import { getEval } from "../lib/evalCache";
import { Board, uciArrow, type Arrow } from "./Board";
import { Button, cx } from "./ui";

/** Ply number (0 = White's first move) of the side to move in a FEN. */
const plyOf = (fen: string) => {
  const [, side, , , , full] = fen.split(" ");
  return (+full - 1) * 2 + (side === "w" ? 0 : 1);
};

export function ExploreBoard({
  fen,
  orientation,
  arrows,
  lastMove,
  evalLine,
  graph,
  build,
  depth,
  footer,
}: {
  fen: string;
  orientation: Side;
  arrows?: Arrow[];
  lastMove?: string;
  evalLine?: Line;
  /** The user's games (their color's tree), to show what they played in an explored position. */
  graph?: Record<string, RepNode>;
  build: EngineBuild;
  depth: number;
  /** Shown under the board when not exploring (the page's own caption). */
  footer?: ReactNode;
}) {
  const [moves, setMoves] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  // A new position from outside starts over.
  useEffect(() => {
    setMoves([]);
    setAt(0);
  }, [fen]);

  const line = useMemo(() => {
    const c = new Chess(fen);
    const fens = [fen];
    const sans: string[] = [];
    for (const u of moves) {
      sans.push(c.move(uciParams(u)).san);
      fens.push(c.fen());
    }
    return { fens, sans };
  }, [fen, moves]);
  const exploring = moves.length > 0;
  const shown = line.fens[at];

  // The engine on the explored position: a cached eval when deep enough, else a live search.
  const [ev, setEv] = useState<{ fen: string; ev: PosEval } | null>(null);
  const engine = useRef<LiveEngine | null>(null);
  useEffect(() => {
    if (!exploring || at === 0) return;
    let live = true;
    const legal = new Chess(shown).moves().length;
    if (!legal) return setEv(null);
    (async () => {
      const cached = await getEval(posKey(shown), depth);
      if (!live) return;
      if (cached) return setEv({ fen: shown, ev: cached });
      setEv(null);
      if (engine.current?.build !== build) {
        engine.current?.terminate();
        engine.current = new LiveEngine(build);
      }
      await engine.current.analyze(shown, depth, 1, (e) => live && setEv({ fen: shown, ev: e }));
    })().catch(() => {});
    return () => {
      live = false;
      engine.current?.stop();
    };
  }, [shown, exploring, at, depth, build]);
  useEffect(() => () => engine.current?.terminate(), []);
  const cur = exploring && at > 0 && ev?.fen === shown ? ev.ev : undefined;

  const onMove = (u: string) => {
    if (moves[at] === u) return setAt(at + 1);
    setMoves([...moves.slice(0, at), u]);
    setAt(at + 1);
  };
  const back = () => {
    setMoves([]);
    setAt(0);
  };

  const node = exploring && at > 0 ? graph?.[posKey(shown)] : undefined;
  const best = cur?.lines[0]?.pv[0];
  const start = plyOf(fen);
  return (
    <div className="flex flex-col gap-2" data-testid="explore-board" data-fen={shown}>
      <Board
        fen={shown}
        orientation={orientation}
        arrows={exploring && at > 0 ? (best ? [uciArrow(best, "green")] : []) : arrows}
        lastMove={exploring && at > 0 ? moves[at - 1] : lastMove}
        evalLine={exploring && at > 0 ? cur?.lines[0] : evalLine}
        movable="both"
        onMove={onMove}
      />
      {!exploring ? (
        footer
      ) : (
        <div className="flex flex-col gap-1.5 text-sm" data-testid="explore-line">
          <div className="flex flex-wrap items-center gap-1">
            <span className="ui-label mr-1">exploring</span>
            {line.sans.map((san, k) => (
              <button
                key={k}
                className={cx("rounded-ui px-1.5 py-0.5", at === k + 1 ? "bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] font-semibold" : "hover:bg-hover")}
                onClick={() => setAt(k + 1)}
              >
                {plyLabel(start + k, san)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon onClick={() => setAt(Math.max(0, at - 1))} disabled={at === 0} aria-label="Previous explored move">
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="ghost" icon onClick={() => setAt(Math.min(moves.length, at + 1))} disabled={at === moves.length} aria-label="Next explored move">
              <ChevronRight size={16} />
            </Button>
            <span className="num min-w-0 flex-1 truncate text-xs text-muted" data-testid="explore-eval">
              {at === 0
                ? "the starting position"
                : cur
                  ? `${fmtEval(cur.lines[0])} · best ${uciToSan(shown, best!)} · depth ${cur.depth}`
                  : new Chess(shown).moves().length
                    ? "analyzing…"
                    : "game over"}
            </span>
            <Button size="sm" variant="secondary" onClick={back} data-testid="explore-back">
              <Undo2 size={14} /> Back
            </Button>
          </div>
          {at > 0 && (
            <div className="text-xs text-muted" data-testid="explore-games">
              {node ? (
                <>
                  Your games here ({node.count}):{" "}
                  {node.edges
                    .slice(0, 5)
                    .map((e) => `${e.san} ${e.count}×`)
                    .join(" · ")}
                </>
              ) : (
                "Your games never reached this position."
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
