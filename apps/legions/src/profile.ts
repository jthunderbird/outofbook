// The player's progress: XP and level, what they own and have equipped, perk
// charges and campaign results. Saved on the device. Owned items are one list,
// whatever unlocked them (a level, a campaign win, later a purchase).
import { useSyncExternalStore } from "react";

export type ItemKind = "tribe" | "court";
/** "tribe:staunton", "court:night", ... (a court is a board with its scenery). */
export type ItemId = `${ItemKind}:${string}`;

export interface Profile {
  xp: number;
  owned: ItemId[];
  equipped: { tribe: string; court: string };
  /** Charges left: show the best move, take a move back. */
  perks: { hint: number; takeback: number };
  /** Campaign battles won (ids from campaign.ts). */
  won: string[];
  sound: boolean;
  /** The player's name in games; a Lichess login's name later. */
  name: string;
  /** Glow on lightning, fire and bright light (bloom); off for slower phones. */
  glow: boolean;
  /** The pixel look for every tribe (fixed oblique camera, low resolution, 16-bit palette). */
  pixel: boolean;
  /** Levels already rewarded (perk charges are given once per level). */
  rewardedLevel: number;
}

const KEY = "legions.profile";
const FRESH: Profile = {
  xp: 0,
  owned: ["tribe:staunton", "court:staunton", "court:night"],
  equipped: { tribe: "staunton", court: "staunton" },
  perks: { hint: 3, takeback: 3 },
  won: [],
  sound: true,
  name: "Player",
  glow: true,
  pixel: false,
  rewardedLevel: 1,
};

export const XP_PER_LEVEL = 500;
export const levelOf = (xp: number) => 1 + Math.floor(xp / XP_PER_LEVEL);

/** Items that unlock on reaching a level. */
export const LEVEL_UNLOCKS: Record<number, ItemId[]> = {
  2: ["court:dusk"],
  3: ["court:storm"],
  4: ["court:ember"],
  5: ["court:forest"],
};

function load(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // Backgrounds became courts (a board with its scenery).
    if (saved?.owned) saved.owned = saved.owned.map((i: string) => i.replace(/^background:/, "court:"));
    if (saved?.equipped?.background) {
      saved.equipped.court ??= saved.equipped.background;
      delete saved.equipped.background;
    }
    // Every player owns the starter tribe's home, the Tournament Hall.
    if (saved?.owned && !saved.owned.includes("court:staunton")) saved.owned.push("court:staunton");
    if (saved) return { ...FRESH, ...saved, equipped: { ...FRESH.equipped, ...saved.equipped }, perks: { ...FRESH.perks, ...saved.perks } };
  } catch {
    /* private mode or bad data: start fresh */
  }
  return FRESH;
}

let profile = load();
const listeners = new Set<() => void>();

function save(p: Profile) {
  profile = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: kept for this visit */
  }
  listeners.forEach((l) => l());
}

export function useProfile() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => profile,
  );
}

export const getProfile = () => profile;
export const update = (fn: (p: Profile) => Profile) => save(fn(profile));
// Epoch Drifters and its stage are open to everyone while the tribe is being previewed.
const PREVIEW: string[] = ["tribe:epoch-drifters", "court:epoch-drifters", "court:epoch-flat"];
export const owns = (p: Profile, id: ItemId) => p.owned.includes(id) || PREVIEW.includes(id);

/** What a game's end brought: XP, a level reached, items unlocked. */
export interface Reward {
  xp: number;
  levelFrom: number;
  levelTo: number;
  unlocked: ItemId[];
}

/** Adds XP (and any items won), rewarding each new level with items and a perk charge of each kind. */
export function award(xp: number, items: ItemId[] = []): Reward {
  const p = profile;
  const levelFrom = levelOf(p.xp);
  const total = p.xp + xp;
  const levelTo = levelOf(total);
  const unlocked = items.filter((i) => !p.owned.includes(i));
  const perks = { ...p.perks };
  for (let l = Math.max(levelFrom, p.rewardedLevel) + 1; l <= levelTo; l++) {
    for (const i of LEVEL_UNLOCKS[l] ?? []) if (!p.owned.includes(i) && !unlocked.includes(i)) unlocked.push(i);
    perks.hint++;
    perks.takeback++;
  }
  save({ ...p, xp: total, owned: [...p.owned, ...unlocked], perks, rewardedLevel: Math.max(p.rewardedLevel, levelTo) });
  return { xp, levelFrom, levelTo, unlocked };
}

export function resetProfile() {
  save(FRESH);
}
