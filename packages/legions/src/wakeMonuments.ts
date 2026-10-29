// The Wake's larger pieces, all made in code: weeping angels, a hooded mourner, two
// crypts and a chapel in ruins. They share the stones' weathering shader (moss, grime,
// dirt, pitting) and carved-and-eroded construction.
import { BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { erode, faces, slab, solid, stoneColor, weather, type StoneKind } from "./wakeStones";
import { fbm, mix, stream } from "./wakeKit";

const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** One weathered material for a figure or a building: pale old stone. */
const marble = (seed: number, moss: number, lightness = 0.3) =>
  weather(new MeshStandardMaterial({ color: new Color().setHSL(0.1, 0.05, lightness + (stream(seed)() - 0.5) * 0.05), roughness: 0.95 }), moss);

const merge = (parts: BufferGeometry[]) => {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    return g;
  });
  const m = mergeGeometries(flat)!;
  parts.forEach((p) => p.dispose());
  return m;
};

// ----- Figures -----

interface Figure {
  /** The arms: "pray" (hands together), "raise" (one up to the sky), "chest" (a hand on the heart). */
  arms: "pray" | "raise" | "chest";
  wings: "up" | "spread" | "folded" | "none";
  /** Wing feathers lost at the tips (0 none, 1 half). */
  brokenWing?: number;
  headless?: boolean;
  hood?: boolean;
  seed: number;
}

const tube = (pts: Vector3[], r: number) => new TubeGeometry(new CatmullRomCurve3(pts), 16, r, 10);

/** A feather: a long thin leaf of stone, fanned out from the shoulder. */
function feather(len: number, w: number, base: Vector3, ang: number, side: number, zOff: number) {
  const g = new SphereGeometry(0.5, 10, 6);
  g.scale(len, w, 0.022);
  g.translate(len / 2, 0, 0);
  g.rotateZ(side > 0 ? ang : Math.PI - ang);
  g.translate(base.x, base.y, base.z + zOff);
  return g;
}

function wing(side: number, a0: number, a1: number, cut: number, seed: number) {
  const r = stream(seed);
  const parts: BufferGeometry[] = [];
  const rows = [
    { n: 9, len: 1.05, w: 0.12, z: 0 },
    { n: 8, len: 0.72, w: 0.11, z: -0.02 },
    { n: 7, len: 0.46, w: 0.1, z: -0.04 },
  ];
  rows.forEach((row, j) => {
    for (let k = 0; k < row.n; k++) {
      if (j === 0 && cut > 0 && k / (row.n - 1) > 1 - cut * 0.5) continue;
      const a = mix(a0, a1, k / (row.n - 1));
      const l = row.len * (0.82 + 0.18 * Math.sin((k / (row.n - 1)) * Math.PI)) * (0.94 + r() * 0.1);
      parts.push(feather(l, row.w, at(side * 0.14, 1.42, -0.1), a + (r() - 0.5) * 0.04, side, row.z - k * 0.003));
    }
  });
  const g = merge(parts);
  g.rotateY(side * 0.45);
  return g;
}

