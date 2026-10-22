import { useEffect, useState } from "react";
import { Bot, Loader2, MonitorPlay, Send, ShieldCheck, Swords, Users } from "lucide-react";
import { login, tokenScopes } from "../lib/auth";
import { acceptChallenge, challengeAi, challengeUser, declineChallenge, seek, streamEvents } from "../lib/lichessBoard";
import type { RawGame } from "@outofbook/core/types";
import { canVibrate } from "../lib/gameFeel";
import { cachedPrefs, loadPrefs, type LichessPrefs } from "../lib/lichessPrefs";
import { gameFeel, LiveGame, loadLive, saveLive, type LiveSettings } from "./LiveGame";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Progress, Seg, Select, Switch } from "./ui";
import { LichessIcon } from "./LichessIcon";

// Board API pools: rapid and classical only (Lichess: "Rapid, Classical and
// Correspondence only. For direct challenges, games vs AI, and bulk pairing,
// Blitz is also possible.").
const POOLS: [number, number, string][] = [
  [10, 0, "Rapid"],
  [10, 5, "Rapid"],
  [15, 10, "Rapid"],
  [30, 0, "Classical"],
  [30, 20, "Classical"],
];
const CHALLENGE_TCS: [number, number][] = [
  [3, 0],
  [3, 2],
  [5, 0],
  [5, 3],
  [10, 0],
  [10, 5],
  [15, 10],
  [30, 0],
];

interface Incoming {
  id: string;
  from: string;
  rating?: number;
  rated: boolean;
  tc: string;
}

// The offline demo of the game screen is for tests: open the app with ?demo.
const SHOW_DEMO = new URLSearchParams(location.search).has("demo");

