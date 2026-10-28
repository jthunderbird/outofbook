// The Collection: a wall in a bedroom with a shelf for each kind of item (the
// room is packages/legions/src/collection.ts). Every item that can be won is on
// it, locked ones grayed with what unlocks them; the modes float by the window. Tap an
// item for its card: what it is, and leading the tribe, using the court,
// wearing the finish or color, or turning the mode on.
import { useEffect, useMemo, useRef, useState } from "react";
import { CollectionScene, type ShelfItem, type ShelfRow } from "@outofbook/legions/collection";
import { COURTS } from "@outofbook/legions/courts";
import { COLORS, FINISHES } from "@outofbook/legions/looks";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { LEVEL_UNLOCKS, owns, update, useProfile, type ItemId, type Profile } from "../profile";
import { ArrowLeft, Lock, Trophy, X } from "lucide-react";

const ABOUT: Record<string, string> = {
  "tribe:staunton": "A classic wooden set. Pieces slide, the knight hops, and a capture knocks the other piece flat.",
  "tribe:stormcourt": "A king who rules by magic, thunder bishops, stone rooks and a queen who opens a pit of fire.",
  "tribe:thornwood": "An ancient forest: root-walking priests, treant rooks, a flytrap queen and the Elder Oak.",
  "tribe:epoch-drifters": "Heroes out of a 16-bit RPG: a sword-swinging hero, a fire-breathing dragon, a cleric, a stone guardian, a princess and their king.",
  "mode:retro": "Every battle drawn as a 16-bit game would, 3D tribes included. Also in Settings.",
  "mode:noir": "Every battle as a black-and-white film: hard light, grain and a dark edge. Also in Settings.",
  "mode:sketch": "Every battle drawn in pencil on paper, lines and hatching. Also in Settings.",
  "finish:original": "Your tribe as it was made.",
  "finish:gold": "Your tribe cast in gold: bright gold for the light side, old gold for the dark.",
  "finish:crystal": "Your tribe in clear crystal.",
  "finish:stone": "Your tribe carved in stone, like statues come to life.",
  "finish:neon": "Your tribe dark, outlined in glowing neon.",
  "finish:chocolate": "Your tribe in milk and dark chocolate.",
  "color:original": "Your tribe's own colors.",
  "outfit:80s": "Big hair, neon and shades for whichever tribe you lead. Being made.",
};
const KIND_ABOUT: Record<string, string> = {
  color: "Your tribe in this color (a light and a dark shade), with any finish.",
};

/** How an item is won, for locked ones. */
function howToGet(id: ItemId) {
  const level = Object.entries(LEVEL_UNLOCKS).find(([, items]) => items.includes(id))?.[0];
  if (level) return `Reach level ${level}`;
  if (id === "tribe:stormcourt" || id === "court:stormcourt") return "Beat the Storm King in the campaign";
  if (id === "tribe:thornwood" || id === "court:thornwood") return "Beat the Elder Oak in the campaign";
  if (id === "tribe:epoch-drifters" || id === "court:epoch-drifters") return "Beat the Princess in the campaign";
  if (id === "court:epoch-flat" || /^(finish|color):|^mode:(noir|sketch)$/.test(id)) return "Buy with credits (coming soon)";
  if (id === "mode:retro") return "Finish the puzzle trek";
  return "Coming soon";
}