/** A robed figure, 1.7 tall, facing +z. */
function figure(o: Figure): Mesh[] {
  const r = stream(o.seed);
  const parts: BufferGeometry[] = [];
  // The robe, flaring to the ground, with folds.
  const prof: Vector2[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    prof.push(new Vector2((o.hood ? 0.18 : 0.14) + (o.hood ? 0.26 : 0.2) * Math.pow(1 - t, 1.7) + 0.012 * Math.sin(t * 16), t * 1.38));
  }
  const robe = new LatheGeometry(prof, 56);
  const rp = robe.getAttribute("position");
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const z = rp.getZ(i);
    const t = rp.getY(i) / 1.38;
    const a = Math.atan2(z, x);
    const k = 1 + 0.09 * Math.sin(a * 9 + t * 3) * (1 - t * 0.7) + 0.04 * Math.sin(a * 17 - t * 5);
    rp.setXYZ(i, x * k, rp.getY(i), z * k * 0.82);
  }
  robe.computeVertexNormals();
  parts.push(robe);
  // Shoulders and neck.
  const sh = new SphereGeometry(0.2, 24, 14);
  sh.scale(1.05, 0.5, 0.7);
  sh.translate(0, 1.4, 0);
  parts.push(sh);
  // The head, bowed; hooded or bare.
  if (!o.headless) {
    const head = new SphereGeometry(o.hood ? 0.15 : 0.1, 24, 18);
    head.scale(1, o.hood ? 1.25 : 1.15, o.hood ? 1.1 : 1);
    head.translate(0, o.hood ? 1.58 : 1.55, 0.03);
    head.translate(0, -1.4, 0);
    head.rotateX(0.35);
    head.translate(0, 1.4, 0);
    parts.push(head);
    if (!o.hood) {
      const hair = new SphereGeometry(0.108, 20, 14);
      hair.scale(1, 1.05, 1.1);
      hair.translate(0, 1.58, -0.02);
      hair.translate(0, -1.4, 0);
      hair.rotateX(0.35);
      hair.translate(0, 1.4, 0);
      parts.push(hair);
    }
  }
  // Arms and hands.
  const arm = (pts: Vector3[], hand: Vector3) => {
    parts.push(tube(pts, 0.052));
    const h = new SphereGeometry(0.055, 14, 10);
    h.scale(0.8, 1.2, 0.8);
    h.translate(hand.x, hand.y, hand.z);
    parts.push(h);
  };
  if (o.arms === "pray") for (const s of [-1, 1]) arm([at(s * 0.2, 1.38, 0), at(s * 0.24, 1.2, 0.13), at(s * 0.03, 1.17, 0.21)], at(s * 0.02, 1.17, 0.23));
  else if (o.arms === "raise") {
    arm([at(0.2, 1.38, 0), at(0.33, 1.7, 0.05), at(0.35, 2.02, 0.06)], at(0.35, 2.06, 0.06));
    arm([at(-0.2, 1.38, 0), at(-0.28, 1.1, 0.04), at(-0.26, 0.82, 0.1)], at(-0.26, 0.78, 0.1));
  } else {
    arm([at(0.2, 1.38, 0), at(0.27, 1.18, 0.12), at(0.05, 1.25, 0.22)], at(0.03, 1.26, 0.23));
    arm([at(-0.2, 1.38, 0), at(-0.27, 1.1, 0.04), at(-0.25, 0.85, 0.1)], at(-0.25, 0.8, 0.1));
  }
  // Wings.
  const wings: BufferGeometry[] = [];
  if (o.wings === "up") for (const s of [-1, 1]) wings.push(wing(s, 0.5, 1.45, s > 0 ? (o.brokenWing ?? 0) : 0, o.seed + s));
  else if (o.wings === "spread") for (const s of [-1, 1]) wings.push(wing(s, -0.15, 1.0, s > 0 ? (o.brokenWing ?? 0) : 0, o.seed + s));
  else if (o.wings === "folded") for (const s of [-1, 1]) wings.push(wing(s, 1.3, 1.62, s > 0 ? (o.brokenWing ?? 0) : 0, o.seed + s));
  const body = merge(parts);
  erode(body, o.seed, 0.018, 0.01);
  const out = [new Mesh(body)];
  if (wings.length) {
    const wg = merge(wings);
    erode(wg, o.seed + 5, 0.01, 0.008);
    out.push(new Mesh(wg));
  }
  void r;
  return out;
}

