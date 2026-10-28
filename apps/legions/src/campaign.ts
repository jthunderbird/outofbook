// The campaign: a ladder of tribes, each fought in battles against ever
// stronger Maia opponents; beating a tribe's last battle (its boss) unlocks it.
// The Stormcourt comes first, rated very low: it is the game's introduction.
import type { Role, Side } from "@outofbook/legions/figures";
import type { ItemId } from "./profile";

export interface Battle {
  id: string;
  name: string;
  /** Maia's rating for the opponent. */
  elo: number;
  /** The side the player plays. */
  side: Side;
  boss?: boolean;
}

export interface Chapter {
  tribe: string;
  name: string;
  story: string;
  /** Where its battles are fought: the tribe's home court. */
  court: string;
  /** XP for a win is 100 times the tier. */
  tier: number;
  battles: Battle[];
  /** What beating the boss unlocks. */
  reward: ItemId[];
  /**
   * The piece that leads the chapter's page, ready for battle in front of its
   * army: its waiting clip and the action it plays now and then (rigged models),
   * leaping that far toward the player.
   */
  hero: { role: Role };
}

export const CHAPTERS: Chapter[] = [
  {
    tribe: "stormcourt",
    name: "The Stormcourt",
    court: "stormcourt",
    story: "A court of storm and stone. Its king rules by magic, its bishops ride the lightning. Their soldiers are green: show them how chess is played.",
    tier: 1,
    battles: [
      { id: "storm-1", name: "Skirmish at the gate", elo: 500, side: "w" },
      { id: "storm-2", name: "The thunder bishops", elo: 575, side: "b" },
      { id: "storm-3", name: "The Storm King", elo: 650, side: "w", boss: true },
    ],
    reward: ["tribe:stormcourt", "court:stormcourt"],
    hero: { role: "k" },
  },
  {
    tribe: "thornwood",
    name: "The Thornwood",
    court: "thornwood",
    story: "An ancient forest that remembers every axe. Its priests travel as roots, its queen's flowers bite, and the Elder Oak grows trees through his enemies.",
    tier: 2,
    battles: [
      { id: "thorn-1", name: "Into the thorns", elo: 650, side: "b" },
      { id: "thorn-2", name: "The Dryad's garden", elo: 725, side: "w" },
      { id: "thorn-3", name: "The Elder Oak", elo: 800, side: "b", boss: true },
    ],
    reward: ["tribe:thornwood", "court:thornwood"],
    hero: { role: "q" },
  },
  {
    tribe: "epoch-drifters",
    name: "The Epoch Drifters",
    court: "epoch-drifters",
    story: "Heroes who drifted out of an old cartridge and through the ages. A dragon that burns, a cleric who calls down light, and a princess who throws her enemies over the horizon.",
    tier: 3,
    battles: [
      { id: "epoch-1", name: "Press start", elo: 800, side: "w" },
      { id: "epoch-2", name: "The dragon's roost", elo: 875, side: "b" },
      { id: "epoch-3", name: "The Princess", elo: 950, side: "w", boss: true },
    ],
    reward: ["tribe:epoch-drifters", "court:epoch-drifters"],
    hero: { role: "n" },
  },
];

/** A chapter opens when the one before it is beaten. */
export const chapterOpen = (i: number, won: string[]) => i === 0 || CHAPTERS[i - 1].battles.every((b) => won.includes(b.id));
/** A battle opens when the one before it in its chapter is won. */
export const battleOpen = (c: Chapter, j: number, won: string[]) => j === 0 || won.includes(c.battles[j - 1].id);

export function findBattle(id: string) {
  for (const c of CHAPTERS) {
    const b = c.battles.find((x) => x.id === id);
    if (b) return { chapter: c, battle: b };
  }
  return null;
}