export function LichessPlay({ token, username, onLiveChange, onReview }: { token: string | null; username: string; onLiveChange: (live: boolean) => void; onReview: (g: RawGame) => void }) {
  const [scopes, setScopes] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSettings>(loadLive);
  const [rated, setRated] = useState<"rated" | "casual">("rated");
  const [seeking, setSeeking] = useState<{ ac: AbortController; tc: string } | null>(null);
  const [chUser, setChUser] = useState("");
  const [chTc, setChTc] = useState("5+3");
  const [chRated, setChRated] = useState<"rated" | "casual">("rated");
  const [chColor, setChColor] = useState<"random" | "white" | "black">("random");
  const [challenging, setChallenging] = useState<AbortController | null>(null);
  const [chResult, setChResult] = useState<string | null>(null);
  const [level, setLevel] = useState(3);
  const [aiTc, setAiTc] = useState("10+5");
  const [aiColor, setAiColor] = useState<"random" | "white" | "black">("random");
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [startingAi, setStartingAi] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<LichessPrefs | null>(cachedPrefs);

  useEffect(() => {
    if (token) tokenScopes(token).then(setScopes);
  }, [token]);
  const canPrefs = !!scopes?.includes("preference:read");
  useEffect(() => {
    if (token && canPrefs) loadPrefs(token).then((p) => p && setPrefs(p));
  }, [token, canPrefs]);
  const canPlay = !!token && !!scopes?.includes("board:play");
  const setL = (p: Partial<LiveSettings>) => {
    const n = { ...live, ...p };
    setLive(n);
    saveLive(n);
  };

  // Incoming events: a game starting (from a seek, a challenge or the AI), or a challenge to us.
  useEffect(() => {
    if (!canPlay) return;
    const ac = new AbortController();
    streamEvents(
      token!,
      (e) => {
        if (e.type === "gameStart") {
          const g = e.game as { gameId?: string; id?: string };
          setGameId(g.gameId ?? g.id ?? null);
          setSeeking((s) => (s?.ac.abort(), null));
          setChallenging((c) => (c?.abort(), null));
        }
        if (e.type === "challenge") {
          const c = e.challenge as { id: string; challenger: { name: string; rating?: number }; destUser?: { id: string }; rated: boolean; timeControl: { show?: string } };
          if (c.destUser?.id?.toLowerCase() === username.toLowerCase())
            setIncoming((x) => [...x.filter((i) => i.id !== c.id), { id: c.id, from: c.challenger.name, rating: c.challenger.rating, rated: c.rated, tc: c.timeControl.show ?? "" }]);
        }
        if (e.type === "challengeCanceled" || e.type === "challengeDeclined") {
          const c = e.challenge as { id: string };
          setIncoming((x) => x.filter((i) => i.id !== c.id));
        }
      },
      ac.signal,
    ).catch((x) => !ac.signal.aborted && setErr(`Lost the connection to Lichess (${String(x)}). Log in again if this persists.`));
    return () => ac.abort();
  }, [canPlay, token, username]);

  const demoGame = demo && (
    <LiveGame demo token="" gameId="demo" username={username} settings={live} prefs={prefs} onLiveChange={() => {}} onExit={() => setDemo(false)} onReview={(g) => (setDemo(false), onReview(g))} />
  );
  const demoButton = SHOW_DEMO && (
    <Button onClick={() => setDemo(true)} data-testid="live-demo">
      <MonitorPlay size={15} /> Preview the live game screen (offline demo)
    </Button>
  );

  if (!token)
    return (
      <Card>
        <CardHeader title="Play on Lichess" sub="Play real Lichess games from this board: rated or casual, against people or the Lichess AI." />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={login}>
            <LichessIcon size={15} /> Log in with Lichess
          </Button>
          {demoButton}
        </div>
        {demoGame}
      </Card>
    );
  if (scopes === null) return <Progress />;
  if (!canPlay)
    return (
      <Alert tone="warn" action={<Button onClick={login}>Log in again</Button>}>
        Your Lichess login predates game play. Log in again to grant the "Play games with the board API" permission.
      </Alert>
    );

  const startSeek = (m: number, i: number) => {
    const ac = new AbortController();
    setErr(null);
    setSeeking({ ac, tc: `${m}+${i}` });
    seek(token, m, i, rated === "rated", ac.signal)
      .catch((e) => !ac.signal.aborted && setErr(String(e)))
      .finally(() => setSeeking((s) => (s?.ac === ac ? null : s)));
  };
  const sendChallenge = () => {
    const ac = new AbortController();
    const [m, i] = chTc.split("+").map(Number);
    setErr(null);
    setChResult(null);
    setChallenging(ac);
    challengeUser(token, chUser, { minutes: m, increment: i, rated: chRated === "rated", color: chColor }, ac.signal)
      .then((r) => r !== "accepted" && setChResult(`Challenge ${r}.`))
      .catch((e) => !ac.signal.aborted && setErr(String(e)))
      .finally(() => setChallenging((c) => (c === ac ? null : c)));
  };

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {demoGame}
      {gameId && (
        <LiveGame
          key={gameId}
          token={token}
          gameId={gameId}
          username={username}
          settings={live}
          prefs={prefs}
          onLiveChange={onLiveChange}
          onExit={() => setGameId(null)}
          onReview={(g) => (setGameId(null), onReview(g))}
        />
      )}
      <Alert tone="info">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={15} /> Fair play: during a game the screen shows only the board, players and clocks. No engine, book, repertoire or move list until it ends.
        </span>
      </Alert>
      {err && (
        <Alert tone="bad" onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}
      {incoming.map((c) => (
        <Alert
          key={c.id}
          tone="warn"
          action={
            <div className="flex gap-1.5">
              <Button size="sm" variant="primary" onClick={() => acceptChallenge(token, c.id).catch((e) => setErr(String(e)))}>
                Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (declineChallenge(token, c.id), setIncoming((x) => x.filter((i) => i.id !== c.id)))}>
                Decline
              </Button>
            </div>
          }
        >
          <b>{c.from}</b> {c.rating ? `(${c.rating})` : ""} challenges you: {c.rated ? "rated" : "casual"} {c.tc}
        </Alert>
      ))}
      <div className="grid gap-[var(--gap)] xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Users size={18} /> Play a person
              </span>
            }
            sub="Random opponent from the Lichess pool. Third-party boards can seek rapid and classical games."
          />
          <div className="mb-3">
            <Seg
              value={rated}
              onChange={setRated}
              options={[
                ["rated", "Rated"],
                ["casual", "Casual"],
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {POOLS.map(([m, i, kind]) => {
              const tc = `${m}+${i}`;
              const on = seeking?.tc === tc;
              return (
                <button
                  key={tc}
                  className="ui-card flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-0.5 transition hover:brightness-110"
                  style={on ? { boxShadow: "0 0 0 2px var(--accent)", ["--card-bg" as string]: "color-mix(in oklab, var(--accent) 14%, var(--surface))" } : undefined}
                  onClick={() => (on ? (seeking!.ac.abort(), setSeeking(null)) : startSeek(m, i))}
                  disabled={!!seeking && !on}
                >
                  <span className="num text-xl font-bold">{tc}</span>
                  <span className="text-xs text-muted">{on ? "cancel" : kind}</span>
                </button>
              );
            })}
          </div>
          {seeking && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Loader2 size={15} className="animate-spin" /> Looking for a {rated} {seeking.tc} opponent… click the tile again to cancel.
            </div>
          )}
          <div className="mt-2 text-xs text-muted">
            Lichess lets third-party boards seek only rapid and classical games (only its own mobile app may seek blitz). Blitz works by direct challenge (right) or against the AI; bullet never.
          </div>
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Swords size={18} /> Challenge a player
              </span>
            }
            sub="Direct challenges also allow blitz. Waits until they accept or decline."
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lichess username" className="col-span-2">
              <Input value={chUser} onChange={(e) => setChUser(e.target.value.trim())} placeholder="their username" />
            </Field>
            <Field label="Time">
              <Select value={chTc} onChange={(e) => setChTc(e.target.value)} options={CHALLENGE_TCS.map(([m, i]) => [`${m}+${i}`, `${m}+${i}`])} />
            </Field>
            <Field label="Color">
              <Select
                value={chColor}
                onChange={(e) => setChColor(e.target.value as typeof chColor)}
                options={[
                  ["random", "Random"],
                  ["white", "White"],
                  ["black", "Black"],
                ]}
              />
            </Field>
            <Seg
              value={chRated}
              onChange={setChRated}
              options={[
                ["rated", "Rated"],
                ["casual", "Casual"],
              ]}
            />
            {challenging ? (
              <Button onClick={() => (challenging.abort(), setChallenging(null))}>
                <Loader2 size={14} className="animate-spin" /> Cancel
              </Button>
            ) : (
              <Button variant="primary" onClick={sendChallenge} disabled={!chUser}>
                <Send size={14} /> Challenge
              </Button>
            )}
          </div>
          {chResult && <div className="mt-2 text-sm text-muted">{chResult}</div>}
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Bot size={18} /> Lichess AI
              </span>
            }
            sub="Stockfish on Lichess, levels 1–8. Never rated."
          />
          <Field label={`Level ${level}`}>
            <input className="ui-range" type="range" min={1} max={8} value={level} onChange={(e) => setLevel(+e.target.value)} />
          </Field>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="Time">
              <Select value={aiTc} onChange={(e) => setAiTc(e.target.value)} options={["3+2", "5+3", "10+0", "10+5", "15+10", "30+0"].map((t) => [t, t])} />
            </Field>
            <Field label="Color">
              <Select
                value={aiColor}
                onChange={(e) => setAiColor(e.target.value as typeof aiColor)}
                options={[
                  ["random", "Random"],
                  ["white", "White"],
                  ["black", "Black"],
                ]}
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="primary"
                className="w-full"
                disabled={startingAi}
                onClick={() => {
                  const [m, i] = aiTc.split("+").map(Number);
                  setErr(null);
                  setStartingAi(true);
                  // The answer names the game: open it now rather than wait for the event stream.
                  challengeAi(token, level, m, i, aiColor)
                    .then((id) => setGameId(id))
                    .catch((e) => setErr(String(e)))
                    .finally(() => setStartingAi(false));
                }}
                data-testid="play-ai"
              >
                {startingAi ? <Loader2 size={15} className="animate-spin" /> : null} {startingAi ? "Starting…" : "Play"}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Live game settings" sub="Applies to every Lichess game played here." />
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Clock turns yellow at ${live.warnPct}% time left`}>
              <input className="ui-range" type="range" min={10} max={90} step={5} value={live.warnPct} onChange={(e) => setL({ warnPct: Math.max(+e.target.value, live.dangerPct + 5) })} />
            </Field>
            <Field label={`Clock turns red at ${live.dangerPct}% time left`}>
              <input className="ui-range" type="range" min={5} max={50} step={5} value={live.dangerPct} onChange={(e) => setL({ dangerPct: Math.min(+e.target.value, live.warnPct - 5) })} />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <Switch
              checked={live.useLichessPrefs}
              onChange={(v) => setL({ useLichessPrefs: v })}
              label="Use my Lichess settings"
              hint={
                !canPrefs
                  ? "Log in again to let OutOfBook read your Lichess preferences."
                  : prefs
                    ? "Premoves, auto queen, sounds, clock tenths, low-time warning, animation, move dots, highlights, coordinates, castling by king-onto-rook, click/drag, resign confirmation and ratings, as on your Lichess board."
                    : "Loading your Lichess preferences…"
              }
            />
            {!canPrefs && live.useLichessPrefs && (
              <div>
                <Button size="sm" onClick={login}>
                  Log in again
                </Button>
              </div>
            )}
            {live.useLichessPrefs && prefs && <PrefsSummary prefs={prefs} />}
            {!(live.useLichessPrefs && prefs) && (
              <>
                <Switch checked={live.premove} onChange={(v) => setL({ premove: v })} label="Premoves" hint="Move during the opponent's turn; it plays instantly if legal." />
                <Field label="Sound set">
                  <Select value={live.soundSet} onChange={(e) => setL({ soundSet: e.target.value })} options={SOUND_SETS} />
                </Field>
              </>
            )}
            <Switch checked={live.sound} onChange={(v) => setL({ sound: v })} label="Sounds" hint="Lichess's own move, capture, check and low-time sounds." />
            <Switch
              checked={live.vibrate}
              onChange={(v) => setL({ vibrate: v })}
              label="Vibrate on the opponent's move"
              hint={canVibrate() ? "On phones, like the Lichess app." : "This browser cannot vibrate (iPhones and desktops can't)."}
            />
            <Switch checked={live.autoFullscreen} onChange={(v) => setL({ autoFullscreen: v })} label="Go full screen when a game starts" />
          </div>
          {demoButton && <div className="mt-4">{demoButton}</div>}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            Logged in as <Badge tone="accent">{username || "?"}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}

const SOUND_SETS: [string, string][] = [
  ["standard", "Standard"],
  ["piano", "Piano"],
  ["nes", "NES"],
  ["sfx", "SFX"],
  ["futuristic", "Futuristic"],
  ["robot", "Robot"],
  ["silent", "Silent"],
];

function PrefsSummary({ prefs }: { prefs: LichessPrefs }) {
  const g = gameFeel({ ...loadLive(), useLichessPrefs: true, sound: true }, prefs);
  const items = [
    `premoves ${g.premove ? "on" : "off"}`,
    `auto queen ${["", "never", "when premoving", "always"][prefs.autoQueen]}`,
    `${prefs.soundSet} sounds`,
    `tenths ${["never", "below 10 s", "always"][prefs.clockTenths]}`,
    `low-time sound ${prefs.clockSound ? "on" : "off"}`,
    `${["no", "fast", "normal", "slow"][prefs.animation]} animation`,
    `${["click", "drag", "click or drag"][prefs.moveEvent]} to move`,
    prefs.confirmResign ? "confirm resign/draw" : "no resign confirmation",
  ];
  return (
    <div className="text-xs text-muted" data-testid="lichess-prefs">
      From Lichess: {items.join(" · ")}.
    </div>
  );
}
