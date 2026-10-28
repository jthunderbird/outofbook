// The settings a player may change mid-game (and on the Settings screen):
// their name, sound, and glow.
import { update, useProfile } from "../profile";

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
    </>
  );
}
