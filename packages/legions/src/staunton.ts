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

/** A turned body from a profile of [radius, height] points, bottom to top. */
const turned = (pts: [number, number][]) => new LatheGeometry(new SplineCurve(pts.map(([x, y]) => new Vector2(x, y))).getPoints(pts.length * 8), 40);

/**
 * The classic Staunton set's proportions, in squares of a 2.25" tournament
 * board: a 3.75" king is 1.67 squares tall on a 1.5" base, the pawn about half
 * the king; stems are long, slim and sweep up concavely from a stepped foot,
 * and every head sits on a collar.
 */
const PROFILES: Record<Exclude<Role, "n">, [number, number][]> = {
  p: [
    [0.001, 0],
    [0.25, 0],
    [0.265, 0.025],
    [0.25, 0.055],
    [0.205, 0.075],
    [0.215, 0.1],
    [0.16, 0.14],
    [0.105, 0.24],
    [0.08, 0.34],
    [0.075, 0.46],
    [0.1, 0.5],
    [0.175, 0.54],
    [0.185, 0.56],
    [0.17, 0.585],
    [0.09, 0.6],
    [0.001, 0.61],
  ],
  r: [
    [0.001, 0],
    [0.29, 0],
    [0.305, 0.03],
    [0.29, 0.065],
    [0.24, 0.085],
    [0.25, 0.11],
    [0.19, 0.16],
    [0.15, 0.28],
    [0.135, 0.46],
    [0.15, 0.55],
    [0.215, 0.6],
    [0.225, 0.64],
    [0.28, 0.7],
    [0.285, 0.84],
    [0.255, 0.85],
    [0.001, 0.85],
  ],
  b: [
    [0.001, 0],
    [0.29, 0],
    [0.305, 0.03],
    [0.29, 0.065],
    [0.24, 0.085],
    [0.25, 0.11],
    [0.19, 0.16],
    [0.14, 0.3],
    [0.1, 0.52],
    [0.09, 0.7],
    [0.11, 0.76],
    [0.2, 0.8],
    [0.21, 0.83],
    [0.17, 0.86],
    [0.12, 0.89],
    [0.001, 0.9],
  ],
  q: [
    [0.001, 0],
    [0.315, 0],
    [0.33, 0.03],
    [0.315, 0.07],
    [0.26, 0.09],
    [0.27, 0.115],
    [0.2, 0.17],
    [0.15, 0.3],
    [0.11, 0.55],
    [0.095, 0.8],
    [0.11, 0.9],
    [0.225, 0.96],
    [0.235, 0.99],
    [0.15, 1.04],
    [0.16, 1.1],
    [0.22, 1.2],
    [0.245, 1.3],
    [0.2, 1.31],
    [0.001, 1.31],
  ],
  k: [
    [0.001, 0],
    [0.335, 0],
    [0.35, 0.03],
    [0.335, 0.07],
    [0.275, 0.095],
    [0.285, 0.12],
    [0.21, 0.18],
    [0.16, 0.32],
    [0.115, 0.6],
    [0.1, 0.88],
    [0.115, 1.0],
    [0.235, 1.06],
    [0.245, 1.09],
    [0.15, 1.14],
    [0.165, 1.2],
    [0.225, 1.3],
    [0.24, 1.4],
    [0.2, 1.42],
    [0.001, 1.42],
  ],
};

/** The figure's height (to its top ornament), for effects that aim at it. */
const HEIGHT: Record<Role, number> = { p: 0.84, n: 1.22, b: 1.32, r: 0.98, q: 1.5, k: 1.68 };

/** A knight's head, carved in profile: an arched neck with a mane, ears, brow, a long muzzle and a flared nostril; it faces +z. */
function knightHead(m: Material) {
  const s = new Shape();
  s.moveTo(-0.2, 0);
  s.lineTo(0.2, 0);
  // Chest and throat up to the jaw.
  s.bezierCurveTo(0.22, 0.12, 0.15, 0.22, 0.12, 0.3);
  s.bezierCurveTo(0.2, 0.31, 0.3, 0.3, 0.38, 0.33);
  // The muzzle, nostril, and up the nose to the brow.
  s.bezierCurveTo(0.43, 0.35, 0.44, 0.43, 0.39, 0.46);
  s.bezierCurveTo(0.32, 0.5, 0.22, 0.6, 0.13, 0.7);
  // Two ears, then the arched neck down the back with its mane.
  s.lineTo(0.1, 0.84);
  s.lineTo(0.05, 0.74);
  s.lineTo(0.0, 0.85);
  s.lineTo(-0.04, 0.72);
  s.bezierCurveTo(-0.14, 0.66, -0.3, 0.5, -0.27, 0.32);
  s.bezierCurveTo(-0.26, 0.2, -0.24, 0.1, -0.2, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 8, curveSegments: 24 });
  g.translate(0, 0, -0.08);
  g.rotateY(-Math.PI / 2);
  const head = new Group();
  head.add(part(g, m));
  // Eyes, dark either side of the brow.
  const eye = new MeshStandardMaterial({ color: 0x0a0605, roughness: 0.25 });
  for (const x of [-0.145, 0.145])
    head.add(
      part(new SphereGeometry(0.024, 12, 10), eye, 0.58)
        .translateX(x)
        .translateZ(0.2),
    );
  head.position.y = 0.2;
  // Turned three-quarters, so the horse's profile reads from the front.
  head.rotation.y = 0.7;
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
  if (role === "n") {
    f.body.add(
      part(
        turned([
          [0.001, 0],
          [0.29, 0],
          [0.305, 0.03],
          [0.29, 0.065],
          [0.24, 0.085],
          [0.25, 0.11],
          [0.2, 0.17],
          [0.19, 0.22],
          [0.001, 0.23],
        ]),
        m,
      ),
    );
    f.body.add(knightHead(m));
  } else f.body.add(part(turned(PROFILES[role]), m));
  if (role === "p") f.body.add(part(new SphereGeometry(0.15, 32, 20), m, 0.7));
  if (role === "b") {
    // An egg of a head with the mitre's slanted cut and a finial ball.
    f.body.add(part(new SphereGeometry(0.17, 32, 20).scale(1, 1.4, 1), m, 1.04));
    f.body.add(part(new SphereGeometry(0.05, 16, 12), m, 1.29));
    const slit = part(new BoxGeometry(0.03, 0.2, 0.36), cut, 1.1);
    slit.rotation.x = 0.6;
    slit.position.z = 0.02;
    f.body.add(slit);
  }
  if (role === "r") ring(f, () => part(new BoxGeometry(0.13, 0.13, 0.1), m), 6, 0.235, 0.85 + 0.06, true);
  if (role === "q") {
    // A coronet: a ring of beads on the rim, and a ball above.
    ring(f, () => part(new SphereGeometry(0.04, 14, 10), m), 9, 0.215, 1.31);
    f.body.add(part(new SphereGeometry(0.085, 20, 14), m, 1.4));
  }
  if (role === "k") {
    // A cross on the crown's flat top.
    f.body.add(part(new BoxGeometry(0.07, 0.3, 0.07), m, 1.57));
    f.body.add(part(new BoxGeometry(0.2, 0.07, 0.07), m, 1.6));
  }
  f.body.add(part(new CylinderGeometry(0.31, 0.31, 0.004, 40), new MeshStandardMaterial({ color: 0x24502c, roughness: 1 }), 0.002));
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
