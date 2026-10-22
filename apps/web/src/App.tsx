import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, Bot, DoorOpen, Download, FileSearch, Gem, GitBranch, LayoutDashboard, ListOrdered, LogOut, Minus, Plus, Settings as Gear, SignpostBig, Sparkles } from "lucide-react";
import { LichessIcon } from "./components/LichessIcon";
import { account as lichessAccount, completeLogin, login, logout } from "./lib/auth";
import { hasAuth, loadSavedGames, me, saveGames, type Me } from "./lib/server";
import { localModel, modelHash, saveLocalModel, saveServerModel, serverModel } from "./lib/modelStore";
import { runAnalysis, type AnalysisProgress } from "./lib/analysis";
import { classify } from "@outofbook/core/classify";
import { askRepertoire } from "./lib/claude";
import { posKey, START_FEN, uciToSan } from "@outofbook/core/chess";
import { defaultPoolSize } from "./lib/engine";
import { countEvals, kvGet, kvSet } from "./lib/evalCache";
import { findPath } from "@outofbook/core/repertoire";
import { loadSettings, saveSettings, type Settings } from "./lib/settings";
import { BAD_VERDICTS, type MoveStat, type PosEval, type RawGame, type RepertoireModel, type Side, type Verdict } from "@outofbook/core/types";
import { Board, type Arrow } from "./components/Board";
import { BookExplorer, type ExploreTarget } from "./components/BookExplorer";
import { GameReview } from "./components/GameReview";
import { GamesView } from "./components/GamesView";
import { ImportPanel } from "./components/ImportPanel";
import { MoveLists } from "./components/MoveLists";
import { OpeningsView } from "./components/OpeningsView";
import { Overview } from "./components/Overview";
import { RepertoireView } from "./components/RepertoireView";
import { SettingsDialog } from "./components/SettingsDialog";
import { PlayBot, type BotStart } from "./components/PlayBot";
import { LichessPlay } from "./components/LichessPlay";
import { Alert, Button, Card, Dialog, Input, Seg, Tip } from "./components/ui";
import { MODES, useDesign } from "./design/design";
import { Shell, type NavItem } from "./shell/Shells";
import { CommandPalette } from "./shell/CommandPalette";

type View = "overview" | "repertoire" | "mistakes" | "outofbook" | "whocares" | "openings" | "games" | "play" | "lichess" | "review";
const ANALYSE: View[] = ["overview", "repertoire", "mistakes", "outofbook", "whocares", "openings", "games"];

export interface BoardState {
  fen: string;
  orientation: Side;
  arrows: Arrow[];
  label?: string;
  evalLine?: PosEval["lines"][number];
  lastMove?: string;
}

