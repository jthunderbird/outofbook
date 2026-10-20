// Single-game review, laid out like Chesskit's analysis page (GPL-3.0) inside
// our shell: board docked right with the controls and move verdict under it;
// accuracy, verdict counts, eval graph, moves, engine lines, the mistakes and
// the repertoire at the current position on the left.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Repeat, X } from "lucide-react";
import { gameAccuracy } from "@outofbook/core/accuracy";
import { classify } from "@outofbook/core/classify";
import { fmtEval, lineWinPct, plyLabel, posKey, pvToSan, uciParams, uciToSan } from "@outofbook/core/chess";
import { EnginePool, defaultPoolSize } from "../lib/engine";
import { getEval, putEval } from "../lib/evalCache";
import { trackLine } from "@outofbook/core/lineTracker";
import { buildRepertoire } from "@outofbook/core/repertoire";
import type { Settings } from "../lib/settings";
import { BAD_VERDICTS, type MoveStat, type PosEval, type RawGame, type RepertoireModel, type Side, type Verdict } from "@outofbook/core/types";
import { AskClaude } from "./AskClaude";
import { BookChip, BOOK_COLOR, SideIcon, VERDICT_COLOR, VERDICT_LABEL, VerdictChip, VerdictIcon } from "./bits";
import { Board, EvalBar, uciArrow } from "./Board";
import type { VerdictOf } from "./RepertoireView";
import { Button, Card, CardHeader, Progress, Seg, Tip, cx } from "./ui";
import { LichessIcon } from "./LichessIcon";

type MoveClass = Verdict | "book";
const RECAP: MoveClass[] = ["splendid", "perfect", "best", "excellent", "okay", "book", "forced", "inaccuracy", "mistake", "blunder"];
const RECAP_LABEL: Record<MoveClass, string> = {
  splendid: "Splendid",
  perfect: "Only move",
  best: "Best",
  excellent: "Excellent",
  okay: "Okay",
  book: "Book",
  forced: "Forced",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};
const other = (c: Side): Side => (c === "w" ? "b" : "w");
const isBad = (c?: MoveClass) => !!c && BAD_VERDICTS.includes(c as Verdict);
const classColor = (c: MoveClass) => (c === "book" ? BOOK_COLOR : VERDICT_COLOR[c]);