function figureStone(id: string, name: string, note: string, o: Figure, base: { h: number; w: number }, copies: number): StoneKind {
  return {
    id,
    name,
    note,
    copies,
    radius: 1,
    build() {
      const g = new Group();
      const tint = stoneColor(o.seed);
      const m = () => faces("name", o.seed, 0.6, tint);
      g.add(solid(slab(base.w + 0.3, 0.22, base.w + 0.3, { round: 0.02, chips: 3, seed: o.seed + 1, erode: 0.9 }), m()));
      g.add(solid(slab(base.w, base.h, base.w, { round: 0.03, chips: 2, seed: o.seed + 2 }), m(), at(0, 0.22, 0)));
      g.add(solid(slab(base.w + 0.12, 0.1, base.w + 0.12, { round: 0.02, seed: o.seed + 3, erode: 0.9 }), m(), at(0, 0.22 + base.h, 0)));
      const mat = marble(o.seed, 0.55);
      const fig = new Group();
      for (const mesh of figure(o)) {
        mesh.material = mat;
        mesh.castShadow = mesh.receiveShadow = true;
        fig.add(mesh);
      }
      fig.position.y = 0.32 + base.h;
      fig.scale.setScalar(1.15);
      g.add(fig);
      if (o.headless) {
        const head = new SphereGeometry(0.1, 20, 14);
        erode(head, o.seed + 9, 0.02, 0.01);
        const h = solid(head, mat, at(0.45, 0.1, 0.55), new Vector3(0.4, 0.5, 0.3));
        g.add(h);
      }
      g.rotation.set(0.02, 0, -0.03);
      return g;
    },
  };
}

// ----- Crypts -----

const black = () => new MeshStandardMaterial({ color: 0x020202, roughness: 1 });

function mausoleum(): Group {
  const g = new Group();
  const tint = stoneColor(401);
  const m = (c: Parameters<typeof faces>[0] = "none", s = 401) => faces(c, s, 0.85, tint);
  g.add(solid(slab(3.2, 0.25, 3.0, { round: 0.03, chips: 5, seed: 401, erode: 1.1, res: 40 }), m()));
  g.add(solid(slab(2.9, 0.22, 2.7, { round: 0.03, chips: 3, seed: 402, erode: 1.1, res: 40 }), m(), at(0, 0.25, 0)));
  g.add(solid(slab(2.5, 2.1, 2.3, { round: 0.05, chips: 6, seed: 403, erode: 1.2, res: 40 }), m(), at(0, 0.47, 0)));
  // The roof: a gable of stone, with a heavy cornice under it.
  g.add(solid(slab(2.8, 0.2, 2.6, { round: 0.03, chips: 4, seed: 404, res: 40 }), m(), at(0, 2.57, 0)));
  g.add(solid(slab(2.7, 0.95, 2.5, { taper: 0.93, round: 0.03, chips: 4, seed: 405, res: 40 }), m(), at(0, 2.77, 0)));
  // The doorway: a pale frame, and the dark within.
  g.add(solid(slab(1.15, 1.75, 0.2, { top: "arch", topH: 0.45, round: 0.03, chips: 3, seed: 406 }), m(), at(0, 0.47, 1.15)));
  g.add(solid(slab(0.78, 1.5, 0.12, { top: "arch", topH: 0.38, round: 0.01, seed: 407, res: 36 }), black(), at(0, 0.47, 1.26)));
  // Columns and a lintel across the front.
  for (const s of [-1, 1]) {
    const col = new CylinderGeometry(0.15, 0.18, 1.85, 20, 24);
    col.translate(s * 1.0, 0.47 + 0.925, 1.45);
    erode(col, 410 + s, 0.025, 0.015);
    g.add(solid(col, m()[0]));
    g.add(solid(slab(0.42, 0.14, 0.42, { round: 0.02, chips: 2, seed: 412 + s, res: 40 }), m(), at(s * 1.0, 2.32, 1.45)));
  }
  g.add(solid(slab(2.7, 0.24, 0.5, { round: 0.03, chips: 3, seed: 414, res: 40 }), m(), at(0, 2.45, 1.45)));
  // Steps and a cross at the peak.
  g.add(solid(slab(1.9, 0.14, 0.5, { round: 0.02, chips: 2, seed: 415, res: 40 }), m(), at(0, 0.47, 1.6)));
  g.add(solid(slab(0.14, 0.7, 0.12, { round: 0.015, chips: 2, seed: 416, res: 50 }), m(), at(0, 3.72, 0)));
  g.add(solid(slab(0.4, 0.12, 0.12, { round: 0.015, chips: 1, seed: 417, res: 50 }), m(), at(0, 4.15, 0)));
  g.rotation.set(0, 0, 0.012);
  return g;
}

