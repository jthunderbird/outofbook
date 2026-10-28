// Builds the Staunton tribe's pieces (models/staunton.bin) from STL meshes of a
// real Staunton set, run once by hand:
//
//   node packages/legions/scripts/staunton.mjs <directory with the STL files>
//
// Each piece is welded, simplified (meshoptimizer) to about TRIS triangles,
// stood up (the STLs are Z-up), centred on its base and scaled with the whole
// set by one factor, so the pieces keep their true proportions (the king
// KING_HEIGHT tall). The file: "STN1", then per piece in ROLES order its vertex
// count and index count (uint32), its box (6 float32: min xyz, size xyz), the
// positions quantized to uint16 within that box, and uint16 indices.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: staunton.mjs <stl directory>");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../models/staunton.bin");
const ROLES = ["k", "q", "r", "b", "n", "p"];
/** The whole pieces among the files (the set's other files are its parts, split for printing; their names are mixed up). */
const FILES = { k: "king_head.stl", q: "pawn_base.stl", r: "queen_full.stl", b: "king_base.stl", n: "king_full.stl", p: "queen_base.stl" };
const TRIS = 10000;
const KING_HEIGHT = 1.72;

/** A binary STL's triangles, welded: shared corners become one vertex. Y-up (z becomes y, y becomes -z). */
function readStl(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(80);
  const pos = [];
  const index = new Uint32Array(n * 3);
  const seen = new Map();
  for (let i = 0; i < n; i++)
    for (let v = 0; v < 3; v++) {
      const o = 84 + i * 50 + 12 + v * 12;
      const x = b.readFloatLE(o);
      const y = b.readFloatLE(o + 4);
      const z = b.readFloatLE(o + 8);
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let k = seen.get(key);
      if (k === undefined) {
        k = pos.length / 3;
        seen.set(key, k);
        pos.push(x, z, -y);
      }
      index[i * 3 + v] = k;
    }
  return { pos: new Float32Array(pos), index };
}

await MeshoptSimplifier.ready;
const pieces = {};
for (const role of ROLES) {
  const { pos, index } = readStl(join(SRC, FILES[role]));
  const [simple, error] = MeshoptSimplifier.simplify(index, pos, 3, Math.min(index.length, TRIS * 3), 0.01, ["LockBorder"]);
  // Keep only the vertices still used, in order.
  const map = new Map();
  const out = [];
  const idx = new Uint16Array(simple.length);
  simple.forEach((v, i) => {
    let k = map.get(v);
    if (k === undefined) {
      k = map.size;
      map.set(v, k);
      out.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
    idx[i] = k;
  });
  pieces[role] = { pos: new Float32Array(out), idx };
  console.log(`${role}: ${index.length / 3} triangles to ${simple.length / 3}, ${map.size} vertices, error ${error.toFixed(4)}`);
}

// One scale for the set: the king KING_HEIGHT tall. Each piece centred on its base, standing on y = 0.
const box = (p) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  return { min, max };
};
const scale = KING_HEIGHT / (box(pieces.k.pos).max[1] - box(pieces.k.pos).min[1]);
const parts = [Buffer.from("STN1")];
for (const role of ROLES) {
  const { pos, idx } = pieces[role];
  const { min, max } = box(pos);
  const mid = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = (pos[i + k] - mid[k]) * scale;
  const b = box(pos);
  const size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const head = Buffer.alloc(8 + 24);
  head.writeUInt32LE(pos.length / 3, 0);
  head.writeUInt32LE(idx.length, 4);
  [...b.min, ...size].forEach((v, i) => head.writeFloatLE(v, 8 + i * 4));
  const q = new Uint16Array(pos.length);
  for (let i = 0; i < pos.length; i++) q[i] = Math.round(((pos[i] - b.min[i % 3]) / size[i % 3]) * 65535);
  parts.push(head, Buffer.from(q.buffer), Buffer.from(idx.buffer));
  console.log(`${role}: ${size[1].toFixed(2)} tall, ${size[0].toFixed(2)} wide`);
}
writeFileSync(OUT, Buffer.concat(parts));
console.log(`wrote ${OUT}`);
