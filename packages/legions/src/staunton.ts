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
import { squareAt } from "./board";
import { pieceWood } from "./wood";
import { Fig, type Role, type Side } from "./figures";
import { ease, ownMaterials, tween, wait } from "./fx";
import type { Stage, Tribe, TribeMove } from "./tribe";

/** Turned boxwood or ebony with a varnished shine; the grain runs up the piece. */
const wood = (side: Side) => new MeshPhysicalMaterial({ map: pieceWood(side === "w"), roughness: side === "w" ? 0.5 : 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, metalness: 0 });

function part(geo: BufferGeometry, m: Material, y = 0) {
  const o = new Mesh(geo, m);
  o.position.y = y;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A turned body from a profile of [radius, height] points, bottom to top. */
const turned = (pts: [number, number][]) => new LatheGeometry(new SplineCurve(pts.map(([x, y]) => new Vector2(x, y))).getPoints(pts.length * 6), 32);

/** The foot every piece stands on: a wide, stepped base with two beads, narrowing into the stem. */
const BASE: [number, number][] = [
  [0.001, 0],
  [0.34, 0],
  [0.355, 0.03],
  [0.34, 0.06],
  [0.3, 0.075],
  [0.31, 0.1],
  [0.27, 0.12],
  [0.28, 0.145],
  [0.21, 0.17],
];

/** Tournament Staunton profiles: a slim waist, a collar under each head. */
const PROFILES: Record<Exclude<Role, "n">, [number, number][]> = {
  p: [...BASE, [0.15, 0.22], [0.11, 0.32], [0.17, 0.35], [0.18, 0.37], [0.11, 0.4], [0.001, 0.41]],
  r: [...BASE, [0.22, 0.26], [0.19, 0.5], [0.2, 0.6], [0.26, 0.63], [0.27, 0.66], [0.25, 0.68], [0.25, 0.8], [0.001, 0.8]],
  b: [...BASE, [0.15, 0.26], [0.095, 0.56], [0.17, 0.6], [0.18, 0.62], [0.1, 0.66], [0.001, 0.67]],
  q: [...BASE, [0.17, 0.28], [0.1, 0.74], [0.2, 0.79], [0.21, 0.81], [0.12, 0.85], [0.13, 0.9], [0.23, 1.0], [0.21, 1.02], [0.001, 1.02]],
  k: [...BASE, [0.18, 0.28], [0.11, 0.8], [0.21, 0.85], [0.22, 0.87], [0.13, 0.91], [0.15, 0.95], [0.22, 1.04], [0.2, 1.06], [0.001, 1.07]],
};

const SCALE = 1.3;
/** The figure's height (to its top ornament), for effects that aim at it. */
const HEIGHT: Record<Role, number> = { p: 0.56 * SCALE, n: 0.82 * SCALE, b: 0.98 * SCALE, r: 0.8 * SCALE, q: 1.12 * SCALE, k: 1.34 * SCALE };

function knightHead(m: Material) {
  // A horse's head in profile, extruded and bevelled; it faces +z.
  // Chest, throat, jaw, muzzle, the brow, two ears, and the arched neck down the back.
  const s = new Shape();
  s.moveTo(-0.15, 0);
  s.lineTo(0.15, 0);
  s.bezierCurveTo(0.17, 0.1, 0.12, 0.2, 0.1, 0.28);
  s.bezierCurveTo(0.12, 0.33, 0.2, 0.34, 0.27, 0.36);
  s.bezierCurveTo(0.31, 0.38, 0.31, 0.45, 0.27, 0.47);
  s.bezierCurveTo(0.2, 0.5, 0.1, 0.56, 0.04, 0.62);
  s.lineTo(0.0, 0.71);
  s.lineTo(-0.03, 0.63);
  s.lineTo(-0.07, 0.7);
  s.lineTo(-0.09, 0.6);
  s.bezierCurveTo(-0.2, 0.5, -0.22, 0.25, -0.15, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 6, curveSegments: 20 });
  g.translate(0, 0, -0.075);
  g.rotateY(-Math.PI / 2);
  const head = new Group();
  head.add(part(g, m));
  // Eyes, dark either side of the brow.
  const eye = new MeshStandardMaterial({ color: 0x0a0605, roughness: 0.3 });
  for (const x of [-0.125, 0.125])
    head.add(
      part(new SphereGeometry(0.022, 10, 8), eye, 0.5)
        .translateX(x)
        .translateZ(0.13),
    );
  head.position.y = 0.2;
  return head;
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
    // The mitre's cut.
    const cut = part(new BoxGeometry(0.025, 0.2, 0.34), new MeshStandardMaterial({ color: side === "w" ? 0x5a3e22 : 0x0a0605, roughness: 0.8 }), 0.86);
    cut.rotation.x = 0.55;
    f.body.add(cut);
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
  f.body.add(part(new CylinderGeometry(0.335, 0.335, 0.004, 32), new MeshStandardMaterial({ color: 0x24502c, roughness: 1 }), 0.002));
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
