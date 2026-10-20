import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ArrowRight, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Flag, Lightbulb, Play, RotateCcw, Shuffle, Undo2, X } from "lucide-react";
import { allNamedLines, applyMoves, Bot, searchLines, type BookMode, type NamedLine } from "../lib/bot";
import { bookChildren } from "@outofbook/core/book";
import { posKey, uciParams, uciToSan } from "@outofbook/core/chess";
import { classify } from "@outofbook/core/classify";
import { EnginePool } from "../lib/engine";
import { evalNow } from "../lib/evalCache";
import { buzz, playMoveSound, preloadSounds } from "../lib/gameFeel";
import { cachedPrefs } from "../lib/lichessPrefs";
import { trackLine } from "@outofbook/core/lineTracker";
import { findPath } from "@outofbook/core/repertoire";
import { BAD_VERDICTS, type Line, type PosEval, type RawGame, type RepertoireModel, type RepNode, type Side, type Verdict } from "@outofbook/core/types";
import { BookChip, VERDICT_COLOR, VerdictChip } from "./bits";
import { Board, uciArrow, type Arrow } from "./Board";
import { gameFeel, loadLive } from "./LiveGame";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Progress, Seg, Select, Switch } from "./ui";

type TopMoves = { fen: string; ev: PosEval; extra: Record<string, Line> };

export interface BotStart {
  color: Side;
  ucis: string[]; // moves already played (from a tree node)
}

const BOOK_MODES: [BookMode, string, string][] = [
  ["opponents", "Play like my opponents", "Bot copies the moves your opponents actually played here (by frequency), then book, then engine."],
  ["book", "Stay in the named book", "Bot picks named book moves while any exist, then plays on with the engine."],
  ["line", "Stick to one line", "Bot follows the chosen line for as long as you do."],
  ["free", "Engine only", "No opening book: the engine plays from the first move."],
];

interface Judged {
  verdict?: Verdict;
  best?: string; // san
  bestUci?: string;
  evalAfter?: PosEval;
  bestLine?: Line; // the position after the engine's best move
  usualSan?: string; // your usual move here, when you played something else
  usualAfter?: Line; // the position after your usual move
}

