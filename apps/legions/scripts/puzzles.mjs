// Builds the puzzle trek's bundled puzzles from the Lichess puzzle database
// (https://database.lichess.org/#puzzles, CC0), run once by hand:
//
//   curl -o ~/.cache/lichess-puzzles/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
//   node apps/legions/scripts/puzzles.mjs [path to the .csv.zst]
//
// Writes one file per 50-point rating band, 350 to 2350, to public/puzzles/
// (r0350.csv holds ratings 350 to 399), each with up to PER_BAND well-tested
// puzzles picked at random (seeded, so a rerun on the same database gives the
// same files). Lines: id,fen,moves,rating. Lichess's FEN is the position before
// the opponent's move; the first of the moves is that move, then the solution.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zstdDecompressSync } from "node:zlib";

const SRC = process.argv[2] ?? join(homedir(), ".cache/lichess-puzzles/lichess_db_puzzle.csv.zst");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/puzzles");
const PER_BAND = 5000;
const LOW = 350;
const HIGH = 2350;
const BAND = 50;

/** Seeded random (mulberry32). */
let seed = 0x5eed;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Reservoir sampling per band: every eligible puzzle has the same chance.
const bands = new Map();
const seen = new Map();
let total = 0;
let kept = 0;
/**
 * The file's lines. It is many zstd frames with skippable frames (a seek
 * table) among them, which Node's zstd does not step over: each frame is found
 * by walking its block headers and is decompressed on its own.
 */
function* csvLines(path) {
  const buf = readFileSync(path);
  let at = 0;
  let rest = "";
  while (at < buf.length) {
    const magic = buf.readUInt32LE(at);
    if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
      at += 8 + buf.readUInt32LE(at + 4);
      continue;
    }
    if (magic !== 0xfd2fb528) throw new Error(`not a zstd frame at ${at}`);
    const start = at;
    const fhd = buf[at + 4];
    const single = (fhd >> 5) & 1;
    const fcs = [single, 2, 4, 8][fhd >> 6];
    const dict = [0, 1, 2, 4][fhd & 3];
    at += 5 + (single ? 0 : 1) + dict + fcs;
    for (;;) {
      const h = buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
      const type = (h >> 1) & 3;
      at += 3 + (type === 1 ? 1 : h >> 3);
      if (h & 1) break;
    }
    if ((fhd >> 2) & 1) at += 4;
    const text = rest + zstdDecompressSync(buf.subarray(start, at)).toString();
    const lines = text.split("\n");
    rest = lines.pop();
    yield* lines;
  }
  if (rest) yield rest;
}

for (const line of csvLines(SRC)) {
  if (line.startsWith("PuzzleId")) continue;
  total++;
  const [id, fen, moves, rating, deviation, popularity, plays] = line.split(",");
  const r = +rating;
  if (r < LOW || r >= HIGH) continue;
  // Well tested and liked: a settled rating, enough plays, few downvotes.
  if (+deviation > 90 || +plays < 100 || +popularity < 60) continue;
  kept++;
  const b = LOW + Math.floor((r - LOW) / BAND) * BAND;
  const list = bands.get(b) ?? [];
  bands.set(b, list);
  const n = (seen.get(b) ?? 0) + 1;
  seen.set(b, n);
  const row = `${id},${fen},${moves},${r}`;
  if (list.length < PER_BAND) list.push(row);
  else {
    const j = Math.floor(random() * n);
    if (j < PER_BAND) list[j] = row;
  }
}

mkdirSync(OUT, { recursive: true });
for (let b = LOW; b < HIGH; b += BAND) {
  const list = bands.get(b) ?? [];
  writeFileSync(join(OUT, `r${String(b).padStart(4, "0")}.csv`), list.join("\n") + "\n");
  console.log(`${b}-${b + BAND - 1}: ${list.length} of ${seen.get(b) ?? 0} eligible`);
}
console.log(`${total} puzzles read, ${kept} eligible in ${LOW}-${HIGH - 1}`);
