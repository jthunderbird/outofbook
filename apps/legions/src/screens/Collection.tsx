// The Collection: a wall in a bedroom with a shelf for each kind of item (the
// room is packages/legions/src/collection.ts). Every item that can be won is on
// it, locked ones grayed with what unlocks them; Retro mode floats by the window. Tap an
// item for its card: what it is, and leading the tribe, using the court or
// turning the mode on.
import { useEffect, useMemo, useRef, useState } from "react";
import { CollectionScene, type ShelfItem, type ShelfRow } from "@outofbook/legions/collection";
import { COURTS } from "@outofbook/legions/courts";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { LEVEL_UNLOCKS, owns, update, useProfile, type ItemId, type Profile } from "../profile";
import { ArrowLeft, Lock, X } from "lucide-react";

const ABOUT: Record<string, string> = {
  "tribe:staunton": "A classic wooden set. Pieces slide, the knight hops, and a capture knocks the other piece flat.",
  "tribe:stormcourt": "A king who rules by magic, thunder bishops, stone rooks and a queen who opens a pit of fire.",
  "tribe:thornwood": "An ancient forest: root-walking priests, treant rooks, a flytrap queen and the Elder Oak.",
  "tribe:epoch-drifters": "Heroes out of a 16-bit RPG: a sword-swinging hero, a fire-breathing dragon, a cleric, a stone guardian, a princess and their king.",
  "mode:retro": "Every battle drawn as a 16-bit game would, 3D tribes included. Also in Settings.",
};

/** How an item is won, for locked ones. */
function howToGet(id: ItemId) {
  const level = Object.entries(LEVEL_UNLOCKS).find(([, items]) => items.includes(id))?.[0];
  if (level) return `Reach level ${level}`;
  if (id === "tribe:stormcourt" || id === "court:stormcourt") return "Beat the Storm King in the campaign";
  if (id === "tribe:thornwood" || id === "court:thornwood") return "Beat the Elder Oak in the campaign";
  if (id === "tribe:epoch-drifters" || id === "court:epoch-drifters") return "Beat the Princess in the campaign";
  if (id === "court:epoch-flat") return "Buy with credits (coming soon)";
  if (id === "mode:retro") return "Finish the puzzle trek";
  return "Coming soon";
}

/** Every item that can be won, by shelf, and Retro mode. */
function shelves(p: Profile): { rows: ShelfRow[]; retro: ShelfItem } {
  const item = (id: ItemId, name: string, on: boolean): ShelfItem => {
    const locked = !owns(p, id);
    return { id, name, on, locked, note: locked ? howToGet(id) : undefined };
  };
  return {
    rows: [
      { title: "Tribes", kind: "figures", items: Object.values(TRIBES).map((t) => item(`tribe:${t.id}`, t.name, p.equipped.tribe === t.id)) },
      { title: "Courts", kind: "pictures", items: COURTS.map((c) => item(`court:${c.id}`, c.name, p.equipped.court === c.id)) },
    ],
    retro: item("mode:retro", "Retro mode", p.retro),
  };
}

export function Collection({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CollectionScene | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const { rows, retro } = useMemo(() => shelves(p), [p]);
  const all = [...rows.flatMap((r) => r.items), retro];
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
  useEffect(() => scene.current?.setRows(rows, [retro]), [rows, retro]);
  useEffect(() => scene.current?.select(sel), [sel]);

  const use = (id: string) => {
    const [kind, name] = id.split(":");
    if (kind === "tribe") update((q) => ({ ...q, equipped: { ...q.equipped, tribe: name } }));
    else if (kind === "court") update((q) => ({ ...q, equipped: { ...q.equipped, court: name } }));
    else update((q) => ({ ...q, retro: !q.retro }));
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
          <div className="muted">{ABOUT[it.id] ?? (court?.tribe ? `Home of ${TRIBES[court.tribe]?.name.replace(/^The /, "the ")}.` : "A board for any tribe.")}</div>
          {it.locked ? (
            <button className="btn dark small" disabled>
              <Lock size={15} /> {it.note}
            </button>
          ) : (
            <button className={`btn small ${it.on ? "gold" : ""}`} disabled={it.on && kind !== "mode"} onClick={() => use(it.id)}>
              {kind === "tribe" ? (it.on ? "Leading" : "Lead this tribe") : kind === "court" ? (it.on ? "In use" : "Use this court") : it.on ? "On: turn off" : "Off: turn on"}
            </button>
          )}
        </div>
      ) : (
        <div className="collection-hint muted small">Drag to look along the shelves, pinch or scroll to zoom, tap an item.</div>
      )}
    </div>
  );
}