function vault(): Group {
  const g = new Group();
  const tint = stoneColor(421);
  const m = (c: Parameters<typeof faces>[0] = "none", s = 421) => faces(c, s, 0.9, tint);
  // A barrel-vaulted tomb half in the hillside.
  const barrel = new CylinderGeometry(1.2, 1.2, 3.4, 40, 40, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2);
  barrel.rotateY(Math.PI / 2);
  barrel.translate(0, 0, -1.4);
  const bp = barrel.getAttribute("position");
  for (let i = 0; i < bp.count; i++) if (bp.getY(i) < 0) bp.setY(i, 0);
  barrel.computeVertexNormals();
  erode(barrel, 421, 0.05, 0.025);
  g.add(solid(barrel, m()[0]));
  g.add(solid(slab(2.7, 1.55, 0.4, { round: 0.04, chips: 5, seed: 422, erode: 1.2, res: 40 }), m(), at(0, 0, 0.3)));
  g.add(solid(slab(1.0, 1.15, 0.22, { top: "arch", topH: 0.4, round: 0.03, chips: 3, seed: 423 }), m(), at(0, 0, 0.52)));
  g.add(solid(slab(0.72, 0.95, 0.12, { top: "arch", topH: 0.32, seed: 424, res: 36 }), black(), at(0, 0, 0.62)));
  const iron = new MeshStandardMaterial({ color: 0x2c211a, roughness: 0.7, metalness: 0.5 });
  for (let i = -3; i <= 3; i++) {
    const h = 0.95 + 0.3 * Math.sqrt(Math.max(0, 1 - Math.pow(i / 3.4, 2)));
    g.add(solid(new BoxGeometry(0.03, h, 0.03).translate(i * 0.095, h / 2, 0.66), iron));
  }
  g.add(solid(new BoxGeometry(0.7, 0.03, 0.03).translate(0, 0.5, 0.66), iron));
  // Steps down to the door.
  for (let i = 0; i < 3; i++) g.add(solid(slab(1.5 - i * 0.1, 0.1, 0.4, { round: 0.015, chips: 1, seed: 430 + i, res: 40 }), m(), at(0, -0.02 - i * 0.04, 0.82 + i * 0.38)));
  g.rotation.y = 0.04;
  return g;
}

// ----- The chapel in ruins -----

interface Opening {
  c: number;
  w: number;
  y0: number;
  y1: number;
}

