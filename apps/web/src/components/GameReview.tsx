// Single-game review, after Chesskit's analysis page (GPL-3.0) inside our shell.
// Left: the repertoire at the current move (the bot page's alerts) on top, then
// the eval graph and the live engine lines side by side, then the mistakes.
// Right: the board with its controls, the accuracy and move-class summary, and
// the move list.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Dumbbell, Lightbulb, Repeat } from "lucide-react";
import { gameAccuracy } from "@outofbook/core/accuracy";
import { bookChildren } from "@outofbook/core/book";
import { classify } from "@outofbook/core/classify";
import { fmtEval, lineWinPct, plyLabel, posKey, pvToSan, uciParams, uciToSan } from "@outofbook/core/chess";
import { moveNotes, usualMove, type MoveNote, type MoveNotes } from "@outofbook/core/moveNotes";
import { ENGINE_BUILDS, EnginePool, LiveEngine, defaultPoolSize, preloadBuild, type EngineBuild } from "../lib/engine";
import { cloudEval, evalNow, getEval, putEval } from "../lib/evalCache";
import { hasAuth, shareEval } from "../lib/server";
import { trackLine } from "@outofbook/core/lineTracker";
import { buildRepertoire } from "@outofbook/core/repertoire";
import { IS_CAPACITOR } from "../lib/platform";
import type { Settings } from "../lib/settings";
import { BAD_VERDICTS, type Line, type MoveStat, type PosEval, type RawGame, type RepertoireModel, type Side, type Verdict } from "@outofbook/core/types";
import { AskClaude } from "./AskClaude";
import { BookChip, BOOK_COLOR, SideIcon, VERDICT_COLOR, VERDICT_LABEL, VerdictChip, VerdictIcon } from "./bits";
import { Board, EvalBar, uciArrow, type Arrow } from "./Board";
import type { VerdictOf } from "./RepertoireView";
import { Alert, Badge, Button, Card, CardHeader, Progress, Seg, Select, Tip, cx } from "./ui";

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
const DEPTHS: [string, string][] = [
  ["12", "depth 12"],
  ["14", "depth 14"],
  ["16", "depth 16"],
  ["18", "depth 18"],
  ["20", "depth 20"],
  ["24", "depth 24"],
  ["0", "depth ∞"],
];
const other = (c: Side): Side => (c === "w" ? "b" : "w");
const sideOf = (i: number): Side => (i % 2 === 0 ? "w" : "b");
const isBad = (c?: MoveClass) => !!c && BAD_VERDICTS.includes(c as Verdict);
const classColor = (c: MoveClass) => (c === "book" ? BOOK_COLOR : VERDICT_COLOR[c]);
const afterMove = (fen: string, uci: string) => {
  const c = new Chess(fen);
  c.move(uciParams(uci));
  return c.fen();
};
const NOTE_TONE = { bad: "bad", warn: "warn", accent: "info", info: "info" } as const;

