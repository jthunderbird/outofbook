// The Staunton tribe: Chess Legions' starter tribe, a classic turned chess set
// (boxwood for light, ebony for dark). Its pieces are wood, not warriors: they
// slide to their square, the knight hops, and a capture knocks the other piece
// over with a wooden clack before it sinks into the board.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry as Geometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  SplineCurve,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { squareAt } from "./board";
import { pieceWood } from "./wood";
import { Fig, type Role, type Side } from "./figures";
import { ease, ownMaterials, tween, wait } from "./fx";
import type { Stage, Tribe, TribeMove } from "./tribe";

/** Turned boxwood or ebonized wood, French-polished: a visible grain and a deep, glossy shine. */
const wood = (side: Side) =>
  new MeshPhysicalMaterial({
    map: pieceWood(side === "w"),
    roughness: side === "w" ? 0.34 : 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    specularIntensity: 1,
    metalness: 0,
  });

function part(geo: BufferGeometry, m: Material, y = 0) {
  const o = new Mesh(geo, m);
  o.position.y = y;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/**
 * A turned body from a profile of [radius, height] points, bottom to top. A
 * third value of 1 marks a sharp edge (a collar's rim, a foot's corner): the
 * profile is smoothed between sharp points but never across them, as on a lathe.
 */
type Pt = [number, number, number?];
function turned(pts: Pt[]) {
  const out: Vector2[] = [];
  let run: Vector2[] = [];
  const flush = () => {
    if (run.length > 2) out.push(...new SplineCurve(run).getPoints(run.length * 6));
    else out.push(...run);
    run = [];
  };
  for (const [x, y, sharp] of pts) {
    run.push(new Vector2(x, y));
    if (sharp) {
      flush();
      run.push(new Vector2(x, y));
    }
  }
  flush();
  return new LatheGeometry(out, 48);
}

/** The foot every piece stands on: a flat disc, a bead, then an ogee sweeping into the stem. */
const foot = (r: number): Pt[] => [
  [0.001, 0, 1],
  [r, 0, 1],
  [r, 0.035, 1],
  [r - 0.03, 0.05, 1],
  [r - 0.03, 0.075, 1],
  [r - 0.1, 0.1],
  [r - 0.165, 0.17],
];

/**
 * The classic Staunton set's proportions, in squares of a 2.25" tournament
 * board: a 3.75" king is 1.67 squares tall on a 1.5" base, the pawn about half
 * the king. Every piece is a stepped foot, a long stem curving in concavely,
 * a flat collar, then its head.
 */
const PROFILES: Record<Exclude<Role, "n">, Pt[]> = {
  p: [...foot(0.25), [0.095, 0.3], [0.075, 0.4], [0.08, 0.45, 1], [0.19, 0.46, 1], [0.19, 0.5, 1], [0.1, 0.52, 1], [0.09, 0.56], [0.001, 0.58, 1]],
  r: [...foot(0.29), [0.15, 0.3], [0.13, 0.5], [0.17, 0.62], [0.27, 0.66, 1], [0.27, 0.84, 1], [0.2, 0.84, 1], [0.001, 0.84, 1]],
  b: [
    ...foot(0.29),
    [0.13, 0.32],
    [0.095, 0.55],
    [0.09, 0.7, 1],
    [0.2, 0.71, 1],
    [0.2, 0.76, 1],
    [0.11, 0.78, 1],
    [0.1, 0.82],
    [0.13, 0.86],
    [0.18, 0.95],
    [0.17, 1.05],
    [0.12, 1.14],
    [0.05, 1.2],
    [0.03, 1.22, 1],
    [0.001, 1.22, 1],
  ],
  q: [
    ...foot(0.315),
    [0.14, 0.34],
    [0.1, 0.6],
    [0.095, 0.82, 1],
    [0.23, 0.84, 1],
    [0.23, 0.9, 1],
    [0.12, 0.92, 1],
    [0.11, 0.97],
    [0.17, 1.06],
    [0.24, 1.2],
    [0.26, 1.31, 1],
    [0.2, 1.33, 1],
    [0.001, 1.33, 1],
  ],
  k: [
    ...foot(0.335),
    [0.15, 0.36],
    [0.11, 0.66],
    [0.1, 0.94, 1],
    [0.25, 0.96, 1],
    [0.25, 1.02, 1],
    [0.13, 1.04, 1],
    [0.12, 1.09],
    [0.19, 1.18],
    [0.26, 1.32],
    [0.26, 1.42, 1],
    [0.2, 1.44, 1],
    [0.001, 1.44, 1],
  ],
};

/** The figure's height (to its top ornament), for effects that aim at it: the real set's (models/staunton.bin). */
const HEIGHT: Record<Role, number> = { p: 0.98, n: 1.22, b: 1.28, r: 1.08, q: 1.44, k: 1.72 };

// The pieces of a real Staunton set (meshes built by scripts/staunton.mjs). Until they have loaded, turned stand-ins take their place.
const BIN = Object.values(import.meta.glob<string>("../models/staunton.bin", { eager: true, query: "?url", import: "default" }))[0];
const ROLES: Role[] = ["k", "q", "r", "b", "n", "p"];
const meshes = new Map<Role, Geometry>();
let loading: Promise<void> | null = null;
function loadSet() {
  loading ??= fetch(BIN)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const v = new DataView(buf);
      let at = 4;
      for (const role of ROLES) {
        const verts = v.getUint32(at, true);
        const count = v.getUint32(at + 4, true);
        const box = Array.from({ length: 6 }, (_, i) => v.getFloat32(at + 8 + i * 4, true));
        at += 32;
        const q = new Uint16Array(buf.slice(at, at + verts * 6));
        at += verts * 6;
        const index = new Uint16Array(buf.slice(at, at + count * 2));
        at += count * 2;
        const pos = new Float32Array(verts * 3);
        for (let i = 0; i < pos.length; i++) pos[i] = box[i % 3] + (q[i] / 65535) * box[3 + (i % 3)];
        const g = new Geometry();
        g.setAttribute("position", new BufferAttribute(pos, 3));
        g.setIndex(new BufferAttribute(index, 1));
        // Smooth where the wood is turned, sharp at collars and cuts.
        const c = toCreasedNormals(g, 0.6);
        // The grain runs up the piece: u round it, v up it.
        const p = c.attributes.position;
        const uv = new Float32Array(p.count * 2);
        for (let i = 0; i < p.count; i++) {
          uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5;
          uv[i * 2 + 1] = p.getY(i) / box[4];
        }
        c.setAttribute("uv", new BufferAttribute(uv, 2));
        meshes.set(role, c);
      }
    })
    .catch((e) => console.error("staunton", e));
  return loading;
}