function chapel(): Group {
  const r = stream(500);
  const geos: BufferGeometry[] = [];
  let seed = 500;
  const block = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, chips = 0) => {
    const b = slab(w, h, d, { round: 0.03, erode: 1.5, chips, res: 10, seed: seed++ });
    b.clearGroups();
    b.deleteAttribute("uv");
    b.rotateY(yaw);
    b.translate(x, y, z);
    geos.push(b);
  };
  const inOpening = (s: number, y: number, o: Opening) => {
    const u = Math.abs(s - o.c) / (o.w / 2);
    return u < 1 && y > o.y0 && y < o.y1 + 0.65 * (1 - Math.pow(u, 1.5));
  };
  /** A wall of stone blocks in courses, ragged where it has fallen. */
  const wall = (x0: number, z0: number, x1: number, z1: number, t: number, hmax: (s: number) => number, holes: Opening[]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const yaw = Math.atan2(-dz, dx);
    for (let y = 0; y < 5.2;) {
      const h = 0.32 + r() * 0.1;
      let s = r() * 0.25;
      while (s < len) {
        const bl = Math.min(0.5 + r() * 0.5, len - s);
        const cs = s + bl / 2;
        const gone = y + h > hmax(cs) || holes.some((o) => inOpening(cs, y + h / 2, o)) || (y > 0.7 && r() < 0.05);
        if (!gone && bl > 0.12) block(x0 + dx * cs, y, z0 + dz * cs, bl - 0.025, h - 0.02, t * (0.92 + r() * 0.16), yaw + (r() - 0.5) * 0.05, r() < 0.12 ? 1 : 0);
        s += bl;
      }
      y += h;
    }
  };
  const W = 2.5;
  const L = 4.2;
  const side = (seed0: number) => (s: number) => 1.2 + 2.3 * Math.pow(fbm(s * 0.5, 0.3, seed0, 1 << 16, 3), 1.2) + (s > 2.6 && s < 3.4 ? -1 : 0);
  const sideHoles: Opening[] = [1.4, 4.2, 7.0].map((c) => ({ c, w: 0.95, y0: 0.95, y1: 2.5 }));
  wall(-W, -L, -W, L, 0.55, side(1), sideHoles);
  wall(W, -L, W, L, 0.55, side(2), sideHoles);
  // The front, with its door and a high window, rising to the gable.
  wall(-W, L, W, L, 0.55, (s) => 1.9 + 3.1 * Math.pow(Math.max(0, 1 - Math.abs(s - W) / (W + 0.2)), 1.15) + (fbm(s * 2, 1, 3, 1 << 16, 2) - 0.5) * 0.8, [
    { c: W, w: 1.4, y0: -1, y1: 2.0 },
    { c: W, w: 0.9, y0: 2.75, y1: 3.7 },
  ]);
  // The back, low and jagged, with a tall window and an altar before it.
  wall(-W, -L, W, -L, 0.55, (s) => 1.0 + 2.0 * fbm(s * 0.9, 2, 4, 1 << 16, 3), [{ c: W, w: 1.0, y0: 1.0, y1: 2.6 }]);
  block(0, 0, -L + 1.0, 1.5, 0.95, 0.7, 0.05, 2);
  block(0, 0.95, -L + 1.0, 1.7, 0.12, 0.85, 0.05, 1);
  // Flagstones on the floor and rubble where the walls have fallen.
  for (let i = 0; i < 12; i++) {
    const b = slab(0.9, 0.08, 0.8, { round: 0.02, erode: 1.2, res: 10, seed: seed++ });
    b.clearGroups();
    b.deleteAttribute("uv");
    b.rotateX((r() - 0.5) * 0.08);
    b.rotateY(r() * 6);
    b.translate((r() - 0.5) * 3.8, 0, (r() - 0.5) * 7);
    geos.push(b);
  }
  for (let i = 0; i < 34; i++) {
    const a = r() * 6.3;
    const near = r() < 0.6;
    const x = near ? (r() < 0.5 ? -1 : 1) * (W + (r() - 0.3) * 2.2) : (r() - 0.5) * 4;
    const z = near ? (r() - 0.5) * 9 : (r() - 0.5) * 7.5;
    block(x, 0, z, 0.3 + r() * 0.5, 0.2 + r() * 0.3, 0.3 + r() * 0.4, a, 1);
  }
  const mesh = new Mesh(merge(geos), marble(500, 0.8, 0.26));
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new Group();
  g.add(mesh);
  return g;
}

export const MONUMENTS: StoneKind[] = [
  figureStone("angel-praying", "Praying angel", "Wings raised, head bowed, hands together.", { arms: "pray", wings: "up", seed: 301 }, { h: 0.8, w: 0.8 }, 2),
  figureStone("angel-raised", "Angel pointing up", "One arm to the sky, wings low, one wing broken.", { arms: "raise", wings: "spread", brokenWing: 1, seed: 311 }, { h: 0.7, w: 0.8 }, 1),
  figureStone("angel-fallen", "Headless angel", "Wings folded, head fallen from the shoulders.", { arms: "chest", wings: "folded", headless: true, seed: 321 }, { h: 1.3, w: 0.7 }, 1),
  figureStone("mourner", "Hooded mourner", "A cloaked figure, a hand over the heart.", { arms: "chest", wings: "none", hood: true, seed: 331 }, { h: 0.6, w: 0.8 }, 2),
  { id: "mausoleum", name: "Mausoleum", note: "A columned crypt with a dark doorway.", copies: 1, radius: 2.4, build: mausoleum },
  { id: "vault", name: "Vault in the hillside", note: "A barrel-vaulted tomb with an iron gate and steps down.", copies: 1, radius: 2.4, build: vault },
  { id: "chapel", name: "Ruined chapel", note: "A roofless chapel, its walls fallen unevenly.", copies: 1, radius: 6, build: chapel },
];
