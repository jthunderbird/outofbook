// The Staunton tribe: Chess Legions' starter tribe, a classic turned chess set
// (boxwood for light, ebony for dark). Its pieces are wood, not warriors: they
// slide to their square, the knight hops, and a capture knocks the other piece
// over with a wooden clack before it sinks into the board.
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  SplineCurve,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { squareAt } from "./board";
import { Fig, type Role, type Side } from "./figures";
import { ease, ownMaterials, tween, wait } from "./fx";
import type { Stage, Tribe, TribeMove } from "./tribe";

const WOOD: Record<Side, { color: number; rough: number }> = {
  w: { color: 0xe8d6b4, rough: 0.45 },
  b: { color: 0x2c2422, rough: 0.35 },
};

const wood = (side: Side) => new MeshStandardMaterial({ color: WOOD[side].color, roughness: WOOD[side].rough, metalness: 0.05 });

function part(geo: BufferGeometry, m: Material, y = 0) {
  const o = new Mesh(geo, m);
  o.position.y = y;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A turned body from a profile of [radius, height] points, bottom to top. */
const turned = (pts: [number, number][]) => new LatheGeometry(new SplineCurve(pts.map(([x, y]) => new Vector2(x, y))).getPoints(pts.length * 6), 32);

/** The foot every piece stands on: a wide base with a bead, narrowing up into the stem. */
const BASE: [number, number][] = [
  [0.001, 0],
  [0.34, 0],
  [0.35, 0.04],
  [0.32, 0.08],
  [0.27, 0.1],
  [0.28, 0.13],
  [0.22, 0.16],
];

const PROFILES: Record<Exclude<Role, "n">, [number, number][]> = {
  p: [...BASE, [0.15, 0.24], [0.12, 0.36], [0.17, 0.4], [0.1, 0.44], [0.001, 0.44]],
  r: [...BASE, [0.21, 0.3], [0.2, 0.62], [0.26, 0.66], [0.26, 0.8], [0.001, 0.8]],
  b: [...BASE, [0.15, 0.28], [0.1, 0.62], [0.17, 0.66], [0.1, 0.7], [0.001, 0.7]],
  q: [...BASE, [0.17, 0.3], [0.1, 0.8], [0.2, 0.86], [0.12, 0.9], [0.22, 1.02], [0.001, 1.02]],
  k: [...BASE, [0.18, 0.3], [0.11, 0.86], [0.21, 0.92], [0.13, 0.96], [0.2, 1.06], [0.001, 1.08]],
};

const SCALE = 1.15;
/** The figure's height (to its top ornament), for effects that aim at it. */
const HEIGHT: Record<Role, number> = { p: 0.56 * SCALE, n: 0.82 * SCALE, b: 0.98 * SCALE, r: 0.8 * SCALE, q: 1.12 * SCALE, k: 1.34 * SCALE };

function knightHead(m: Material) {
  // A horse's head in profile, extruded and bevelled; it faces +z.
  const s = new Shape();
  s.moveTo(-0.14, 0);
  s.lineTo(0.16, 0);
  s.bezierCurveTo(0.17, 0.12, 0.1, 0.2, 0.2, 0.32);
  s.bezierCurveTo(0.26, 0.38, 0.26, 0.44, 0.2, 0.47);
  s.lineTo(0.06, 0.44);
  s.bezierCurveTo(0.04, 0.52, -0.02, 0.58, -0.08, 0.6);
  s.lineTo(-0.1, 0.66);
  s.lineTo(-0.14, 0.58);
  s.bezierCurveTo(-0.2, 0.46, -0.2, 0.2, -0.14, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -0.06);
  g.rotateY(-Math.PI / 2);
  return part(g, m, 0.2);
}

function stauntonFigure(role: Role, side: Side): Fig {
  const f = new Fig(role, side, HEIGHT[role]);
  const m = wood(side);
  if (role === "n") {
    f.body.add(part(turned([...BASE, [0.2, 0.2], [0.001, 0.22]]), m));
    f.body.add(knightHead(m));
  } else f.body.add(part(turned(PROFILES[role]), m));
  if (role === "p") f.body.add(part(new SphereGeometry(0.12, 24, 16), m, 0.5));
  if (role === "b") {
    f.body.add(part(new SphereGeometry(0.15, 24, 16).scale(1, 1.35, 1), m, 0.8));
    f.body.add(part(new SphereGeometry(0.04, 12, 8), m, 0.98));
  }
  if (role === "r")
    for (let i = 0; i < 4; i++) {
      const merlon = part(new BoxGeometry(0.1, 0.09, 0.08), m, 0.84);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      merlon.position.x = Math.cos(a) * 0.19;
      merlon.position.z = Math.sin(a) * 0.19;
      merlon.rotation.y = -a;
      f.body.add(merlon);
    }
  if (role === "q") {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bead = part(new SphereGeometry(0.035, 12, 8), m, 1.04);
      bead.position.x = Math.cos(a) * 0.19;
      bead.position.z = Math.sin(a) * 0.19;
      f.body.add(bead);
    }
    f.body.add(part(new SphereGeometry(0.07, 16, 10), m, 1.06));
  }
  if (role === "k") {
    f.body.add(part(new BoxGeometry(0.06, 0.22, 0.06), m, 1.2));
    f.body.add(part(new BoxGeometry(0.18, 0.06, 0.06), m, 1.22));
  }
  f.body.add(part(new CylinderGeometry(0.335, 0.335, 0.004, 32), new MeshStandardMaterial({ color: 0x2f5a33, roughness: 1 }), 0.002));
  // A touch larger than a real set, so the pieces read from the camera's height.
  // (Scaled inside body: kills squash and shrink body itself.)
  const inner = new Group();
  inner.add(...f.body.children);
  inner.scale.setScalar(SCALE);
  f.body.add(inner);
  f.mats = ownMaterials(f.body);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}

export const staunton: Tribe = {
  id: "staunton",
  name: "The Staunton tribe",
  figure: stauntonFigure,
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
