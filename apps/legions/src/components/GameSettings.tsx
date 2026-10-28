// The settings a player may change mid-game (and on the Settings screen):
// their name, sound, glow and (once won) Retro mode.
import { Lock } from "lucide-react";
import { owns, update, useProfile } from "../profile";

export function GameSettings() {
  const p = useProfile();
  return (
    <>
      <div className="toggle">
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          className="text"
          maxLength={20}
          value={p.name}
          onChange={(e) => update((q) => ({ ...q, name: e.target.value }))}
          onBlur={() => update((q) => ({ ...q, name: q.name.trim() || "Player" }))}
        />
      </div>
      <div className="toggle">
        <span>Sound</span>
        <button className={`switch${p.sound ? " on" : ""}`} aria-label="Sound" aria-pressed={p.sound} onClick={() => update((q) => ({ ...q, sound: !q.sound }))} />
      </div>
      <div className="toggle">
        <span>
          Glow effects
          <div className="muted" style={{ fontSize: 13, maxWidth: 320 }}>
            Lightning, fire and magic glow. Turn off if the game runs slowly.
          </div>
        </span>
        <button className={`switch${p.glow ? " on" : ""}`} aria-label="Glow effects" aria-pressed={p.glow} onClick={() => update((q) => ({ ...q, glow: !q.glow }))} />
      </div>
      <div className="toggle">
        <span>
          Retro mode
          <div className="muted" style={{ fontSize: 13, maxWidth: 360 }}>
            {owns(p, "mode:retro") ? "Every battle drawn as a 16-bit game would, 3D tribes included." : "Finish the puzzle trek to unlock."}
          </div>
        </span>
        {owns(p, "mode:retro") ? (
          <button className={`switch${p.retro ? " on" : ""}`} aria-label="Retro mode" aria-pressed={p.retro} onClick={() => update((q) => ({ ...q, retro: !q.retro }))} />
        ) : (
          <Lock size={18} aria-label="Locked" />
        )}
      </div>
    </>
  );
}
