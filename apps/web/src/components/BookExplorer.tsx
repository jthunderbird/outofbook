import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Alert, Badge, Button, Dialog } from "./ui";
import { BOOK, bookChildren, bookMainLine, bookName, type Step } from "@outofbook/core/book";
import { fmtEval, lineWinPct, posKey, uciParams, uciToSan } from "@outofbook/core/chess";
import { EnginePool, type EngineBuild } from "@outofbook/engines/engine";
import { evalNow } from "../lib/evalCache";
import type { PosEval, RepNode, Side } from "@outofbook/core/types";
import { uciArrow } from "./Board";
import { ExploreBoard } from "./ExploreBoard";

export interface ExploreTarget {
  fen: string;
  orientation: Side; // the user's color in this repertoire
  graph?: Record<string, RepNode>; // the user's games, to show what was actually played
  played?: string; // uci of the move in question at the start position
  path?: string[]; // moves from the starting position to `fen`, to step back through
}

interface Row {
  uci: string;
  san: string;
  fen: string;
  key: string;
  inBook: boolean;
  games: number;
  name?: [string, string];
  line: Step[]; // this move and its continuation
  yours: boolean; // continuation taken from the user's games
}

const applyUci = (fen: string, uci: string) => {
  const c = new Chess(fen);
  c.move(uciParams(uci));
  return c.fen();
};

/** Most common continuation in the user's games, following the busiest edge. */
function graphLine(graph: Record<string, RepNode> | undefined, fen: string, maxPlies = 16): Step[] {
  const steps: Step[] = [];
  let cur = fen;
  const seen = new Set<string>();
  while (graph && steps.length < maxPlies) {
    const e = graph[posKey(cur)]?.edges[0];
    if (!e || seen.has(e.to)) break;
    seen.add(e.to);
    cur = applyUci(cur, e.uci);
    steps.push({ uci: e.uci, san: e.san, fen: cur });
  }
  return steps;
}

const moveNo = (fen: string) => {
  const [, side, , , , full] = fen.split(" ");
  return side === "w" ? `${full}.` : `${full}…`;
};

