import { BACKGROUNDS } from "@outofbook/legions/backgrounds";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { LEVEL_UNLOCKS, owns, update, useProfile, type ItemId } from "../profile";
import { ArrowLeft, Lock } from "lucide-react";

const ABOUT: Record<string, string> = {
  staunton: "A classic wooden set. Pieces slide, the knight hops, and a capture knocks the other piece flat.",
  stormcourt: "A king who rules by magic, thunder bishops, stone rooks and a queen who opens a pit of fire.",
};

/** How an item is won, for locked ones. */
function howToGet(id: ItemId) {
  const level = Object.entries(LEVEL_UNLOCKS).find(([, items]) => items.includes(id))?.[0];
  if (level) return `Reach level ${level}`;
  if (id === "tribe:stormcourt") return "Beat the Storm King in the campaign";
  return "Coming soon";
}

export function Collection({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  return (
    <div className="screen" data-testid="collection">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Collection</h2>
      </div>
      <h3 style={{ margin: "4px 0 10px" }}>Tribes</h3>
      <div className="grid">
        {Object.values(TRIBES).map((t, i) => {
          const id: ItemId = `tribe:${t.id}`;
          const have = owns(p, id);
          const on = p.equipped.tribe === t.id;
          return (
            <div key={t.id} className={`card${on ? " equipped" : ""}${have ? "" : " locked"}`} style={{ ["--i" as string]: i }}>
              <h3>{t.name}</h3>
              <div className="muted" style={{ minHeight: 40 }}>
                {ABOUT[t.id]}
              </div>
              <button
                className={`btn small ${on ? "gold" : have ? "" : "dark"}`}
                style={{ width: "100%", marginTop: 12 }}
                disabled={!have}
                onClick={() => !on && update((q) => ({ ...q, equipped: { ...q.equipped, tribe: t.id } }))}
              >
                {on ? (
                  "Leading"
                ) : have ? (
                  "Lead this tribe"
                ) : (
                  <>
                    <Lock size={15} /> {howToGet(id)}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <h3 style={{ margin: "22px 0 10px" }}>Backgrounds</h3>
      <div className="grid">
        {BACKGROUNDS.map((b, i) => {
          const id: ItemId = `background:${b.id}`;
          const have = owns(p, id);
          const on = p.equipped.background === b.id;
          return (
            <div key={b.id} className={`card${on ? " equipped" : ""}${have ? "" : " locked"}`} style={{ ["--i" as string]: i }}>
              <div className="swatch" style={{ background: `linear-gradient(180deg, ${b.top}, ${b.bottom})` }} />
              <h3>{b.name}</h3>
              <button
                className={`btn small ${on ? "gold" : have ? "" : "dark"}`}
                style={{ width: "100%" }}
                disabled={!have}
                onClick={() => !on && update((q) => ({ ...q, equipped: { ...q.equipped, background: b.id } }))}
              >
                {on ? (
                  "In use"
                ) : have ? (
                  "Use"
                ) : (
                  <>
                    <Lock size={15} /> {howToGet(id)}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ textAlign: "center", marginTop: 22 }}>
        Boards, piece colors and overlays are coming.
      </p>
    </div>
  );
}
