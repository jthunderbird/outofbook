// The Restless: classic monsters in a graveyard (home court: The Wake). King: a vampire
// lord; queen: his bride; bishop: a witch on her broom; knight: a werewolf; pawns:
// skeletons (light) and zombies (dark); rooks: gravestones made here. The models are
// Meshy-made (packages/legions/models/restless-*.glb); the moves and kills are acted out
// in code over them. Not in the tribe list yet.
//
// Rook: a gravestone that zombie hands pull under the board and push up on its
// square; to take, hands claw the piece down first, and the stone rises with a
// pencil sketch of it. Pawn: zombies take together (the nearest four join in).
// Bishop: a witch on her broom rears and darts; to take, she turns the piece into
// an animal that goes off by itself. Knight: one bound, then three bites. King: bats
// that reform and drain. Queen: glides; bats carry the piece into the night.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  CylinderGeometry,
  ExtrudeGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Actor } from "./actor";
import { squareAt } from "./board";
import { Fig, type Role, type Side } from "./figures";
import { ease, tween, wait } from "./fx";
import { loadModels, modelFig } from "./models";
import { staunton } from "./staunton";
import type { Stage, Tribe, TribeMove } from "./tribe";

// ---------- Figures ----------

const MODEL: Record<Exclude<Role, "r" | "p">, string> = { k: "restless-king", q: "restless-queen", b: "restless-bishop", n: "restless-knight" };
const HEIGHT: Record<Role, number> = { k: 1.85, q: 1.65, b: 1.4, n: 1.15, r: 1.2, p: 0.8 };
const BLOOD = 0x9a0f14;

function wakeFigure(role: Role, side: Side): Fig {
  if (role === "r") return gravestone(side);
  // Skeletons (light) and zombies (dark) are pawns of their own; the rest wear a pale cast on the light side.
  const name = role === "p" ? (side === "w" ? "restless-pawn-w" : "restless-pawn-b") : MODEL[role];
  const f = modelFig(name, role, side, HEIGHT[role], { tint: role === "p" ? { w: "none" } : { w: "pallid" } });
  if (!f) return staunton.figure(role, side);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  // Witches and the bride hover.
  if (role === "b" || role === "q") f.floating = true;
  return f;
}

export const wake: Tribe = {
  id: "restless",
  name: "The Restless",
  figure: wakeFigure,
  ready: () => loadModels("restless-"),
  play: (stage, move) => new Graveyard(stage).play(move),
};

// ---------- The gravestone ----------