/**
 * A knight's head, carved in profile as on any tournament set: a thick arched
 * neck with a flowing mane, pricked ears, a flat forehead running down a long
 * nose to a blunt muzzle, a nostril and a rounded jaw. It faces +z.
 */
function knightHead(m: Material) {
  const s = new Shape();
  s.moveTo(-0.22, 0);
  s.lineTo(0.22, 0);
  // Chest, then the throat curving in to the jaw.
  s.bezierCurveTo(0.26, 0.1, 0.2, 0.2, 0.12, 0.3);
  s.bezierCurveTo(0.16, 0.38, 0.24, 0.4, 0.3, 0.4);
  // Jaw to chin, the blunt muzzle, and up the long nose.
  s.bezierCurveTo(0.38, 0.4, 0.43, 0.44, 0.42, 0.52);
  s.bezierCurveTo(0.41, 0.57, 0.36, 0.6, 0.31, 0.64);
  // The flat forehead rising to the ears.
  s.bezierCurveTo(0.25, 0.7, 0.2, 0.76, 0.16, 0.82);
  s.lineTo(0.14, 0.94);
  s.lineTo(0.07, 0.86);
  s.lineTo(0.0, 0.94);
  s.lineTo(-0.02, 0.82);
  // The mane running down the arched back of the neck.
  s.bezierCurveTo(-0.14, 0.78, -0.3, 0.66, -0.3, 0.46);
  s.bezierCurveTo(-0.3, 0.28, -0.26, 0.12, -0.22, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 10, curveSegments: 32 });
  g.translate(0, 0, -0.08);
  g.rotateY(-Math.PI / 2);
  const head = new Group();
  head.add(part(g, m));
  // Eyes, dark either side of the head, and nostrils on the muzzle.
  const dark = new MeshStandardMaterial({ color: 0x0a0605, roughness: 0.25 });
  for (const x of [-0.145, 0.145]) {
    head.add(
      part(new SphereGeometry(0.026, 12, 10), dark, 0.64)
        .translateX(x)
        .translateZ(0.25),
    );
    head.add(
      part(new SphereGeometry(0.02, 10, 8), dark, 0.5)
        .translateX(x * 0.8)
        .translateZ(0.46),
    );
  }
  head.position.y = 0.22;
  // Turned a little to the side, so the horse's profile reads from the player's seat.
  head.rotation.y = 0.55;
  return head;
}

/** Evenly spaced small parts round a circle of radius r at height y. */
function ring(f: Fig, make: () => Mesh, n: number, r: number, y: number, face = false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const o = make();
    o.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    if (face) o.rotation.y = -a;
    f.body.add(o);
  }
}

function stauntonFigure(role: Role, side: Side): Fig {
  const f = new Fig(role, side, HEIGHT[role]);
  const m = wood(side);
  const cut = new MeshStandardMaterial({ color: side === "w" ? 0x6a4526 : 0x050303, roughness: 0.7 });
  const real = meshes.get(role);
  if (real) {
    const piece = part(real, m);
    // The knight's horse looks along +x in the set; it is turned to face the other side, a little to the side so its profile reads from the player's seat.
    if (role === "n") piece.rotation.y = -Math.PI / 2 + 0.55;
    f.body.add(piece);
  } else if (role === "n") {
    f.body.add(part(turned([...foot(0.29), [0.2, 0.2], [0.2, 0.24, 1], [0.001, 0.24, 1]]), m));
    f.body.add(knightHead(m));
  } else f.body.add(part(turned(PROFILES[role]), m));
  if (!real) standIn(f, role, m, cut);
  f.body.add(part(new CylinderGeometry(0.31, 0.31, 0.004, 40), new MeshStandardMaterial({ color: 0x24502c, roughness: 1 }), 0.002));
  f.mats = ownMaterials(f.body);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}

