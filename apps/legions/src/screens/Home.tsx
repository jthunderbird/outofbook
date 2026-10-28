import { useState } from "react";
import type { Screen } from "../App";
import { levelOf, owns, update, useProfile, XP_PER_LEVEL } from "../profile";
import { Castle, ChessKnight, Gamepad2, Globe, Lock, Puzzle, Settings as SettingsIcon, Swords } from "lucide-react";

export function Home({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const level = levelOf(p.xp);
  const into = p.xp % XP_PER_LEVEL;
  const [online, setOnline] = useState(false);
  return (
    <div className="screen" data-testid="home">
      <div className="title">
        <h1>
          Chess
          <br />
          Legions
        </h1>
        <p>Every piece fights its own way</p>
      </div>
      <div className="xp">
        <div className="row">
          <span>Level {level}</span>
          <span className="muted">
            {into} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <div className="bar">
          <div style={{ width: `${(into / XP_PER_LEVEL) * 100}%` }} />
        </div>
      </div>
      <div className="menu">
        <button className="btn gold" style={{ ["--i" as string]: 0 }} onClick={() => go({ name: "campaign" })}>
          <span className="icon">
            <Swords size={30} />
          </span>
          <span>
            Campaign
            <small>Beat each tribe to win it</small>
          </span>
        </button>
        <button className="btn" style={{ ["--i" as string]: 1 }} onClick={() => go({ name: "quick" })}>
          <span className="icon">
            <ChessKnight size={30} />
          </span>
          <span>
            Quick play
            <small>Any strength, any side</small>
          </span>
        </button>
        <button className="btn dark" style={{ ["--i" as string]: 2 }} disabled>
          <span className="icon">
            <Puzzle size={30} />
          </span>
          <span>
            Puzzles
            <small>Coming soon</small>
          </span>
        </button>
        <button className={`btn ${owns(p, "mode:retro") ? "" : "dark"}`} style={{ ["--i" as string]: 3 }} disabled={!owns(p, "mode:retro")} onClick={() => update((q) => ({ ...q, retro: !q.retro }))}>
          <span className="icon">{owns(p, "mode:retro") ? <Gamepad2 size={30} /> : <Lock size={30} />}</span>
          <span>
            Retro mode{owns(p, "mode:retro") ? (p.retro ? ": on" : ": off") : ""}
            <small>{owns(p, "mode:retro") ? "Every battle drawn as a 16-bit game" : "Beat the puzzle challenges to unlock"}</small>
          </span>
        </button>
        <button className="btn green" style={{ ["--i" as string]: 4 }} onClick={() => go({ name: "collection" })}>
          <span className="icon">
            <Castle size={30} />
          </span>
          <span>
            Collection
            <small>Tribes and courts</small>
          </span>
        </button>
        <div className="row-btns" style={{ marginTop: 0 }}>
          <button className="btn dark small" style={{ ["--i" as string]: 5 }} onClick={() => setOnline(true)}>
            <Globe size={18} /> Play online
          </button>
          <button className="btn dark small" style={{ ["--i" as string]: 6 }} onClick={() => go({ name: "settings" })}>
            <SettingsIcon size={18} /> Settings
          </button>
        </div>
      </div>
      {online && (
        <div className="overlay" onClick={() => setOnline(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>Play online</h2>
            <p className="muted">
              Play real people, friends or the AI on <b style={{ color: "var(--gold)" }}>OutOfBook</b>, our chess app, through your Lichess account. Its Legion mode plays on this same 3D board, and
              your progress here can be saved there with a Lichess login.
            </p>
            <p className="muted">OutOfBook is coming to the Play Store soon.</p>
            <button className="btn gold small" style={{ width: "100%" }} onClick={() => setOnline(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