export function GameReview({
  game,
  model,
  evalOf,
  verdict,
  verdictOf,
  settings,
  onClose,
}: {
  game: RawGame;
  model: RepertoireModel;
  evalOf: (k: string) => PosEval | undefined;
  verdict: (m: MoveStat) => Verdict | undefined;
  verdictOf: VerdictOf;
  settings: Settings;
  onClose: () => void;
}) {
  // Games outside the loaded set (e.g. bot games) get a summary of their own.
  const s = useMemo(() => model.games[game.id] ?? buildRepertoire([game], { pliesAfterBook: 10, treeMaxPly: 30 }).games[game.id], [model, game]);
  const { fens, ucis, sans } = useMemo(() => {
    const c = new Chess();
    const fens = [c.fen()];
    const ucis: string[] = [];
    const sans: string[] = [];
    for (const san of game.sans) {
      try {
        const m = c.move(san);
        ucis.push(m.from + m.to + (m.promotion ?? ""));
        sans.push(m.san);
        fens.push(c.fen());
      } catch {
        break;
      }
    }
    return { fens, ucis, sans };
  }, [game]);
  const tracked = useMemo(() => trackLine(ucis), [ucis]);
  const [ply, setPly] = useState(0);
  const [flip, setFlip] = useState(false);
  const [local, setLocal] = useState<Record<string, PosEval>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [mistakesOf, setMistakesOf] = useState<"me" | "both">("me");
  const go = (p: number) => setPly(Math.max(0, Math.min(ucis.length, p)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(ucis.length, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "Home") setPly(0);
      if (e.key === "End") setPly(ucis.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ucis.length]);

  // Analyse every position on open: repertoire evals, then the eval cache, then the engine.
  useEffect(() => {
    let live = true;
    const pool = new EnginePool(settings.poolSize || defaultPoolSize());
    const todo = fens.filter((f) => !evalOf(posKey(f))?.lines.length);
    if (!todo.length) return () => pool.terminate();
    let done = 0;
    setProgress(0);
    Promise.all(
      todo.map(async (fen) => {
        const k = posKey(fen);
        let e = await getEval(k, settings.depth);
        if (!e && live) {
          e = await pool.analyse(fen, settings.depth, 2);
          await putEval(k, e);
        }
        if (!live || !e) return;
        setLocal((l) => ({ ...l, [k]: e! }));
        setProgress(++done / todo.length);
      }),
    )
      .catch(() => {})
      .finally(() => live && setProgress(null));
    return () => {
      live = false;
      pool.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fens, settings.depth, settings.poolSize]);

  const ev = (i: number) => local[posKey(fens[i])] ?? evalOf(posKey(fens[i]));
  const verdicts = useMemo(
    () =>
      ucis.map((u, i): Verdict | undefined => {
        const b = ev(i);
        const a = ev(i + 1);
        if (!a?.lines.length && new Chess(fens[i + 1]).isCheckmate()) return "best";
        if (!b?.lines.length || !a?.lines.length) return undefined;
        return classify({
          fenBefore: fens[i],
          played: u,
          before: b,
          after: a,
          prevFen: i > 0 ? fens[i - 1] : undefined,
          prevUci: i > 0 ? ucis[i - 1] : undefined,
          legalCount: new Chess(fens[i]).moves().length,
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ucis, fens, local, evalOf],
  );
  // Book moves show as "book" (Chesskit's "opening"), unless the engine calls them bad.
  const classOf = (i: number): MoveClass | undefined => {
    const v = verdicts[i];
    if (tracked.plies[i]?.book === "in" && !isBad(v)) return "book";
    return v;
  };
  const classes = ucis.map((_, i) => classOf(i));
  // White's win% per position; game-over positions have no engine lines.
  const wins = fens.map((f, i) => {
    const l = ev(i)?.lines[0];
    if (l) return lineWinPct(l);
    const c = new Chess(f);
    if (c.isCheckmate()) return c.turn() === "w" ? 0 : 100;
    if (c.isDraw() || c.isStalemate()) return 50;
    return undefined;
  });
  const accuracy = gameAccuracy(wins);
  const counts: Record<Side, Partial<Record<MoveClass, number>>> = { w: {}, b: {} };
  classes.forEach((k, i) => {
    const side = i % 2 === 0 ? "w" : "b";
    if (k) counts[side][k] = (counts[side][k] ?? 0) + 1;
  });

  const orientation: Side = flip ? other(s.color) : s.color;
  const cur = ev(ply);
  const focus = ply - 1; // the move just played (-1 at the start)
  const lastClass = focus >= 0 ? classes[focus] : undefined;
  const bestBefore = focus >= 0 ? ev(focus)?.lines[0]?.pv[0] : undefined;
  const arrows = [
    ...(cur?.lines[0]?.pv[0] ? [uciArrow(cur.lines[0].pv[0], "green")] : []),
    ...(focus >= 0 && bestBefore && bestBefore !== ucis[focus] && isBad(lastClass) ? [uciArrow(bestBefore, "blue")] : []),
  ];
  const nextOfClass = (side: Side, k: MoveClass) => {
    const idx = classes.map((c, i) => (c === k && (i % 2 === 0 ? "w" : "b") === side ? i : -1)).filter((i) => i >= 0);
    const next = idx.find((i) => i + 1 > ply) ?? idx[0];
    if (next !== undefined) go(next + 1);
  };

  // Repertoire at the current move: what you (or your opponents) played in the position before it.
  const at = ply < ucis.length ? ply : ply - 1;
  const graph = model.graphs[s.color];
  const node = at >= 0 ? graph[posKey(fens[at])] : undefined;
  const mine = (at % 2 === 0 ? "w" : "b") === s.color;
  const same = Object.values(model.games).filter((g) => g.color === s.color && g.opening === s.opening);
  const open = model.openings.find((o) => o.color === s.color && o.name === s.opening);
  const repeated = model.moves.filter((m) => m.color === s.color && m.gameIds.includes(game.id) && BAD_VERDICTS.includes(verdict(m)!) && m.count > 1);
  const mistakes = ucis.map((_, i) => i).filter((i) => BAD_VERDICTS.includes(verdicts[i]!) && (mistakesOf === "both" || (i % 2 === 0 ? "w" : "b") === s.color));
  const name = (c: Side) => (c === "w" ? game.white : game.black);

  const dest = focus >= 0 ? uciParams(ucis[focus]).to : undefined;
  const destPos = dest ? (orientation === "w" ? { x: dest.charCodeAt(0) - 97, y: 8 - +dest[1] } : { x: 104 - dest.charCodeAt(0), y: +dest[1] - 1 }) : undefined;

  const playerBar = (c: Side) => (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <SideIcon c={c} />
      <span className={cx("truncate font-semibold", c === s.color && "text-accent")}>{name(c)}</span>
      {c === s.color && <span className="text-xs text-muted">(you)</span>}
      <span className="flex-1" />
      {accuracy && (
        <Tip content="Accuracy (Lichess formula)">
          <span
            className="num rounded-ui px-2 py-0.5 text-xs font-semibold"
            style={{ background: c === "w" ? "#f2f2f2" : "#2a2a2a", color: c === "w" ? "#111" : "#eee", outline: "1px solid var(--border)" }}
          >
            {accuracy[c].toFixed(1)}%
          </span>
        </Tip>
      )}
    </div>
  );

  const boardColumn = (
    <div className="board-col min-w-0 lg:sticky lg:top-0 lg:order-last lg:self-start" data-testid="review-board">
      <Card className="flex flex-col">
        {playerBar(other(orientation))}
        <div className="flex gap-1.5">
          <EvalBar line={cur?.lines[0]} orientation={orientation} />
          <div className="relative min-w-0 flex-1">
            <Board fen={fens[ply]} orientation={orientation} arrows={arrows} lastMove={focus >= 0 ? ucis[focus] : undefined} hideEval />
            {destPos && lastClass && (
              <div className="pointer-events-none absolute z-10" style={{ left: `${(destPos.x + 1) * 12.5}%`, top: `${destPos.y * 12.5}%`, transform: "translate(-62%, -38%)" }}>
                <VerdictIcon v={lastClass} size={24} />
              </div>
            )}
          </div>
        </div>
        {playerBar(orientation)}
        <div className="mt-1 grid grid-cols-5 gap-1.5" data-testid="review-controls">
          <Button className="h-11!" onClick={() => go(0)} aria-label="First move">
            <ChevronsLeft size={22} />
          </Button>
          <Button className="h-11!" onClick={() => go(ply - 1)} aria-label="Previous move">
            <ChevronLeft size={22} />
          </Button>
          <Button className="h-11!" onClick={() => go(ply + 1)} aria-label="Next move">
            <ChevronRight size={22} />
          </Button>
          <Button className="h-11!" onClick={() => go(ucis.length)} aria-label="Last move">
            <ChevronsRight size={22} />
          </Button>
          <Button className="h-11!" onClick={() => setFlip((f) => !f)} aria-label="Flip board">
            <Repeat size={18} />
          </Button>
        </div>
        <div className="mt-2 flex min-h-6 flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm" data-testid="move-info">
          {focus < 0 ? (
            <span className="text-muted">Starting position · ← → to step through</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <VerdictIcon v={lastClass} size={18} />
                <b>{plyLabel(focus, sans[focus])}</b> is {lastClass === "book" ? "a book move" : lastClass ? VERDICT_LABEL[lastClass] : "being analysed…"}
              </span>
              {bestBefore && bestBefore !== ucis[focus] && lastClass && !["book", "forced", "splendid", "perfect"].includes(lastClass) && (
                <span className="flex items-center gap-1.5">
                  <VerdictIcon v="best" size={18} />
                  <b>{uciToSan(fens[focus], bestBefore)}</b> was best
                </span>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_min(560px,45%)]" style={{ ["--board-max" as string]: "calc(100dvh - 19rem)" }}>
      {boardColumn}
      <div className="flex min-w-0 flex-col gap-[var(--gap)]">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <b>{game.result}</b> · {game.speed}
              {game.rated ? " · rated" : ""} · {new Date(game.date).toISOString().slice(0, 10)} · {s.eco} {s.opening}
              {game.url && (
                <a className="ui-link ml-2 inline-flex items-center gap-1" href={game.url} target="_blank" rel="noreferrer">
                  {game.site === "lichess" && <LichessIcon size={13} />}
                  {game.site} <ExternalLink size={12} />
                </a>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={15} /> Close
            </Button>
          </div>
          {progress !== null && (
            <div className="mt-3 flex items-center gap-3 text-xs text-muted">
              <Progress value={progress * 100} className="flex-1" /> analysing at depth {settings.depth}…
            </div>
          )}
        </Card>

        <Card data-testid="accuracy">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
            <div className="truncate text-right font-semibold">{game.white}</div>
            <div />
            <div className="truncate font-semibold">{game.black}</div>
            <div className="text-right">
              <span className="num inline-block min-w-16 rounded-ui px-2 py-1 text-center font-bold" style={{ background: "#f2f2f2", color: "#111" }}>
                {accuracy ? accuracy.w.toFixed(1) : "…"}
              </span>
            </div>
            <div className="ui-label text-center">accuracy</div>
            <div>
              <span className="num inline-block min-w-16 rounded-ui px-2 py-1 text-center font-bold" style={{ background: "#2a2a2a", color: "#eee", outline: "1px solid var(--border)" }}>
                {accuracy ? accuracy.b.toFixed(1) : "…"}
              </span>
            </div>
            {RECAP.filter((k) => counts.w[k] || counts.b[k] || isBad(k)).map((k) => (
              <Fragment key={k}>
                <button
                  className="num text-right font-semibold enabled:hover:underline disabled:opacity-40"
                  style={{ color: classColor(k) }}
                  disabled={!counts.w[k]}
                  onClick={() => nextOfClass("w", k)}
                >
                  {counts.w[k] ?? 0}
                </button>
                <div className="flex items-center gap-2 text-[0.82rem]">
                  <VerdictIcon v={k} size={16} /> {RECAP_LABEL[k]}
                </div>
                <button
                  className="num text-left font-semibold enabled:hover:underline disabled:opacity-40"
                  style={{ color: classColor(k) }}
                  disabled={!counts.b[k]}
                  onClick={() => nextOfClass("b", k)}
                >
                  {counts.b[k] ?? 0}
                </button>
              </Fragment>
            ))}
          </div>
          <div className="mt-2 text-center text-xs text-muted">Click a count to jump to the next such move.</div>
        </Card>

        <Card pad={false} className="overflow-hidden">
          <EvalGraph wins={wins} ply={ply} classes={classes} exitPly={s.deviation.ply} onPick={go} />
        </Card>

        <div className="grid gap-[var(--gap)] xl:grid-cols-2">
          <Card>
            <CardHeader title="Moves" sub="Dashed underline: where the game left the named book." />
            <MovesTable sans={sans} ply={ply} classes={classes} exitPly={s.deviation.ply} onPick={go} />
          </Card>
          <Card>
            <CardHeader title="Engine" sub={cur ? `depth ${cur.depth} · ${cur.source}` : "analysing…"} />
            <div className="flex flex-col gap-1.5 text-[0.84rem]" data-testid="engine-lines">
              {cur?.lines.length ? (
                cur.lines.map((l, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="num min-w-14 rounded-ui px-1.5 py-0.5 text-center text-xs font-bold"
                      style={{ background: lineWinPct(l) >= 50 ? "#f2f2f2" : "#2a2a2a", color: lineWinPct(l) >= 50 ? "#111" : "#eee", outline: "1px solid var(--border)" }}
                    >
                      {fmtEval(l)}
                    </span>
                    <span className="leading-6">{pvToSan(fens[ply], l.pv, 10).join(" ")}</span>
                  </div>
                ))
              ) : (
                <span className="text-muted">…</span>
              )}
            </div>
            {focus >= 0 && (
              <div className="mt-3" key={ply}>
                <AskClaude
                  disabled={!ev(focus) || !ev(ply)}
                  input={() => {
                    const b = ev(focus)!;
                    const a = ev(ply)!;
                    return {
                      fen: fens[focus],
                      moveSan: sans[focus],
                      mover: focus % 2 === 0 ? "w" : "b",
                      verdict: verdicts[focus],
                      evalBefore: fmtEval(b.lines[0]),
                      evalAfter: fmtEval(a.lines[0]),
                      bestSan: uciToSan(fens[focus], b.lines[0].pv[0]),
                      bestLineSan: pvToSan(fens[focus], b.lines[0].pv),
                      afterLineSan: pvToSan(fens[ply], a.lines[0].pv),
                      opening: s.opening,
                    };
                  }}
                />
              </div>
            )}
          </Card>
        </div>

        <Card data-testid="review-mistakes">
          <CardHeader
            title="Mistakes"
            sub="Inaccuracies, mistakes and blunders, with the engine's move and the win% given up. Click to jump."
            actions={
              <Seg
                value={mistakesOf}
                onChange={setMistakesOf}
                options={[
                  ["me", "Yours"],
                  ["both", "Both sides"],
                ]}
              />
            }
          />
          {mistakes.length === 0 ? (
            <div className="text-sm text-muted">{progress !== null ? "Analysing…" : "None: a clean game."}</div>
          ) : (
            <table className="ui-table">
              <tbody>
                {mistakes.map((i) => {
                  const best = ev(i)?.lines[0]?.pv[0];
                  const lost = wins[i] !== undefined && wins[i + 1] !== undefined ? Math.abs(wins[i]! - wins[i + 1]!) : undefined;
                  const rep = model.moves.find((m) => m.color === s.color && m.fromKey === posKey(fens[i]) && m.uci === ucis[i]);
                  return (
                    <tr key={i} className="cursor-pointer" data-hl={ply === i + 1} onClick={() => go(i + 1)}>
                      <td className="w-6">
                        <SideIcon c={i % 2 === 0 ? "w" : "b"} />
                      </td>
                      <td className="font-semibold whitespace-nowrap">{plyLabel(i, sans[i])}</td>
                      <td>
                        <VerdictChip v={verdicts[i]} />
                      </td>
                      <td className="whitespace-nowrap">
                        {best && (
                          <>
                            best <b>{uciToSan(fens[i], best)}</b>
                          </>
                        )}
                      </td>
                      <td className="num text-right">{lost !== undefined ? `−${lost.toFixed(0)}%` : ""}</td>
                      <td className="text-xs text-muted">{rep && rep.count > 1 ? `played ${rep.count}× in your games` : tracked.plies[i]?.book === "in" ? "book move" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card data-testid="review-repertoire">
          <CardHeader title="Your repertoire here" sub={`${s.eco} ${s.opening} · as ${s.color === "w" ? "White" : "Black"} · ${same.length} of your games reached this line`} />
          <div className="mb-3 flex flex-col gap-1 text-sm">
            <div>
              This game:{" "}
              {s.deviation.by === "none" ? (
                "never left the named book."
              ) : s.deviation.by === "exhausted" ? (
                `the named line ended before ${plyLabel(s.deviation.ply, s.deviation.san ?? "")}.`
              ) : (
                <>
                  <b style={{ color: s.deviation.by === "user" ? "var(--bad)" : "var(--warn)" }}>{s.deviation.by === "user" ? "you" : "your opponent"}</b> left the book with{" "}
                  <button className="ui-link" onClick={() => go(s.deviation.ply + 1)}>
                    {plyLabel(s.deviation.ply, s.deviation.san ?? "")}
                  </button>
                  .
                </>
              )}
            </div>
            {open && (
              <div className="text-muted">
                In this line you left the book first {open.userLeft}×, your opponents {open.opponentLeft}×, and the line ran out {open.exhausted}×.
              </div>
            )}
          </div>
          {at >= 0 && at < ucis.length && (
            <>
              <div className="ui-label mb-1">
                before {plyLabel(at, sans[at])} ({mine ? "your move" : "opponent's move"}) · position reached in {node ? node.count : 0} of your games
              </div>
              {node ? (
                <table className="ui-table" data-testid="review-position">
                  <thead>
                    <tr>
                      <th>Move</th>
                      <th>Book</th>
                      <th className="text-right">Played</th>
                      <th className="text-right">%</th>
                      <th>{mine ? "Verdict" : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {node.edges.slice(0, 8).map((e) => (
                      <tr key={e.uci} data-hl={e.uci === ucis[at]}>
                        <td className="font-semibold whitespace-nowrap">
                          {e.san}
                          {e.uci === ucis[at] && <span className="ml-2 text-xs font-normal text-muted">this game</span>}
                        </td>
                        <td>
                          <BookChip s={e.book} />
                        </td>
                        <td className="num text-right">
                          {e.count} / {node.count}
                        </td>
                        <td className="num text-right">{Math.round((e.count / Math.max(1, node.count)) * 100)}%</td>
                        <td>{mine ? <VerdictChip v={verdictOf(s.color, node.key, e.uci)} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-muted">Your loaded games never reached this position.</div>
              )}
              {node && !node.edges.some((e) => e.uci === ucis[at]) && <div className="mt-1 text-sm text-muted">{sans[at]} is new here: not played in your other games.</div>}
            </>
          )}
          {repeated.length > 0 && (
            <>
              <div className="ui-label mt-4 mb-1">mistakes you have repeated in other games</div>
              <div className="flex flex-col gap-1">
                {repeated.map((m) => (
                  <button key={m.id} className="flex items-center gap-2 rounded-ui p-1 text-left text-sm hover:bg-hover" onClick={() => go(m.ply + 1)}>
                    <VerdictIcon v={verdict(m)} />
                    <b>{plyLabel(m.ply, m.san)}</b>
                    <span className="text-muted">played {m.count}× in this position</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Two-column move list with verdict icons; the current move stays in view. */
function MovesTable({ sans, ply, classes, exitPly, onPick }: { sans: string[]; ply: number; classes: (MoveClass | undefined)[]; exitPly: number; onPick: (p: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-ply="${ply}"]`);
    if (el && box.current) box.current.scrollTop = el.offsetTop - box.current.clientHeight / 2;
  }, [ply]);
  const cell = (i: number) =>
    i < sans.length ? (
      <button
        data-ply={i + 1}
        className="ui-move flex w-full items-center gap-1.5 text-left"
        data-on={ply === i + 1}
        onClick={() => onPick(i + 1)}
        style={i === exitPly ? { borderBottom: "2px dashed var(--warn)" } : undefined}
      >
        <VerdictIcon v={classes[i]} size={15} />
        {sans[i]}
      </button>
    ) : null;
  return (
    <div ref={box} className="relative max-h-[22rem] overflow-auto text-[0.86rem]" data-testid="review-moves">
      <table className="w-full">
        <tbody>
          {Array.from({ length: Math.ceil(sans.length / 2) }, (_, r) => (
            <tr key={r} style={r % 2 ? undefined : { background: "var(--hover)" }}>
              <td className="num w-9 py-0.5 pl-2 text-muted">{r + 1}.</td>
              <td className="w-1/2 py-0.5 pr-1">{cell(2 * r)}</td>
              <td className="w-1/2 py-0.5 pr-1">{cell(2 * r + 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** White's win% over the game (as in Chesskit's graph tab): click to jump; dots mark mistakes. */
function EvalGraph({ wins, ply, classes, exitPly, onPick }: { wins: (number | undefined)[]; ply: number; classes: (MoveClass | undefined)[]; exitPly: number; onPick: (p: number) => void }) {
  const n = Math.max(1, wins.length - 1);
  const W = 1000;
  const H = 140;
  let last = 50;
  const filled = wins.map((w) => (last = w ?? last));
  const pts = filled.map((w, i) => `${((i / n) * W).toFixed(1)},${(H - (w / 100) * H).toFixed(1)}`).join(" ");
  const pct = (i: number) => `${(i / n) * 100}%`;
  return (
    <div
      className="relative h-36 w-full cursor-pointer"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick(Math.round(((e.clientX - r.left) / r.width) * n));
      }}
      data-testid="eval-graph"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect width={W} height={H} fill="#2a2a2a" />
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="#f2f2f2" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      </svg>
      {exitPly >= 0 && <div className="absolute top-0 bottom-0 border-l-2 border-dashed" style={{ left: pct(exitPly + 1), borderColor: "var(--warn)" }} title="Left the book" />}
      <div className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(ply), background: "var(--accent)" }} />
      {classes.map((c, i) =>
        isBad(c) ? (
          <div
            key={i}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: pct(i + 1), top: `${100 - filled[i + 1]}%`, background: VERDICT_COLOR[c as Verdict], outline: "1px solid #000" }}
          />
        ) : null,
      )}
    </div>
  );
}