export function GameReview({
  game,
  model,
  evalOf,
  verdict,
  verdictOf,
  settings,
  onSettings,
  onPractice,
}: {
  game: RawGame;
  model: RepertoireModel;
  evalOf: (k: string) => PosEval | undefined;
  verdict: (m: MoveStat) => Verdict | undefined;
  verdictOf: VerdictOf;
  settings: Settings;
  /** Saves engine choices made on this page (they become the defaults). */
  onSettings: (s: Partial<Settings>) => void;
  /** Opens Play vs bot from this position, as the user's color. */
  onPractice: (color: Side, ucis: string[]) => void;
}) {
  // Games outside the loaded set (e.g. bot games) get a summary of their own.
  const inModel = !!model.games[game.id];
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
  const graph = model.graphs[s.color];
  // This game is counted in its own positions when it is part of the loaded set (the tree stops at treeMaxPly).
  const thisGame = (i: number): 0 | 1 => (inModel && i < settings.treeMaxPly ? 1 : 0);
  // Your usual move where you played another: its position is analyzed too, to compare.
  const usualFens = useMemo(
    () =>
      ucis.map((u, i) => {
        if (sideOf(i) !== s.color) return undefined;
        const um = usualMove(graph[posKey(fens[i])], u, inModel && i < settings.treeMaxPly ? 1 : 0);
        return um ? afterMove(fens[i], um.uci) : undefined;
      }),
    [ucis, fens, graph, s.color, inModel, settings.treeMaxPly],
  );

  const [ply, setPly] = useState(0);
  const [flip, setFlip] = useState(false);
  const [local, setLocal] = useState<Record<string, PosEval>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [mistakesOf, setMistakesOf] = useState<"me" | "both">("me");
  const go = (p: number) => setPly(Math.max(0, Math.min(ucis.length, p)));
  const build = settings.engineBuild;
  // Layout from the space the page has, not the device. "desk": the full page
  // (repertoire beside the board, the rest below). Otherwise the board and one
  // panel with tabs fill the screen, side by side when the space is wide for
  // its height, else stacked; the page itself then does not scroll.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ mode: "desk" | "side" | "stack"; cardW: number; panel: number }>(() => ({
    mode: window.matchMedia("(min-width: 1100px)").matches ? "desk" : "stack",
    cardW: 0,
    panel: 0,
  }));
  const wide = fit.mode === "desk";
  const [tab, setTab] = useState<"rep" | "engine" | "moves">("rep");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") setPly((p) => Math.min(ucis.length, p + 1));
      else if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      else if (e.key === "Home") setPly(0);
      else if (e.key === "End") setPly(ucis.length);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ucis.length]);

  // The full build is 113 MB: downloaded once (with progress), then every worker loads it from the browser cache.
  const [buildReady, setBuildReady] = useState<EngineBuild | null>(build === "lite" ? "lite" : null);
  useEffect(() => {
    let live = true;
    if (build === "lite") {
      setBuildReady("lite");
      return;
    }
    setBuildReady(null);
    setDownload(0);
    preloadBuild(build, (f) => live && setDownload(f))
      .catch(() => {})
      .finally(() => {
        if (!live) return;
        setDownload(null);
        setBuildReady(build);
      });
    return () => {
      live = false;
    };
  }, [build]);

  // Game pass, as in Chesskit: every position (and your usual moves' positions) analyzed once, at the
  // Engine panel's depth and number of lines, so browsing the game only reads the results; the live
  // engine runs only for depth ∞ or a position the pass has not reached yet.
  // Sources: the browser cache, the server's shared cache, the Lichess cloud, then the engine pool.
  const target = settings.reviewDepth;
  const nLines = settings.reviewLines;
  const passDepth = target || 14;
  useEffect(() => {
    if (buildReady !== build) return;
    let live = true;
    let pool: EnginePool | null = null;
    const eng = (f: string, d: number, m: number) => (pool ??= new EnginePool(settings.poolSize || defaultPoolSize(), build)).analyze(f, d, m);
    const all = [...new Set([...fens, ...usualFens.filter((f): f is string => !!f)])];
    const want = (f: string) => Math.min(nLines, new Chess(f).moves().length);
    const enough = (f: string, e?: PosEval) => !!e && e.depth >= passDepth && e.lines.length >= want(f);
    const todo = all.filter((f) => want(f) > 0 && !enough(f, evalOf(posKey(f))));
    if (!todo.length) return;
    let done = 0;
    setProgress(0);
    Promise.all(
      todo.map(async (fen) => {
        // The cloud only for the opening plies, as the background analysis does (Settings: cloud eval up to ply).
        const early = fens.indexOf(fen) >= 0 ? fens.indexOf(fen) < settings.cloudMaxPly : false;
        const e = await evalNow(fen, passDepth, nLines, eng, want(fen), settings.useCloud && early);
        if (!live) return;
        setLocal((l) => ({ ...l, [posKey(fen)]: e }));
        setProgress(++done / todo.length);
      }),
    )
      .catch(() => {})
      .finally(() => live && setProgress(null));
    return () => {
      live = false;
      pool?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fens, usualFens, passDepth, nLines, settings.poolSize, build, buildReady]);

  const evKey = (k: string) => local[k] ?? evalOf(k);
  const ev = (i: number) => evKey(posKey(fens[i]));
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
    if (k) counts[sideOf(i)][k] = (counts[sideOf(i)][k] ?? 0) + 1;
  });

  // What every move means for your repertoire (the bot page's alerts).
  const notes: MoveNotes[] = ucis.map((u, i) => {
    const leftBook = tracked.exit?.kind === "left" && tracked.exit.ply === i;
    const before = ev(i);
    const best = before?.lines[0]?.pv[0];
    return moveNotes({
      me: s.color,
      mover: sideOf(i),
      san: sans[i],
      uci: u,
      book: tracked.plies[i]?.book ?? "after",
      leftBook,
      bookSans: leftBook ? bookChildren(fens[i]).map((b) => b.san) : [],
      node: graph[posKey(fens[i])],
      thisGame: thisGame(i),
      verdict: verdicts[i],
      before,
      after: ev(i + 1),
      usualAfter: usualFens[i] ? evKey(posKey(usualFens[i]!)) : undefined,
      bestSan: best ? uciToSan(fens[i], best) : undefined,
    });
  });

  const orientation: Side = flip ? other(s.color) : s.color;
  const focus = ply - 1; // the move just played (-1 at the start)
  const lastClass = focus >= 0 ? classes[focus] : undefined;
  const focusNotes = focus >= 0 ? notes[focus] : undefined;
  const bestBefore = focus >= 0 ? ev(focus)?.lines[0]?.pv[0] : undefined;

  // Live engine on the current position: the cache or Lichess cloud when deep enough, else the chosen build, deepening.
  const [liveEv, setLiveEv] = useState<{ fen: string; ev: PosEval } | null>(null);
  const engineRef = useRef<LiveEngine | null>(null);
  // The repertoire box is as tall as the board itself (not its card).
  const boardCard = useRef<HTMLDivElement>(null);
  const repBody = useRef<HTMLDivElement>(null);
  const [boardH, setBoardH] = useState(0);
  useEffect(() => {
    const el = boardCard.current?.querySelector<HTMLElement>(".board-wrap");
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // A review opens at its top, whatever the page before was scrolled to.
    rootRef.current?.closest("main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const main = root.closest("main");
    const measure = () => {
      const top = root.getBoundingClientRect().top + (main?.scrollTop ?? 0) + window.scrollY;
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) : 16;
      const avail = window.innerHeight - top - pad;
      const w = root.clientWidth;
      const card = boardCard.current;
      const wrap = card?.querySelector<HTMLElement>(".board-wrap");
      // What the board card needs around the board itself (player bars, controls, eval bar).
      const ex = card && wrap ? { x: card.offsetWidth - wrap.offsetWidth, y: card.offsetHeight - wrap.offsetHeight } : { x: 60, y: 170 };
      const gap = 16;
      let next: typeof fit;
      if (w >= 1100 && avail >= 700) next = { mode: "desk", cardW: 0, panel: 0 };
      else if (w >= 600 && w > 0.8 * avail) {
        const board = Math.max(240, Math.min(avail - ex.y, w - 320 - gap - ex.x));
        next = { mode: "side", cardW: Math.floor(board + ex.x), panel: Math.max(320, Math.floor(avail)) };
      } else {
        const board = Math.max(220, Math.min(w - ex.x, avail - ex.y - gap - Math.max(260, 0.4 * avail)));
        next = { mode: "stack", cardW: Math.floor(board + ex.x), panel: Math.max(260, Math.floor(avail - board - ex.y - gap)) };
      }
      setFit((f) => (f.mode === next.mode && f.cardW === next.cardW && f.panel === next.panel ? f : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // The layout's root element changes with the mode.
  }, [fit.mode]);
  // Each move starts at its alerts.
  // (Braces: this Chromium's scrollTo returns a Promise, which React would take for a cleanup function.)
  useEffect(() => {
    repBody.current?.scrollTo({ top: 0 });
  }, [ply]);
  useEffect(() => {
    if (buildReady !== build) return;
    const fen = fens[ply];
    const legal = new Chess(fen).moves().length;
    if (!legal) return setLiveEv(null);
    const want = Math.min(nLines, legal);
    const key = posKey(fen);
    let live = true;
    let last: PosEval | null = null;
    const enough = (e?: PosEval | null) => !!e && target > 0 && e.depth >= target && e.lines.length >= want;
    // Kept when deeper than what is stored (or as deep with more lines); shared with the server cache.
    const save = (e: PosEval, prev?: PosEval) => {
      if (e.depth < settings.depth || (prev && (prev.depth > e.depth || (prev.depth === e.depth && prev.lines.length >= e.lines.length)))) return;
      void putEval(key, e);
      shareEval(key, e, hasAuth());
    };
    (async () => {
      const cached = await getEval(key, 0);
      if (!live) return;
      setLiveEv(cached && cached.lines.length >= want ? { fen, ev: cached } : null);
      if (enough(cached)) return;
      if (settings.useCloud) {
        const c = await cloudEval(fen, want).catch(() => undefined);
        if (!live) return;
        if (c && c !== "busy" && enough(c)) {
          setLiveEv({ fen, ev: c });
          save(c, cached);
          return;
        }
      }
      if (engineRef.current?.build !== build) {
        engineRef.current?.terminate();
        engineRef.current = new LiveEngine(build);
      }
      const done = await engineRef.current.analyze(fen, target, want, (e) => {
        if (!live) return;
        last = e;
        setLiveEv({ fen, ev: e });
      });
      if (done) save(done, cached);
    })().catch(() => {});
    return () => {
      live = false;
      engineRef.current?.stop();
      // An endless (∞) search is saved when the user moves on.
      if (last && target === 0) void getEval(key, 0).then((prev) => save(last!, prev));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, fens, build, buildReady, target, nLines]);
  useEffect(() => () => engineRef.current?.terminate(), []);

  const cur = liveEv?.fen === fens[ply] ? liveEv.ev : ev(ply);
  // The move the game played from here, highlighted among the engine lines (or added below them).
  const playedUci = ply < ucis.length ? ucis[ply] : undefined;
  const engineRows: { line: Line; played: boolean }[] = (cur?.lines ?? []).slice(0, nLines).map((l) => ({ line: l, played: l.pv[0] === playedUci }));
  if (playedUci && cur?.lines.length && !engineRows.some((r) => r.played)) {
    const after = ev(ply + 1)?.lines[0];
    if (after) engineRows.push({ line: { ...after, pv: [playedUci, ...after.pv] }, played: true });
  }

  // Arrows: on a flagged move of yours, what you played (red), your usual or the book's move (green) and the engine's (blue).
  const arrows: Arrow[] = [];
  const leftBookHere = !!focusNotes?.notes.some((n) => n.kind === "left-book");
  if (focusNotes && (focusNotes.bad || focusNotes.offUsual || focusNotes.better || leftBookHere)) {
    arrows.push(uciArrow(ucis[focus], "red"));
    const want = focusNotes.usual?.uci ?? (leftBookHere ? [...bookChildren(fens[focus])].sort((a, b) => b.namedBelow - a.namedBelow)[0]?.uci : undefined);
    if (want) arrows.push(uciArrow(want, "green"));
    if (bestBefore && bestBefore !== ucis[focus] && bestBefore !== want) arrows.push(uciArrow(bestBefore, "blue"));
  } else if (cur?.lines[0]?.pv[0]) arrows.push(uciArrow(cur.lines[0].pv[0], "green"));

  const nextOfClass = (side: Side, k: MoveClass) => {
    const idx = classes.map((c, i) => (c === k && sideOf(i) === side ? i : -1)).filter((i) => i >= 0);
    const next = idx.find((i) => i + 1 > ply) ?? idx[0];
    if (next !== undefined) go(next + 1);
  };

  // Repertoire at the current move: what you (or your opponents) played in the position before it.
  const at = ply < ucis.length ? ply : ply - 1;
  const node = at >= 0 ? graph[posKey(fens[at])] : undefined;
  const mine = sideOf(at) === s.color;
  const same = Object.values(model.games).filter((g) => g.color === s.color && g.opening === s.opening);
  const open = model.openings.find((o) => o.color === s.color && o.name === s.opening);
  const repeated = model.moves.filter((m) => m.color === s.color && m.gameIds.includes(game.id) && BAD_VERDICTS.includes(verdict(m)!) && m.count > 1);
  const mistakes = ucis.map((_, i) => i).filter((i) => BAD_VERDICTS.includes(verdicts[i]!) && (mistakesOf === "both" || sideOf(i) === s.color));
  const name = (c: Side) => (c === "w" ? game.white : game.black);
  const firstMine = (f: (n: MoveNotes) => boolean) => notes.findIndex((n, i) => sideOf(i) === s.color && f(n));
  const jumps = (
    [
      ["Book exit", s.deviation.by === "user" || s.deviation.by === "opponent" ? s.deviation.ply : -1],
      ["Off your usual", firstMine((n) => n.offUsual)],
      ["Better move", firstMine((n) => n.better)],
      ["Your first mistake", firstMine((n) => n.bad)],
    ] as [string, number][]
  ).filter(([, i]) => i >= 0);

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

  const summary = (
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
            <button className="num text-right font-semibold enabled:hover:underline disabled:opacity-40" style={{ color: classColor(k) }} disabled={!counts.w[k]} onClick={() => nextOfClass("w", k)}>
              {counts.w[k] ?? 0}
            </button>
            <div className="flex items-center gap-2 text-[0.82rem]">
              <VerdictIcon v={k} size={16} /> {RECAP_LABEL[k]}
            </div>
            <button className="num text-left font-semibold enabled:hover:underline disabled:opacity-40" style={{ color: classColor(k) }} disabled={!counts.b[k]} onClick={() => nextOfClass("b", k)}>
              {counts.b[k] ?? 0}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="mt-2 text-center text-xs text-muted">Click a count to jump to the next such move.</div>
    </Card>
  );
  const moveList = (
    <Card>
      <CardHeader title="Moves" sub="Dashed: left the book. Amber dot: not your usual move. Bulb: a better move was available." />
      <MovesTable sans={sans} ply={ply} classes={classes} notes={notes} me={s.color} exitPly={s.deviation.ply} onPick={go} />
    </Card>
  );

  const boardColumn = (
    <div className="board-col min-w-0 space-y-[var(--gap)] lg:order-last" data-testid="review-board">
      <Card className="flex flex-col" ref={boardCard} data-testid="review-board-card">
        {playerBar(other(orientation))}
        <div className="flex gap-1.5">
          <EvalBar line={cur?.lines[0]} orientation={orientation} />
          <div className="relative min-w-0 flex-1">
            <Board fen={fens[ply]} orientation={orientation} arrows={arrows} lastMove={focus >= 0 ? ucis[focus] : undefined} hideEval />
            {progress !== null && (
              // On the board while the game is analyzed; the board stays usable under it.
              <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex flex-col gap-1.5 rounded-ui bg-black/75 px-3 py-2 text-xs text-white" data-testid="review-progress">
                <Progress value={progress * 100} />
                <span>
                  Analyzing the game at depth {passDepth}, {nLines} lines, with {ENGINE_BUILDS[build].label}… {Math.round(progress * 100)}%
                </span>
              </div>
            )}
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
                <b>{plyLabel(focus, sans[focus])}</b> is {lastClass === "book" ? "a book move" : lastClass ? VERDICT_LABEL[lastClass] : "being analyzed…"}
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
      {wide && summary}
      {wide && moveList}
    </div>
  );

  const engineCard = (
    <Card className="min-w-0" data-testid="review-engine">
      <div className="mb-2 flex items-baseline gap-2">
        <div className="ui-h2">Engine</div>
        <div className="min-w-0 flex-1 truncate text-right text-xs text-muted" data-testid="engine-status">
          {download !== null
            ? `Downloading ${ENGINE_BUILDS[build].label} (${ENGINE_BUILDS[build].mb} MB): ${Math.round(download * 100)}%`
            : cur
              ? `${cur.source === "engine" ? ENGINE_BUILDS[build].label : cur.source} · depth ${cur.depth}${target && cur.source === "engine" && cur.depth < target ? ` of ${target}` : ""}`
              : "analyzing…"}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {!IS_CAPACITOR && (
          <Seg
            value={build}
            onChange={(engineBuild) => onSettings({ engineBuild })}
            options={[
              ["lite", "Lite"],
              ["full", "Full"],
            ]}
          />
        )}
        <Select aria-label="Engine depth" value={String(target)} onChange={(e) => onSettings({ reviewDepth: +e.target.value })} options={DEPTHS} />
        <Select
          aria-label="Engine lines"
          value={String(nLines)}
          onChange={(e) => onSettings({ reviewLines: +e.target.value })}
          options={[1, 2, 3, 4, 5].map((n) => [String(n), `${n} line${n > 1 ? "s" : ""}`])}
        />
      </div>
      {download !== null && <Progress value={download * 100} className="mb-2" />}
      <div className="flex flex-col gap-1 text-[0.84rem]" data-testid="engine-lines">
        {engineRows.length ? (
          engineRows.map(({ line: l, played }, i) => (
            <div
              key={i}
              className={cx("flex items-start gap-2 rounded-ui px-1 py-0.5", played && "outline-1")}
              style={
                played ? { background: "color-mix(in oklab, var(--accent) 12%, transparent)", outlineStyle: "solid", outlineColor: "color-mix(in oklab, var(--accent) 45%, transparent)" } : undefined
              }
              data-testid="engine-line"
              data-played={played || undefined}
            >
              <span
                className="num min-w-14 rounded-ui px-1.5 py-0.5 text-center text-xs font-bold"
                style={{ background: lineWinPct(l) >= 50 ? "#f2f2f2" : "#2a2a2a", color: lineWinPct(l) >= 50 ? "#111" : "#eee", outline: "1px solid var(--border)" }}
              >
                {fmtEval(l)}
              </span>
              <span className="min-w-0 flex-1 leading-6">
                {played && (
                  <Badge tone="accent" className="mr-1.5">
                    played
                  </Badge>
                )}
                {pvToSan(fens[ply], l.pv, 10).join(" ")}
              </span>
            </div>
          ))
        ) : (
          <span className="text-muted">{new Chess(fens[ply]).moves().length ? "…" : "Game over."}</span>
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
                mover: sideOf(focus),
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
  );

  const repCard = (
    <Card data-testid="review-repertoire" className="flex flex-col" style={wide ? (boardH ? { height: boardH } : undefined) : { flex: "1 1 0", minHeight: 280 }}>
      <CardHeader
        title="Your repertoire"
        sub={`${s.eco} ${s.opening} · as ${s.color === "w" ? "White" : "Black"} · ${same.length} of your games reached this line`}
        actions={
          <Button size="sm" onClick={() => onPractice(s.color, ucis.slice(0, ply))} title="Play on from this position against the bot, with the drill on">
            <Dumbbell size={14} /> Practice from here
          </Button>
        }
      />
      {jumps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" data-testid="review-jumps">
          {jumps.map(([label, i]) => (
            <Button key={label} size="sm" variant={ply === i + 1 ? "primary" : "secondary"} onClick={() => go(i + 1)}>
              {label}: {plyLabel(i, sans[i])}
            </Button>
          ))}
        </div>
      )}
      {/* Fixed height (the board's): the content scrolls, so the page does not jump from move to move. */}
      <div ref={repBody} className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2" data-testid="review-repertoire-body">
        <div className="mb-3 flex flex-col gap-2" data-testid="review-alerts">
          {focus < 0 ? (
            <div className="text-sm text-muted">Step through the game: each move is checked against your repertoire and the book.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <b>{plyLabel(focus, sans[focus])}</b>
                <span className="text-muted">({sideOf(focus) === s.color ? "your move" : "opponent's move"})</span>
                <BookChip s={tracked.plies[focus]?.book ?? "after"} />
                {sideOf(focus) === s.color && <VerdictChip v={verdicts[focus]} />}
              </div>
              {focusNotes!.notes.map((n) => (
                <NoteBox key={n.kind} n={n} />
              ))}
            </>
          )}
        </div>
        <div className="mb-3 text-sm text-muted">
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
          {open && ` In this line you left the book first ${open.userLeft}×, your opponents ${open.opponentLeft}×, and the line ran out ${open.exhausted}×.`}
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
      </div>
    </Card>
  );
  const graphCard = (
    <Card pad={false} className={cx("overflow-hidden", wide ? "min-h-40" : "h-24 shrink-0")}>
      <EvalGraph wins={wins} ply={ply} classes={classes} exitPly={s.deviation.ply} onPick={go} />
    </Card>
  );
  const graphEngine = (
    <div className="grid gap-[var(--gap)] @2xl:grid-cols-2" data-testid="graph-engine">
      {graphCard}
      {engineCard}
    </div>
  );
  const mistakesCard = (
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
        <div className="text-sm text-muted">{progress !== null ? "Analyzing…" : "None: a clean game."}</div>
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
                    <SideIcon c={sideOf(i)} />
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
  );

  if (!wide)
    return (
      <div
        ref={rootRef}
        className={cx("grid gap-[var(--gap)]", fit.mode === "side" ? "items-start" : "justify-items-center")}
        style={fit.mode === "side" ? { gridTemplateColumns: `${fit.cardW}px minmax(0, 1fr)` } : undefined}
        data-layout={fit.mode}
      >
        <div className="w-full" style={{ maxWidth: fit.cardW || undefined }}>
          {boardColumn}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2" style={{ height: fit.panel || undefined }} data-testid="review-panel">
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              ["rep", "Repertoire"],
              ["engine", "Engine"],
              ["moves", "Moves"],
            ]}
          />
          <div className="@container -mr-1 flex min-h-0 flex-1 flex-col gap-[var(--gap)] overflow-y-auto pr-1">
            {tab === "rep" && repCard}
            {tab === "engine" && (
              // The lines first; the graph under them, short.
              <div className="flex flex-col gap-[var(--gap)]" data-testid="graph-engine">
                {engineCard}
                {graphCard}
              </div>
            )}
            {tab === "moves" && (
              <>
                {summary}
                {mistakesCard}
                {moveList}
              </>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div ref={rootRef} className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_min(560px,45%)] lg:items-start" style={{ ["--board-max" as string]: "calc(100dvh - 19rem)" }} data-layout="desk">
      {boardColumn}
      <div className="@container flex min-w-0 flex-col gap-[var(--gap)]">
        {repCard}

        {graphEngine}

        {mistakesCard}
      </div>
    </div>
  );
}

/** One repertoire alert, in the bot page's colors; "better move available" gets the bot page's callout. */
function NoteBox({ n }: { n: MoveNote }) {
  if (n.kind === "better")
    return (
      <div className="rounded-ui border-l-4 p-3 text-sm" style={{ borderColor: "var(--accent)", background: "color-mix(in oklab, var(--accent) 12%, transparent)" }} data-testid="better-move">
        <div className="flex items-center gap-2 font-semibold">
          <Lightbulb size={16} style={{ color: "var(--accent)" }} /> {n.title}
        </div>
        <div className="mt-1">{n.text}</div>
      </div>
    );
  return (
    <div data-testid="review-note" data-kind={n.kind}>
      <Alert tone={NOTE_TONE[n.tone]}>
        <div className="text-sm">
          <b>{n.title}.</b> {n.text}
        </div>
      </Alert>
    </div>
  );
}

/** Two-column move list with verdict icons and repertoire marks; the current move stays in view. */
function MovesTable({
  sans,
  ply,
  classes,
  notes,
  me,
  exitPly,
  onPick,
}: {
  sans: string[];
  ply: number;
  classes: (MoveClass | undefined)[];
  notes: MoveNotes[];
  me: Side;
  exitPly: number;
  onPick: (p: number) => void;
}) {
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
        {sideOf(i) === me && notes[i]?.offUsual && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--warn)" }} title="Not your usual move" data-testid="mark-off-usual" />
        )}
        {notes[i]?.better && <Lightbulb size={12} className="shrink-0" style={{ color: "var(--accent)" }} aria-label="Better move available" />}
      </button>
    ) : null;
  return (
    <div ref={box} className="relative max-h-[18rem] overflow-auto text-[0.86rem]" data-testid="review-moves">
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

/** White's win% over the game (as in Chesskit's graph tab): click to jump; dots mark mistakes. Fills its card. */
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
      className="relative h-full min-h-40 w-full cursor-pointer"
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
