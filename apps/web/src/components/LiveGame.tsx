// Full-screen live Lichess game. Fair play: no engine, eval, book, repertoire,
// move list or chat here — only the board, both players, clocks and move
// browsing, like a quiet Lichess board.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chess } from "chess.js";
import type { Api } from "chessground/api";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Flag, Handshake, X } from "lucide-react";
import { uciParams } from "@outofbook/core/chess";
import { buzz, playMoveSound, playSound, preloadSounds } from "../lib/gameFeel";
import { ANIMATION_MS, LICHESS_DEFAULTS, type LichessPrefs } from "../lib/lichessPrefs";
import { abort, claimDraw, claimVictory, exportGame, offerDraw, resign, sendMove, streamGame, type GameFull, type GameState, type OpponentGone } from "../lib/lichessBoard";
import type { RawGame, Side } from "@outofbook/core/types";
import { Board, type BoardFeel, type PremoveQueue } from "./Board";
import { Button, cx } from "./ui";
import { LichessIcon } from "./LichessIcon";

export interface LiveSettings {
  // OutOfBook's own settings, on top of Lichess's.
  warnPct: number; // clock turns yellow at or below this share of the initial time
  dangerPct: number; // red
  oppClockWarn: boolean; // the opponent's clock changes color too (else only ours)
  multiPremove: boolean; // queue several premoves, as on chess.com (needs Lichess premoves on)
  vibrate: boolean;
  columnLeft: boolean; // wide screens: clocks and buttons left of the board (switched in game)
  // Lichess's settings: imported from the account, or set here; one or the other.
  useLichessPrefs: boolean;
  lichess: LichessPrefs; // used when not importing
}
export const LIVE_DEFAULTS: LiveSettings = {
  warnPct: 50,
  dangerPct: 10,
  oppClockWarn: true,
  multiPremove: false,
  vibrate: true,
  columnLeft: false,
  useLichessPrefs: true,
  lichess: LICHESS_DEFAULTS,
};

/** The Lichess settings in force: the account's when imported (Lichess's defaults until they load), else ours. */
export const lichessSettings = (settings: LiveSettings, prefs: LichessPrefs | null): LichessPrefs => (settings.useLichessPrefs ? (prefs ?? LICHESS_DEFAULTS) : settings.lichess);

/** What a game screen should do, from our settings and the Lichess settings in force. */
export function gameFeel(settings: LiveSettings, prefs: LichessPrefs | null) {
  const p = lichessSettings(settings, prefs);
  const feel: BoardFeel = {
    autoQueen: p.autoQueen,
    animationMs: ANIMATION_MS[p.animation] ?? 250,
    showDests: p.destination,
    highlight: p.highlight,
    coords: p.coords,
    rookCastle: p.rookCastle === 1,
    moveEvent: p.moveEvent,
  };
  return {
    fromLichess: settings.useLichessPrefs,
    feel,
    premove: p.premove,
    multiPremove: p.premove && settings.multiPremove,
    soundSet: p.soundSet,
    tenths: p.clockTenths,
    lowTime: p.clockSound && p.soundSet !== "silent",
    confirm: p.confirmResign === 1,
    ratings: p.ratings, // 0 hide, 1 show, 2 hide during games
    vibrate: settings.vibrate,
    oppClockWarn: settings.oppClockWarn,
  };
}
export const loadLive = (): LiveSettings => {
  try {
    const saved = JSON.parse(localStorage.getItem("liveSettings") ?? "{}");
    // Before the split, premoves and sounds were our own top-level settings.
    const lichess: LichessPrefs = {
      ...LICHESS_DEFAULTS,
      ...(saved.premove !== undefined ? { premove: saved.premove } : {}),
      ...(saved.soundSet ? { soundSet: saved.soundSet } : {}),
      ...(saved.sound === false ? { soundSet: "silent" } : {}),
      ...saved.lichess,
    };
    return { ...LIVE_DEFAULTS, ...saved, lichess };
  } catch {
    return LIVE_DEFAULTS;
  }
};
export const saveLive = (s: LiveSettings) => {
  try {
    localStorage.setItem("liveSettings", JSON.stringify(s));
  } catch {
    /* private mode */
  }
};

