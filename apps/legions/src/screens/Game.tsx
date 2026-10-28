// A battle: the player's tribe against the opponent's on the 3D board, Maia
// playing the other side. The scene fills the screen; the opponent's banner is
// at the top and the player's name at the bottom, each with what they have
// taken; the buttons stand in a slim column on the right so the board gets the
// most room. Perks (best-move hint, take-back) spend charges. The result waits
// for the board to finish acting out the last move, then shows the XP and
// anything unlocked.
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import LegionsBoard from "@outofbook/legions/LegionsBoard";
import type { Side } from "@outofbook/legions/figures";
import { TRIBES } from "@outofbook/legions/tribes";
import { court } from "@outofbook/legions/courts";
import type { Screen } from "../App";
import { findBattle } from "../campaign";
import { bestMove, getMaia, maiaMove, unwatchMaia, type MaiaStatus } from "../opponent";
import { award, myLook, myMode, owns, update, useProfile, type ItemId, type Reward } from "../profile";
import { CircleArrowUp, Flag, Lightbulb, LockOpen, Settings as Cog, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { Captured } from "../components/Captured";
import { GameSettings } from "../components/GameSettings";
import { TribeBanner } from "../components/TribeBanner";

export interface GameSetup {
  /** A new value starts a new game. */
  nonce: number;
  /** A campaign battle's id; none for quick play. */
  battle?: string;
  opponentTribe: string;
  /** Quick play: the player's tribe and the court; the equipped ones (a campaign battle: the opponent's court) when not given. */
  myTribe?: string;
  court?: string;
  elo: number;
  side: Side;
  title: string;
}

type Outcome = { result: "win" | "loss" | "draw"; why: string };

const ITEM_NAMES: Record<string, string> = { tribe: "Tribe", court: "Court" };
const itemName = (id: ItemId) => {
  const [kind, name] = id.split(":");
  const t = kind === "tribe" ? TRIBES[name]?.name : court(name).name;
  return `${ITEM_NAMES[kind] ?? kind}: ${t ?? name}`;
};

export function Game({ setup, go }: { setup: GameSetup; go: (s: Screen) => void }) {
  const p = useProfile();
  const chess = useRef(new Chess());
  const frame = useRef<HTMLDivElement>(null);
  const [plies, setPlies] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [maia, setMaia] = useState<MaiaStatus>({ state: "loading", progress: 0 });
  const [confirmResign, setConfirmResign] = useState(false);
  const [settings, setSettings] = useState(false);
  const me = setup.side;
  const them: Side = me === "w" ? "b" : "w";
  const fen = useMemo(() => chess.current.fen(), [plies]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastMove = plies[plies.length - 1];
  const turn = chess.current.turn();
  const ready = maia.state === "ready";

  useEffect(() => {
    getMaia(setMaia);
    return () => void unwatchMaia(setMaia);
  }, []);

  const finishIfOver = () => {
    const c = chess.current;
    if (!c.isGameOver()) return;
    if (c.isCheckmate()) setOutcome(c.turn() === me ? { result: "loss", why: "Checkmate" } : { result: "win", why: "Checkmate" });
    else setOutcome({ result: "draw", why: c.isStalemate() ? "Stalemate" : c.isThreefoldRepetition() ? "Repetition" : c.isInsufficientMaterial() ? "Not enough to mate" : "Fifty moves" });
  };

  const play = (uci: string) => {
    try {
      chess.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    setHint(null);
    setPlies((x) => [...x, uci]);
    finishIfOver();
    return true;
  };

  // The opponent's turn.
  useEffect(() => {
    if (outcome || !ready || turn !== them) return;
    let live = true;
    setThinking(true);
    const started = Date.now();
    maiaMove(fen, setup.elo, setup.elo)
      .then(async (uci) => {
        // A moment to "think", so its move does not land on top of yours.
        await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - started))));
        if (live) play(uci);
      })
      .finally(() => live && setThinking(false));
    return () => {
      live = false;
    };
  }, [fen, ready, outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rewards, once, when the game ends.
  const rewarded = useRef(false);
  useEffect(() => {
    if (!outcome || rewarded.current) return;
    rewarded.current = true;
    const found = setup.battle ? findBattle(setup.battle) : null;
    let xp: number;
    const items: ItemId[] = [];
    if (found) {
      const tier = found.chapter.tier;
      xp = outcome.result === "win" ? 100 * tier : outcome.result === "draw" ? 40 : 10;
      if (outcome.result === "win") {
        update((q) => (q.won.includes(found.battle.id) ? q : { ...q, won: [...q.won, found.battle.id] }));
        if (found.battle.boss) items.push(...found.chapter.reward);
      }
    } else xp = outcome.result === "win" ? Math.round(setup.elo / 10) : outcome.result === "draw" ? Math.round(setup.elo / 30) : 5;
    setReward(award(xp, items));
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev: load any position, for trying out the screen: legionsGame.load(fen).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { legionsGame?: object }).legionsGame = {
      load: (f: string) => {
        chess.current.load(f);
        setPlies((x) => [...x, ""]);
      },
    };
  }, []);

  const myTurn = !outcome && ready && turn === me && !thinking;

  const useHint = async () => {
    if (!myTurn || p.perks.hint <= 0 || hint) return;
    update((q) => ({ ...q, perks: { ...q.perks, hint: q.perks.hint - 1 } }));
    setHint(await bestMove(fen));
  };

  const takeBack = () => {
    // Your last move and the reply to it.
    if (!myTurn || p.perks.takeback <= 0 || plies.length < 2) return;
    update((q) => ({ ...q, perks: { ...q.perks, takeback: q.perks.takeback - 1 } }));
    chess.current.undo();
    chess.current.undo();
    setHint(null);
    setPlies((x) => x.slice(0, -2));
  };

  const meTribe = setup.myTribe ?? p.equipped.tribe;
  const tribes = me === "w" ? { w: meTribe, b: setup.opponentTribe } : { w: setup.opponentTribe, b: meTribe };
  const showResult = outcome && !busy;
  // A campaign battle is fought on the opponent's home court; quick play on yours.
  const found = setup.battle ? findBattle(setup.battle) : null;
  const courtId = setup.court ?? (found ? found.chapter.court : p.equipped.court);

  return (
    <div className="game" data-testid="game">
      {/* The scene fills the screen; the board is framed where its place is. */}
      <div className="stage">
        <LegionsBoard
          frame={frame}
          fen={fen}
          orientation={me}
          lastMove={lastMove}
          movable={myTurn ? me : undefined}
          onMove={play}
          onBusy={setBusy}
          sound={p.sound}
          tribes={tribes}
          court={courtId}
          glow={p.glow}
          pixel={p.retro && owns(p, "mode:retro")}
          looks={{ [me]: myLook(p) }}
          mode={myMode(p)}
          hint={hint}
        />
      </div>
      <div className="board" ref={frame} />
      <div className="banner top">
        <TribeBanner tribe={setup.opponentTribe} on={turn === them && !outcome} />
        <div className="sub muted">
          {setup.title} · {setup.elo}
          {thinking && <span className="thinking"> · thinking…</span>}
        </div>
        <Captured fen={fen} side={them} />
      </div>
      <div className="banner bottom">
        <Captured fen={fen} side={me} />
        <div className={`player-name${turn === me && !outcome ? " on" : ""}`}>{p.name || "Player"}</div>
        <div className="sub muted">{TRIBES[meTribe]?.name}</div>
      </div>
      <div className="rail">
        <button className="btn mini green" onClick={useHint} disabled={!myTurn || p.perks.hint <= 0} aria-label="Hint: best move">
          <Lightbulb size={18} />
          <span className="badge">{p.perks.hint}</span>
        </button>
        <button className="btn mini" onClick={takeBack} disabled={!myTurn || p.perks.takeback <= 0 || plies.length < 2} aria-label="Take back">
          <Undo2 size={18} />
          <span className="badge">{p.perks.takeback}</span>
        </button>
        <button className="btn mini dark" onClick={() => update((q) => ({ ...q, sound: !q.sound }))} aria-label={p.sound ? "Sound off" : "Sound on"}>
          {p.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="btn mini dark" onClick={() => setSettings(true)} aria-label="Settings">
          <Cog size={18} />
        </button>
        <button className="btn mini red" onClick={() => (outcome ? go({ name: setup.battle ? "campaign" : "quick" }) : setConfirmResign(true))} aria-label={outcome ? "Leave" : "Resign"}>
          {outcome ? <X size={18} /> : <Flag size={18} />}
        </button>
      </div>

      {settings && (
        <div className="overlay" onClick={() => setSettings(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)" }}>
            <h2>Settings</h2>
            <GameSettings />
            <div className="row-btns">
              <button className="btn gold small" onClick={() => setSettings(false)}>
                Back to the battle
              </button>
            </div>
          </div>
        </div>
      )}

      {!ready && (
        <div className="overlay" data-testid="maia-loading">
          <div className="panel">
            <h2>{maia.state === "error" ? "Opponent failed to load" : "Summoning the opponent…"}</h2>
            {maia.state !== "error" && (
              <div className="bar" style={{ margin: "12px 0" }}>
                <div style={{ width: `${maia.state === "downloading" ? maia.progress : 8}%` }} />
              </div>
            )}
            <p className="muted">
              {maia.state === "downloading" ? `Downloading the AI (45 MB, once): ${maia.progress}%` : maia.state === "error" ? "Check your connection and try again." : "Getting ready…"}
            </p>
            <button className="btn dark small" onClick={() => go({ name: "home" })}>
              Back
            </button>
          </div>
        </div>
      )}

      {confirmResign && (
        <div className="overlay" onClick={() => setConfirmResign(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>Resign?</h2>
            <div className="row-btns">
              <button className="btn dark small" onClick={() => setConfirmResign(false)}>
                Keep fighting
              </button>
              <button
                className="btn red small"
                onClick={() => {
                  setConfirmResign(false);
                  setOutcome({ result: "loss", why: "You resigned" });
                }}
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {showResult && (
        <div className="overlay" data-testid="result">
          <div className="panel">
            <h2 className={outcome.result}>{outcome.result === "win" ? "Victory!" : outcome.result === "loss" ? "Defeat" : "Draw"}</h2>
            <div className="muted">{outcome.why}</div>
            {reward && (
              <>
                <div style={{ margin: "14px 0 6px", fontSize: 22, color: "var(--gold)" }}>+{reward.xp} XP</div>
                {reward.levelTo > reward.levelFrom && (
                  <div className="unlock">
                    <CircleArrowUp size={16} style={{ verticalAlign: -3 }} /> Level {reward.levelTo}! +1 hint, +1 take-back
                  </div>
                )}
                {reward.unlocked.map((i) => (
                  <div key={i} className="unlock">
                    <LockOpen size={16} style={{ verticalAlign: -3 }} /> Unlocked {itemName(i)}
                  </div>
                ))}
              </>
            )}
            <div className="row-btns">
              <button className="btn dark small" onClick={() => go({ name: setup.battle ? "campaign" : "home" })}>
                {setup.battle ? "Campaign" : "Home"}
              </button>
              <button className="btn gold small" onClick={() => go({ name: "game", setup: { ...setup, nonce: Date.now() } })}>
                Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
