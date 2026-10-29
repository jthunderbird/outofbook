// The game's money: what it is called, what playing earns and what the Store
// asks. Everything is written in base amounts and run through two percentages,
// so tuning is one number: EARN_PCT moves every reward at once, COST_PCT every
// price. Credits come slowly on purpose (hours of play and the campaign and puzzle
// trek to afford the big things). The store is credits only for now; a Product
// may carry a cash price (cents) for when real-money purchases are added.
import type { ItemId } from "./profile";
import { COLORS, FINISHES } from "@outofbook/legions/looks";

/** What the credits are called. */
export const CURRENCY = { one: "Sigil", many: "Sigils" };
export const money = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? CURRENCY.one : CURRENCY.many}`;

/** Percent of the base rewards paid out, and of the base prices asked. */
export const EARN_PCT = 100;
export const COST_PCT = 100;
export const earn = (base: number) => Math.round((base * EARN_PCT) / 100);
export const cost = (base: number) => Math.round((base * COST_PCT) / 100);

// --- Earning (base amounts) ---

/** A won campaign battle: this much per tier of its chapter; a draw pays a quarter. */
const CAMPAIGN_WIN = 10;
/** A won quick-play game: this much per 100 of the opponent's rating (a draw pays a third), at least 1. */
const QUICK_WIN = 1;
/** A puzzle challenge passed for the first time: this much per stage (harder stages come later). */
const PUZZLE_FIRST = 2;

/** Credits for a finished game. Losses pay nothing. */
export function gameCredits(result: "win" | "draw" | "loss", opts: { tier?: number; elo: number }): number {
  if (result === "loss") return 0;
  const win = opts.tier ? CAMPAIGN_WIN * opts.tier : Math.max(1, Math.round((QUICK_WIN * opts.elo) / 100));
  return earn(result === "win" ? win : Math.max(1, Math.round(win / (opts.tier ? 4 : 3))));
}

/** Credits for passing a challenge of the trek's stage for the first time. */
export const puzzleCredits = (stage: number) => earn(PUZZLE_FIRST * stage);

// --- Selling (base prices) ---

export type PerkId = "hint" | "takeback" | "retry";

export interface Product {
  id: string;
  name: string;
  blurb: string;
  section: "Skins" | "Finishes" | "Colors" | "Charges";
  /** What it gives: an item for the Collection, or this many charges of a perk. */
  item?: ItemId;
  perk?: { id: PerkId; n: number };
  /** Base price in credits (see COST_PCT). */
  base: number;
  /** Later: the price in cents for buying it with real money. */
  cents?: number;
}

const FINISH_BASE: Record<string, number> = { gold: 3000, crystal: 2400, stone: 1800, neon: 2400, chocolate: 1500 };
const COLOR_BASE = 600;

export const PRODUCTS: Product[] = [
  { id: "mode:noir", name: "Noir", blurb: "Your tribes as a black-and-white film. Comes with the Back Alley court.", section: "Skins", item: "mode:noir", base: 2500 },
  { id: "mode:sketch", name: "Sketch", blurb: "Your tribes in pencil on paper. Comes with the Sketchbook Desk court.", section: "Skins", item: "mode:sketch", base: 2500 },
  ...FINISHES.map<Product>((f) => ({
    id: `finish:${f.id}`,
    name: f.name,
    blurb: `Your tribe in ${f.id === "gold" ? "gold" : f.id === "crystal" ? "clear crystal" : f.id === "stone" ? "carved stone" : f.id === "neon" ? "glowing neon" : "milk and dark chocolate"}.`,
    section: "Finishes",
    item: `finish:${f.id}` as ItemId,
    base: FINISH_BASE[f.id] ?? 2000,
  })),
  ...COLORS.map<Product>((c) => ({
    id: `color:${c.id}`,
    name: c.name,
    blurb: `Your tribe in ${c.name.toLowerCase()}, a light and a dark shade.`,
    section: "Colors",
    item: `color:${c.id}` as ItemId,
    base: COLOR_BASE,
  })),
  { id: "perk:hint", name: "3 hints", blurb: "Show the best move in a game.", section: "Charges", perk: { id: "hint", n: 3 }, base: 150 },
  { id: "perk:takeback", name: "3 take-backs", blurb: "Take a move back in a game.", section: "Charges", perk: { id: "takeback", n: 3 }, base: 150 },
  { id: "perk:retry", name: "2 retries", blurb: "Carry on with a puzzle challenge you failed (bronze at best).", section: "Charges", perk: { id: "retry", n: 2 }, base: 400 },
];

export const price = (p: Product) => cost(p.base);
