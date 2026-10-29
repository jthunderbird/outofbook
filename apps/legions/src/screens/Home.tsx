import { useState } from "react";
import type { Screen } from "../App";
import { levelOf, useProfile, XP_PER_LEVEL } from "../profile";
import { Castle, Coins, Star, ChessKnight, Globe, Puzzle, Settings as SettingsIcon, Swords } from "lucide-react";

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
      <div className="home-stats">
        <span title={`${into} / ${XP_PER_LEVEL} XP to level ${level + 1}`}>
          <Star size={13} /> Level {level}
        </span>
        <span title="Credits">
          <Coins size={13} /> {p.credits}
        </span>
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
        <button className="btn" style={{ ["--i" as string]: 2 }} onClick={() => go({ name: "trek" })}>
          <span className="icon">
            <Puzzle size={30} />
          </span>
          <span>
            Puzzles
            <small>The puzzle trek: 250 timed challenges</small>
          </span>
        </button>
        <button className="btn green" style={{ ["--i" as string]: 3 }} onClick={() => go({ name: "collection" })}>
          <span className="icon">
            <Castle size={30} />
          </span>
          <span>
            Collection
            <small>Tribes, courts and Retro mode</small>
          </span>
        </button>
        <div className="row-btns" style={{ marginTop: 0 }}>
          <button className="btn dark small" style={{ ["--i" as string]: 4 }} onClick={() => setOnline(true)}>
            <Globe size={18} /> Play online
          </button>
          <button className="btn dark small" style={{ ["--i" as string]: 5 }} onClick={() => go({ name: "settings" })}>
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