/** Clock text; tenths as the Lichess pref clockTenths (0 never, 1 below 10 s, 2 always). */
const fmtClock = (ms: number, tenths: 0 | 1 | 2 = 1) => {
  const t = Math.max(0, ms);
  const s = Math.floor(t / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const base = h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
  const showTenths = tenths === 2 || (tenths === 1 && t < 10_000);
  return showTenths && !h ? `${base}.${Math.floor((t % 1000) / 100)}` : base;
};

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const GLYPH: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };
/** Lichess-style material difference: the extra pieces each side has, and the points. */
function material(fen: string) {
  const counts: Record<Side, Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(" ")[0]) {
    const l = ch.toLowerCase();
    if (l in VALUES) counts[ch === l ? "b" : "w"][l]++;
  }
  const extra = (s: Side) => {
    const o = s === "w" ? "b" : "w";
    return Object.keys(VALUES).flatMap((k) => Array(Math.max(0, counts[s][k] - counts[o][k])).fill(k) as string[]);
  };
  const score = Object.keys(VALUES).reduce((a, k) => a + (counts.w[k] - counts.b[k]) * VALUES[k], 0);
  return { w: extra("w"), b: extra("b"), score };
}

/** What the live screen needs from Lichess; the demo stands in for it offline. */
interface Conn {
  stream: (onFull: (g: GameFull) => void, onState: (s: GameState) => void, onGone: (o: OpponentGone) => void, signal: AbortSignal, onLink: (up: boolean) => void) => Promise<void>;
  move: (uci: string) => Promise<void>;
  abort: () => Promise<void>;
  resign: () => Promise<void>;
  draw: () => Promise<void>;
  claimWin: () => Promise<void>;
  claimDraw: () => Promise<void>;
}

const realConn = (token: string, id: string): Conn => ({
  stream: (f, st, gone, sig, link) => streamGame(token, id, f, st, gone, sig, link),
  move: (u) => sendMove(token, id, u),
  abort: () => abort(token, id),
  resign: () => resign(token, id),
  draw: () => offerDraw(token, id),
  claimWin: () => claimVictory(token, id),
  claimDraw: () => claimDraw(token, id),
});

/** Offline demo: you are White vs a random mover, 1+1 so the clock colors show quickly.
 * From the browser console, window.demoOpponentGone(seconds) makes the opponent "leave",
 * and window.demoClocks(whiteMs, blackMs) sets the clocks. */
function demoConn(username: string): Conn {
  const initial = 60_000;
  const inc = 1000;
  let st: GameState = { moves: "", wtime: initial, btime: initial, status: "started" };
  let at = Date.now();
  let onS: ((s: GameState) => void) | undefined;
  const list = () => st.moves.split(" ").filter(Boolean);
  const push = (p: Partial<GameState>, echoMs = 0) => {
    st = { ...st, ...p };
    at = Date.now();
    const snap = st;
    if (echoMs) setTimeout(() => onS?.(snap), echoMs);
    else onS?.(snap);
  };
  const play = (uci: string, echoMs = 0) => {
    const ms = list();
    const side = ms.length % 2 === 0 ? "wtime" : "btime";
    const spent = ms.length >= 2 ? Date.now() - at : 0;
    const c = new Chess();
    for (const m of [...ms, uci]) c.move(uciParams(m));
    const end: Partial<GameState> = c.isCheckmate() ? { status: "mate", winner: c.turn() === "w" ? "black" : "white" } : c.isDraw() ? { status: "draw" } : {};
    push({ moves: [...ms, uci].join(" "), [side]: st[side] - spent + (ms.length >= 2 ? inc : 0), ...end }, echoMs);
    return c;
  };
  return {
    stream: (onFull, onState, onGone, signal) => {
      onS = onState;
      (window as { demoOpponentGone?: (s: number) => void }).demoOpponentGone = (s) => onGone({ gone: true, claimWinInSeconds: s });
      (window as { demoClocks?: (w: number, b: number) => void }).demoClocks = (w, b) => push({ wtime: w, btime: b });
      onFull({
        id: "demo",
        white: { id: username.toLowerCase() || "you", name: username || "You", rating: 1650 },
        black: { name: "Demo opponent", rating: 1700 },
        clock: { initial, increment: inc },
        speed: "bullet",
        rated: false,
        state: st,
      });
      return new Promise((r) => signal.addEventListener("abort", () => r()));
    },
    move: async (uci) => {
      // Our move comes back after a network-like delay, as from Lichess.
      const c = play(uci, 150);
      if (c.isGameOver()) return;
      setTimeout(
        () => {
          if (st.status !== "started") return;
          const moves = c.moves({ verbose: true });
          const m = moves[Math.floor(Math.random() * moves.length)];
          play(m.from + m.to + (m.promotion ?? ""));
        },
        500 + Math.random() * 2500,
      );
    },
    abort: async () => push({ status: "aborted" }),
    resign: async () => push({ status: "resign", winner: "black" }),
    draw: async () => push({ status: "draw" }),
    // Lichess ends a claimed game with status "timeout" (left the game).
    claimWin: async () => push({ status: "timeout", winner: "white" }),
    claimDraw: async () => push({ status: "timeout" }),
  };
}

