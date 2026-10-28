// Quick play: a single battle with everything chosen: the tribe you lead, the
// tribe you face, the stage (court) to fight on, your side and Maia's strength.
// Your tribe and stage are remembered as your equipped ones; tribes and courts
// not yet won are shown locked.
import { useState } from "react";
import type { Side } from "@outofbook/legions/figures";
import { COURTS } from "@outofbook/legions/courts";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { owns, update, useProfile } from "../profile";
import { ArrowLeft, Lock, Swords } from "lucide-react";

export function QuickPlay({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const [elo, setElo] = useState(1100);
  const [side, setSide] = useState<Side | "random">("random");
  const [opp, setOpp] = useState("stormcourt");
  const mine = owns(p, `tribe:${p.equipped.tribe}`) ? p.equipped.tribe : "staunton";
  const court = owns(p, `court:${p.equipped.court}`) ? p.equipped.court : "staunton";
  const start = () =>
    go({
      name: "game",
      setup: { nonce: Date.now(), opponentTribe: opp, myTribe: mine, court, elo, side: side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side, title: "Quick play" },
    });
  return (
    <div className="screen" data-testid="quick">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Quick play</h2>
      </div>
      <div className="panel" style={{ width: "min(620px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ marginBottom: 8 }}>Your tribe</div>
          <div className="choices">
            {Object.values(TRIBES).map((t) => {
              const have = owns(p, `tribe:${t.id}`);
              return (
                <button key={t.id} className={mine === t.id ? "on" : ""} disabled={!have} onClick={() => update((q) => ({ ...q, equipped: { ...q.equipped, tribe: t.id } }))}>
                  {!have && <Lock size={14} />} {t.name}
                </button>
              );
            })}
          </div>
          {Object.values(TRIBES).some((t) => !owns(p, `tribe:${t.id}`)) && (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Win a tribe in the campaign to lead it.
            </div>
          )}
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>Opponent</div>
          <div className="choices">
            {Object.values(TRIBES).map((t) => (
              <button key={t.id} className={opp === t.id ? "on" : ""} onClick={() => setOpp(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>Stage</div>
          <div className="choices">
            {COURTS.map((c) => {
              const have = owns(p, `court:${c.id}`);
              return (
                <button key={c.id} className={court === c.id ? "on" : ""} disabled={!have} onClick={() => update((q) => ({ ...q, equipped: { ...q.equipped, court: c.id } }))}>
                  {!have && <Lock size={14} />} {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="toggle">
          <span>
            Retro mode
            <div className="muted" style={{ fontSize: 13, maxWidth: 360 }}>
              {owns(p, "mode:retro") ? "The tribes drawn as a 16-bit game would, 3D ones included." : "Finish the puzzle trek to unlock."}
            </div>
          </span>
          {owns(p, "mode:retro") ? (
            <button className={`switch${p.retro ? " on" : ""}`} aria-label="Retro mode" aria-pressed={p.retro} onClick={() => update((q) => ({ ...q, retro: !q.retro }))} />
          ) : (
            <Lock size={18} aria-label="Locked" />
          )}
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
          <div style={{ marginBottom: 8 }}>
            Opponent strength: <span style={{ color: "var(--gold)" }}>{elo}</span>
          </div>
          <input type="range" min={500} max={2600} step={50} value={elo} onChange={(e) => setElo(+e.target.value)} />
          <div className="muted" style={{ fontSize: 13 }}>
            Maia plays like a human of this rating.
          </div>
        </div>
        <button className="btn gold" onClick={start} style={{ justifyContent: "center" }}>
          <Swords size={22} /> Battle
        </button>
      </div>
    </div>
  );
}