export function PlayBot({ model, start, depth, onReview }: { model: RepertoireModel | null; start: BotStart | null; depth: number; onReview: (g: RawGame) => void }) {
  const lines = useMemo(() => allNamedLines(), []);
  const [color, setColor] = useState<Side | "random">(start?.color ?? "w");
  const [engine, setEngine] = useState<"stockfish" | "maia">("maia");
  const [elo, setElo] = useState(1500);
  const [userElo, setUserElo] = useState(1500);
  const [bookMode, setBookMode] = useState<BookMode>("opponents");
  const [line, setLine] = useState<NamedLine | null>(null);
  const [lineQuery, setLineQuery] = useState("");
  const [startUcis, setStartUcis] = useState<string[]>(start?.ucis ?? []);
  const [drill, setDrill] = useState(true);
  const [showEval, setShowEval] = useState(false);
  // Engine top 5 for the position you are to move in.
  const [top, setTop] = useState<TopMoves | null>(null);
  // Browsing the game with the arrows under the board (null: the live position).
  const [viewPly, setViewPly] = useState<number | null>(null);

  const [game, setGame] = useState<{ chess: Chess; history: string[]; color: Side } | null>(null);
  const [botWhy, setBotWhy] = useState("");
  const [thinking, setThinking] = useState(false);
  const [maiaLoad, setMaiaLoad] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [judged, setJudged] = useState<Record<number, Judged>>({});
  const [acked, setAcked] = useState<number>(-1); // drill: last user ply the user chose to play on from
  const bot = useRef<Bot | null>(null);
  // "Other reply": moves the bot already tried in a position, used once for its next move there.
  const tried = useRef(new Map<string, string[]>());
  const retryAt = useRef<string | null>(null);
  const judge = useRef<EnginePool | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (start) {
      setColor(start.color);
      setStartUcis(start.ucis);
      if (start.ucis.length) setBookMode("opponents");
    }
  }, [start]);
  useEffect(
    () => () => {
      bot.current?.terminate();
      judge.current?.terminate();
    },
    [],
  );

  const graphFor = (c: Side) => model?.graphs[c];

  const randomLine = () => {
    // Weighted by how often you reached each named line with this color.
    const c = color === "random" ? "w" : color;
    const g = graphFor(c);
    if (!g || !model) return;
    const named = Object.values(g).filter((n) => n.book && n.count >= 2);
    const total = named.reduce((s, n) => s + n.count, 0);
    let r = Math.random() * total;
    const pick = named.find((n) => (r -= n.count) <= 0) ?? named[0];
    const path = findPath(g, model.rootKey, pick.key);
    if (!path) return;
    setLine({ eco: pick.book!.eco, name: pick.book!.name, ucis: path.map((e) => e.uci), sans: path.map((e) => e.san) });
    setBookMode("line");
  };

  const newGame = () => {
    bot.current?.terminate();
    judge.current?.terminate();
    // Two engines: one judges your moves, the other fills the top lines.
    judge.current = new EnginePool(2);
    const c: Side = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
    const lineUcis = bookMode === "line" ? (line?.ucis ?? startUcis) : undefined;
    setMaiaLoad(engine === "maia" ? "Loading Maia…" : null);
    bot.current = new Bot({ engine, elo, bookMode, line: lineUcis }, (s, p) =>
      setMaiaLoad(s === "ready" ? null : s === "downloading" ? `Downloading Maia… ${p}%` : s === "error" ? "Maia failed to load" : "Loading Maia…"),
    );
    setGame({ chess: applyMoves(startUcis), history: [...startUcis], color: c });
    setOver(null);
    setJudged({});
    setAcked(-1);
    setBotWhy("");
    tried.current.clear();
    retryAt.current = null;
  };

  // Same board feel as live Lichess games: sounds, vibration, the user's Lichess prefs.
  const feel = useMemo(() => gameFeel(loadLive(), cachedPrefs()), []);
  useEffect(() => preloadSounds(feel.soundSet), [feel.soundSet]);
  const [hideEnd, setHideEnd] = useState(false);
  useEffect(() => {
    setHideEnd(false);
    if (over && feel.vibrate) buzz([60, 80, 60]);
  }, [over, feel.vibrate]);

  const finishIfOver = (g: NonNullable<typeof game>) => {
    if (!g.chess.isGameOver()) return false;
    setOver(g.chess.isCheckmate() ? (g.chess.turn() === "w" ? "0-1" : "1-0") : "1/2-1/2");
    return true;
  };

  const hist = game?.history ?? startUcis;
  const tracked = useMemo(() => trackLine(hist), [hist, hist.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const myColor = game?.color ?? (color === "random" ? "w" : color);
  const graph = graphFor(myColor);
  const lineUcis = bookMode === "line" ? (line?.ucis ?? startUcis) : undefined;

  // The user's last move and what we know about it.
  const lastMine = [...tracked.plies].reverse().find((p) => p.mover === myColor && p.ply >= startUcis.length);
  const mineNode = lastMine ? graph?.[lastMine.fromKey] : undefined;
  const mineEdge = mineNode?.edges.find((e) => e.uci === lastMine!.uci);
  const usual = mineNode?.edges[0];
  const mineJudged = lastMine ? judged[lastMine.ply] : undefined;
  const onLine = lineUcis && lastMine && hist.slice(0, lastMine.ply).every((u, i) => u === lineUcis[i]);
  const lineExpected = onLine && lastMine!.ply < lineUcis!.length ? lineUcis![lastMine!.ply] : undefined;
  const offLine = lineExpected && lineExpected !== lastMine!.uci;
  const offUsual = usual && lastMine && usual.uci !== lastMine.uci && usual.count >= 2;
  const bad = mineJudged?.verdict && BAD_VERDICTS.includes(mineJudged.verdict);
  // The bot's last move, and how often your real opponents played it there.
  const botLast = [...tracked.plies].reverse().find((p) => p.mover !== myColor && p.ply >= startUcis.length);
  const botIsLast = !!botLast && botLast.ply === hist.length - 1;
  const botNode = botLast ? graph?.[botLast.fromKey] : undefined;
  const botEdge = botNode?.edges.find((e) => e.uci === botLast!.uci);
  const oppUsual = botNode?.edges[0];
  const lastEval = mineJudged?.evalAfter?.lines[0];
  // One-line notes under each row of the moves table.
  const botNote = !botLast
    ? null
    : botEdge
      ? botLast.book !== "in" && `Out of book, but your opponents chose it ${pct(botEdge.count, botNode!.count)}% of the time here.`
      : botNode
        ? `Your opponents never played this here${oppUsual ? `; they usually play ${oppUsual.san} (${pct(oppUsual.count, botNode.count)}%)` : ""}.`
        : "Your games never reached this position.";
  // Your repertoire move (played at least twice here) was fine, but the engine
  // has a clearly better one: called out in its own box.
  const mineAfter = mineJudged?.evalAfter?.lines[0];
  const gap = mineJudged?.bestLine && mineAfter ? povPawns(mineJudged.bestLine, myColor) - povPawns(mineAfter, myColor) : 0;
  const betterAvailable =
    !!mineEdge && mineEdge.count >= 2 && !!mineJudged?.verdict && !BAD_VERDICTS.includes(mineJudged.verdict) && !!mineJudged.bestLine && (mineJudged.verdict === "okay" || gap >= 0.15);
  const myNote = !lastMine
    ? null
    : [
        !mineEdge && (mineNode ? "New move: you never played it here." : "Your games never reached this position."),
        offUsual && !mineJudged?.usualAfter && `Your usual move is ${usual!.san} (${usual!.count}×).`,
        mineJudged && !betterAvailable && compareText(mineJudged, myColor, lastMine.san),
        mineJudged?.best && mineJudged.verdict !== "best" && !betterAvailable && !(mineJudged.usualAfter === undefined && mineJudged.bestLine) && `Engine best: ${mineJudged.best}.`,
      ]
        .filter(Boolean)
        .join(" ") || null;
  // Drill: after each of your moves the bot waits for the verdict, and stops
  // when the move was bad or left your repertoire / the chosen line.
  const lastIsMine = !!lastMine && lastMine.ply === hist.length - 1;
  const flagged = !!(bad || offLine || offUsual);
  const paused = drill && !!game && !over && lastIsMine && lastMine!.ply > acked && (!mineJudged || flagged);
  const stopped = paused && !!mineJudged && flagged;

  const arrows: Arrow[] = [];
  if (stopped && lastMine) {
    arrows.push(uciArrow(lastMine.uci, "red"));
    const want = lineExpected ?? (bad ? mineJudged?.bestUci : offUsual ? usual!.uci : undefined);
    if (want && want !== lastMine.uci) arrows.push(uciArrow(want, "green"));
  }

  // Bot's turn.
  useEffect(() => {
    if (!game || over || thinking || game.chess.turn() === game.color) return;
    if (paused) return;
    setThinking(true);
    const fen = game.chess.fen();
    const exclude = retryAt.current === fen ? (tried.current.get(fen) ?? []) : [];
    retryAt.current = null;
    bot
      .current!.move(fen, game.history, userElo, graphFor(game.color), exclude)
      .then(([uci, why]) => {
        const m = game.chess.move(uciParams(uci));
        game.history.push(uci);
        playMoveSound(feel.soundSet, m.san);
        if (feel.vibrate) buzz(40);
        setBotWhy(why);
        finishIfOver(game);
        force((x) => x + 1);
      })
      .catch((e) => setBotWhy(`Bot error: ${e}`))
      .finally(() => setThinking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, over, thinking, game?.history.length, paused]);

  // Top 5 engine lines whenever it is your move.
  const fenNow = game?.chess.fen();
  const myTurn = !!game && !over && game.chess.turn() === game.color;
  // Your repertoire and book moves that are not in the top 5 get an eval of their own.
  useEffect(() => {
    const pool = judge.current;
    if (!myTurn || !fenNow || !pool) return;
    let live = true;
    const eng = (f: string, d: number, m: number) => pool.analyse(f, d, m);
    const legal = new Chess(fenNow).moves().length;
    (async () => {
      const ev = await evalNow(fenNow, depth, 5, eng, Math.min(5, legal));
      if (!live) return;
      setTop({ fen: fenNow, ev, extra: {} });
      const inTop = new Set(ev.lines.slice(0, 5).map((l) => l.pv[0]));
      for (const uci of candidateMoves(fenNow, graphFor(myColor)).filter((u) => !inTop.has(u))) {
        const after = await evalNow(applyMovesFrom(fenNow, uci), depth, 1, eng, 1);
        if (!live) return;
        if (after.lines[0]) setTop((t) => (t && t.fen === fenNow ? { ...t, extra: { ...t.extra, [uci]: after.lines[0] } } : t));
      }
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [fenNow, myTurn, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new move returns the board to the live position; arrow keys browse.
  useEffect(() => setViewPly(null), [hist.length]);
  const stepTo = (p: number | null) => setViewPly(p === null || p >= hist.length ? null : Math.max(0, p));
  useEffect(() => {
    if (!game) return;
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const at = viewPly ?? hist.length;
      if (e.key === "ArrowLeft") stepTo(at - 1);
      else if (e.key === "ArrowRight") stepTo(at + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") stepTo(0);
      else if (e.key === "ArrowDown" || e.key === "End") stepTo(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [game, viewPly, hist.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Engine verdict for each of the user's moves (cache → cloud → engine).
  // `usualUci`: your usual move here when you played another, to compare evals against.
  const judgeMove = (ply: number, fenBefore: string, uci: string, fenAfter: string, prevFen?: string, prevUci?: string, usualUci?: string) => {
    const pool = judge.current;
    if (!pool) return;
    const eng = (f: string, d: number, m: number) => pool.analyse(f, d, m);
    const usualFen = usualUci ? applyMovesFrom(fenBefore, usualUci) : undefined;
    Promise.all([evalNow(fenBefore, depth, 2, eng), evalNow(fenAfter, depth, 2, eng), usualFen ? evalNow(usualFen, depth, 2, eng) : undefined])
      .then(([b, a, u]) => {
        if (!b.lines.length || !a.lines.length) return setJudged((j) => ({ ...j, [ply]: {} }));
        const verdict = classify({ fenBefore, played: uci, before: b, after: a, prevFen, prevUci, legalCount: new Chess(fenBefore).moves().length });
        const bestUci = b.lines[0].pv[0];
        const usual = usualUci && u?.lines.length ? { usualSan: uciToSan(fenBefore, usualUci), usualAfter: u.lines[0] } : {};
        setJudged((j) => ({ ...j, [ply]: { verdict, bestUci, best: uciToSan(fenBefore, bestUci), evalAfter: a, bestLine: bestUci !== uci ? b.lines[0] : undefined, ...usual } }));
      })
      .catch(() => setJudged((j) => ({ ...j, [ply]: {} })));
  };

  const onMove = (uci: string) => {
    if (!game || over || thinking || game.chess.turn() !== game.color) return;
    const fenBefore = game.chess.fen();
    try {
      playMoveSound(feel.soundSet, game.chess.move(uciParams(uci)).san);
    } catch {
      force((x) => x + 1);
      return;
    }
    const ply = game.history.length;
    const prevUci = game.history[ply - 1];
    const prevFen = ply > 0 ? applyMoves(game.history.slice(0, ply - 1)).fen() : undefined;
    const usualHere = graphFor(game.color)?.[posKey(fenBefore)]?.edges[0];
    game.history.push(uci);
    judgeMove(ply, fenBefore, uci, game.chess.fen(), prevFen, prevUci, usualHere && usualHere.uci !== uci && usualHere.count >= 2 ? usualHere.uci : undefined);
    finishIfOver(game);
    force((x) => x + 1);
  };

  const takeback = () => {
    if (!game || thinking) return;
    const undo = game.chess.turn() === game.color ? 2 : 1;
    for (let i = 0; i < undo && game.history.length > startUcis.length; i++) {
      game.chess.undo();
      game.history.pop();
    }
    setOver(null);
    force((x) => x + 1);
  };

  /** Undo the bot's last move and have it play a different one. */
  const otherReply = () => {
    if (!game || thinking || over || !botLast) return;
    game.chess.undo();
    game.history.pop();
    const fen = game.chess.fen();
    tried.current.set(fen, [...(tried.current.get(fen) ?? []), botLast.uci]);
    retryAt.current = fen;
    force((x) => x + 1);
  };

  const review = () => {
    if (!game) return;
    const c = new Chess();
    const sans = game.history.map((u) => c.move(uciParams(u)).san);
    const botName = engine === "maia" ? `Maia ${elo}` : `Stockfish ${elo}`;
    onReview({
      id: `bot:${Date.now()}`,
      site: "lichess",
      url: "",
      white: game.color === "w" ? "You" : botName,
      black: game.color === "b" ? "You" : botName,
      userColor: game.color,
      result: (over as RawGame["result"]) ?? "*",
      date: Date.now(),
      speed: "bot",
      rated: false,
      sans,
    });
  };

  const filteredLines = useMemo(() => {
    return searchLines(lines, lineQuery);
  }, [lineQuery, lines]);

  // The side column changes height with every move (banner, notes, top lines).
  // When the page is scrolled, a shrink makes the scroll position snap and the
  // board jump; during a game the column only ever grows.
  const colRef = useRef<HTMLDivElement>(null);
  const [colMin, setColMin] = useState(0);
  const gameKey = game ? game.chess : null;
  useEffect(() => {
    setColMin(0);
    const el = colRef.current;
    if (!el || !gameKey) return;
    const ro = new ResizeObserver(() => setColMin((m) => Math.max(m, el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [gameKey]);

  const startLabel = startUcis.length ? sanLine(startUcis) : "the starting position";
  const playing = !!game && !over;
  const shownPly = viewPly ?? hist.length;
  const boardFen = viewPly !== null ? applyMoves(hist.slice(0, viewPly)).fen() : (game?.chess.fen() ?? applyMoves(startUcis).fen());
  // The bar keeps the last known eval until a new one arrives, instead of
  // dropping to 0.00 while the next position is being analysed.
  const heldEval = useRef<Line | undefined>(undefined);
  const evalNowShown = viewPly === null ? (top && top.fen === fenNow ? top.ev.lines[0] : lastEval) : judged[viewPly - 1]?.evalAfter?.lines[0];
  if (!game) heldEval.current = undefined;
  else if (evalNowShown) heldEval.current = evalNowShown;

  // Board size from the screen: as large as fits with the controls below it
  // still on screen; on wide screens the side column sits beside it at 440px.
  const gridRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ px: number; wide: boolean } | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const main = grid.closest("main");
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const top = grid.getBoundingClientRect().top + (main?.scrollTop ?? 0) + window.scrollY;
      // The controls are measured once a game is on; before that, their usual height.
      const ctrl = Math.max(ctrlRef.current?.offsetHeight ?? 0, 112);
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) : 16;
      const byHeight = window.innerHeight - top - ctrl - pad + (showEval ? 44 : 0);
      const byWidth = wide ? grid.clientWidth - 440 - 16 : grid.clientWidth;
      setFit({ px: Math.max(240, Math.floor(Math.min(byHeight, byWidth))), wide });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [showEval, !!game]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = thinking ? "Bot is thinking…" : paused && !stopped ? "Checking your move…" : myTurn ? "Your move" : "";
  const navBtn = "ui-btn ui-btn-secondary h-11! justify-center";

  return (
    <div ref={gridRef} className="grid items-start gap-[var(--gap)]" style={fit?.wide ? { gridTemplateColumns: `${fit.px}px 440px`, justifyContent: "center" } : undefined}>
      <div className="mx-auto w-full" style={{ maxWidth: fit ? fit.px : undefined }}>
        <div className="relative">
          <Board
            fen={boardFen}
            orientation={myColor}
            lastMove={shownPly > 0 ? hist[shownPly - 1] : undefined}
            arrows={viewPly === null ? arrows : undefined}
            hideEval={!showEval}
            bigEval
            evalLine={heldEval.current}
            movable={playing && !thinking && viewPly === null && !maiaLoad ? myColor : undefined}
            onMove={onMove}
            feel={feel.feel}
          />
          {viewPly !== null && (
            <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
              Move {viewPly}/{hist.length} · → returns
            </div>
          )}
          {game && maiaLoad && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.35)" }} data-testid="maia-loading">
              <div className="ui-card ui-pad flex min-w-60 flex-col items-center gap-3 text-center shadow-2xl" style={{ background: "var(--surface)" }}>
                <div className="ui-h2">{maiaLoad}</div>
                {maiaLoad !== "Maia failed to load" && <Progress className="w-full" value={/(\d+)%/.test(maiaLoad) ? +maiaLoad.match(/(\d+)%/)![1] : undefined} />}
                <div className="text-xs text-muted">{maiaLoad === "Maia failed to load" ? "Start a new game, or play Stockfish instead." : "The game starts when Maia is ready."}</div>
              </div>
            </div>
          )}
          {over && game && !hideEnd && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.45)" }} data-testid="bot-result">
              <div className="ui-card ui-pad relative flex max-w-[90%] flex-col items-center gap-3 text-center shadow-2xl" style={{ background: "var(--surface)" }}>
                <button className="absolute top-2 right-2 text-muted hover:text-fg" onClick={() => setHideEnd(true)} aria-label="Show the board" title="Show the board">
                  <X size={18} />
                </button>
                <div className="ui-h1 px-6">{over === "1/2-1/2" ? "Draw" : (over === "1-0") === (game.color === "w") ? "You won" : "You lost"}</div>
                <div className="text-sm text-muted">{endReason(game.chess, over)}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" size="lg" onClick={review}>
                    Review game
                  </Button>
                  <Button size="lg" onClick={newGame}>
                    <Play size={16} /> New game
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={ctrlRef}>
          {/* Always laid out, so the page height does not change while the bot thinks. */}
          <Progress className={thinking ? "mt-2" : "invisible mt-2"} />
          {game && (
            <div className="mt-2 flex flex-col gap-2" data-testid="bot-controls">
              <div className="flex flex-wrap items-center gap-2">
                {playing && (
                  <>
                    <Button onClick={takeback} disabled={thinking}>
                      <Undo2 size={14} /> Take back
                    </Button>
                    <Button onClick={otherReply} disabled={thinking || !botIsLast} title="Undo the bot's move and have it play a different one" data-testid="other-reply">
                      <Shuffle size={14} /> Other reply
                    </Button>
                    <Button variant="danger" onClick={() => setOver(game.color === "w" ? "0-1" : "1-0")}>
                      <Flag size={14} /> Resign
                    </Button>
                  </>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  vs {engine === "maia" ? `Maia ${elo}` : `Stockfish ${elo}`}
                  {status ? ` · ${status}` : ""}
                </span>
                <Switch checked={showEval} onChange={setShowEval} label="Eval bar" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button className={navBtn} onClick={() => stepTo(0)} disabled={shownPly === 0} aria-label="First move">
                  <ChevronFirst size={20} />
                </button>
                <button className={navBtn} onClick={() => stepTo(shownPly - 1)} disabled={shownPly === 0} aria-label="Previous move">
                  <ChevronLeft size={20} />
                </button>
                <button className={navBtn} onClick={() => stepTo(shownPly + 1)} disabled={viewPly === null} aria-label="Next move">
                  <ChevronRight size={20} />
                </button>
                <button className={navBtn} onClick={() => stepTo(null)} disabled={viewPly === null} aria-label="Last move">
                  <ChevronLast size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div ref={colRef} className="flex min-w-0 flex-col gap-[var(--gap)]" style={{ minHeight: colMin || undefined }}>
        {game && (
          <Card data-testid="line-status">
            <div className="ui-label mb-1">Current line</div>
            <div className="ui-h2">{tracked.name ? `${tracked.name[0]} ${tracked.name[1]}` : "Starting position"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {!tracked.exit ? (
                <Badge tone="good">in book</Badge>
              ) : tracked.exit.kind === "exhausted" ? (
                <>
                  <Badge tone="accent">book ended</Badge>
                  <span className="text-muted">before {plyText(tracked.exit.ply, tracked.exit.san)}</span>
                </>
              ) : (
                <>
                  <Badge tone={tracked.exit.by === myColor ? "bad" : "warn"}>{tracked.exit.by === myColor ? "you left the book" : "bot left the book"}</Badge>
                  <span className="text-muted">with {plyText(tracked.exit.ply, tracked.exit.san)}</span>
                </>
              )}
            </div>
            {(botLast || lastMine) && (
              <table className="mt-3 w-full border-t text-sm" style={{ borderColor: "var(--border)" }} data-testid="moves-table">
                <thead>
                  <tr className="text-left">
                    <th className="ui-label pt-2 pb-1 font-normal"></th>
                    <th className="ui-label pt-2 pb-1 font-normal">move</th>
                    <th className="ui-label pt-2 pb-1 font-normal">status</th>
                    <th className="ui-label pt-2 pb-1 text-right font-normal" title="Times played here in your games, of the games that reached this position">
                      played
                    </th>
                    <th className="ui-label pt-2 pb-1 text-right font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {[botLast && { who: "Bot", p: botLast, node: botNode, edge: botEdge, testid: "bot-move" }, lastMine && { who: "You", p: lastMine, node: mineNode, edge: mineEdge, testid: "my-move" }]
                    .filter((r): r is NonNullable<typeof r> => !!r)
                    .sort((a, b) => a.p.ply - b.p.ply)
                    .map((r) => {
                      const mine = r.who === "You";
                      const note = mine ? myNote : [botNote, botWhy && !thinking && `Bot: ${botWhy}.`].filter(Boolean).join(" ") || null;
                      // Your move is the one this box is about: tinted and larger.
                      const tint = mine ? { background: "color-mix(in oklab, var(--accent) 10%, transparent)" } : {};
                      return (
                        <Fragment key={r.who}>
                          <tr data-testid={r.testid} className="border-t" style={{ borderColor: "color-mix(in oklab, var(--border) 50%, transparent)", ...tint }}>
                            <td className={`py-1.5 pr-2 pl-1 ${mine ? "font-semibold" : "text-muted"}`}>{r.who}</td>
                            <td className={`py-1.5 pr-2 font-semibold whitespace-nowrap ${mine ? "text-base" : ""}`}>{plyText(r.p.ply, r.p.san)}</td>
                            <td className="py-1.5 pr-2">
                              <span className="flex flex-wrap gap-1">
                                <BookChip s={r.p.book} />
                                {mine && (mineJudged ? <VerdictChip v={mineJudged.verdict} /> : <Badge>judging…</Badge>)}
                              </span>
                            </td>
                            <td className="num py-1.5 pl-2 text-right whitespace-nowrap">{r.node ? `${r.edge?.count ?? 0} / ${r.node.count}` : "–"}</td>
                            <td className="num py-1.5 pl-2 text-right font-semibold">{r.node ? `${pct(r.edge?.count ?? 0, r.node.count)}%` : "–"}</td>
                          </tr>
                          {note && (
                            <tr style={tint}>
                              <td></td>
                              <td colSpan={4} className="pb-1.5 text-[0.8rem] text-muted">
                                {note}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            )}
            {betterAvailable && lastMine && (
              <div
                className="mt-3 rounded-ui border-l-4 p-3 text-sm"
                style={{ borderColor: "var(--accent)", background: "color-mix(in oklab, var(--accent) 12%, transparent)" }}
                data-testid="better-move"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Lightbulb size={16} style={{ color: "var(--accent)" }} /> Better move available
                </div>
                <div className="mt-1">
                  You have played <b>{lastMine.san}</b> here {mineEdge!.count}× and it is {mineJudged!.verdict}, but <span className="ui-grad-text">{mineJudged!.best}</span> is stronger:{" "}
                  {povText(mineJudged!.bestLine!, myColor)} vs {povText(mineAfter!, myColor)}.
                </div>
              </div>
            )}
          </Card>
        )}
        {playing && <TopMovesCard top={top} current={top?.fen === fenNow} myTurn={myTurn} myColor={myColor} graph={graph} />}
        {stopped && lastMine && (
          <Alert
            tone={bad ? "bad" : "warn"}
            action={
              <div className="flex flex-col gap-1.5">
                <Button size="sm" variant="primary" onClick={takeback}>
                  <Undo2 size={14} /> Take back
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAcked(lastMine.ply)}>
                  Play on <ArrowRight size={14} />
                </Button>
              </div>
            }
          >
            {bad && (
              <div>
                <b style={{ color: VERDICT_COLOR[mineJudged!.verdict!] }}>{mineJudged!.verdict}</b>: {lastMine.san}{" "}
                {mineEdge ? `(you have played it ${mineEdge.count}× here${lastMine.book !== "in" ? ", out of book" : ""})` : ""}. Best was <b>{mineJudged!.best}</b>.
              </div>
            )}
            {offLine && (
              <div>
                The line continues {uciToSan(lastMine.fenBefore, lineExpected!)}; you played {lastMine.san}.
              </div>
            )}
            {!offLine && offUsual && (
              <div>
                You usually play {usual!.san} here ({usual!.count}×); you played {lastMine.san}.{mineJudged?.usualAfter ? ` ${compareText(mineJudged, myColor, lastMine.san)}` : ""}
              </div>
            )}
          </Alert>
        )}
        {!playing && (
          <Card>
            <CardHeader title="Play your repertoire vs a bot" sub="Maia plays like a human of a given rating; Stockfish is the engine, limited in strength." />
            {over && (
              <Alert
                tone="good"
                className="mb-3"
                action={
                  <Button size="sm" onClick={review}>
                    Review game
                  </Button>
                }
              >
                Game over: {over}
              </Alert>
            )}
            {game && over && <MoveList ucis={hist} judged={judged} myColor={myColor} />}
            <div className="mt-2 flex flex-col gap-4">
              <Field label="You play">
                <Seg
                  value={color}
                  onChange={setColor}
                  options={[
                    ["w", "White"],
                    ["b", "Black"],
                    ["random", "Random"],
                  ]}
                />
              </Field>
              <Field label="Opponent">
                <Seg
                  value={engine}
                  onChange={setEngine}
                  options={[
                    ["maia", "Maia (human-like)"],
                    ["stockfish", "Stockfish"],
                  ]}
                />
              </Field>
              <Field
                label={<>Bot strength: {elo}</>}
                hint={engine === "maia" ? "Maia plays like a human of this rating" : elo < 1320 ? "Stockfish skill level (its Elo setting starts at 1320)" : "Stockfish Elo limit"}
              >
                <input className="ui-range" type="range" value={elo} min={600} max={engine === "maia" ? 2600 : 3000} step={50} onChange={(e) => setElo(+e.target.value)} />
              </Field>
              {engine === "maia" && (
                <Field label={<>Your rating (Maia adapts to it): {userElo}</>}>
                  <input className="ui-range" type="range" value={userElo} min={600} max={2600} step={50} onChange={(e) => setUserElo(+e.target.value)} />
                </Field>
              )}
              <Field label="Bot's opening behaviour" hint={BOOK_MODES.find((b) => b[0] === bookMode)?.[2]}>
                <Select value={bookMode} onChange={(e) => setBookMode(e.target.value as BookMode)} options={BOOK_MODES.map(([v, l]) => [v, l])} />
              </Field>
              {bookMode === "line" && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input className="flex-1" placeholder="Search any named line (e.g. caro-kann advance)" value={lineQuery} onChange={(e) => setLineQuery(e.target.value)} />
                    <Button onClick={randomLine} disabled={!model} title="Random line, weighted by your games">
                      <Shuffle size={14} /> Mine
                    </Button>
                  </div>
                  {filteredLines.length > 0 && (
                    <div className="ui-card max-h-56 overflow-auto p-1">
                      {filteredLines.map((l) => (
                        <button
                          key={l.eco + l.name}
                          className="ui-nav w-full"
                          onClick={() => {
                            setLine(l);
                            setLineQuery("");
                          }}
                        >
                          <span className="text-muted">{l.eco}</span> <span className="truncate">{l.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {line && (
                    <div className="text-xs text-muted">
                      <b className="text-fg">
                        {line.eco} {line.name}
                      </b>
                      : {sanLine(line.ucis)}
                    </div>
                  )}
                </div>
              )}
              <div className="text-sm">
                Start from: <b>{startLabel}</b>{" "}
                {startUcis.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setStartUcis([])}>
                    <RotateCcw size={13} /> reset
                  </Button>
                )}
                <div className="text-xs text-muted">Tip: the ⚔ button on any row of the Repertoire tree starts a game from that position.</div>
              </div>
              <Switch
                checked={drill}
                onChange={setDrill}
                label="Drill"
                hint="After each move: engine verdict, your usual move and the line; a banner with take-back on mistakes or when you leave your repertoire."
              />
              <Switch checked={showEval} onChange={setShowEval} label="Show eval bar during the game" />
              <Button variant="primary" size="lg" onClick={newGame}>
                <Play size={16} /> {over ? "New game" : "Start game"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function MoveList({ ucis, judged, myColor }: { ucis: string[]; judged: Record<number, Judged>; myColor: Side }) {
  const c = new Chess();
  const items = ucis.map((u, i) => {
    let san = u;
    try {
      san = c.move(uciParams(u)).san;
    } catch {
      /* ignore */
    }
    const v = judged[i]?.verdict;
    const mine = (i % 2 === 0 ? "w" : "b") === myColor;
    const tint = mine && v && BAD_VERDICTS.includes(v) ? VERDICT_COLOR[v] : undefined;
    return (
      <span key={i} className="mr-1 inline-block">
        {i % 2 === 0 && <span className="num mr-0.5 text-muted">{i / 2 + 1}.</span>}
        <span className="rounded px-1" style={tint ? { background: `color-mix(in oklab, ${tint} 35%, transparent)` } : undefined}>
          {san}
        </span>
      </span>
    );
  });
  return (
    <div className="max-h-48 min-h-12 overflow-auto rounded-ui p-2 text-[0.84rem] leading-7" style={{ background: "var(--hover)" }}>
      {items.length ? items : <span className="text-muted">No moves yet</span>}
    </div>
  );
}

const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);

/** An eval from your side, in pawns (mate as a large number), and as text. */
const povPawns = (l: Line, me: Side) => (me === "w" ? 1 : -1) * (l.mate !== undefined ? Math.sign(l.mate) * (1000 - Math.abs(l.mate)) : (l.cp ?? 0) / 100);
const povText = (l: Line, me: Side) => {
  const s = me === "w" ? 1 : -1;
  if (l.mate !== undefined) return `${l.mate * s > 0 ? "" : "-"}#${Math.abs(l.mate)}`;
  const v = ((l.cp ?? 0) * s) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
};

/** "Your eval is 0.4 worse than your usual Nf3 (+0.20 vs +0.60)." Against your usual move, else the engine's best. */
function compareText(j: Judged, me: Side, playedSan: string) {
  const mine = j.evalAfter?.lines[0];
  const ref = j.usualAfter ?? j.bestLine;
  if (!mine || !ref) return null;
  const what = j.usualAfter ? `your usual ${j.usualSan}` : `the engine's best ${j.best}`;
  const vs = `(${playedSan} ${povText(mine, me)} vs ${povText(ref, me)})`;
  if (mine.mate !== undefined || ref.mate !== undefined) return `Compared with ${what}: ${vs}.`;
  const d = povPawns(mine, me) - povPawns(ref, me);
  if (Math.abs(d) < 0.05) return `Your eval is the same as ${what} ${vs}.`;
  return `Your eval is ${Math.abs(d).toFixed(2)} ${d < 0 ? "worse" : "better"} than ${what} ${vs}.`;
}

/** Moves worth showing besides the engine's top 5: your most played here, then book moves (by how many named lines follow). */
function candidateMoves(fen: string, graph?: Record<string, RepNode>) {
  const mine = (graph?.[posKey(fen)]?.edges ?? []).slice(0, 3).map((e) => e.uci);
  const book = [...bookChildren(fen)]
    .sort((a, b) => b.namedBelow - a.namedBelow)
    .slice(0, 3)
    .map((b) => b.uci);
  return [...new Set([...mine, ...book])].slice(0, 4);
}

/** Where you are to move: the engine's top 5 plus your repertoire and book moves,
 * each with its eval, best first, book moves named. Collapsible, open at the start.
 * The last position's moves stay (dimmed) until the new ones arrive, so the box keeps its height. */
function TopMovesCard({ top, current, myTurn, myColor, graph }: { top: TopMoves | null; current: boolean; myTurn: boolean; myColor: Side; graph?: Record<string, RepNode> }) {
  const fen = top?.fen ?? "";
  const node = graph?.[posKey(fen)];
  const book = new Map(top ? bookChildren(fen).map((b) => [b.uci, b]) : []);
  const status = current ? `depth ${top!.ev.depth}` : myTurn ? "analysing…" : "for your next move";
  const rows = !top
    ? []
    : [...new Set([...top.ev.lines.slice(0, 5).map((l) => l.pv[0]), ...candidateMoves(fen, graph)])]
        .map((uci) => ({ uci, line: top.ev.lines.find((l) => l.pv[0] === uci) ?? top.extra[uci], edge: node?.edges.find((e) => e.uci === uci), book: book.get(uci) }))
        .sort((a, b) => (b.line ? povPawns(b.line, myColor) : -1e6) - (a.line ? povPawns(a.line, myColor) : -1e6));
  return (
    <Card data-testid="top-lines">
      <details open>
        <summary className="ui-label cursor-pointer select-none">top moves · {status}</summary>
        {!top ? (
          <div className="mt-2 text-sm text-muted">Analysing…</div>
        ) : (
          <table className={`mt-1 w-full table-fixed text-sm ${current ? "" : "opacity-50"}`}>
            <colgroup>
              <col className="w-16" />
              <col className="w-14" />
              <col />
              <col className="w-28" />
            </colgroup>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uci} className="border-t" style={{ borderColor: "color-mix(in oklab, var(--border) 50%, transparent)" }} data-testid="top-move" data-uci={r.uci}>
                  <td className="num py-1.5 pr-2 text-right font-semibold whitespace-nowrap">{r.line ? povText(r.line, myColor) : "…"}</td>
                  <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">{uciToSan(fen, r.uci)}</td>
                  {/* The name gets all the width the other columns leave; very long ones end in "…". */}
                  <td className="truncate py-1.5 pr-2" title={r.book?.name}>
                    {r.book?.name ? <span className="ui-grad-text">{r.book.name}</span> : r.book ? <Badge tone="good">book</Badge> : null}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {r.edge && node ? (
                      <span className="num text-xs text-muted" title={`You played it ${r.edge.count} of ${node.count} times here`}>
                        {r.edge === node.edges[0] ? <Badge tone="accent">your usual</Badge> : null} {pct(r.edge.count, node.count)}%
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </Card>
  );
}

const applyMovesFrom = (fen: string, uci: string) => {
  const c = new Chess(fen);
  c.move(uciParams(uci));
  return c.fen();
};

const plyText = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? "." : "…"} ${san}`;

function sanLine(ucis: string[]) {
  const c = new Chess();
  return ucis
    .map((u, i) => {
      const san = c.move(uciParams(u)).san;
      return i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san;
    })
    .join(" ");
}

function endReason(c: Chess, result: string) {
  if (c.isCheckmate()) return "Checkmate";
  if (c.isStalemate()) return "Stalemate";
  if (c.isThreefoldRepetition()) return "Threefold repetition";
  if (c.isInsufficientMaterial()) return "Insufficient material";
  if (c.isDraw()) return "Fifty-move rule";
  return result === "1/2-1/2" ? "Draw" : "Resignation";
}