const noise = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/** Weathered stone with a crack, moss at the foot and a worn cross, for one side's color. */
const stoneCache = new Map<string, CanvasTexture>();
export function stoneTexture(side: Side, variant = 0) {
  const hit = stoneCache.get(side + variant);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const base = side === "w" ? [178, 174, 164] : [84, 86, 96];
  g.fillStyle = `rgb(${base})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = noise(variant * 977 + i) * 256;
    const y = noise(variant * 977 + i + 9000) * 256;
    const d = (noise(variant * 977 + i + 4000) - 0.5) * 46;
    g.fillStyle = `rgba(${base[0] + d},${base[1] + d},${base[2] + d},0.5)`;
    g.fillRect(x, y, 1 + noise(variant * 977 + i + 7) * 3, 1 + noise(variant * 977 + i + 3) * 3);
  }
  // Moss, thickest at the foot.
  for (let i = 0; i < 260; i++) {
    const y = 256 - Math.pow(noise(variant * 977 + i + 50), 1.8) * 120;
    g.fillStyle = `rgba(${60 + noise(variant * 977 + i) * 30},${92 + noise(variant * 977 + i + 1) * 40},${48},${0.12 + noise(variant * 977 + i + 2) * 0.22})`;
    g.beginPath();
    g.arc(noise(variant * 977 + i + 20) * 256, y, 3 + noise(variant * 977 + i + 30) * 9, 0, 7);
    g.fill();
  }
  // A crack from the top right shoulder down.
  g.strokeStyle = "rgba(20,20,24,0.8)";
  g.lineWidth = 2.2;
  g.beginPath();
  let x = 190;
  let y = 20;
  g.moveTo(x, y);
  for (let i = 0; i < 9; i++) {
    x += (noise(variant * 977 + i + 300) - 0.55) * 34;
    y += 18 + noise(variant * 977 + i + 400) * 14;
    g.lineTo(x, y);
  }
  g.stroke();
  // A worn carved cross and a frame.
  g.strokeStyle = "rgba(25,25,30,0.55)";
  g.lineWidth = 6;
  g.strokeRect(34, 30, 188, 210);
  g.beginPath();
  g.moveTo(128, 52);
  g.lineTo(128, 112);
  g.moveTo(104, 76);
  g.lineTo(152, 76);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  stoneCache.set(side + variant, t);
  return t;
}

export type HeadKind = "arch" | "slab" | "round" | "obelisk" | "cross" | "stump" | "tomb" | "pillar";
export const HEAD_KINDS: HeadKind[] = ["arch", "slab", "round", "obelisk", "cross", "stump", "tomb", "pillar"];

/** Outlines, about 1 across and 1 tall, for each kind of headstone; and how deep they stand. */
const OUTLINE: Record<HeadKind, { pts: [number, number][]; depth: number }> = {
  arch: {
    pts: [
      [-0.36, 0],
      [0.36, 0],
      [0.36, 0.8],
      [0.31, 0.93],
      [0.24, 0.97],
      [0.2, 1.06],
      [0.1, 1.13],
      [-0.04, 1.15],
      [-0.18, 1.1],
      [-0.3, 0.98],
      [-0.36, 0.8],
    ],
    depth: 0.2,
  },
  slab: {
    pts: [
      [-0.34, 0],
      [0.34, 0],
      [0.34, 0.9],
      [0.28, 0.97],
      [-0.28, 0.97],
      [-0.34, 0.9],
    ],
    depth: 0.18,
  },
  round: {
    pts: [
      [-0.34, 0],
      [0.34, 0],
      [0.34, 0.6],
      ...Array.from({ length: 9 }, (_, i): [number, number] => [0.34 * Math.cos((i / 8) * Math.PI), 0.6 + 0.34 * Math.sin((i / 8) * Math.PI)]).slice(1, 8),
      [-0.34, 0.6],
    ],
    depth: 0.2,
  },
  obelisk: {
    pts: [
      [-0.3, 0],
      [0.3, 0],
      [0.2, 1.7],
      [0, 2.1],
      [-0.2, 1.7],
    ],
    depth: 0.3,
  },
  cross: {
    pts: [
      [-0.12, 0],
      [0.12, 0],
      [0.12, 0.55],
      [0.4, 0.55],
      [0.4, 0.8],
      [0.12, 0.8],
      [0.12, 1.3],
      [-0.12, 1.3],
      [-0.12, 0.8],
      [-0.4, 0.8],
      [-0.4, 0.55],
      [-0.12, 0.55],
    ],
    depth: 0.18,
  },
  stump: {
    pts: [
      [-0.35, 0],
      [0.35, 0],
      [0.35, 0.5],
      [0.2, 0.62],
      [0.12, 0.5],
      [-0.02, 0.72],
      [-0.2, 0.55],
      [-0.35, 0.62],
    ],
    depth: 0.22,
  },
  tomb: {
    pts: [
      [-0.7, 0],
      [0.7, 0],
      [0.7, 0.42],
      [0.6, 0.5],
      [-0.6, 0.5],
      [-0.7, 0.42],
    ],
    depth: 0.6,
  },
  pillar: {
    pts: [
      [-0.18, 0],
      [0.18, 0],
      [0.18, 0.9],
      [0.1, 1.0],
      [-0.05, 0.85],
      [-0.18, 0.95],
    ],
    depth: 0.36,
  },
};
const headGeo = new Map<HeadKind, ExtrudeGeometry>();

/** The shape of a kind of headstone, standing on y = 0 and about 1 across, shared by all of that kind. */
export function headGeometry(kind: HeadKind) {
  let geo = headGeo.get(kind);
  if (!geo) {
    const o = OUTLINE[kind];
    geo = new ExtrudeGeometry(new Shape(o.pts.map(([x, y]) => new Vector2(x, y))), { depth: o.depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    geo.translate(0, 0, -o.depth / 2);
    headGeo.set(kind, geo);
  }
  return geo;
}

export function headstone(side: Side, lean: [number, number] = [-0.03, 0.07], kind: HeadKind = "arch", variant = 0) {
  const geo = headGeometry(kind);
  const tex = stoneTexture(side, variant);
  tex.repeat.set(1 / 0.9, 1 / 1.3);
  tex.offset.set(0.5, 0);
  const stone = new MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const slab = new Mesh(geo, stone);
  slab.position.y = 0.08;
  slab.rotation.set(lean[0], 0, lean[1]);
  slab.castShadow = slab.receiveShadow = true;
  const base = new MeshStandardMaterial({ color: side === "w" ? 0x8e8a80 : 0x3c3e48, roughness: 1 });
  const plinth = new Mesh(new BoxGeometry(kind === "tomb" ? 1.6 : 0.92, 0.1, kind === "tomb" ? 0.9 : 0.46), base);
  plinth.position.y = 0.05;
  plinth.castShadow = plinth.receiveShadow = true;
  const group = new Group();
  group.add(plinth, slab);
  return { group, mats: [stone, base] as Material[], plinth };
}

/** A tall headstone with a chipped, arched top and a slight lean, on a low plinth. */
function gravestone(side: Side): Fig {
  const f = new Fig("r", side, HEIGHT.r);
  const { group, mats } = headstone(side);
  // The face the dead are drawn on: clear until a piece is taken.
  const epitaph = new Mesh(new PlaneGeometry(0.46, 0.6), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  epitaph.position.set(0.0, 0.62, 0.15);
  epitaph.rotation.set(-0.03, 0, 0.07);
  f.body.add(group, epitaph);
  epitaphs.set(f, epitaph);
  f.mats = mats;
  return f;
}

/** Each gravestone's face, for the sketch of the piece it took. */
const epitaphs = new WeakMap<Fig, Mesh>();

// ---------- Animals (what the witches turn pieces into) ----------

type Gait = "hop" | "scurry" | "fly" | "slither" | "crawl";
const ANIMALS = ["toad", "rat", "crow", "snake", "rabbit", "spider", "cat", "bat", "owl", "frog"] as const;
export type AnimalKind = (typeof ANIMALS)[number];
export const animalKinds = ANIMALS;
const GAIT: Record<AnimalKind, Gait> = { toad: "hop", rat: "scurry", crow: "fly", snake: "slither", rabbit: "hop", spider: "crawl", cat: "scurry", bat: "fly", owl: "fly", frog: "hop" };

/** A little low-poly animal about 0.4 long, facing +z. */
function animal(kind: AnimalKind): Group {
  const g = new Group();
  const mat = (c: number) => new MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
  const ball = (r: number, c: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new Mesh(new SphereGeometry(r, 8, 6), mat(c));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const cone = (r: number, h: number, c: number, x: number, y: number, z: number, rx = 0) => {
    const m = new Mesh(new ConeGeometry(r, h, 6), mat(c));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const eyes = (y: number, z: number, w: number, c = 0xffd040) => {
    for (const s of [-1, 1]) ball(0.022, c, s * w, y, z);
  };
  switch (kind) {
    case "toad":
    case "frog": {
      const c = kind === "toad" ? 0x7a6a3a : 0x4cb04a;
      ball(0.17, c, 0, 0.15, 0, 1, 0.75, 1.2);
      ball(0.1, c, 0, 0.2, 0.2, 1, 0.8, 1);
      eyes(0.3, 0.22, 0.07);
      ball(0.07, c, -0.15, 0.06, -0.08, 0.7, 0.7, 1.4);
      ball(0.07, c, 0.15, 0.06, -0.08, 0.7, 0.7, 1.4);
      break;
    }
    case "rat":
    case "cat": {
      const c = kind === "rat" ? 0x5a5048 : 0x20202a;
      const s = kind === "cat" ? 1.35 : 1;
      ball(0.12 * s, c, 0, 0.13 * s, 0, 1, 0.9, 1.7);
      ball(0.08 * s, c, 0, 0.16 * s, 0.22 * s);
      cone(0.04 * s, 0.1 * s, c, -0.04 * s, 0.26 * s, 0.2 * s);
      cone(0.04 * s, 0.1 * s, c, 0.04 * s, 0.26 * s, 0.2 * s);
      eyes(0.18 * s, 0.29 * s, 0.035, kind === "cat" ? 0x80ff60 : 0xff6060);
      const tail = new Mesh(new CylinderGeometry(0.012, 0.02, 0.3 * s, 5), mat(kind === "rat" ? 0xb09088 : c));
      tail.position.set(0, 0.1 * s, -0.28 * s);
      tail.rotation.x = 1.2;
      g.add(tail);
      break;
    }
    case "crow":
    case "bat":
    case "owl": {
      const c = kind === "crow" ? 0x15151c : kind === "bat" ? 0x2a2230 : 0x8a7050;
      ball(0.1, c, 0, 0.3, 0, 1, 1, 1.4);
      ball(0.07, c, 0, 0.36, 0.14);
      cone(0.025, 0.1, kind === "owl" ? 0xe0a030 : 0x606068, 0, 0.35, 0.22, Math.PI / 2);
      for (const s of [-1, 1]) {
        const w = ball(0.2, c, s * 0.2, 0.32, 0, 1.4, 0.12, 0.7);
        w.userData.wing = s;
      }
      eyes(0.39, 0.19, 0.035, kind === "owl" ? 0xffe060 : 0xff4040);
      break;
    }
    case "snake": {
      for (let i = 0; i < 9; i++) ball(0.045 - i * 0.002, i % 2 ? 0x3a6a30 : 0x4c8a3c, Math.sin(i * 0.9) * 0.05, 0.05, -i * 0.055 + 0.2);
      ball(0.06, 0x4c8a3c, 0, 0.07, 0.25, 1, 0.8, 1.3);
      eyes(0.1, 0.29, 0.03, 0xff3030);
      break;
    }
    case "rabbit": {
      ball(0.14, 0xd8d0c4, 0, 0.16, 0, 1, 0.9, 1.3);
      ball(0.09, 0xd8d0c4, 0, 0.26, 0.17);
      for (const s of [-1, 1]) ball(0.035, 0xd8d0c4, s * 0.04, 0.42, 0.14, 0.7, 3, 0.7);
      ball(0.04, 0xffffff, 0, 0.14, -0.2);
      eyes(0.29, 0.24, 0.045, 0xd02030);
      break;
    }
    case "spider": {
      ball(0.08, 0x18101c, 0, 0.1, 0);
      ball(0.06, 0x18101c, 0, 0.1, 0.1);
      eyes(0.13, 0.15, 0.03, 0xff3030);
      for (let i = 0; i < 8; i++) {
        const s = i < 4 ? -1 : 1;
        const leg = new Mesh(new CylinderGeometry(0.008, 0.008, 0.26, 4), mat(0x18101c));
        leg.position.set(s * 0.14, 0.07, ((i % 4) - 1.5) * 0.06);
        leg.rotation.z = s * 1.0;
        g.add(leg);
      }
      break;
    }
  }
  g.scale.setScalar(1.15);
  return g;
}

// ---------- Effects ----------

let batTex: CanvasTexture | null = null;
function batTexture() {
  if (!batTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0c0810";
    g.beginPath();
    g.moveTo(32, 26);
    g.quadraticCurveTo(46, 6, 62, 18);
    g.quadraticCurveTo(54, 24, 52, 36);
    g.quadraticCurveTo(46, 30, 40, 38);
    g.quadraticCurveTo(36, 32, 32, 42);
    g.quadraticCurveTo(28, 32, 24, 38);
    g.quadraticCurveTo(18, 30, 12, 36);
    g.quadraticCurveTo(10, 24, 2, 18);
    g.quadraticCurveTo(18, 6, 32, 26);
    g.fill();
    g.fillStyle = "#ff3030";
    g.fillRect(28, 28, 2, 2);
    g.fillRect(34, 28, 2, 2);
    batTex = new CanvasTexture(c);
    batTex.colorSpace = SRGBColorSpace;
  }
  return batTex;
}

let glow: CanvasTexture | null = null;
/** A soft round glow, for bolts. */
function glowTexture() {
  if (!glow) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "#fff");
    r.addColorStop(0.35, "rgba(255,255,255,0.6)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    glow = new CanvasTexture(c);
  }
  return glow;
}

interface Bat {
  s: Sprite;
  phase: number;
  r: number;
  a: number;
  h: number;
}

/** A zombie hand and forearm, about 0.9 tall with the fingers up and open, y = 0 at the arm's middle; its fingers (userData.fingers) curl toward +z. */
function hand(): Group {
  const g = new Group();
  const skin = new MeshStandardMaterial({ color: 0x93a47c, roughness: 0.85, flatShading: true, emissive: 0x1c2a12, emissiveIntensity: 0.7 });
  const bone = new MeshStandardMaterial({ color: 0xc8c4a8, roughness: 0.8, flatShading: true });
  const arm = new Mesh(new CylinderGeometry(0.07, 0.1, 0.75, 7), skin);
  arm.position.y = 0.1;
  const palm = new Mesh(new BoxGeometry(0.27, 0.11, 0.2), skin);
  palm.position.y = 0.5;
  // A ragged cuff and a bit of bone showing at the wrist.
  const cuff = new Mesh(new CylinderGeometry(0.115, 0.125, 0.12, 7), new MeshStandardMaterial({ color: 0x3a3226, roughness: 1, flatShading: true }));
  cuff.position.y = -0.1;
  const knob = new Mesh(new SphereGeometry(0.045, 6, 5), bone);
  knob.position.set(0.05, 0.28, 0.06);
  g.add(arm, palm, cuff, knob);
  const fingers: { upper: Group; lower: Group }[] = [];
  for (let i = 0; i < 4; i++) {
    const upper = new Group();
    upper.position.set(-0.1 + i * 0.067, 0.55, 0);
    upper.rotation.z = (i - 1.5) * -0.07;
    const a = new Mesh(new CylinderGeometry(0.022, 0.03, 0.17, 5), skin);
    a.position.y = 0.085;
    const lower = new Group();
    lower.position.y = 0.17;
    const b = new Mesh(new CylinderGeometry(0.007, 0.022, 0.15, 5), bone);
    b.position.y = 0.075;
    lower.add(b);
    upper.add(a, lower);
    g.add(upper);
    fingers.push({ upper, lower });
  }
  const thumb = new Group();
  thumb.position.set(0.14, 0.48, 0);
  const tb = new Mesh(new CylinderGeometry(0.014, 0.03, 0.2, 5), skin);
  tb.position.y = 0.1;
  thumb.add(tb);
  thumb.rotation.z = -0.8;
  g.add(thumb);
  g.userData.fingers = fingers;
  g.userData.thumb = thumb;
  g.userData.mats = [skin, bone, cuff.material];
  return g;
}

/** Curls a hand's fingers: 0 open, 1 gripping. */
function curl(h: Group, c: number) {
  for (const f of h.userData.fingers as { upper: Group; lower: Group }[]) {
    f.upper.rotation.x = 0.1 + 0.8 * c;
    f.lower.rotation.x = 0.2 + 1.1 * c;
  }
  (h.userData.thumb as Group).rotation.x = 0.5 * c;
}

// ---------- The graveyard's moves and kills ----------

/** Chosen for a witch's next hex (the mock page sets it; else a random one). */
export const hex: { animal?: AnimalKind } = {};

class Graveyard extends Actor {
  constructor(stage: Stage) {
    super(stage);
  }

  async play({ mover, to, victim, castle }: TribeMove) {
    if (castle) {
      await this.glide(mover, squareAt(to));
      await this.stoneWalk(castle.rook, castle.to);
      return;
    }
    switch (mover.role) {
      case "p":
        await this.zombie(mover, to, victim);
        break;
      case "n":
        await this.pounce(mover, to, victim);
        break;
      case "b":
        await this.witch(mover, to, victim);
        break;
      case "r":
        await this.stoneWalk(mover, to, victim);
        break;
      case "q":
        await this.bride(mover, to, victim);
        break;
      case "k":
        await this.lord(mover, to, victim);
        break;
    }
  }

  // ----- Shared -----

  /** Walks (or, with fast, runs) to b, ms a square. */
  private async walk(f: Fig, b: Vector3, ms: number, o: { stopShort?: number; speed?: number } = {}) {
    const a = f.root.position.clone();
    const dist = a.distanceTo(b);
    if (dist < 0.01) return;
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z), 120);
    const end = o.stopShort ? a.clone().lerp(b, Math.max(0, 1 - o.stopShort / dist)) : b;
    void f.play("Walking", { loop: true, speed: o.speed ?? 1.1 });
    await this.line(f, end, end.distanceTo(a) * ms);
    void f.play(f.anim?.idle ?? "Idle", { loop: true, fade: 0.2 });
  }

  /** Back to standing on the square, facing the opponent. */
  private async settle(f: Fig) {
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /** A floating figure gliding to b, trailing petals. */
  private async glide(f: Fig, b: Vector3, ms = 480) {
    const a = f.root.position.clone();
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z), 140);
    await tween(this.clock, Math.max(ms, a.distanceTo(b) * 150), (t) => {
      f.root.position.set(a.x + (b.x - a.x) * t, Math.sin(Math.PI * t) * 0.12, a.z + (b.z - a.z) * t);
      if (Math.random() < 0.4)
        this.fx.spawn(f.root.position.clone().setY(0.3), {
          color: 0x7a1020,
          size: 0.03,
          vel: new Vector3((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4),
          life: 600,
          gravity: 0,
          glow: true,
        });
    });
    await this.settle(f);
  }

  /** A burst of blood at p. */
  private blood(p: Vector3, n = 14) {
    this.fx.burst(p, BLOOD, n, { speed: 1.6, size: 0.05, up: 1.6, life: 800 });
  }

  /** Dims the figure's colors toward c over ms. */
  private tint(v: Fig, c: number, amount: number, ms: number) {
    const mats = this.standard(v.mats);
    const from = mats.map((m) => m.color.clone());
    const to = new Color(c);
    return tween(this.clock, ms, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(to, amount * t);
        m.emissiveIntensity *= 1 - t * 0.5;
      }),
    );
  }

  private hurt(v: Fig) {
    void v.play("Hit_Reaction", { speed: 1.2, hold: true });
    this.sound.play(Math.random() < 0.5 ? "death1" : "death2", { gain: 0.5, rate: v.side === "b" ? 0.85 : 1 });
  }

  // ----- Hands -----

  /**
   * Hands about p, ready to rise: each stands dist from p facing it, its palm lift
   * high when risen, grown by s. Returns them with ways to raise, claw, drag
   * down, and push up.
   */
  private grab(p: Vector3, o: { dist: number; lift: number; s: number; n?: number; angle?: number }) {
    const n = o.n ?? 2;
    const list = Array.from({ length: n }, (_, i) => {
      const h = hand();
      const a = (o.angle ?? 0) + (i / n) * Math.PI * 2;
      h.scale.setScalar(o.s);
      h.rotation.order = "YXZ";
      h.rotation.set(0.3, a + Math.PI, 0);
      h.position.set(p.x + Math.sin(a) * o.dist, -0.95 * o.s, p.z + Math.cos(a) * o.dist);
      h.userData.up = o.lift - 0.48 * o.s;
      h.userData.base = new Vector3(h.position.x, 0, h.position.z);
      curl(h, 0.1);
      this.scene.add(h);
      return h;
    });
    const each = (fn: (h: Group, i: number) => void) => list.forEach(fn);
    const raise = async (ms = 300, gripTo = 1) => {
      this.fx.dust(p, 8, 0x3a2c1e);
      this.sound.play("rubble", { gain: 0.45, rate: 1.1 });
      await tween(
        this.clock,
        ms,
        (t) =>
          each((h, i) => {
            const k = Math.min(1, t * (1 + i * 0.1));
            h.position.y = -0.95 * o.s + (h.userData.up + 0.95 * o.s) * k;
            curl(h, 0.1 + (gripTo - 0.1) * Math.max(0, (t - 0.55) / 0.45));
          }),
        ease.out,
      );
    };
    const claw = (ms: number) => {
      let tt = 0;
      const stop = this.loop((dt) => {
        tt += dt / 1000;
        each((h, i) => {
          h.rotation.x = 0.3 + Math.sin(tt * 13 + i * 2) * 0.28;
          h.position.x = h.userData.base.x + Math.sin(tt * 22 + i) * 0.03;
          curl(h, 0.55 + 0.45 * Math.sin(tt * 18 + i * 1.7));
        });
      });
      return wait(this.clock, ms).then(stop);
    };
    /** Down by depth in ms, the grip held; extra gets the progress. */
    const drag = async (ms: number, depth: number, extra?: (t: number) => void) => {
      const y0 = list.map((h) => h.position.y);
      await tween(
        this.clock,
        ms,
        (t) => {
          each((h, i) => (h.position.y = y0[i] - depth * t));
          extra?.(t);
        },
        ease.in,
      );
    };
    /** Starting depth below where they hold, up to holding, as the thing they push rises. */
    const push = (ms: number, depth: number, extra: (t: number) => void) => {
      each((h) => curl(h, 1));
      return tween(
        this.clock,
        ms,
        (t) => {
          each((h) => (h.position.y = h.userData.up - depth * (1 - t)));
          extra(t);
        },
        ease.out,
      );
    };
    const clear = () => {
      for (const h of list) {
        h.removeFromParent();
        h.traverse((x) => (x as Mesh).geometry?.dispose());
        for (const m of h.userData.mats as Material[]) m.dispose();
      }
    };
    return { list, raise, claw, drag, push, clear };
  }

  // ----- Rooks: gravestones -----

  /**
   * Two great hands grip the stone's sides and pull it under; a heave of earth runs
   * to its square; hands push it up there. To take, the same hands come up round the
   * piece first, claw it and drag it down, and the stone rises with a pencil sketch
   * of it.
   */
  private async stoneWalk(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const depth = f.height + 0.3;
    const hold = { dist: 0.52, lift: 0.8, s: 1.35 };
    const down = this.grab(a, hold);
    await down.raise(320);
    this.sound.play("grind", { gain: 0.5, rate: 0.7 });
    this.shake = 160;
    await down.drag(480, depth, (t) => (f.root.position.y = -depth * t));
    down.clear();
    f.root.position.set(a.x, -depth, a.z);
    await this.mound(a, b);
    let sketch: HTMLCanvasElement | null = null;
    if (victim) {
      sketch = this.stage.portrait(victim);
      const side = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      const claws = this.grab(victim.root.position, { dist: 0.46, lift: victim.height * 0.5, s: 0.9 + victim.height * 0.55, angle: side });
      await claws.raise(300, 0.7);
      this.hurt(victim);
      const home = victim.root.position.clone();
      const struggle = this.loop(() => {
        victim.body.rotation.z = Math.sin(this.clock.now * 0.03) * 0.16;
        victim.root.position.x = home.x + Math.sin(this.clock.now * 0.05) * 0.04;
      });
      this.sound.play("slash", { gain: 0.45, rate: 0.7 });
      await claws.claw(700);
      struggle();
      this.blood(victim.root.position.clone().setY(0.5), 10);
      this.sound.play("grind", { gain: 0.5, rate: 0.8 });
      const sink = victim.height + 0.2;
      await claws.drag(520, sink + 0.3, (t) => (victim.root.position.y = -sink * t));
      victim.root.removeFromParent();
      claws.clear();
    }
    f.root.position.set(b.x, -depth, b.z);
    const up = this.grab(b, hold);
    this.fx.dust(b, 12, 0x3a2c1e);
    this.sound.play("slam", { gain: 0.5, rate: 0.9 });
    this.shake = 220;
    await up.push(420, depth, (t) => (f.root.position.y = -depth * (1 - t)));
    await tween(this.clock, 200, (t) => up.list.forEach((h) => curl(h, 1 - t)));
    await up.drag(220, 1.6);
    up.clear();
    if (sketch) {
      const mesh = epitaphs.get(f);
      if (mesh) {
        const tex = new CanvasTexture(sketch);
        tex.colorSpace = SRGBColorSpace;
        const m = mesh.material as MeshBasicMaterial;
        m.map = tex;
        m.needsUpdate = true;
        await tween(this.clock, 450, (t) => (m.opacity = 0.85 * t));
      }
    }
    f.rest();
  }

  /** A heave of earth running under the board from a to b. */
  private async mound(a: Vector3, b: Vector3) {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    const earth = new MeshStandardMaterial({ color: 0x2c2218, roughness: 1 });
    const m = new Mesh(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), earth);
    m.scale.set(0.34, 0.001, 0.46);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(m);
    await tween(
      this.clock,
      Math.max(420, dist * 240),
      (t) => {
        const p = this.along(a, b, t);
        m.position.set(p.x, 0, p.z);
        m.scale.y = Math.max(0.001, 0.14 * Math.min(1, t * 6, (1 - t) * 6) * (0.85 + 0.15 * Math.sin(t * 44)));
        if (Math.random() < 0.6)
          this.fx.spawn(p.clone().setY(0.1), { color: 0x2c2218, size: 0.035, vel: new Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2), life: 450 });
      },
      ease.linear,
    );
    m.removeFromParent();
    m.geometry.dispose();
    earth.dispose();
  }

  // ----- Tearing figures apart -----

  /**
   * Cuts a figure along random planes into pieces (a copy of it, each piece the part
   * of it on one side of every cut), and hides the figure. The pieces can be moved
   * apart, tinted red and eaten; clear() takes the rest away.
   */
  private shred(v: Fig, cuts = 2) {
    const c = v.root.position.clone().setY(v.height * 0.5);
    const normals = Array.from({ length: cuts }, () => new Vector3(Math.random() - 0.5, (Math.random() - 0.3) * 0.9, Math.random() - 0.5).normalize());
    const body = cloneSkinned(v.root);
    v.root.visible = false;
    const pieces = Array.from({ length: 1 << cuts }, (_, k) => {
      const base = normals.map((n, i) => new Plane().setFromNormalAndCoplanarPoint(n.clone().multiplyScalar((k >> i) & 1 ? -1 : 1), c));
      const planes = base.map((p) => p.clone());
      const holder = new Group();
      holder.matrixAutoUpdate = false;
      const copy = k === 0 ? body : cloneSkinned(v.root);
      copy.visible = true;
      const mats: MeshStandardMaterial[] = [];
      copy.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as MeshStandardMaterial).clone();
        mat.side = DoubleSide;
        mat.clippingPlanes = planes;
        m.material = mat;
        m.castShadow = false;
        mats.push(mat);
      });
      holder.add(copy);
      this.scene.add(holder);
      const dir = base
        .reduce((d, p) => d.add(p.normal), new Vector3())
        .setY(0.3)
        .normalize();
      const piece = {
        holder,
        base,
        planes,
        dir,
        off: new Vector3(),
        rot: new Euler(),
        spin: new Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
        mats,
        alive: true,
        c,
      };
      place(piece);
      return piece;
    });
    return {
      pieces,
      /** Moves every living piece out by d along its way, turning a little. */
      spread: (d: number) =>
        pieces.forEach((p) => {
          if (!p.alive) return;
          p.off.addScaledVector(p.dir, d);
          p.rot.x += p.spin.x * d;
          p.rot.y += p.spin.y * d;
          p.rot.z += p.spin.z * d;
          place(p);
        }),
      /** Reddens what is left, 0 to 1. */
      redden: (k: number) =>
        pieces.forEach((p) => {
          if (!p.alive) return;
          for (const m of p.mats) {
            m.emissive.set(0x6a0608);
            m.emissiveIntensity = k;
            m.color.lerp(new Color(BLOOD), k * 0.35);
          }
        }),
      /** A piece torn off and gone, in a spray of blood. */
      eat: (p: (typeof pieces)[number]) => {
        p.alive = false;
        this.blood(p.c.clone().add(p.off), 14);
        p.holder.removeFromParent();
        p.holder.traverse((o) => ((o as Mesh).material as Material | undefined)?.dispose());
      },
      clear: () =>
        pieces.forEach((p) => {
          if (p.alive) {
            p.holder.removeFromParent();
            p.holder.traverse((o) => ((o as Mesh).material as Material | undefined)?.dispose());
          }
        }),
    };

    function place(p: { holder: Group; base: Plane[]; planes: Plane[]; off: Vector3; rot: Euler; c: Vector3 }) {
      const m = new Matrix4()
        .makeTranslation(p.c.x + p.off.x, p.c.y + p.off.y, p.c.z + p.off.z)
        .multiply(new Matrix4().makeRotationFromEuler(p.rot))
        .multiply(new Matrix4().makeTranslation(-p.c.x, -p.c.y, -p.c.z));
      p.holder.matrix.copy(m);
      p.holder.matrixWorldNeedsUpdate = true;
      p.base.forEach((b, i) => p.planes[i].copy(b).applyMatrix4(m));
    }
  }

  // ----- Pawns: zombies -----

  /** A pawn walks; to take, it runs in with the four nearest of its side and they all tear the piece to pieces. */
  private async zombie(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    if (!victim) {
      await this.walk(f, b, 380);
      await this.settle(f);
      return;
    }
    const at = victim.root.position.clone();
    const mates = this.stage
      .figures()
      .filter((x) => x !== f && x !== victim && x.role === "p" && x.side === f.side)
      .sort((x, y) => x.root.position.distanceTo(at) - y.root.position.distanceTo(at))
      .slice(0, 4);
    const pack = [f, ...mates];
    const homes = pack.map((x) => ({ p: x.root.position.clone(), r: x.root.rotation.y }));
    // Round the victim, the taker on its own side of it.
    const toward = f.root.position.clone().sub(at).setY(0).normalize();
    const base = Math.atan2(toward.x, toward.z);
    // Out of control: they lurch and stagger as they come.
    const lurch = this.loop(() =>
      pack.forEach((x, i) => {
        const t = this.clock.now * 0.012 + i * 2.1;
        x.body.rotation.x = Math.sin(t * 1.3) * 0.25;
        x.body.rotation.z = Math.sin(t * 0.9 + 1) * 0.3;
      }),
    );
    await Promise.all(
      pack.map((x, i) => {
        const a = base + (i === 0 ? 0 : ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI * 2) / 5);
        const spot = at.clone().add(new Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.55));
        return this.walk(x, spot, 170, { speed: 1.9 });
      }),
    );
    await Promise.all(pack.map((x) => this.turn(x, Math.atan2(at.x - x.root.position.x, at.z - x.root.position.z), 90)));
    this.hurt(victim);
    // Frenzy: each seizes a piece and pulls.
    const shred = this.shred(victim, 2);
    const thrash = this.loop(() => {
      pack.forEach((x, i) => {
        const t = this.clock.now * 0.03 + i * 1.9;
        x.body.rotation.x = 0.35 + Math.sin(t * 2.3) * 0.4;
        x.body.rotation.z = Math.sin(t * 1.9) * 0.35;
      });
    });
    for (let k = 0; k < 3; k++) {
      pack.forEach((x, i) => void x.play("Thrust_Slash", { speed: 1.7 + (i % 2) * 0.5 }));
      this.sound.play("slash", { gain: 0.5, rate: 0.7 + k * 0.1 });
      await wait(this.clock, 200);
      shred.spread(0.22);
      this.blood(at.clone().setY(0.5), 12);
      const alive = shred.pieces.filter((p) => p.alive);
      if (k === 1) shred.eat(alive[0]);
      if (k === 1 && alive[1]) shred.eat(alive[1]);
      if (k === 2) alive.forEach((p) => shred.eat(p));
      await wait(this.clock, 160);
    }
    thrash();
    lurch();
    shred.clear();
    victim.root.removeFromParent();
    await Promise.all([
      this.walk(f, b, 200, { speed: 1.6 }).then(() => this.settle(f)),
      ...mates.map((x, i) =>
        this.walk(x, homes[i + 1].p, 170, { speed: 1.9 }).then(async () => {
          await this.turn(x, homes[i + 1].r, 100);
          x.rest();
        }),
      ),
    ]);
  }

  // ----- Knights: werewolves -----

  /** One bound to the square; on a piece, it lands mounted on it and eats it in three bites, the piece cut away piece by piece and red. */
  private async pounce(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const face = Math.atan2(b.x - a.x, b.z - a.z);
    await this.turn(f, face, 140);
    this.sound.play("roar", { gain: 0.45, rate: 0.9 });
    await tween(this.clock, 160, (t) => (f.body.rotation.x = 0.25 * t));
    this.sound.play("gallop", { gain: 0.5 });
    const dist = a.distanceTo(b);
    await tween(
      this.clock,
      Math.max(520, dist * 260),
      (t) => {
        f.root.position.set(a.x + (b.x - a.x) * t, Math.sin(Math.PI * t) * (0.9 + dist * 0.18), a.z + (b.z - a.z) * t);
        f.body.rotation.x = -0.4 * Math.cos(Math.PI * t) + (victim ? 0.3 * t : 0);
      },
      ease.linear,
    );
    this.sound.play("land", { gain: 0.6 });
    this.shake = 140;
    if (!victim) {
      this.fx.dust(b, 8, 0x4a4a40);
      await this.settle(f);
      return;
    }
    // On the piece: three bites, each taking a piece of it and reddening the rest.
    this.hurt(victim);
    const shred = this.shred(victim, 2);
    const take = [1, 1, 2];
    for (let k = 0; k < 3; k++) {
      this.sound.play("slash", { gain: 0.6, rate: 0.6 + k * 0.1 });
      await tween(this.clock, 130, (t) => {
        f.body.rotation.x = 0.3 + 0.35 * t;
        f.root.position.y = 0.32 - 0.1 * t;
      });
      const alive = shred.pieces.filter((p) => p.alive);
      for (let i = 0; i < take[k] && alive[i]; i++) shred.eat(alive[i]);
      shred.redden(0.4 + k * 0.3);
      await tween(this.clock, 190, (t) => {
        f.body.rotation.x = 0.65 - 0.35 * t;
        f.root.position.y = 0.22 + 0.1 * t;
      });
    }
    shred.clear();
    victim.root.removeFromParent();
    this.sound.play("roar", { gain: 0.5, rate: 0.75 });
    await tween(this.clock, 160, (t) => (f.root.position.y = 0.32 * (1 - t)), ease.in);
    await this.settle(f);
  }

  // ----- Bishops: witches -----

  /** She rears and darts along the diagonal; to take, she hexes the piece into an animal that goes off by itself. */
  private async witch(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    if (victim) {
      await this.turn(f, Math.atan2(b.x - f.root.position.x, b.z - f.root.position.z), 140);
      await this.rear(f);
      await this.hexBolt(f, victim);
      void this.leave(victim);
    }
    await this.dart(f, b);
  }

  private async rear(f: Fig) {
    this.sound.play("whoosh", { gain: 0.3, rate: 0.8 });
    await tween(this.clock, 200, (t) => {
      f.body.rotation.x = -0.5 * t;
      f.body.position.y = 0.15 * t;
    });
  }

  private async dart(f: Fig, b: Vector3) {
    const a = f.root.position.clone();
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z), 100);
    if (f.body.rotation.x === 0) await this.rear(f);
    this.sound.play("whoosh", { gain: 0.6 });
    await tween(
      this.clock,
      Math.max(260, a.distanceTo(b) * 90),
      (t) => {
        f.root.position.set(a.x + (b.x - a.x) * t, 0.1 * Math.sin(Math.PI * t), a.z + (b.z - a.z) * t);
        f.body.rotation.x = -0.5 * (1 - t) + 0.3 * Math.sin(Math.PI * t);
        if (Math.random() < 0.7) this.fx.spawn(f.root.position.clone().setY(0.5), { color: 0xff9030, size: 0.035, vel: new Vector3(0, 0.2, 0), life: 500, gravity: 0, glow: true });
      },
      ease.inOut,
    );
    this.fx.dust(b, 6, 0x50484a);
    await tween(this.clock, 180, (t) => {
      f.body.rotation.x = 0.3 * (1 - t);
      f.body.position.y = 0.15 * (1 - t);
    });
    await this.settle(f);
  }

  /** A witchfire bolt from the witch to the piece, then a flash and smoke: the piece is gone, an animal sits there. */
  private async hexBolt(f: Fig, v: Fig) {
    const from = f.root.position.clone().setY(1.0);
    const to = v.root.position.clone().setY(0.6);
    const bolt = new Sprite(new SpriteMaterial({ map: glowTexture(), color: 0xff8a20, blending: AdditiveBlending, depthWrite: false }));
    bolt.scale.setScalar(0.55);
    this.scene.add(bolt);
    this.sound.play("zap", { gain: 0.5, rate: 0.8 });
    await tween(this.clock, 260, (t) => {
      bolt.position.lerpVectors(from, to, t);
      this.fx.spawn(bolt.position.clone(), { color: 0xff9a30, size: 0.04, vel: new Vector3(0, 0.1, 0), life: 350, gravity: 0, glow: true });
    });
    bolt.removeFromParent();
    this.hurt(v);
    this.flash.position.copy(to);
    this.flash.color.set(0xff7a20);
    this.flash.intensity = 30;
    void tween(this.clock, 260, (t) => (this.flash.intensity = 30 * (1 - t)));
    this.fx.burst(to, 0xff8a20, 22, { speed: 1.8, size: 0.06, up: 1.4, glow: true });
    this.fx.dust(v.root.position, 14, 0x5a4a60);
    await tween(this.clock, 160, (t) => v.body.scale.setScalar(Math.max(0.001, 1 - t)));
  }

  /** The animal pops up where the piece stood and goes off by itself, then is gone. */
  private async leave(v: Fig) {
    const kind = hex.animal ?? ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const at = v.root.position.clone();
    v.root.removeFromParent();
    const g = animal(kind);
    g.position.copy(at);
    g.scale.multiplyScalar(0.01);
    this.scene.add(g);
    // Any way at all, to the board's edge and past it.
    const heading = Math.random() * Math.PI * 2;
    const dir = new Vector3(Math.sin(heading), 0, Math.cos(heading));
    g.rotation.y = heading;
    const gait = GAIT[kind];
    const end = at.clone().addScaledVector(dir, { hop: 5, scurry: 6.5, fly: 7, slither: 5, crawl: 5.5 }[gait]);
    const ms = { hop: 1500, scurry: 1100, fly: 1300, slither: 2000, crawl: 1500 }[gait];
    this.sound.play("land", { gain: 0.2, rate: 1.8 });
    const wings: Object3D[] = [];
    g.traverse((o) => o.userData.wing && wings.push(o));
    await tween(
      this.clock,
      ms,
      (t) => {
        const k = Math.min(1, t * 8);
        g.scale.setScalar(1.15 * k * (t > 0.88 ? (1 - t) / 0.12 : 1) + 0.001);
        const p = at.clone().lerp(end, t);
        let y = 0;
        let yaw = 0;
        if (gait === "hop") y = Math.abs(Math.sin(t * Math.PI * 6)) * 0.22;
        else if (gait === "scurry") y = Math.abs(Math.sin(t * Math.PI * 18)) * 0.03;
        else if (gait === "fly") y = 0.2 + t * 1.8 + Math.sin(t * Math.PI * 14) * 0.04;
        else if (gait === "slither") yaw = Math.sin(t * Math.PI * 10) * 0.5;
        else y = Math.abs(Math.sin(t * Math.PI * 24)) * 0.015;
        g.position.set(p.x, y, p.z);
        g.rotation.y = Math.atan2(dir.x, dir.z) + yaw;
        for (const w of wings) w.rotation.z = (w.userData.wing as number) * Math.sin(t * Math.PI * 40) * 0.9;
      },
      ease.linear,
    );
    g.removeFromParent();
    g.traverse((o) => {
      (o as Mesh).geometry?.dispose();
      ((o as Mesh).material as Material | undefined)?.dispose();
    });
  }

  // ----- Queen: the bride -----

  /** Glides; to take, she raises a hand and commands the bats to gather round the piece and carry it up into the night. */
  private async bride(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    if (victim) {
      const at = victim.root.position.clone();
      await this.turn(f, Math.atan2(at.x - f.root.position.x, at.z - f.root.position.z), 140);
      // Her hand rises, palm out, and holds.
      const clip = ["Charged_Spell_Cast", "mage_soell_cast"].find((n) => f.anim?.clips.has(n));
      if (clip) {
        void f.play(clip, { speed: 0.9, hold: true });
        await wait(this.clock, 520);
      }
      const bats = this.bats(f.root.position.clone().setY(1.5), 26);
      this.sound.play("whoosh", { gain: 0.5, rate: 1.4 });
      // They stream from her hand to the piece.
      await tween(this.clock, 450, (t) => this.flap(bats, f.root.position.clone().setY(1.5).lerp(at.clone().setY(0.6), ease.inOut(t)), 0.4 + 0.2 * t, t * 4));
      this.hurt(victim);
      const h = victim.root.position.y;
      await tween(
        this.clock,
        1000,
        (t) => {
          victim.root.position.y = h + 3.4 * t * t;
          victim.root.rotation.y += 0.05;
          victim.body.scale.setScalar(Math.max(0.15, 1 - 0.7 * t));
          this.flap(bats, at.clone().setY(0.6 + 3.4 * t * t), 0.5 - 0.15 * t, 4 + t * 6);
        },
        ease.linear,
      );
      victim.root.removeFromParent();
      await tween(this.clock, 380, (t) => this.flap(bats, at.clone().setY(4.2 + 2 * t), 0.5 + 2 * t, 10 + t * 4, 1 - t));
      this.dropBats(bats);
      f.rest();
    }
    await this.glide(f, b);
  }

  // ----- Bats -----

  private bats(at: Vector3, n: number): Bat[] {
    const tex = batTexture();
    return Array.from({ length: n }, () => {
      const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.28);
      this.scene.add(s);
      return { s, phase: Math.random() * 6.28, r: 0.3 + Math.random() * 0.4, a: Math.random() * 6.28, h: (Math.random() - 0.5) * 0.9 };
    });
  }

  /** Bats circling c at radius r (spread), wings beating; fade is 1 to 0 for fading out. */
  private flap(bats: Bat[], c: Vector3, r: number, turn: number, fade = 1) {
    bats.forEach((b) => {
      const a = b.a + turn + b.phase * 0.2;
      b.s.position.set(c.x + Math.cos(a) * b.r * r * 2, c.y + b.h * r * 1.6, c.z + Math.sin(a) * b.r * r * 2);
      const beat = Math.abs(Math.sin(this.clock.now * 0.03 + b.phase));
      b.s.scale.set(0.12 + 0.2 * beat, 0.25, 1);
      b.s.material.opacity = fade;
    });
  }

  private dropBats(bats: Bat[]) {
    for (const b of bats) {
      b.s.removeFromParent();
      b.s.material.dispose();
    }
  }

  // ----- King: the vampire lord -----

  /** Bursts into bats that sweep over the piece and reform behind it; to take, he bites it from behind, drains it to dust, and steps into its square. */
  private async lord(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dir = b.clone().sub(a).setY(0).normalize();
    const bats = this.bats(a.clone().setY(1.0), 30);
    f.root.visible = false;
    this.sound.play("whoosh", { gain: 0.5, rate: 1.5 });
    // Over the piece and down behind it.
    const spot = victim ? b.clone().addScaledVector(dir, 0.75) : b.clone();
    const over = b.clone().setY(2.2);
    await tween(
      this.clock,
      Math.max(750, a.distanceTo(b) * 240),
      (t) => {
        const u = 1 - t;
        const c = new Vector3()
          .addScaledVector(a.clone().setY(1.0), u * u)
          .addScaledVector(over, 2 * u * t)
          .addScaledVector(spot.clone().setY(1.0), t * t);
        this.flap(bats, c, 0.5 + 0.35 * Math.sin(Math.PI * t), t * 14);
      },
      ease.linear,
    );
    // Reform: the bats close in and he appears.
    f.root.position.copy(spot);
    f.root.rotation.y = Math.atan2(-dir.x, -dir.z);
    f.root.visible = true;
    await tween(this.clock, 260, (t) => {
      f.body.scale.setScalar(Math.max(0.01, t));
      this.flap(bats, spot.clone().setY(1.0), 0.55 * (1 - t), 14 + t * 8, 1 - t);
    });
    this.dropBats(bats);
    f.body.scale.setScalar(1);
    if (!victim) {
      await this.settle(f);
      return;
    }
    // Over its shoulder: he leans in and bites.
    this.hurt(victim);
    this.sound.play("hum", { gain: 0.4, rate: 0.6 });
    await tween(this.clock, 260, (t) => {
      f.body.rotation.x = 0.5 * t;
      f.root.position.copy(spot.clone().addScaledVector(dir, -0.25 * t));
      victim.body.rotation.x = -0.3 * t;
    });
    this.blood(victim.root.position.clone().setY(victim.height * 0.8), 6);
    const v = victim.root.position.clone().setY(victim.height * 0.8);
    const k = f.root.position.clone().setY(1.5);
    void this.tint(victim, 0x777777, 0.9, 900);
    await tween(this.clock, 900, (t) => {
      victim.body.scale.set(1 - 0.3 * t, 1 - 0.5 * t, 1 - 0.3 * t);
      for (let i = 0; i < 2; i++)
        this.fx.spawn(v.clone().add(new Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2)), {
          color: 0xc01428,
          size: 0.04,
          vel: k
            .clone()
            .sub(v)
            .multiplyScalar(2)
            .add(new Vector3(0, 0.3, 0)),
          life: 450,
          gravity: 0,
          glow: true,
        });
    });
    // The piece crumbles to dust.
    this.fx.burst(v.clone().setY(victim.height * 0.5), 0x8a8a90, 30, { speed: 1.2, size: 0.05, up: 0.9, life: 900 });
    this.fx.dust(victim.root.position, 14, 0x777780);
    this.sound.play("rubble", { gain: 0.4, rate: 1.5 });
    victim.root.removeFromParent();
    await tween(this.clock, 200, (t) => (f.body.rotation.x = 0.5 * (1 - t)));
    await this.glide(f, b, 280);
  }
}