/** Window size, re-read after rotation changes: some phones
 * (Galaxy Fold) fire resize before the new size is final. */
function useViewport() {
  const read = () => ({ w: window.visualViewport?.width ?? window.innerWidth, h: window.visualViewport?.height ?? window.innerHeight });
  const [v, set] = useState(read);
  useEffect(() => {
    const timers: number[] = [];
    const on = () => {
      set(read());
      timers.push(
        window.setTimeout(() => set(read()), 150),
        window.setTimeout(() => set(read()), 500),
      );
    };
    window.addEventListener("resize", on);
    window.visualViewport?.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.visualViewport?.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
      timers.forEach(clearTimeout);
    };
  }, []);
  return v;
}

/** Abort / draw / resign / full screen: twice the small button size, easy to hit on a phone. */
const ACTION_BTN = "h-14! min-w-14 px-3! text-base! gap-2!";
const ACTION_ICON = 28;

/** Two-step button: the first click arms it, the second (within 3 s) fires. */
function ConfirmButton({ label, icon, onConfirm, danger, confirm = true }: { label: string; icon: React.ReactNode; onConfirm: () => void; danger?: boolean; confirm?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant={armed ? (danger ? "danger" : "primary") : "secondary"}
      className={ACTION_BTN}
      onClick={() => (armed || !confirm ? (setArmed(false), onConfirm()) : setArmed(true))}
      title={label}
      aria-label={label}
    >
      {icon}
      {armed ? `${label}?` : ""}
    </Button>
  );
}

