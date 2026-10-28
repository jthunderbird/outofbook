import { useState } from "react";
import type { Screen } from "../App";
import { resetProfile, update } from "../profile";
import { COURTS } from "@outofbook/legions/courts";
import { COLORS, FINISHES } from "@outofbook/legions/looks";
import { TRIBES } from "@outofbook/legions/tribes";
import { ArrowLeft } from "lucide-react";
import { GameSettings } from "../components/GameSettings";

export function Settings({ go }: { go: (s: Screen) => void }) {
  const [reset, setReset] = useState(false);
  return (
    <div className="screen" data-testid="settings">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Settings</h2>
      </div>
      <div className="panel" style={{ width: "min(520px, 100%)", margin: "0 auto" }}>
        <GameSettings />
        <div className="toggle">
          <span>
            Lichess account
            <div className="muted" style={{ fontSize: 13, maxWidth: 320 }}>
              Optional. Logging in lets OutOfBook, our chess app, use your progress here: your tribes and courts in its Legion mode.
            </div>
          </span>
          <button className="btn dark small" disabled>
            Soon
          </button>
        </div>
        {import.meta.env.DEV && (
          <div className="toggle">
            <span>Own everything (dev build only)</span>
            <button
              className="btn dark small"
              onClick={() =>
                update((q) => ({
                  ...q,
                  owned: [
                    ...Object.keys(TRIBES).map((t) => `tribe:${t}` as const),
                    ...COURTS.map((c) => `court:${c.id}` as const),
                    ...FINISHES.map((f) => `finish:${f.id}` as const),
                    ...COLORS.map((c) => `color:${c.id}` as const),
                    "mode:retro" as const,
                    "mode:noir" as const,
                    "mode:sketch" as const,
                  ],
                }))
              }
            >
              Unlock
            </button>
          </div>
        )}
        <div className="toggle" style={{ borderBottom: 0 }}>
          <span>Start over</span>
          <button className="btn red small" onClick={() => setReset(true)}>
            Reset
          </button>
        </div>
      </div>
      {reset && (
        <div className="overlay" onClick={() => setReset(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>Start over?</h2>
            <p className="muted">Your XP, unlocked tribes and courts, and campaign wins on this device are erased.</p>
            <div className="row-btns">
              <button className="btn dark small" onClick={() => setReset(false)}>
                Keep
              </button>
              <button
                className="btn red small"
                onClick={() => {
                  resetProfile();
                  setReset(false);
                }}
              >
                Erase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
