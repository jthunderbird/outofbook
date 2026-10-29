// The player's progress: XP and level, what they own and have equipped, perk
// charges and campaign results. Saved on the device. Owned items are one list,
// whatever unlocked them (a level, a campaign win, later a purchase).
import { useSyncExternalStore } from "react";
import { COURTS } from "@outofbook/legions/courts";
import { MODES, type Mode } from "@outofbook/legions/modes";
import { NEW_TREK, type Trek } from "./puzzles";

export type ItemKind = "tribe" | "court" | "mode" | "finish" | "color" | "outfit";
/** "tribe:staunton", "court:night", "mode:retro", "finish:gold", "color:ruby", ... (a court is a board with its scenery; a mode a way of drawing the game; a finish and a color the look of the player's own pieces). */
export type ItemId = `${ItemKind}:${string}`;

export interface Profile {
  xp: number;
  /** Credits: earned by playing, spent in the store (not yet in use). */
  credits: number;
  owned: ItemId[];
  /** finish and color: "original" for the tribe as it was made. */
  equipped: { tribe: string; court: string; finish: string; color: string };
  /** Charges left: show the best move, take a move back, carry on with a failed puzzle challenge (bought in the store). */
  perks: { hint: number; takeback: number; retry: number };
  /** Campaign battles won (ids from campaign.ts). */
  won: string[];
  /** The puzzle trek: progress on this run and the tallies. */
  trek: Trek;
  sound: boolean;
  /** The player's name in games; a Lichess login's name later. */
  name: string;
  /** Glow on lightning, fire and bright light (bloom); off for slower phones. */
  glow: boolean;
  /** Retro mode: every battle drawn at 16-bit resolution and palette, 3D tribes included. Needs mode:retro. */
  retro: boolean;
  /** Another way of drawing every battle ("noir", "sketch"), or "" for none. Needs mode:<id>. */
  mode: string;
  /** Levels already rewarded (perk charges are given once per level). */
  rewardedLevel: number;
}

const KEY = "legions.profile";
const FRESH: Profile = {
  xp: 0,
  credits: 0,
  owned: ["tribe:staunton", "court:staunton", "court:night"],
  equipped: { tribe: "staunton", court: "staunton", finish: "original", color: "original" },
  perks: { hint: 3, takeback: 3, retry: 0 },
  won: [],
  trek: NEW_TREK,
  sound: true,
  name: "Player",
  glow: true,
  retro: false,
  mode: "",
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
    if (saved) return { ...FRESH, ...saved, equipped: { ...FRESH.equipped, ...saved.equipped }, perks: { ...FRESH.perks, ...saved.perks }, trek: { ...FRESH.trek, ...saved.trek } };
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
/** Owned outright, or (a skin's court) owned with its skin. */
export const owns = (p: Profile, id: ItemId): boolean => {
  if (p.owned.includes(id)) return true;
  const skin = id.startsWith("court:") ? COURTS.find((c) => `court:${c.id}` === id)?.skin : undefined;
  return !!skin && p.owned.includes(`mode:${skin}`);
};

/** The look the player's own pieces wear (only what they own). */
export function myLook(p: Profile) {
  const { finish, color } = p.equipped;
  return {
    finish: finish !== "original" && owns(p, `finish:${finish}`) ? finish : undefined,
    color: color !== "original" && owns(p, `color:${color}`) ? color : undefined,
  };
}
/** The way every battle is drawn besides Retro mode, if owned. */
export const myMode = (p: Profile) => ((MODES as readonly string[]).includes(p.mode) && owns(p, `mode:${p.mode}`) ? (p.mode as Mode) : null);

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