// Alternatives at one position: the named book moves plus every move played in
// the user's games, each with its continuation (main named line, or the user's
// own most common line). Selecting a row steps through its moves like a game
// viewer; nothing drills down. Blue arrow: next move; green: engine best.
export function BookExplorer({ target, depth, build, onClose }: { target: ExploreTarget; depth: number; build: EngineBuild; onClose: () => void }) {
  // The moves that led here (plus the move in question): pick any of them to see
  // the alternatives at that point. `at` is the position before history[at].
  const { history, histFens, histSans } = useMemo(() => {
    const path = target.path ?? [];
    const c = new Chess();
    const fens = [c.fen()];
    const sans: string[] = [];
    for (const u of path) {
      try {
        sans.push(c.move(uciParams(u)).san);
      } catch {
        return { history: [], histFens: [target.fen], histSans: [] };
      }
      fens.push(c.fen());
    }
    if (posKey(c.fen()) !== posKey(target.fen)) return { history: [], histFens: [target.fen], histSans: [] };
    fens[fens.length - 1] = target.fen;
    const history = target.played ? [...path, target.played] : path;
    if (target.played) sans.push(uciToSan(target.fen, target.played));
    return { history, histFens: fens, histSans: sans };
  }, [target]);
  const [at, setAt] = useState(histFens.length - 1);
  const root = histFens[at];
  const playedHere = history[at];
  const pool = useRef<EnginePool | null>(null);
  const [evals, setEvals] = useState<Record<string, PosEval>>({});
  const [sel, setSel] = useState<{ uci: string; idx: number } | null>(playedHere ? { uci: playedHere, idx: -1 } : null);
  const [hover, setHover] = useState<string | null>(null);
  const goTo = (i: number) => {
    setAt(i);
    setHover(null);
    setSel(history[i] ? { uci: history[i], idx: -1 } : null);
  };

  const rows = useMemo<Row[]>(() => {
    const byUci = new Map<string, Row>();
    for (const c of bookChildren(root)) {
      const main = bookMainLine(c.fen);
      byUci.set(c.uci, {
        uci: c.uci,
        san: c.san,
        fen: c.fen,
        key: c.key,
        inBook: true,
        games: 0,
        name: main.name ?? (c.name ? [c.eco!, c.name] : undefined),
        line: [{ uci: c.uci, san: c.san, fen: c.fen }, ...main.steps],
        yours: false,
      });
    }
    const playedMoves = target.graph?.[posKey(root)]?.edges ?? [];
    for (const e of playedMoves) {
      const r = byUci.get(e.uci);
      if (r) r.games = e.count;
      else {
        const fen = applyUci(root, e.uci);
        byUci.set(e.uci, {
          uci: e.uci,
          san: e.san,
          fen,
          key: e.to,
          inBook: false,
          games: e.count,
          name: BOOK[e.to]?.n,
          line: [{ uci: e.uci, san: e.san, fen }, ...graphLine(target.graph, fen)],
          yours: true,
        });
      }
    }
    if (playedHere) {
      // The move in question always shows the line as actually played.
      const fen = applyUci(root, playedHere);
      const r = byUci.get(playedHere);
      const line = [{ uci: playedHere, san: uciToSan(root, playedHere), fen }, ...graphLine(target.graph, fen)];
      if (r) Object.assign(r, { line, yours: true });
      else byUci.set(playedHere, { uci: playedHere, san: line[0].san, fen, key: posKey(fen), inBook: false, games: 0, line, yours: true });
    }
    return [...byUci.values()];
  }, [root, target, playedHere]);

  const selRow = rows.find((r) => r.uci === sel?.uci);
  const curFen = selRow && sel && sel.idx >= 0 ? selRow.line[sel.idx].fen : root;
  const nextUci = hover ?? (selRow ? selRow.line[(sel?.idx ?? -1) + 1]?.uci : undefined);

  useEffect(() => {
    pool.current = new EnginePool(2);
    return () => pool.current?.terminate();
  }, []);

  const want = useMemo(() => [{ fen: root, mpv: 3 }, { fen: curFen, mpv: 3 }, ...rows.map((r) => ({ fen: r.fen, mpv: 2 }))], [root, curFen, rows]);
  useEffect(() => {
    let live = true;
    const engine = (f: string, d: number, mpv: number) => pool.current!.analyze(f, d, mpv);
    for (const w of want) {
      const k = posKey(w.fen);
      if (evals[k]) continue;
      evalNow(w.fen, depth, w.mpv, engine).then((e) => live && setEvals((x) => ({ ...x, [k]: e })));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, depth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const white = root.split(" ")[1] === "w";
  const userToMove = (white ? "w" : "b") === target.orientation;
  const score = (key: string) => {
    const e = evals[key];
    return e?.lines[0] ? lineWinPct(e.lines[0]) * (white ? 1 : -1) : -Infinity;
  };
  const sorted = [...rows].sort((a, b) => score(b.key) - score(a.key) || +b.inBook - +a.inBook);
  const rootBest = evals[posKey(root)]?.lines[0]?.pv[0];
  const curEval = evals[posKey(curFen)];
  const curBest = curEval?.lines[0]?.pv[0];
  const arrows = [...(nextUci ? [uciArrow(nextUci, "blue")] : []), ...(curBest && curBest !== nextUci ? [uciArrow(curBest, "green")] : [])];
  const name = bookName(root);
  const hasBook = rows.some((r) => r.inBook);
  // ◀ ▶: through the selected line; ◀ from its start steps back through the moves to here.
  const step = (d: number) => {
    if (d < 0 && (!sel || sel.idx < 0)) return at > 0 && goTo(at - 1);
    if (selRow && sel) setSel({ ...sel, idx: Math.max(-1, Math.min(selRow.line.length - 1, sel.idx + d)) });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={1180}
      title={
        <span>
          Book explorer{" "}
          {name ? (
            <span className="text-muted">
              · {name[0]} {name[1]}
            </span>
          ) : (
            ""
          )}{" "}
          <span className="text-sm text-muted">
            · {moveNo(root)} {white ? "White" : "Black"} to move
          </span>
        </span>
      }
    >
      <div className="flex flex-col-reverse gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {histSans.length > 0 && (
            <div className="mb-3 rounded-ui p-2 text-[0.84rem] leading-7" style={{ background: "var(--hover)" }} data-testid="explorer-history">
              <span className="ui-label mr-2">moves to here</span>
              <span className="ui-move mr-1" data-on={at === 0} onClick={() => goTo(0)}>
                start
              </span>
              {histSans.map((san, i) => {
                const fenBefore = histFens[i] ?? root;
                const showNo = i === 0 || fenBefore.split(" ")[1] === "w";
                const last = i === history.length - 1 && !!target.played;
                return (
                  <span key={i} className="mr-0.5 inline-block">
                    {showNo && <span className="num mr-0.5 text-muted">{moveNo(fenBefore)}</span>}
                    <span
                      className="ui-move"
                      data-on={at === i}
                      onClick={() => goTo(i)}
                      style={last && at !== i ? { background: "color-mix(in oklab, var(--warn) 22%, transparent)" } : undefined}
                      title="Show the alternatives to this move"
                    >
                      {san}
                    </span>
                  </span>
                );
              })}
              <div className="text-xs text-muted">Click a move to see what else was possible there: book moves, engine moves and the moves from your games.</div>
            </div>
          )}
          {!hasBook && (
            <Alert tone="info" className="mb-2">
              No named line continues from here; showing the moves from your games and the engine's top moves.
            </Alert>
          )}
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Move</th>
                  <th>Line</th>
                  <th className="text-right">Eval</th>
                  <th className="text-right">{userToMove ? "You played" : "Opponents played"}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const isPlayed = r.uci === playedHere;
                  const selected = r.uci === sel?.uci;
                  return (
                    <tr
                      key={r.uci}
                      data-hl={selected}
                      className="cursor-pointer"
                      style={isPlayed && !selected ? { background: "color-mix(in oklab, var(--warn) 10%, transparent)" } : undefined}
                      onMouseEnter={() => !selected && setHover(r.uci)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        setHover(null);
                        if (!selected) setSel({ uci: r.uci, idx: -1 });
                      }}
                    >
                      <td className="align-top font-semibold whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.san}
                          {r.uci === rootBest && <Badge tone="good">best</Badge>}
                          {isPlayed && <Badge tone="warn">played</Badge>}
                          {!r.inBook && <Badge>not in book</Badge>}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-muted">
                          {r.name ? `${r.name[0]} ${r.name[1]}` : ""}
                          {r.yours ? `${r.name ? " · " : ""}your most common continuation` : ""}
                        </div>
                        <div className="text-[0.82rem] leading-7">
                          {r.line.map((st, i) => {
                            const before = i === 0 ? root : r.line[i - 1].fen;
                            const showNo = i === 0 || before.split(" ")[1] === "w";
                            const active = selected && sel!.idx === i;
                            return (
                              <span
                                key={i}
                                className="ui-move mr-0.5"
                                data-on={active}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHover(null);
                                  setSel({ uci: r.uci, idx: i });
                                }}
                              >
                                {showNo ? <span className="text-muted">{moveNo(before)} </span> : ""}
                                {st.san}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="num text-right align-top">{evals[r.key] ? fmtEval(evals[r.key].lines[0]) : "…"}</td>
                      <td className="num text-right align-top">{r.games || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!hasBook && evals[posKey(root)] && <div className="mt-2 text-sm">Engine's top moves: {evals[posKey(root)].lines.map((l) => `${uciToSan(root, l.pv[0])} (${fmtEval(l)})`).join(" · ")}</div>}
          <div className="mt-2 text-xs text-muted">
            Click a row to select its line, then click moves or use ◀ ▶ (or the arrow keys). Blue arrow: next move. Green arrow: engine best when different.
          </div>
        </div>
        <div className="w-full shrink-0 lg:w-[440px]">
          <ExploreBoard
            fen={curFen}
            orientation={target.orientation}
            arrows={arrows}
            evalLine={curEval?.lines[0]}
            lastMove={selRow && sel && sel.idx >= 0 ? selRow.line[sel.idx].uci : undefined}
            graph={target.graph}
            build={build}
            depth={depth}
          />
          <div className="mt-2 flex items-center gap-1">
            <Button size="sm" variant="ghost" icon onClick={() => sel && setSel({ ...sel, idx: -1 })} disabled={!selRow}>
              <ChevronsLeft size={16} />
            </Button>
            <Button size="sm" variant="ghost" icon onClick={() => step(-1)} disabled={!selRow && at === 0}>
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="ghost" icon onClick={() => step(1)} disabled={!selRow}>
              <ChevronRight size={16} />
            </Button>
            <Button size="sm" variant="ghost" icon onClick={() => selRow && sel && setSel({ ...sel, idx: selRow.line.length - 1 })} disabled={!selRow}>
              <ChevronsRight size={16} />
            </Button>
            <span className="num ml-2 text-xs text-muted">{curEval?.lines[0]?.pv[0] ? `best ${uciToSan(curFen, curEval.lines[0].pv[0])} · d${curEval.depth} ${curEval.source}` : "analyzing…"}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
