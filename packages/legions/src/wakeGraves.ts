// The rest of The Wake's headstones and grave markers (the first nine are in wakeStones.ts),
// and the whole list in one place: stones, monuments, crypts and the ruined chapel.
import { CylinderGeometry, Group, LatheGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { erode, faces, slab, solid, stoneColor, STONES, weather, type StoneKind } from "./wakeStones";
import { MONUMENTS } from "./wakeMonuments";
import { fbm, smooth } from "./wakeKit";

const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A heap of fresh-ish dirt for a grave, its edge ragged. */
function mound(w: number, l: number, seed: number) {
  const g = new SphereGeometry(1, 36, 18);
  g.scale(w / 2, 0.16, l / 2);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
  g.computeVertexNormals();
  erode(g, seed, 0.05, 0.03);
  const m = weather(new MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), 0.45, 0.05);
  return solid(g, m);
}

const MORE: StoneKind[] = [
  {
    id: "arch-small",
    name: "Child's headstone",
    note: "Small, round-topped, leaning.",
    copies: 3,
    radius: 0.5,
    build() {
      const g = new Group();
      g.add(solid(slab(0.62, 0.95, 0.16, { top: "arch", topH: 0.3, chips: 2, seed: 101 }), faces("name", 101, 0.7)));
      g.rotation.set(0.04, 0, 0.08);
      return g;
    },
  },
  {
    id: "arch-wide",
    name: "Wide family stone",
    note: "Broad and low, a bordered verse.",
    copies: 2,
    radius: 0.9,
    build() {
      const g = new Group();
      g.add(solid(slab(1.25, 1.15, 0.2, { top: "arch", topH: 0.4, chips: 4, seed: 111 }), faces("scroll", 111, 0.6)));
      g.rotation.set(-0.02, 0.03, -0.05);
      return g;
    },
  },
  {
    id: "gothic-tall",
    name: "Tall gothic stone",
    note: "A narrow pointed shaft with a carved cross.",
    copies: 2,
    radius: 0.6,
    build() {
      const g = new Group();
      g.add(solid(slab(0.7, 2.1, 0.2, { top: "gothic", topH: 0.62, chips: 3, seed: 121 }), faces("cross", 121, 0.5)));
      g.rotation.set(0.03, 0.1, 0.07);
      return g;
    },
  },
  {
    id: "flat-top",
    name: "Square-topped stone",
    note: "A plain squared slab, corners knocked off.",
    copies: 3,
    radius: 0.7,
    build() {
      const g = new Group();
      g.add(solid(slab(0.95, 1.25, 0.2, { round: 0.05, chips: 5, seed: 131 }), faces("name", 131, 0.65)));
      g.rotation.set(-0.03, -0.06, 0.03);
      return g;
    },
  },
  {
    id: "twin",
    name: "Leaning pair",
    note: "Two slabs fallen against each other.",
    copies: 1,
    radius: 1,
    build() {
      const g = new Group();
      const tint = stoneColor(141);
      g.add(solid(slab(0.85, 1.2, 0.15, { top: "arch", topH: 0.3, chips: 2, seed: 141 }), faces("rip", 141, 0.7, tint), at(-0.48, 0, 0), new Vector3(0, 0.1, -0.28)));
      g.add(solid(slab(0.8, 1.1, 0.15, { top: "ogee", topH: 0.3, chips: 3, seed: 142 }), faces("name", 142, 0.8, tint), at(0.5, 0, 0.05), new Vector3(0, -0.12, 0.3)));
      return g;
    },
  },
  {
    id: "broken-low",
    name: "Snapped low stone",
    note: "Only the stump of a stone remains.",
    copies: 3,
    radius: 0.7,
    build() {
      const g = new Group();
      const tint = stoneColor(151);
      g.add(solid(slab(0.8, 0.75, 0.18, { top: "broken", topH: 0.4, chips: 3, seed: 151, erode: 1.4 }), faces("name", 151, 0.85, tint)));
      g.add(solid(slab(0.55, 0.3, 0.18, { top: "arch", topH: 0.2, chips: 2, seed: 152, erode: 1.4 }), faces("none", 152, 0.9, tint), at(-0.5, 0.02, 0.5), new Vector3(-Math.PI / 2 + 0.1, 0.2, 0.6)));
      g.rotation.y = 0.15;
      return g;
    },
  },
  {
    id: "latin-cross",
    name: "Stone cross",
    note: "A plain Latin cross on a block.",
    copies: 3,
    radius: 0.7,
    build() {
      const g = new Group();
      const tint = stoneColor(161);
      const m = (c: Parameters<typeof faces>[0], s: number) => faces(c, s, 0.6, tint);
      g.add(solid(slab(0.75, 0.3, 0.6, { round: 0.03, chips: 3, seed: 161, erode: 0.9 }), m("name", 161)));
      g.add(solid(slab(0.22, 1.7, 0.2, { round: 0.03, chips: 2, seed: 162 }), m("none", 162), at(0, 0.3, 0)));
      g.add(solid(slab(0.8, 0.2, 0.2, { round: 0.03, chips: 3, seed: 163 }), m("none", 163), at(0, 1.35, 0)));
      g.rotation.set(0.04, 0.1, -0.06);
      return g;
    },
  },
  {
    id: "celtic-big",
    name: "Great ringed cross",
    note: "A tall cross with a wide ring, on three steps.",
    copies: 1,
    radius: 1.1,
    build() {
      const g = new Group();
      const tint = stoneColor(171);
      const m = (c: Parameters<typeof faces>[0], s: number) => faces(c, s, 0.65, tint);
      g.add(solid(slab(1.3, 0.2, 1.0, { round: 0.03, chips: 3, seed: 171, erode: 0.9 }), m("none", 171)));
      g.add(solid(slab(1.0, 0.2, 0.75, { round: 0.03, seed: 172, erode: 0.9 }), m("none", 172), at(0, 0.2, 0)));
      g.add(solid(slab(0.75, 0.42, 0.55, { round: 0.03, chips: 2, seed: 173 }), m("name", 173), at(0, 0.4, 0)));
      g.add(solid(slab(0.28, 2.1, 0.24, { round: 0.04, chips: 3, seed: 174 }), m("none", 174), at(0, 0.82, 0)));
      g.add(solid(slab(1.05, 0.28, 0.24, { round: 0.04, chips: 4, seed: 175 }), m("none", 175), at(0, 2.0, 0)));
      g.add(solid(new TorusGeometry(0.42, 0.065, 20, 64), m("none", 176)[0], at(0, 2.14, 0)));
      g.rotation.set(0.02, -0.2, 0.05);
      return g;
    },
  },
  {
    id: "broken-cross",
    name: "Broken cross",
    note: "The arm has fallen; the stem is snapped short.",
    copies: 2,
    radius: 0.9,
    build() {
      const g = new Group();
      const tint = stoneColor(181);
      g.add(solid(slab(0.7, 0.26, 0.55, { round: 0.03, chips: 3, seed: 181, erode: 1.2 }), faces("name", 181, 0.75, tint)));
      g.add(solid(slab(0.22, 1.05, 0.2, { top: "broken", topH: 0.22, chips: 3, seed: 182, erode: 1.3 }), faces("none", 182, 0.75, tint), at(0, 0.26, 0)));
      g.add(solid(slab(0.75, 0.2, 0.2, { round: 0.03, chips: 3, seed: 183, erode: 1.3 }), faces("none", 183, 0.9, tint), at(0.45, 0, 0.62), new Vector3(0.05, 0.5, 0.1)));
      g.rotation.set(0.03, 0.2, -0.08);
      return g;
    },
  },
  {
    id: "column",
    name: "Broken column",
    note: "A column cut short, jagged where it was broken.",
    copies: 2,
    radius: 0.7,
    build() {
      const g = new Group();
      const tint = stoneColor(191);
      const mats = faces("name", 191, 0.7, tint);
      g.add(solid(slab(0.7, 0.4, 0.7, { round: 0.03, chips: 3, seed: 191, erode: 0.9 }), mats));
      const col = new CylinderGeometry(0.2, 0.25, 1.5, 24, 34);
      const p = col.getAttribute("position");
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.55) p.setY(i, p.getY(i) - smooth(0.45, 0.75, p.getY(i)) * (0.1 + fbm(p.getX(i) * 8 + 5, p.getZ(i) * 8, 19, 1 << 16, 3) * 0.55));
      col.computeVertexNormals();
      col.translate(0, 0.4 + 0.75, 0);
      erode(col, 192, 0.03, 0.02);
      g.add(solid(col, mats[0]));
      g.rotation.set(0.02, 0.4, 0.05);
      return g;
    },
  },
  {
    id: "urn-tall",
    name: "Tall urn",
    note: "A slim urn with a lid on a tall pedestal.",
    copies: 1,
    radius: 0.6,
    build() {
      const g = new Group();
      const tint = stoneColor(201);
      const m = (c: Parameters<typeof faces>[0], s: number) => faces(c, s, 0.6, tint);
      g.add(solid(slab(0.7, 0.2, 0.7, { round: 0.02, chips: 2, seed: 201, erode: 0.9 }), m("none", 201)));
      g.add(solid(slab(0.46, 1.1, 0.46, { round: 0.03, chips: 2, seed: 202 }), m("name", 202), at(0, 0.2, 0)));
      g.add(solid(slab(0.6, 0.12, 0.6, { round: 0.03, seed: 203, erode: 0.9 }), m("none", 203), at(0, 1.3, 0)));
      const prof: Vector2[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const belly = Math.sin(Math.pow(t, 0.9) * Math.PI * 0.95) * 0.15;
        const lid = smooth(0.8, 0.86, t) * (1 - smooth(0.86, 1, t)) * 0.07;
        prof.push(new Vector2(0.04 + belly + lid + (1 - smooth(0, 0.1, t)) * 0.06, t * 0.8));
      }
      const urn = new LatheGeometry(prof, 48);
      urn.translate(0, 1.42, 0);
      erode(urn, 204, 0.02, 0.012);
      g.add(solid(urn, m("none", 205)[0]));
      g.rotation.set(0, -0.2, 0.03);
      return g;
    },
  },
  {
    id: "sarcophagus",
    name: "Sarcophagus",
    note: "A gabled stone chest, its lid slipped aside.",
    copies: 1,
    radius: 1.3,
    build() {
      const g = new Group();
      const tint = stoneColor(211);
      g.add(solid(slab(1.1, 0.6, 2.0, { round: 0.04, chips: 4, seed: 211, erode: 1.2 }), faces("name", 211, 0.85, tint)));
      g.add(solid(slab(1.2, 0.5, 2.1, { taper: 0.6, round: 0.03, chips: 5, seed: 212, erode: 1.2 }), faces("none", 212, 0.9, tint), at(0.12, 0.6, 0.1), new Vector3(0, 0.1, 0.04)));
      g.rotation.y = 0.3;
      return g;
    },
  },
  {
    id: "skull",
    name: "Memento stone",
    note: "A skull and crossed bones carved above the name.",
    copies: 2,
    radius: 0.7,
    build() {
      const g = new Group();
      g.add(solid(slab(0.9, 1.3, 0.2, { top: "arch", topH: 0.34, chips: 3, seed: 221 }), faces("skull", 221, 0.55)));
      g.rotation.set(0.02, -0.05, 0.04);
      return g;
    },
  },
  {
    id: "kerb",
    name: "Kerbed grave",
    note: "A stone kerb round a mound, a small headstone at its head.",
    copies: 2,
    radius: 1.5,
    build() {
      const g = new Group();
      const tint = stoneColor(231);
      const km = () => faces("none", 231, 0.7, tint)[0];
      for (const [w, l, x, z] of [
        [0.14, 2.1, -0.62, 0],
        [0.14, 2.1, 0.62, 0],
        [1.38, 0.14, 0, -1.0],
        [1.38, 0.14, 0, 1.0],
      ] as const)
        g.add(solid(slab(w, 0.2, l, { round: 0.02, chips: 1, seed: 232 + Math.round(x * 10 + z * 3), erode: 1.1 }), km(), at(x, 0, z)));
      g.add(mound(1.1, 1.9, 233));
      g.add(solid(slab(0.6, 0.85, 0.12, { top: "arch", topH: 0.25, chips: 2, seed: 234 }), faces("name", 234, 0.7, tint), at(0, 0, -1.2)));
      g.rotation.y = 0.1;
      return g;
    },
  },
  {
    id: "wood-mound",
    name: "Wooden cross on a mound",
    note: "A poor grave: a leaning wooden cross over bare dirt.",
    copies: 3,
    radius: 1,
    build() {
      const g = new Group();
      g.add(mound(0.9, 1.7, 241));
      const wood = weather(new MeshStandardMaterial({ color: 0x4a3c2e, roughness: 0.95 }), 0.35, 0.04);
      const stem = slab(0.09, 1.1, 0.07, { round: 0.01, chips: 1, seed: 242, res: 40, erode: 1.4 });
      const arm = slab(0.5, 0.08, 0.07, { round: 0.01, chips: 1, seed: 243, res: 40, erode: 1.4 });
      const cross = new Group();
      cross.add(solid(stem, wood), solid(arm, wood, at(0, 0.72, 0)));
      cross.position.set(0, 0.05, -0.65);
      cross.rotation.set(0.12, 0.2, -0.22);
      g.add(cross);
      return g;
    },
  },
];

for (const k of MORE) k.copies = Math.min(3, k.copies ?? 2);

/** Every grave marker in the court, each with how many may stand in it. */
export const GRAVES: StoneKind[] = [...STONES, ...MORE, ...MONUMENTS];