/** The turned stand-ins' ornaments: the pawn's ball, the mitre's cut, the battlement, the coronet, the cross. */
function standIn(f: Fig, role: Role, m: Material, cut: Material) {
  if (role === "p") f.body.add(part(new SphereGeometry(0.15, 40, 24), m, 0.68));
  if (role === "b") {
    // The mitre's slanted cut across the head, and a finial ball on top.
    f.body.add(part(new SphereGeometry(0.05, 20, 14), m, 1.25));
    const slit = part(new BoxGeometry(0.03, 0.2, 0.4), cut, 1.0);
    slit.rotation.x = 0.7;
    slit.position.z = 0.05;
    f.body.add(slit);
  }
  if (role === "r") {
    // The turret's battlement: four merlons with a gap between each.
    for (let i = 0; i < 4; i++) f.body.add(part(new CylinderGeometry(0.27, 0.27, 0.12, 12, 1, false, (i / 4) * Math.PI * 2 + 0.3, 0.97), m, 0.9));
  }
  if (role === "q") {
    // A coronet: a ring of beads on the rim, and a ball above.
    ring(f, () => part(new SphereGeometry(0.04, 14, 10), m), 9, 0.22, 1.34);
    f.body.add(part(new SphereGeometry(0.085, 24, 16), m, 1.42));
  }
  if (role === "k") {
    // A cross on the crown's flat top.
    f.body.add(part(new BoxGeometry(0.07, 0.3, 0.07), m, 1.6));
    f.body.add(part(new BoxGeometry(0.2, 0.07, 0.07), m, 1.63));
  }
}

export const staunton: Tribe = {
  id: "staunton",
  name: "The Staunton tribe",
  figure: stauntonFigure,
  ready: loadSet,
  play: (stage, move) => play(stage, move),
};

/** Slides (or, for a knight, hops) from where f stands to b. */
function travel(stage: Stage, f: Fig, b: Vector3, hop: boolean) {
  const a = f.root.position.clone();
  const dist = a.distanceTo(b);
  const ms = hop ? 520 : Math.max(320, dist * 190);
  return tween(stage.clock, ms, (t) => f.root.position.set(a.x + (b.x - a.x) * t, hop ? Math.sin(Math.PI * t) * 0.7 : Math.sin(Math.PI * t) * 0.04, a.z + (b.z - a.z) * t), ease.inOut);
}

/** Knocked over away from the blow, then sunk into the board and gone. */
async function knockOver(stage: Stage, v: Fig, dir: Vector3) {
  const axis = new Vector3(dir.z, 0, -dir.x).normalize();
  const start = v.root.quaternion.clone();
  stage.sound.play(Math.random() < 0.5 ? "wood1" : "wood2", { gain: 0.8 });
  await tween(
    stage.clock,
    300,
    (t) => {
      v.root.quaternion.copy(start);
      v.root.rotateOnWorldAxis(axis, (Math.PI / 2) * t);
    },
    ease.in,
  );
  stage.sound.play("knock", { gain: 0.6 });
  stage.fx.dust(v.root.position, 8, 0xd8cdb8);
  await wait(stage.clock, 250);
  const y = v.root.position.y;
  await tween(stage.clock, 380, (t) => (v.root.position.y = y - 0.5 * t));
  v.root.removeFromParent();
}

async function play(stage: Stage, { mover, to, victim, castle }: TribeMove) {
  const hop = mover.role === "n";
  if (castle) {
    // The king steps over first, then the rook slides round him.
    await travel(stage, mover, squareAt(to), false);
    stage.sound.play("wood1", { gain: 0.5 });
    await travel(stage, castle.rook, squareAt(castle.to), false);
    stage.sound.play("wood2", { gain: 0.5 });
    return;
  }
  const b = squareAt(to);
  if (victim) {
    // Up to the piece, a knock that sends it over, then onto its square.
    const at = victim.root.position.clone();
    const dir = at.clone().sub(mover.root.position).setY(0);
    const short = at.clone().sub(dir.clone().normalize().multiplyScalar(0.55));
    await travel(stage, mover, dist(mover, short) > 0.05 ? short : at, hop);
    void knockOver(stage, victim, dir);
    await wait(stage.clock, 260);
  }
  await travel(stage, mover, b, hop && !victim);
  stage.sound.play(hop ? "knock" : Math.random() < 0.5 ? "wood1" : "wood2", { gain: 0.55 });
}

const dist = (f: Fig, p: Vector3) => f.root.position.distanceTo(p);
