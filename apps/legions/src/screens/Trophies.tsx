// The trophy room, next door to the Collection: everything the player has won
// by playing (never bought), on shelves down a wood-paneled wall to scroll
// through. A cup for each campaign tribe beaten and for each finished puzzle
// trek; a medal case for each trek stage with a coin per challenge (gold, silver,
// bronze or empty). Trophies not won yet stand dimmed with what wins them.
import type { Screen } from "../App";
import { CHAPTERS } from "../campaign";
import { CHALLENGES, MEDAL_NAMES, STAGES, medalCounts } from "../puzzles";
import { useProfile } from "../profile";
import { Wallet } from "../components/Wallet";
import { ArrowLeft, Lock } from "lucide-react";

/** A cup drawn in SVG: gold, silver or bronze, or dimmed. */
function Cup({ tone, dim }: { tone: "gold" | "silver" | "bronze"; dim?: boolean }) {
  const [a, b] = tone === "gold" ? ["#fff3b0", "#c8960e"] : tone === "silver" ? ["#ffffff", "#8a909e"] : ["#ffd2a8", "#8a4a18"];
  return (
    <svg viewBox="0 0 64 72" className={`cup${dim ? " dim" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id={`cup-${tone}`} x1="0" x2="1">
          <stop offset="0" stopColor={b} />
          <stop offset="0.45" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <path d="M14 6 H50 V22 C50 34 42 42 32 42 C22 42 14 34 14 22 Z" fill={`url(#cup-${tone})`} />
      <path d="M14 10 H6 C6 24 12 28 16 28 M50 10 H58 C58 24 52 28 48 28" fill="none" stroke={b} strokeWidth="4" />
      <rect x="28" y="42" width="8" height="12" fill={b} />
      <rect x="18" y="54" width="28" height="6" rx="2" fill={`url(#cup-${tone})`} />
      <rect x="14" y="60" width="36" height="9" rx="2" fill="#3a2414" />
    </svg>
  );
}

export function Trophies({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const t = p.trek;
  const counts = medalCounts(t);
  const won = (id: string) => p.won.includes(id);

  return (
    <div className="screen trophies" data-testid="trophies">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "collection" })} aria-label="Back to the Collection">
          <ArrowLeft size={22} />
        </button>
        <h2>Trophy room</h2>
        <div className="spacer" />
        <span className="collection-count">
          {[3, 2, 1].map((k) => (
            <span key={k} className={`medal-count m${k}`} title={`${MEDAL_NAMES[k]} medals`}>
              <span className="coin" /> {counts[k]}
            </span>
          ))}
        </span>
        <Wallet />
      </div>

      <section className="trophy-shelf">
        <h3>Campaign</h3>
        <div className="trophy-row">
          {CHAPTERS.map((c) => {
            const boss = c.battles.find((b) => b.boss) ?? c.battles[c.battles.length - 1];
            const has = won(boss.id);
            return (
              <div key={c.tribe} className={`trophy${has ? "" : " locked"}`}>
                {!has && (
                  <div className="trophy-lock">
                    <Lock size={14} /> Beat {boss.name.replace(/^The /, "the ")}
                  </div>
                )}
                <Cup tone="gold" dim={!has} />
                <div className="plate">{c.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="trophy-shelf">
        <h3>Puzzle trek</h3>
        <div className="trophy-row">
          {Array.from({ length: Math.max(1, t.runs) }, (_, i) => {
            const has = i < t.runs;
            return (
              <div key={i} className={`trophy${has ? "" : " locked"}`}>
                {!has && (
                  <div className="trophy-lock">
                    <Lock size={14} /> Finish the trek
                  </div>
                )}
                <Cup tone={i === 0 ? "gold" : i === 1 ? "silver" : "bronze"} dim={!has} />
                <div className="plate">{has ? `Trek finished${t.runs > 1 ? ` #${i + 1}` : ""}` : "Trek champion"}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="trophy-shelf">
        <h3>Medals by stage</h3>
        <div className="trophy-row cases">
          {Array.from({ length: STAGES }, (_, i) => {
            const list = CHALLENGES.filter((c) => c.stage === i + 1);
            const any = list.some((c) => t.medals?.[c.id]);
            return (
              <div key={i} className={`medal-case${any ? "" : " locked"}`}>
                <div className="coins">
                  {list.map((c) => (
                    <span key={c.id} className={`m${t.medals?.[c.id] ?? 0}`} title={`Challenge ${c.n}: ${MEDAL_NAMES[t.medals?.[c.id] ?? 0] || "no medal yet"}`}>
                      <span className="coin" />
                    </span>
                  ))}
                </div>
                <div className="plate">
                  Stage {i + 1} · {list.filter((c) => t.medals?.[c.id] === 3).length}/{list.length} gold
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