/** Every item that can be won, by shelf, and the modes. */
function shelves(p: Profile): { rows: ShelfRow[]; modes: ShelfItem[] } {
  const item = (id: ItemId, name: string, on: boolean): ShelfItem => {
    const locked = !owns(p, id) && !id.endsWith(":original");
    return { id, name, on, locked, note: locked ? howToGet(id) : undefined };
  };
  return {
    rows: [
      { title: "Tribes", kind: "figures", items: Object.values(TRIBES).map((t) => item(`tribe:${t.id}`, t.name, p.equipped.tribe === t.id)) },
      { title: "Courts", kind: "pictures", items: COURTS.map((c) => item(`court:${c.id}`, c.name, p.equipped.court === c.id)) },
      { title: "Finishes", kind: "figures", items: [{ id: "original", name: "Original" }, ...FINISHES].map((f) => item(`finish:${f.id}`, f.name, p.equipped.finish === f.id)) },
      { title: "Colors", kind: "figures", items: [{ id: "original", name: "Original" }, ...COLORS].map((c) => item(`color:${c.id}`, c.name, p.equipped.color === c.id)) },
      // Outfits fit every tribe; the first is a placeholder until it is made.
      { title: "Outfits", kind: "figures", items: [item("outfit:80s", "80s", false)] },
    ],
    modes: [item("mode:noir", "Noir", p.mode === "noir"), item("mode:retro", "Retro mode", p.retro), item("mode:sketch", "Sketch", p.mode === "sketch")],
  };
}

export function Collection({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CollectionScene | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const { rows, modes } = useMemo(() => shelves(p), [p]);
  const all = [...rows.flatMap((r) => r.items), ...modes];
  const it = all.find((i) => i.id === sel);

  useEffect(() => {
    const s = new CollectionScene(host.current!, setSel);
    scene.current = s;
    if (import.meta.env.DEV) (window as unknown as { collection?: CollectionScene }).collection = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => scene.current?.setRows(rows, modes), [rows, modes]);
  useEffect(() => scene.current?.select(sel), [sel]);

  const use = (id: string) => {
    const [kind, name] = id.split(":");
    if (kind === "tribe") update((q) => ({ ...q, equipped: { ...q.equipped, tribe: name } }));
    else if (kind === "court" || kind === "finish" || kind === "color") update((q) => ({ ...q, equipped: { ...q.equipped, [kind]: name } }));
    else if (name === "retro") update((q) => ({ ...q, retro: !q.retro }));
    else update((q) => ({ ...q, mode: q.mode === name ? "" : name }));
  };
  const kind = it?.id.split(":")[0];
  const court = kind === "court" ? COURTS.find((c) => `court:${c.id}` === it!.id) : undefined;
  const owned = all.filter((i) => !i.locked).length;

  return (
    <div className="screen collection" data-testid="collection">
      <div className="collection-stage" ref={host} />
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Collection</h2>
        <div className="spacer" />
        <button className="btn dark small trophy-btn" onClick={() => go({ name: "trophies" })}>
          <Trophy size={16} /> Trophies
        </button>
        <span className="collection-count">
          {owned} of {all.length} won
        </span>
      </div>
      {it ? (
        <div className="collection-card">
          <button className="btn dark round small close" onClick={() => setSel(null)} aria-label="Close">
            <X size={18} />
          </button>
          <h3>{it.name}</h3>
          <div className="muted">{ABOUT[it.id] ?? KIND_ABOUT[kind!] ?? (court?.tribe ? `Home of ${TRIBES[court.tribe]?.name.replace(/^The /, "the ")}.` : "A board for any tribe.")}</div>
          {it.locked ? (
            <button className="btn dark small" disabled>
              <Lock size={15} /> {it.note}
            </button>
          ) : (
            <button className={`btn small ${it.on ? "gold" : ""}`} disabled={it.on && kind !== "mode"} onClick={() => use(it.id)}>
              {kind === "tribe"
                ? it.on
                  ? "Leading"
                  : "Lead this tribe"
                : kind === "court"
                  ? it.on
                    ? "In use"
                    : "Use this court"
                  : kind === "finish" || kind === "color"
                    ? it.on
                      ? "Wearing"
                      : "Wear it"
                    : it.on
                      ? "On: turn off"
                      : "Off: turn on"}
            </button>
          )}
        </div>
      ) : (
        <div className="collection-hint muted small">Drag to look along the shelves, pinch or scroll to zoom, tap an item.</div>
      )}
    </div>
  );
}
