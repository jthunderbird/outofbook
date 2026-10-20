// Builds src/data/book.json from lichess-org/chess-openings (CC0, scripts/openings/*.tsv).
// Every position on the path of a named line is a book node; edges are the book
// moves between them. Keys are FEN without the move counters, so transpositions
// into a named position land on the same node.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Chess } from "chess.js";

const posKey = (fen) => fen.split(" ").slice(0, 4).join(" ");
const nodes = {}; // key -> { n?: [eco, name], c: { uci: childKey } }
const node = (k) => (nodes[k] ??= { c: {} });

let lines = 0;
for (const f of ["a", "b", "c", "d", "e"]) {
  const rows = readFileSync(new URL(`./openings/${f}.tsv`, import.meta.url), "utf8")
    .trim()
    .split("\n")
    .slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const chess = new Chess();
    let key = posKey(chess.fen());
    node(key);
    for (const san of pgn
      .replace(/\d+\.(\.\.)?/g, " ")
      .trim()
      .split(/\s+/)) {
      const m = chess.move(san);
      const child = posKey(chess.fen());
      node(key).c[m.from + m.to + (m.promotion ?? "")] = child;
      node(child);
      key = child;
    }
    // Several names can end on one position (transpositions); keep the first, shortest-ECO one.
    if (!nodes[key].n) nodes[key].n = [eco, name];
    lines++;
  }
}
mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/data/book.json", import.meta.url), JSON.stringify(nodes));
console.log(`book: ${lines} named lines, ${Object.keys(nodes).length} positions`);
