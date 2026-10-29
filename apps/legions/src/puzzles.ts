// The puzzle trek: 20 stages of challenges along one long track. A stage has a
// fixed rating (400 to 2300); its challenges ask for ever more puzzles in ever
// less time a puzzle. A challenge is passed by solving all its puzzles without a
// wrong move before the clock runs out. The puzzles (Lichess's, bundled in
// public/puzzles/ by scripts/puzzles.mjs) are drawn at random when a challenge
// starts, within 50 points of the stage's rating: a challenge tried again brings
// new ones.

export const STAGES = 20;
/** A stage's rating: 400, 500, ... 2300. */
export const stageRating = (stage: number) => 400 + 100 * (stage - 1);
/** Stage N has N + 2 challenges. */
export const challengesIn = (stage: number) => stage + 2;
/** How far from the stage's rating its puzzles may be. */
const SPREAD = 50;

export interface Challenge {
  /** "s3-c2": stage 3, challenge 2. */
  id: string;
  stage: number;
  /** 1-based within its stage. */
  n: number;
  rating: number;
  /** Puzzles to solve: the challenge's number plus 2. */
  puzzles: number;
  /** The whole challenge's time, in seconds. */
  seconds: number;
}

/** Every challenge, in the order of the track. */
export const CHALLENGES: Challenge[] = [];
for (let s = 1; s <= STAGES; s++) {
  const count = challengesIn(s);
  // A puzzle's time: 40 s in the first challenge of stage 1, a little more in later stages (longer puzzles), falling to 55% by a stage's last challenge.
  const first = 40 + 1.5 * (s - 1);
  for (let n = 1; n <= count; n++) {
    const each = first * (1 - (0.45 * (n - 1)) / (count - 1));
    // 3 puzzles for the first three challenges, one more every three after (1,261 puzzles over the trek).
    const puzzles = 2 + Math.ceil(n / 3);
    CHALLENGES.push({ id: `s${s}-c${n}`, stage: s, n, rating: stageRating(s), puzzles, seconds: Math.round((each * puzzles) / 5) * 5 });
  }
}
export const findChallenge = (id: string) => CHALLENGES.find((c) => c.id === id);

/** The stage's world: the tribe the puzzles are played against, on its home court. */
export const WORLDS = [
  { tribe: "stormcourt", court: "stormcourt", name: "Storm" },
  { tribe: "thornwood", court: "thornwood", name: "Forest" },
  { tribe: "epoch-drifters", court: "epoch-drifters", name: "Pixel" },
  { tribe: "restless", court: "wake", name: "Graveyard" },
] as const;
export const worldOf = (stage: number) => WORLDS[(stage - 1) % WORLDS.length];

export interface Puzzle {
  id: string;
  /** The position before the opponent's move. */
  fen: string;
  /** The opponent's move, then the solution: the player's moves and the replies, uci. */
  moves: string[];
  rating: number;
}

const bands = new Map<number, Promise<Puzzle[]>>();
/** One 50-point band's puzzles (r0400.csv: 400 to 449), fetched once. */
function band(low: number): Promise<Puzzle[]> {
  let p = bands.get(low);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}puzzles/r${String(low).padStart(4, "0")}.csv`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) =>
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [id, fen, moves, rating] = line.split(",");
            return { id, fen, moves: moves.split(" "), rating: +rating };
          }),
      );
    p.catch(() => bands.delete(low));
    bands.set(low, p);
  }
  return p;
}

/** n puzzles at random within SPREAD of the rating, none twice and none in avoid. */
export async function drawPuzzles(rating: number, n: number, avoid: Set<string> = new Set()): Promise<Puzzle[]> {
  const lows: number[] = [];
  for (let b = Math.floor((rating - SPREAD) / 50) * 50; b <= rating + SPREAD; b += 50) lows.push(b);
  const pool = (await Promise.all(lows.map(band))).flat().filter((p) => Math.abs(p.rating - rating) <= SPREAD && !avoid.has(p.id));
  const out: Puzzle[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

/** The trek's progress and its tallies, kept in the profile. */
export interface Trek {
  /** Challenges passed on this run. */
  cleared: string[];
  /** Full treks finished. */
  runs: number;
  /** This run finished: the player may replay any challenge or start over. */
  finished: boolean;
  /** Tallies over every run: time spent in challenges (ms), and challenges played, passed and failed. */
  total: Tally;
  /** The same for this run. */
  run: Tally;
  /** The best medal won on each challenge, over every run (by challenge id). */
  medals: Record<string, Medal>;
}

/** Bronze, silver, gold: won by passing a challenge, the better the less of its time is used. */
export type Medal = 1 | 2 | 3;
export const MEDAL_NAMES = ["", "Bronze", "Silver", "Gold"] as const;
/** The share of a challenge's time within which gold and silver are won (bronze: any pass, or a pass with a retry). */
const GOLD_WITHIN = 0.4;
const SILVER_WITHIN = 0.65;
/** The time (seconds) to beat for gold and silver. */
export const medalTimes = (c: Challenge) => ({ gold: Math.round(c.seconds * GOLD_WITHIN), silver: Math.round(c.seconds * SILVER_WITHIN) });
/** The medal for a pass with msUsed of the challenge's time; a retry spent makes it bronze. */
export function medalFor(c: Challenge, msUsed: number, retried: boolean): Medal {
  const t = medalTimes(c);
  if (retried) return 1;
  return msUsed <= t.gold * 1000 ? 3 : msUsed <= t.silver * 1000 ? 2 : 1;
}
/** How many of each medal (index 1 bronze to 3 gold). */
export function medalCounts(t: Trek) {
  const n = [0, 0, 0, 0];
  for (const m of Object.values(t.medals ?? {})) n[m]++;
  return n;
}
export interface Tally {
  ms: number;
  played: number;
  passed: number;
  failed: number;
}
export const NEW_TALLY: Tally = { ms: 0, played: 0, passed: 0, failed: 0 };
export const NEW_TREK: Trek = { cleared: [], runs: 0, finished: false, total: NEW_TALLY, run: NEW_TALLY, medals: {} };

/** The first challenge not yet passed on this run (the hero's place on the track); none when the run is finished. */
export const nextChallenge = (t: Trek) => CHALLENGES.find((c) => !t.cleared.includes(c.id));
/** A challenge can be played once the one before it is passed (any of them, when the run is finished). */
export const challengeOpen = (t: Trek, c: Challenge) => {
  if (t.finished) return true;
  const i = CHALLENGES.indexOf(c);
  return i === 0 || t.cleared.includes(CHALLENGES[i - 1].id);
};

/** XP for passing a challenge the first time on a run. */
export const challengeXp = (c: Challenge) => 10 * c.stage;
/** XP for finishing the trek again (the first time unlocks Retro mode). */
export const TREK_XP = 5000;

/** "2:05". */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** "3 h 12 min", "12 min", "45 s". */
export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