const TITLES: Record<View, [string, string]> = {
  overview: ["Overview", "Your repertoire at a glance"],
  repertoire: ["Repertoire", "Every position you reached, transpositions merged"],
  mistakes: ["Mistakes", "Repeated opening mistakes, by how often you played them"],
  outofbook: ["Out of book", "Where you left the named lines"],
  whocares: ["Book? Who cares", "Great moves nobody has named yet"],
  openings: ["Who left the book", "You or your opponent, per opening"],
  games: ["Games", "Your imported games"],
  play: ["Play vs bot", "Drill your repertoire against Maia or Stockfish"],
  lichess: ["Play on Lichess", "Real games, no assistance"],
  review: ["Game review", "One game against your repertoire"],
};

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [games, setGames] = useState<RawGame[]>([]);
  const [model, setModel] = useState<RepertoireModel | null>(null);
  const [building, setBuilding] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [tab, setTab] = useState<View>("overview");
  const [colorSel, setColorSel] = useState<"both" | Side>("both");
  const [minGames, setMinGames] = useState(settings.minGames);
  const [board, setBoard] = useState<BoardState>({ fen: START_FEN, orientation: "w", arrows: [] });
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [explore, setExplore] = useState<ExploreTarget | null>(null);
  const [account, setAccount] = useState<Me | null>(null);
  const accountRef = useRef<Me | null>(null);
  accountRef.current = account;
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // The save note is news, not a state: it goes away by itself.
  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 8000);
    return () => clearTimeout(t);
  }, [saveMsg]);
  const [botStart, setBotStart] = useState<BotStart | null>(null);
  const [extraGames, setExtraGames] = useState<RawGame[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [answer, setAnswer] = useState<{ q: string; note?: string; text?: string; busy?: boolean; err?: string } | null>(null);
  const [version, setVersion] = useState(0);
  const evals = useRef(new Map<string, PosEval>());
  const verdicts = useRef(new Map<string, Verdict>());
  const analysis = useRef<{ stop: () => void } | null>(null);
  const buildRun = useRef(0); // the latest loadGames call; older ones drop their result

  // Login redirect, account, and the last import (kept in IndexedDB for quick PoC reloads).
  useEffect(() => {
    completeLogin()
      .then(async (t) => {
        setToken(t);
        if (t) setUsername((await lichessAccount(t))?.username ?? "");
        setAccount(await me());
      })
      .catch((e) => alert(String(e)));
    // Games: this browser's copy, else (new device, cleared browser) the account's saved games.
    // performance marks: startup timing for the hybrid PoC measurements.
    performance.mark("oob-start");
    kvGet<RawGame[]>("lastGames").then(async (g) => {
      if (g?.length) return (performance.mark("oob-games"), loadGames(g));
      if (!hasAuth()) return;
      const saved = await loadSavedGames().catch(() => []);
      if (saved.length) {
        performance.mark("oob-games");
        kvSet("lastGames", saved);
        loadGames(saved);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGames = useCallback(
    (g: RawGame[], s: Settings = settings) => {
      analysis.current?.stop();
      setGames(g);
      setModel(null);
      setBuilding(true);
      setReviewId(null);
      const opts = { pliesAfterBook: s.pliesAfterBook, treeMaxPly: s.treeMaxPly };
      const ready = (m: RepertoireModel, source: string) => {
        setBuilding(false);
        setModel(m);
        performance.mark("oob-model");
        (window as unknown as { __oob: unknown }).__oob = { buildMetrics: m.metrics, model: { source, ms: Math.round(performance.now() - t0) } };
        startAnalysis(m, s);
      };
      // The built model: this browser's copy, else the server's, else build it
      // here and keep it in both places.
      const t0 = performance.now();
      const run = ++buildRun.current;
      (async () => {
        const hash = await modelHash(g, opts);
        const local = await localModel(hash);
        if (run !== buildRun.current) return;
        if (local) return ready(local, "browser");
        const remote = await serverModel(hash);
        if (run !== buildRun.current) return;
        if (remote) {
          saveLocalModel(hash, remote);
          return ready(remote, "server");
        }
        const w = new Worker(new URL("./workers/build.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (ev: MessageEvent<RepertoireModel>) => {
          w.terminate();
          if (run !== buildRun.current) return;
          ready(ev.data, "built");
          saveLocalModel(hash, ev.data);
          saveServerModel(hash, ev.data);
        };
        w.postMessage({ games: g, opts });
      })();
    },
    [settings],
  );

  const startAnalysis = (m: RepertoireModel, s: Settings) => {
    evals.current.clear();
    verdicts.current.clear();
    const byKey = new Map<string, MoveStat[]>();
    for (const mv of m.moves) for (const k of [mv.fromKey, mv.toKey]) byKey.set(k, [...(byKey.get(k) ?? []), mv]);
    let dirty = false;
    const tick = setInterval(() => dirty && (setVersion((v) => v + 1), (dirty = false)), 500);
    const run = runAnalysis(
      m.moves,
      { depth: s.depth, poolSize: s.poolSize || defaultPoolSize(), build: s.engineBuild, useCloud: s.useCloud, cloudMaxPly: s.cloudMaxPly, share: !!accountRef.current },
      (key, e) => {
        evals.current.set(key, e);
        for (const mv of byKey.get(key) ?? []) {
          const b = evals.current.get(mv.fromKey);
          const a = evals.current.get(mv.toKey);
          if (b && a && b.lines.length && a.lines.length && !verdicts.current.has(mv.id)) {
            verdicts.current.set(mv.id, classify({ fenBefore: mv.fen, played: mv.uci, before: b, after: a, prevFen: mv.prevFen, prevUci: mv.prevUci, legalCount: new Chess(mv.fen).moves().length }));
          }
        }
        dirty = true;
      },
      (p) => {
        if (!p.running) performance.mark("oob-analysed");
        setProgress(p);
        const w = window as unknown as { __oob: Record<string, unknown> };
        w.__oob = { ...(w.__oob ?? {}), analysis: p };
      },
    );
    analysis.current = run;
    run.finished.then(() => {
      clearInterval(tick);
      setVersion((v) => v + 1);
      countEvals().then((n) => console.log(`eval cache: ${n} positions`));
    });
  };

  const verdict = useCallback((m: MoveStat) => verdicts.current.get(m.id), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdictOf = useCallback((c: Side, fromKey: string, uci: string) => verdicts.current.get(`${c}|${fromKey}|${uci}`), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const evalOf = useCallback((k: string) => evals.current.get(k), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const colors: Side[] = colorSel === "both" ? ["w", "b"] : [colorSel];
  const select = useCallback((fen: string, orientation: Side, arrows: Arrow[], label?: string) => setBoard({ fen, orientation, arrows, label }), []);
  const openExplore = useCallback(
    (t: ExploreTarget) => {
      const graph = t.graph ?? model?.graphs[t.orientation];
      // The moves that led here, so the explorer can step back through them.
      const path = t.path ?? (graph && model ? findPath(graph, model.rootKey, posKey(t.fen))?.map((e) => e.uci) : undefined);
      setExplore({ ...t, graph, path });
    },
    [model],
  );

  const prevTab = useRef<View>("overview");
  const openGame = useCallback(
    (id: string) => {
      if (tab !== "review") prevTab.current = tab;
      setReviewId(id);
      setTab("review");
      history.pushState({ review: id }, "");
    },
    [tab],
  );
  useEffect(() => {
    const onPop = () => {
      setReviewId(null);
      setTab((t) => (t === "review" ? prevTab.current : t));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Fair play: while a Lichess game is live, stop engine work and hide everything else.
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (live) {
      analysis.current?.stop();
      setExplore(null);
      setImportOpen(false);
      setSettingsOpen(false);
      setCmdOpen(false);
      setTab("lichess");
    } else if (model && analysis.current) startAnalysis(model, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const reviewExtra = useCallback(
    (g: RawGame) => {
      setExtraGames((x) => [g, ...x]);
      openGame(g.id);
    },
    [openGame],
  );
  const reviewGame = useMemo(() => [...extraGames, ...games].find((g) => g.id === reviewId), [games, extraGames, reviewId]);
  const emptyModel = useMemo(
    () => ({ graphs: { w: {}, b: {} }, rootKey: posKey(START_FEN), moves: [], games: {}, openings: [], metrics: { games: 0, plies: 0, ms: 0, uniquePositions: 0 } }) as RepertoireModel,
    [],
  );

  const onImported = async (g: RawGame[]) => {
    setImportOpen(false);
    kvSet("lastGames", g);
    loadGames(g);
    setSaveMsg(null);
    if (!account) return;
    if (account.limit !== null && g.length > account.limit) {
      setSaveMsg(`Not saved to your account: ${g.length} games is over the ${account.limit}-game limit.`);
      return;
    }
    const r = await saveGames(g);
    setSaveMsg("saved" in r ? `Saved ${r.saved} games to your account.` : `Save failed: ${r.error}`);
    setAccount(await me());
  };

  const nav: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Analyse", disabled: !model },
    { id: "repertoire", label: "Repertoire", icon: GitBranch, group: "Analyse", disabled: !model },
    { id: "mistakes", label: "Mistakes", icon: AlertTriangle, group: "Analyse", disabled: !model },
    { id: "outofbook", label: "Out of book", icon: SignpostBig, group: "Analyse", disabled: !model },
    { id: "whocares", label: "Book? Who cares", icon: Gem, group: "Analyse", disabled: !model },
    { id: "openings", label: "Who left the book", short: "Who left", icon: DoorOpen, group: "Analyse", disabled: !model },
    { id: "games", label: "Games", icon: ListOrdered, group: "Analyse", disabled: !model },
    { id: "play", label: "Play vs bot", short: "Bots", icon: Bot, group: "Play" },
    { id: "lichess", label: "Play on Lichess", short: "Lichess", icon: LichessIcon, group: "Play" },
    ...(reviewGame ? [{ id: "review", label: `${reviewGame.white} vs ${reviewGame.black}`, short: "Review", icon: FileSearch, group: "Game" as const }] : []),
  ];
  const go = (id: string) => setTab(id as View);

  const jumpToLine = (c: Side, key: string) => {
    const n = model?.graphs[c][key];
    if (!n || !model) return;
    const path = findPath(model.graphs[c], model.rootKey, key);
    setColorSel(c);
    setTab("repertoire");
    setBoard({ fen: n.fen, orientation: c, arrows: [], label: n.book?.name, lastMove: path?.[path.length - 1]?.uci });
  };

  // Questions from the command palette: a light "router", plus Claude when a key is set.
  const onAsk = (q: string) => {
    const s = q.toLowerCase();
    const side: Side | undefined = /\bas black\b|\bwith black\b/.test(s) ? "b" : /\bas white\b|\bwith white\b/.test(s) ? "w" : undefined;
    if (side) setColorSel(side);
    const routes: [RegExp, View][] = [
      [/who cares|gem|unnamed|novelt/, "whocares"],
      [/who left|leave the book|leaves the book/, "openings"],
      [/out of book|off book|deviat/, "outofbook"],
      [/mistake|blunder|wrong|error|inaccura/, "mistakes"],
      [/\bgames?\b|history/, "games"],
      [/\bbots?\b|maia|stockfish|drill|practi/, "play"],
      [/lichess|rated|seek|challenge/, "lichess"],
      [/tree|repertoire|line/, "repertoire"],
    ];
    const route = routes.find(([r]) => r.test(s))?.[1];
    let note = "";
    if (model) {
      const words = s.split(/[^a-z']+/).filter((w) => w.length > 3);
      let best: { c: Side; key: string; score: number; name: string; count: number } | null = null;
      for (const c of side ? [side] : (["w", "b"] as Side[]))
        for (const n of Object.values(model.graphs[c])) {
          if (!n.book) continue;
          const name = n.book.name.toLowerCase();
          const score = words.filter((w) => name.includes(w)).length;
          if (score && (!best || score > best.score || (score === best.score && n.count > best.count))) best = { c, key: n.key, score, name: n.book.name, count: n.count };
        }
      if (best) {
        jumpToLine(best.c, best.key);
        note = `Showing ${best.name} as ${best.c === "w" ? "White" : "Black"} (${best.count} games).`;
        if (route && route !== "repertoire") setTab(route);
      } else if (route) setTab(route);
    }
    if (!settings.claudeKey) {
      setAnswer({ q, note: (note || (route ? `Opened ${TITLES[route][0]}.` : "No matching view or opening.")) + " Add an Anthropic API key in Settings for a written answer from Claude." });
      return;
    }
    setAnswer({ q, note, busy: true });
    askRepertoire(settings.claudeKey, q, repertoireSummary(model, verdict, evalOf))
      .then((text) => setAnswer({ q, note, text }))
      .catch((e) => setAnswer({ q, note, err: String(e) }));
  };

  const t = TITLES[tab];
  const analyseView = ANALYSE.includes(tab);
  const statusText = building ? (
    `Building repertoire from ${games.length} games…`
  ) : progress && model ? (
    <span data-testid="analysis-progress" title={`browser cache ${progress.cache} · shared cache ${progress.server} · cloud ${progress.cloud} · engine ${progress.engine}`}>
      <span data-testid="build-metrics">
        {model.metrics.games} games · {model.metrics.uniquePositions} positions
      </span>{" "}
      · analysis {progress.done}/{progress.total}
      {progress.running ? ` · ${(progress.done / Math.max(0.001, progress.ms / 1000)).toFixed(1)} pos/s` : " · done"}
    </span>
  ) : model ? (
    <span data-testid="build-metrics">{model.metrics.games} games</span>
  ) : null;

  const actions = (
    <>
      <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
        <Download size={14} /> Load games
      </Button>
      {token ? (
        <Tip content="Log out of Lichess">
          <Button size="sm" variant="ghost" onClick={() => logout().then(() => (setToken(null), setUsername("")))} data-testid="account-btn">
            <LogOut size={14} /> {username || "Lichess"}
          </Button>
        </Tip>
      ) : (
        <Button size="sm" variant="primary" onClick={login}>
          <LichessIcon size={14} /> Log in with Lichess
        </Button>
      )}
      <Tip content="Settings">
        <Button size="sm" variant="ghost" icon onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Gear size={16} />
        </Button>
      </Tip>
    </>
  );

  const pickers = <ThemePicker />;

  const toolbar =
    model && analyseView ? (
      <>
        <Seg
          value={colorSel}
          onChange={setColorSel}
          options={[
            ["both", "Both"],
            ["w", "White"],
            ["b", "Black"],
          ]}
        />
        {/* One "min games" for every list (tree, mistakes, out of book, who left): a stepper, easy to hit.
            Not on Who cares: a great move counts even if played once. */}
        {tab !== "whocares" && (
          <div
            className="flex items-center gap-1 rounded-ui border px-1 py-0.5"
            style={{ borderColor: "color-mix(in oklab, var(--accent) 45%, var(--border))", background: "color-mix(in oklab, var(--accent) 8%, transparent)" }}
            data-testid="min-games"
          >
            <span className="px-1.5 text-xs font-semibold whitespace-nowrap">Min games</span>
            <Button size="sm" variant="ghost" icon onClick={() => setMinGames((n) => Math.max(1, n - 1))} disabled={minGames <= 1} aria-label="Fewer games">
              <Minus size={16} />
            </Button>
            <Input type="number" className="num w-12 text-center text-base font-bold" value={minGames} onChange={(e) => setMinGames(Math.max(1, +e.target.value || 1))} aria-label="Min games" />
            <Button size="sm" variant="ghost" icon onClick={() => setMinGames((n) => n + 1)} aria-label="More games">
              <Plus size={16} />
            </Button>
          </div>
        )}
      </>
    ) : null;

  const welcome = (
    <Card className="mx-auto max-w-3xl">
      <div className="ui-h1 mb-2">Find where your openings go wrong.</div>
      <div className="mb-5 text-muted">
        Load your Lichess or Chess.com games. OutOfBook maps your repertoire, finds the moves you keep getting wrong, and where you (or your opponents) leave the book.
      </div>
      {building ? (
        <div className="text-sm">Building repertoire from {games.length} games…</div>
      ) : (
        <ImportPanel key={username || account?.username} token={token} defaultUser={username || account?.username || ""} saveLimit={account ? account.limit : undefined} onImported={onImported} />
      )}
      {account && account.savedGames > 0 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span data-testid="account">
            {account.savedGames} saved games on your account{account.limit === null ? " (unlimited)" : ` of ${account.limit}`}
          </span>
          <Button size="sm" onClick={async () => loadGames(await loadSavedGames())}>
            Load my saved games
          </Button>
        </div>
      )}
    </Card>
  );

  let view: ReactNode = null;
  if (analyseView && !model) view = welcome;
  else if (tab === "overview" && model)
    view = (
      <Overview
        model={model}
        colors={colors}
        minGames={minGames}
        progress={progress}
        verdict={verdict}
        whoCares={settings.whoCaresVerdicts}
        whoCaresMinMove={settings.whoCaresMinMove}
        onNav={go}
        onSelect={select}
      />
    );
  else if (tab === "repertoire" && model)
    view = (
      <RepertoireView
        model={model}
        colors={colors}
        minGames={minGames}
        verdictOf={verdictOf}
        onSelect={select}
        onExplore={openExplore}
        onPlay={(color, ucis) => (setBotStart({ color, ucis }), setTab("play"))}
      />
    );
  else if (model && (tab === "mistakes" || tab === "outofbook" || tab === "whocares"))
    view = (
      <MoveLists
        mode={tab}
        moves={model.moves}
        colors={colors}
        minGames={tab === "whocares" ? 1 : minGames}
        whoCaresVerdicts={settings.whoCaresVerdicts}
        whoCaresMinMove={settings.whoCaresMinMove}
        verdict={verdict}
        evalOf={evalOf}
        onSelect={select}
        onOpenGame={openGame}
        onExplore={openExplore}
      />
    );
  else if (model && tab === "openings") view = <OpeningsView openings={model.openings} colors={colors} minGames={minGames} evalOf={evalOf} onSelect={select} onExplore={openExplore} />;
  else if (model && tab === "games") view = <GamesView games={games} model={model} colors={colors} onOpen={openGame} />;
  else if (tab === "play") view = <PlayBot model={model} start={botStart} depth={Math.min(settings.depth, 14)} onReview={reviewExtra} />;
  else if (tab === "review" && reviewGame)
    view = (
      <GameReview
        key={reviewGame.id}
        game={reviewGame}
        model={model ?? emptyModel}
        evalOf={evalOf}
        verdict={verdict}
        verdictOf={verdictOf}
        settings={settings}
        onSettings={(p) => {
          const s = { ...settings, ...p };
          setSettings(s);
          saveSettings(s);
        }}
        onPractise={(color, ucis) => (setBotStart({ color, ucis }), setTab("play"))}
        onClose={() => history.back()}
      />
    );

  const answerCard = answer && (
    <Card className="mb-3" data-testid="answer">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
        <Sparkles size={13} /> {answer.q}
        <button className="ml-auto" onClick={() => setAnswer(null)} aria-label="Close answer">
          ✕
        </button>
      </div>
      {answer.note && <div className="text-sm text-muted">{answer.note}</div>}
      {answer.busy && <div className="mt-1 text-sm">Claude is thinking…</div>}
      {answer.text && <div className="mt-2 text-[0.92rem] leading-relaxed whitespace-pre-wrap">{answer.text}</div>}
      {answer.err && (
        <Alert tone="bad" className="mt-2">
          {answer.err}
        </Alert>
      )}
    </Card>
  );

  const main = (
    <>
      {answerCard}
      {saveMsg && (
        <Alert tone="info" className="mb-3" onClose={() => setSaveMsg(null)}>
          <span data-testid="save-msg">{saveMsg}</span>
        </Alert>
      )}
      {view}
      {/* Kept mounted so incoming Lichess games and challenges are always seen. */}
      <div style={{ display: tab === "lichess" ? undefined : "none" }}>
        <LichessPlay token={token} username={username} onLiveChange={setLive} onReview={reviewExtra} />
      </div>
    </>
  );

  // Game review has its own board column (controls and verdicts under the board).
  const showBoard = analyseView && !!model;
  const boardPanel = showBoard ? (
    <Card className="flex flex-col gap-2" pad>
      <Board fen={board.fen} orientation={board.orientation} arrows={board.arrows} lastMove={board.lastMove} evalLine={board.evalLine ?? evalOf(posKey(board.fen))?.lines[0]} />
      <div className="min-h-5 text-sm">{board.label ?? <span className="text-muted">Hover a move to see it here.</span>}</div>
      {evalOf(posKey(board.fen))?.lines[0]?.pv[0] && (
        <div className="num text-xs text-muted">
          best {uciToSan(board.fen, evalOf(posKey(board.fen))!.lines[0].pv[0])} · depth {evalOf(posKey(board.fen))!.depth}
        </div>
      )}
    </Card>
  ) : null;

  return (
    <>
      <div style={{ display: live ? "none" : undefined }} aria-hidden={live}>
        <Shell
          nav={nav}
          active={tab}
          onNav={go}
          title={tab === "review" && reviewGame ? `${reviewGame.white} vs ${reviewGame.black}` : t[0]}
          subtitle={t[1]}
          actions={actions}
          pickers={pickers}
          toolbar={toolbar}
          status={statusText}
          hideHead={tab === "play"}
          main={main}
          board={boardPanel}
          onCommand={() => setCmdOpen(true)}
        />
      </div>
      {!live && <CommandPalette open={cmdOpen} setOpen={setCmdOpen} nav={nav} onNav={go} model={model} onLine={jumpToLine} onAsk={onAsk} />}
      {explore && !live && <BookExplorer target={explore} depth={settings.depth} onClose={() => setExplore(null)} />}
      <Dialog open={importOpen && !live} onClose={() => setImportOpen(false)} title="Load games" width={920}>
        <ImportPanel key={username || account?.username} token={token} defaultUser={username || account?.username || ""} saveLimit={account ? account.limit : undefined} onImported={onImported} />
        {account && (
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <span>
              Account {account.username}: {account.savedGames} saved games{account.limit === null ? " (unlimited)" : ` of ${account.limit}`}
            </span>
            {account.savedGames > 0 && (
              <Button size="sm" onClick={async () => (setImportOpen(false), loadGames(await loadSavedGames()))}>
                Load my saved games
              </Button>
            )}
          </div>
        )}
      </Dialog>
      {settingsOpen && (
        <SettingsDialog
          open
          value={settings}
          onClose={(s) => {
            setSettingsOpen(false);
            if (!s) return;
            const rebuild = s.pliesAfterBook !== settings.pliesAfterBook || s.depth !== settings.depth;
            setSettings(s);
            saveSettings(s);
            setMinGames(s.minGames);
            if (rebuild && games.length) loadGames(games, s);
          }}
        />
      )}
    </>
  );
}

/** Dark / light (also in Settings). */
function ThemePicker() {
  const { design, setDesign } = useDesign();
  return <Seg value={design.mode} onChange={(mode) => setDesign({ mode })} options={MODES} />;
}

/** Compact text summary of the repertoire for Claude. */
function repertoireSummary(model: RepertoireModel | null, verdict: (m: MoveStat) => Verdict | undefined, evalOf: (k: string) => PosEval | undefined) {
  if (!model) return "No games loaded.";
  const ops = [...model.openings].sort((a, b) => b.games - a.games).slice(0, 20);
  const bad = model.moves
    .filter((m) => BAD_VERDICTS.includes(verdict(m)!))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  return [
    `${model.metrics.games} games.`,
    "Openings (color, name, games, W/D/L from White's side, times the player left book first, times the opponent did):",
    ...ops.map((o) => `- ${o.color === "w" ? "White" : "Black"}: ${o.eco} ${o.name}: ${o.games} games, ${o.w}/${o.d}/${o.b}, player left ${o.userLeft}, opponent left ${o.opponentLeft}`),
    "Most repeated bad moves (color, opening, move, verdict, times, engine best):",
    ...bad.map((m) => {
      const best = evalOf(m.fromKey)?.lines[0]?.pv[0];
      return `- ${m.color === "w" ? "White" : "Black"}: ${m.opening}: ${m.san} (${verdict(m)}) ×${m.count}${best ? `, best ${uciToSan(m.fen, best)}` : ""}; FEN ${m.fen}`;
    }),
  ].join("\n");
}
