import { useState } from "react";
import type { Side } from "@outofbook/legions/figures";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { owns, useProfile } from "../profile";
import { ArrowLeft, Swords } from "lucide-react";

export function QuickPlay({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const [elo, setElo] = useState(1100);
  const [side, setSide] = useState<Side | "random">("random");
  const [opp, setOpp] = useState("stormcourt");
  const start = () =>
    go({
      name: "game",
      setup: { nonce: Date.now(), opponentTribe: opp, elo, side: side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side, title: "Quick play" },
    });
  return (
    <div className="screen" data-testid="quick">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Quick play</h2>
      </div>
      <div className="panel" style={{ width: "min(520px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            Opponent strength: <span style={{ color: "var(--gold)" }}>{elo}</span>
          </div>
          <input type="range" min={600} max={2600} step={50} value={elo} onChange={(e) => setElo(+e.target.value)} />
          <div className="muted" style={{ fontSize: 13 }}>
            Maia plays like a human of this rating.
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>You play</div>
          <div className="seg">
            {(
              [
                ["w", "Light"],
                ["random", "Random"],
                ["b", "Dark"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={side === v ? "on" : ""} onClick={() => setSide(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>Opponent tribe</div>
          <div className="seg">
            {Object.values(TRIBES).map((t) => (
              <button key={t.id} className={opp === t.id ? "on" : ""} onClick={() => setOpp(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            You lead {TRIBES[p.equipped.tribe]?.name ?? "your tribe"}
            {owns(p, "tribe:stormcourt") ? "" : ". Win the Stormcourt in the campaign to lead it."}
          </div>
        </div>
        <button className="btn gold" onClick={start} style={{ justifyContent: "center" }}>
          <Swords size={22} /> Battle
        </button>
      </div>
    </div>
  );
}