export function LiveGame({
  token,
  gameId,
  username,
  settings,
  prefs,
  onLiveChange,
  onExit,
  onReview,
  demo,
}: {
  demo?: boolean;
  prefs: LichessPrefs | null;
  token: string;
  gameId: string;
  username: string;
  settings: LiveSettings;
  onLiveChange: (live: boolean) => void;
  onExit: () => void;
  onReview: (g: RawGame) => void;
}) {
  const [full, setFull] = useState<GameFull | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  // My move, shown before Lichess echoes it; `base` is the server's move count
  // when it was sent, so the echo itself retires it (no frame with it twice).
  const [sent, setSent] = useState<{ uci: string; base: number } | null>(null);
  // Queued premoves (multiPremove): each is sent when the opponent's next move arrives.
  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const onMoveRef = useRef<(uci: string) => void>(() => {});
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [finished, setFinished] = useState<RawGame | null>(null);
  // Rating changes once the game is over, as Lichess shows them by the names.
  const [diffs, setDiffs] = useState<Partial<Record<Side, number>>>({});
  // Read and saved here, not from `settings`: the switch is in the game screen
  // and must hold for the next game too.
  const [columnLeft, setColumnLeft] = useState(() => loadLive().columnLeft);
  const switchSide = () =>
    setColumnLeft((v) => {
      saveLive({ ...loadLive(), columnLeft: !v });
      return !v;
    });
  const [hideEnd, setHideEnd] = useState(false);
  // False while the game stream is down and being reopened.
  const [linkUp, setLinkUp] = useState(true);
  // Opponent left: when Lichess opens the claim (our clock time), or null.
  const [goneUntil, setGoneUntil] = useState<number | null>(null);
  const myColorRef = useRef<Side>("w");
  // Clocks. Lichess sends each side's time as of the last move. We count from
  // when that move happened on the server: arrival minus our measured one-way
  // delay (half the time from sending our move to its echo). Our own move stops
  // our clock and starts the opponent's at once, as on lichess.org, instead of
  // freezing both until the echo; the echo then corrects by the lag only.
  const stateAt = useRef(Date.now());
  const lag = useRef(0);
  const sentAt = useRef(0);
  const localMove = useRef<{ at: number; mine: number } | null>(null);
  const g = useMemo(() => gameFeel(settings, prefs), [settings, prefs]);
  useEffect(() => preloadSounds(g.soundSet), [g.soundSet]);
  const arrived = () => {
    const t = Date.now();
    if (sentAt.current) {
      const oneWay = Math.min(1500, Math.max(0, (t - sentAt.current) / 2));
      lag.current = lag.current ? 0.7 * lag.current + 0.3 * oneWay : oneWay;
      sentAt.current = 0;
    }
    stateAt.current = t - lag.current;
  };
  const api = useRef<Api | null>(null);
  const { w, h } = useViewport();
  // Wider than tall at all: board left, column right. Taller: stacked.
  const wide = w > h;
  const conn = useMemo(() => (demo ? demoConn(username) : realConn(token, gameId)), [demo, username, token, gameId]);

  useEffect(() => {
    const ac = new AbortController();
    conn
      .stream(
        (gf) => {
          setFull(gf);
          setState(gf.state);
          stateAt.current = Date.now();
        },
        (s) => {
          arrived();
          setState(s);
        },
        (o) => setGoneUntil(o.gone ? Date.now() + 1000 * (o.claimWinInSeconds ?? 0) : null),
        ac.signal,
        setLinkUp,
      )
      .catch((x) => !ac.signal.aborted && setErr(String(x)));
    return () => ac.abort();
  }, [conn]);

  const live = !!state && ["created", "started"].includes(state.status);
  useEffect(() => onLiveChange(live), [live, onLiveChange]);
  useEffect(() => () => onLiveChange(false), [onLiveChange]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [live]);

  // Moves (with my own move shown immediately, before Lichess echoes it).
  const serverMoves = useMemo(() => (state?.moves ?? "").split(" ").filter(Boolean), [state?.moves]);
  const pending = sent && sent.base === serverMoves.length ? sent.uci : null;
  const moves = useMemo(() => (pending ? [...serverMoves, pending] : serverMoves), [serverMoves, pending]);
  const fens = useMemo(() => {
    const c = new Chess();
    const out = [c.fen()];
    const sans: string[] = [""];
    for (const u of moves) {
      try {
        sans.push(c.move(uciParams(u)).san);
      } catch {
        break;
      }
      out.push(c.fen());
    }
    return { out, sans };
  }, [moves]);

  // New move from Lichess: snap back to live, and for the opponent's move play
  // its sound and buzz (our own move already sounded when we made it), then
  // fire a premove.
  const prevLen = useRef(-1);
  useEffect(() => {
    const n = serverMoves.length;
    if (prevLen.current >= 0 && n > prevLen.current) {
      setViewPly(null);
      const mover: Side = (n - 1) % 2 === 0 ? "w" : "b";
      if (mover !== myColorRef.current) {
        setGoneUntil(null);
        playMoveSound(g.soundSet, fens.sans[n] ?? "");
        if (g.vibrate) buzz(40);
        // The next queued premove goes if it is legal now; if not, the whole queue does.
        const [next, ...rest] = queueRef.current;
        if (next) {
          let legal = false;
          try {
            new Chess(fens.out[n]).move(uciParams(next));
            legal = true;
          } catch {
            /* illegal here */
          }
          setQueue(legal ? rest : []);
          if (legal) onMoveRef.current(next);
        }
      }
      api.current?.playPremove();
    }
    prevLen.current = n;
  }, [serverMoves.length, g.soundSet, g.vibrate, fens.sans, fens.out]);

  // Arrow keys browse.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setViewPly((p) => Math.max(0, (p ?? moves.length) - 1));
      if (e.key === "ArrowRight") setViewPly((p) => (p === null || p + 1 >= moves.length ? null : p + 1));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [moves.length]);

  // Fetch the finished game for review.
  useEffect(() => {
    if (!state || live) return;
    if (demo) {
      const c = new Chess();
      const sans = serverMoves.map((u) => c.move(uciParams(u)).san);
      setFinished({
        id: `demo:${Date.now()}`,
        site: "lichess",
        url: "",
        white: username || "You",
        black: "Demo opponent",
        userColor: "w",
        result: state.winner === "white" ? "1-0" : state.winner === "black" ? "0-1" : "1/2-1/2",
        date: Date.now(),
        speed: "bullet",
        rated: false,
        sans,
      });
      if (state.winner) setDiffs(state.winner === "white" ? { w: 7, b: -7 } : { w: -7, b: 7 });
      return;
    }
    let stop = false;
    // Lichess fills in a rated game's rating changes a moment after it ends.
    const load = async (tries: number): Promise<Awaited<ReturnType<typeof exportGame>> | undefined> => {
      const g = await exportGame(gameId);
      if (stop) return;
      const dw = g.players.white.ratingDiff as number | undefined;
      const db = g.players.black.ratingDiff as number | undefined;
      if (g.rated && dw === undefined && tries > 1) {
        await new Promise((r) => setTimeout(r, 1500));
        return stop ? undefined : load(tries - 1);
      }
      setDiffs({ w: dw, b: db });
      return g;
    };
    load(4)
      .then((g) => {
        if (!g) return;
        const white = g.players.white.user?.name ?? `Lichess AI ${g.players.white.aiLevel ?? ""}`;
        const black = g.players.black.user?.name ?? `Lichess AI ${g.players.black.aiLevel ?? ""}`;
        setFinished({
          id: `li:${g.id}`,
          site: "lichess",
          url: `https://lichess.org/${g.id}`,
          white,
          black,
          userColor: white.toLowerCase() === username.toLowerCase() ? "w" : "b",
          result: g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2",
          date: g.createdAt,
          speed: g.speed,
          rated: g.rated,
          sans: (g.moves ?? "").split(" ").filter(Boolean),
        });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [gameId, state, live, username, demo]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = username.toLowerCase();
  const myColor: Side = full && me && (full.black.id ?? "").toLowerCase() === me ? "b" : "w";
  myColorRef.current = myColor;
  const opp: Side = myColor === "w" ? "b" : "w";
  const turn: Side = moves.length % 2 === 0 ? "w" : "b";
  const shown = viewPly ?? moves.length;
  const fen = fens.out[Math.min(shown, fens.out.length - 1)];
  const lastMove = shown > 0 ? moves[shown - 1] : undefined;

  const initial = full?.clock?.initial ?? 0;
  const increment = full?.clock?.increment ?? 0;
  const clockMs = (side: Side, at = now) => {
    if (!state) return 0;
    const base = side === "w" ? state.wtime : state.btime;
    const lm = pending ? localMove.current : null;
    if (lm) {
      if (side === myColor) return lm.mine;
      return moves.length >= 2 ? base - (at - lm.at) : base;
    }
    const running = live && turn === side && serverMoves.length >= 2;
    return running ? base - (at - stateAt.current) : base;
  };

  const onMove = (uci: string) => {
    if (!live) return;
    const t = Date.now();
    localMove.current = { at: t, mine: clockMs(myColor, t) + (serverMoves.length >= 2 ? increment : 0) };
    sentAt.current = t;
    setSent({ uci, base: serverMoves.length });
    try {
      playMoveSound(g.soundSet, new Chess(fens.out[fens.out.length - 1]).move(uciParams(uci)).san);
    } catch {
      /* illegal: Lichess will refuse it */
    }
    conn.move(uci).catch((e) => {
      setSent(null);
      sentAt.current = 0;
      setErr(String(e));
    });
  };

  onMoveRef.current = onMove;
  // The queue ends with the game.
  useEffect(() => {
    if (!live) setQueue([]);
  }, [live]);

  // Game start and end, as on Lichess: a notify sound at the start; a buzz at the end.
  const startedRef = useRef(false);
  useEffect(() => {
    if (live && full && !startedRef.current) {
      startedRef.current = true;
      if (serverMoves.length === 0) playSound(g.soundSet, "genericNotify");
    }
    if (!live && startedRef.current && state) {
      startedRef.current = false;
      if (g.vibrate) buzz([60, 80, 60]);
    }
  }, [live, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Low-time warning (Lichess pref clockSound): once below the threshold, again
  // only after climbing back above 1.5x it. Threshold as lila's clockCtrl.
  const lowArmed = useRef(true);
  const myMs = clockMs(myColor);
  useEffect(() => {
    if (!live || !initial || !g.lowTime) return;
    const s = initial / 1000;
    const emerg = 1000 * Math.min(60, s < 60 ? Math.max(2, s * 0.2) : Math.max(10, s * 0.125));
    if (lowArmed.current && myMs < emerg && turn === myColor) {
      lowArmed.current = false;
      playSound(g.soundSet, "lowTime");
    } else if (myMs > 1.5 * emerg) lowArmed.current = true;
  }, [myMs, live, initial, g.lowTime, g.soundSet, turn, myColor]);
  const mat = material(fens.out[fens.out.length - 1]);

  const name = (p?: GameFull["white"]) => (p?.aiLevel ? `Lichess AI · level ${p.aiLevel}` : (p?.name ?? "?"));
  const rating = (p?: GameFull["white"]) => (p?.rating && (g.ratings === 1 || (g.ratings === 2 && !live)) ? String(p.rating) : "");
  const player = (s: Side) => (s === "w" ? full?.white : full?.black);
  const canAbort = live && serverMoves.length < 2;

  const status = state && !live ? describeEnd(state, myColor) : null;

  // Opponent left the game: Lichess's countdown, then claim the win or a draw.
  const goneLeft = live && goneUntil !== null ? Math.max(0, Math.ceil((goneUntil - now) / 1000)) : null;
  const canClaim = goneLeft === 0;
  useEffect(() => {
    if (canClaim && g.vibrate) buzz([40, 60, 40]);
  }, [canClaim]); // eslint-disable-line react-hooks/exhaustive-deps
  const goneBar = goneLeft !== null && (
    <div className="ui-card ui-pad flex flex-col items-center gap-2 text-center" style={{ background: "color-mix(in oklab, var(--warn) 22%, var(--surface))" }} data-testid="opponent-gone">
      <div className="font-semibold">{canClaim ? "Opponent left the game" : `Opponent left the game. You can claim victory in ${goneLeft} s.`}</div>
      {canClaim && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" size="lg" onClick={() => conn.claimWin().catch((e) => setErr(String(e)))}>
            Claim victory
          </Button>
          <Button size="lg" onClick={() => conn.claimDraw().catch((e) => setErr(String(e)))}>
            Call draw
          </Button>
        </div>
      )}
    </div>
  );

  // Sizes in px from the real window, so near-square screens (a Fold) still
  // get the largest board. Wide: the column takes what the board leaves, within
  // 220-440px. Tall: clocks and arrows shrink (to a floor) before the board does.
  // Tall screens carry the action buttons in the top strip.
  const strip = wide ? 34 : 66;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  let boardPx: number,
    colPx = 0,
    clockPx: number,
    arrowPx: number;
  if (wide) {
    const byHeight = Math.min(h - strip - 16, 1100);
    colPx = clamp(w - byHeight - 48, 220, 440);
    boardPx = Math.min(byHeight, w - colPx - 48);
    // Column: 2 name rows (~100px), actions (~60px), gaps; arrows are half a clock.
    clockPx = clamp(Math.min(h * 0.19, (h - strip - 220) / 2.5), 48, 170);
    arrowPx = clockPx / 2;
  } else {
    // The put-away result (a line and two buttons) takes its own row.
    const gaps = 8 * 5 + 10 + (status && hideEnd ? 78 : 0);
    const target = Math.min(w - 12, 1100);
    const spare = h - strip - target - gaps;
    const wantClock = Math.min(h * 0.13, 112);
    const wantArrow = Math.min(h * 0.09, 76);
    const scale = clamp(spare / (2 * wantClock + wantArrow), 0, 1);
    clockPx = Math.max(44, wantClock * scale);
    arrowPx = Math.max(44, wantArrow * scale);
    boardPx = Math.min(target, h - strip - gaps - 2 * clockPx - arrowPx);
  }
  const clockH = `${Math.round(clockPx)}px`;

  const clock = (side: Side) => (
    <ClockFace
      ms={clockMs(side)}
      tenths={g.tenths}
      initial={initial}
      warnPct={settings.warnPct}
      dangerPct={settings.dangerPct}
      active={live && turn === side}
      height={clockH}
      wide={wide}
      warn={side === myColor || g.oppClockWarn}
    />
  );
  const info = (side: Side, align: "left" | "right" = "left") => {
    const p = player(side);
    const extra = mat[side];
    const pts = side === "w" ? mat.score : -mat.score;
    return (
      <div className={cx("flex min-w-0 flex-col gap-0.5", align === "right" && "items-end text-right")}>
        <div className="flex max-w-full min-w-0 items-baseline gap-2">
          <span className="truncate text-[1.05rem] font-semibold">{name(p)}</span>
          <span className="num text-sm text-muted">{rating(p)}</span>
          {diffs[side] !== undefined && (
            <span className="num text-sm font-semibold" style={{ color: diffs[side]! > 0 ? "var(--good)" : diffs[side]! < 0 ? "var(--bad)" : undefined }} data-testid="rating-diff">
              {diffs[side]! > 0 ? `+${diffs[side]}` : diffs[side] === 0 ? "±0" : diffs[side]}
            </span>
          )}
        </div>
        <div className="flex h-6 items-center gap-0.5 text-lg leading-none text-muted" title="Material">
          {extra.map((k, i) => (
            <span key={i}>{GLYPH[k]}</span>
          ))}
          {pts > 0 && <span className="num ml-1 text-sm font-semibold text-fg">+{pts}</span>}
        </div>
      </div>
    );
  };
  const arrows = (height: string) => (
    <div className="grid grid-cols-2 gap-2" style={{ height }}>
      <button className="ui-btn ui-btn-secondary h-full! text-2xl" onClick={() => setViewPly((p) => Math.max(0, (p ?? moves.length) - 1))} disabled={shown === 0} aria-label="Previous move">
        <ChevronLeft size={36} />
      </button>
      <button
        className="ui-btn ui-btn-secondary h-full! text-2xl"
        onClick={() => setViewPly((p) => (p === null || p + 1 >= moves.length ? null : p + 1))}
        disabled={viewPly === null}
        aria-label="Next move"
      >
        <ChevronRight size={36} />
      </button>
    </div>
  );
  const actions = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {canAbort && <ConfirmButton label="Abort" icon={<X size={ACTION_ICON} />} confirm={g.confirm} onConfirm={() => conn.abort().catch((e) => setErr(String(e)))} />}
      {live && !canAbort && <ConfirmButton label="Offer draw" icon={<Handshake size={ACTION_ICON} />} confirm={g.confirm} onConfirm={() => conn.draw().catch((e) => setErr(String(e)))} />}
      {live && !canAbort && <ConfirmButton danger label="Resign" icon={<Flag size={ACTION_ICON} />} confirm={g.confirm} onConfirm={() => conn.resign().catch((e) => setErr(String(e)))} />}
      {wide && (
        <Button
          variant="secondary"
          className={ACTION_BTN}
          onClick={switchSide}
          title="Move clocks and buttons to the other side"
          aria-label="Move clocks and buttons to the other side"
          data-testid="switch-side"
        >
          <ArrowLeftRight size={ACTION_ICON} />
        </Button>
      )}
    </div>
  );

  const premoveQueue: PremoveQueue | undefined =
    live && viewPly === null && g.multiPremove && turn !== myColor ? { color: myColor, moves: queue, onAdd: (u) => setQueue((q) => [...q, u]), onClear: () => setQueue([]) } : undefined;
  const board = (
    <Board
      fen={fen}
      orientation={myColor}
      lastMove={lastMove}
      hideEval
      movable={live && viewPly === null ? myColor : undefined}
      onMove={onMove}
      premove={g.premove && !g.multiPremove}
      feel={g.feel}
      premoveQueue={premoveQueue}
      onApi={(a) => (api.current = a)}
    />
  );
  const viewingPast = viewPly !== null && (
    <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
      Move {viewPly}/{moves.length} · → returns
    </div>
  );
  // The result sits over the board, so it is plain the game is over; it can be
  // put away to look at the final position (and brought back from the column).
  const endCard = status && !hideEnd && (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.45)" }}>
      <div className="ui-card ui-pad relative flex max-w-[90%] flex-col items-center gap-3 text-center shadow-2xl" style={{ background: "var(--surface)" }} data-testid="live-result">
        <button className="absolute top-2 right-2 text-muted hover:text-fg" onClick={() => setHideEnd(true)} aria-label="Show the board" title="Show the board">
          <X size={18} />
        </button>
        <div className="ui-h1 px-6">{status}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {finished && (
            <Button variant="primary" size="lg" onClick={() => onReview(finished)}>
              Review game
            </Button>
          )}
          <Button size="lg" onClick={onExit}>
            Back to OutOfBook
          </Button>
        </div>
      </div>
    </div>
  );
  // The result card put away: the result in a line, and its two choices.
  const endAgain = status && hideEnd && (
    <div className="flex flex-col gap-1.5" data-testid="end-again">
      <button className="text-center text-sm font-semibold hover:underline" onClick={() => setHideEnd(false)} title="Show the result again">
        {status}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {finished && (
          <Button variant="primary" className="h-auto! min-h-10 whitespace-normal" onClick={() => onReview(finished)}>
            Review game
          </Button>
        )}
        <Button className={cx("h-auto! min-h-10 whitespace-normal", !finished && "col-span-2")} onClick={onExit}>
          Exit
        </Button>
      </div>
    </div>
  );

  const boardSize = `${Math.floor(boardPx)}px`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ background: "var(--page-bg)" }} data-testid="live-game">
      <div className="flex shrink-0 items-center gap-2 px-3 text-xs text-muted" style={{ height: strip }}>
        <span className="hidden items-center gap-1.5 font-semibold whitespace-nowrap text-fg sm:flex">
          <img src="/brand/web-icon.png" alt="" className="h-4 w-auto" /> OutOfBook
        </span>
        {live && !linkUp ? (
          <span className="flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: "var(--warn)" }} data-testid="reconnecting">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--warn)" }} /> RECONNECTING
          </span>
        ) : live ? (
          <span className="flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: "var(--bad)" }}>
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--bad)" }} /> LIVE
          </span>
        ) : (
          <span>finished</span>
        )}
        {demo && (
          <span className="font-semibold whitespace-nowrap" style={{ color: "var(--warn)" }}>
            DEMO
          </span>
        )}
        {full && (
          <span className="hidden truncate sm:inline">
            {full.rated ? "Rated" : "Casual"} {full.speed}
            {full.clock ? ` · ${full.clock.initial / 60000}+${full.clock.increment / 1000}` : ""}
          </span>
        )}
        <span className="flex-1" />
        {!wide && actions}
        {demo ? (
          <button className="whitespace-nowrap hover:text-fg" onClick={onExit} aria-label="Exit demo">
            <span className="hidden sm:inline">exit demo </span>✕
          </button>
        ) : (
          <a className="hidden items-center gap-1 hover:text-fg sm:inline-flex" href={`https://lichess.org/${gameId}`} target="_blank" rel="noreferrer">
            <LichessIcon size={13} /> lichess.org/{gameId}
          </a>
        )}
      </div>
      {err && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-ui px-3 py-1.5 text-xs" style={{ background: "color-mix(in oklab, var(--bad) 18%, transparent)", color: "var(--bad)" }}>
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {wide ? (
        <div className={cx("flex min-h-0 flex-1 items-center justify-center gap-6 px-3 pb-2", columnLeft && "flex-row-reverse")}>
          <div className="relative shrink-0" style={{ width: boardSize }}>
            {board}
            {viewingPast}
            {endCard}
          </div>
          <div className="flex shrink-0 flex-col gap-3" style={{ width: colPx, containerType: "inline-size" }}>
            {info(opp)}
            {clock(opp)}
            {arrows(`calc(${clockH} / 2)`)}
            {clock(myColor)}
            {info(myColor)}
            {goneBar}
            {actions}
            {endAgain}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-1.5 pb-2">
          <div className="flex w-full items-center gap-3 px-1" style={{ maxWidth: boardSize, containerType: "inline-size" }}>
            <div className="min-w-0 flex-1">{info(opp)}</div>
            <div className="w-[58%]">{clock(opp)}</div>
          </div>
          <div className="relative w-full" style={{ maxWidth: boardSize }}>
            {board}
            {viewingPast}
            {endCard}
            {/* Tall screens have no spare height: the notice sits over the opponent's side of the board. */}
            {goneBar && <div className="absolute inset-x-2 top-2 z-20 shadow-2xl">{goneBar}</div>}
          </div>
          <div className="flex w-full items-center gap-3 px-1" style={{ maxWidth: boardSize, containerType: "inline-size" }}>
            <div className="w-[58%]">{clock(myColor)}</div>
            <div className="min-w-0 flex-1">{info(myColor, "right")}</div>
          </div>
          <div className="w-full px-1" style={{ maxWidth: boardSize }}>
            {arrows(`${Math.round(arrowPx)}px`)}
          </div>
          {endAgain && (
            <div className="w-full px-1" style={{ maxWidth: boardSize }}>
              {endAgain}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ClockFace({
  ms,
  tenths,
  initial,
  warnPct,
  dangerPct,
  active,
  height,
  wide,
  warn = true,
}: {
  warn?: boolean; // false: never changes color (the opponent's clock, when the user turned that off)
  ms: number;
  tenths: 0 | 1 | 2;
  initial: number;
  warnPct: number;
  dangerPct: number;
  active: boolean;
  height: string;
  wide: boolean;
}) {
  const pct = initial ? (ms / initial) * 100 : 100;
  const level = !warn ? 0 : pct <= dangerPct ? 2 : pct <= warnPct ? 1 : 0;
  // Flash once each time the clock crosses into a new level.
  const prev = useRef(level);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (level > prev.current) setFlash((f) => f + 1);
    prev.current = level;
  }, [level]);
  const color = level === 2 ? "var(--bad)" : level === 1 ? "var(--warn)" : undefined;
  return (
    <div
      key={flash}
      className={cx("ui-card num flex items-center justify-center font-bold tracking-tight", flash > 0 && "clock-flash")}
      data-testid="clock"
      data-level={level}
      data-active={active}
      style={{
        height,
        fontSize: wide ? `min(26cqw, calc(${height} * 0.72))` : `min(16cqw, calc(${height} * 0.72))`,
        background: color ? `color-mix(in oklab, ${color} ${active ? 85 : 35}%, var(--surface))` : active ? "var(--surface-2)" : "var(--card-bg)",
        color: color && active ? "#111" : active ? "var(--fg)" : "var(--muted)",
        boxShadow: active ? "0 0 0 2px var(--accent)" : undefined,
        padding: 0,
      }}
    >
      {fmtClock(ms, tenths)}
    </div>
  );
}

function describeEnd(s: GameState, me: Side) {
  const won = s.winner ? (s.winner === "white") === (me === "w") : null;
  const how: Record<string, string> = {
    mate: "checkmate",
    resign: "resignation",
    outoftime: "time",
    timeout: "abandonment",
    draw: "agreement",
    stalemate: "stalemate",
    aborted: "",
    noStart: "no start",
    cheat: "fair-play",
    variantEnd: "variant end",
  };
  if (s.status === "aborted") return "Game aborted";
  if (won === null) return `Draw${how[s.status] ? ` by ${how[s.status]}` : ""}`;
  return `${won ? "You won" : "You lost"}${how[s.status] ? ` by ${how[s.status]}` : ""}`;
}
