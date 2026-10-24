// Arena figures, all built here from shapes so every one can be tweaked:
// a sorcerer king with a big staff, a queen in a gown, a sorcerer bishop (white:
// a haloed, winged holy man), a mounted knight (black: a headless horseman), a
// stone tower that comes apart, and foot soldiers. White is bright and good,
// black dark and evil. Figures face +z; the scene turns white's around.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type Euler,
  type Material,
  type Object3D,
} from "three";
import { clipAbove, ease, ownMaterials, tween, type Clock } from "./fx";

export type Role = "k" | "q" | "r" | "b" | "n" | "p";
export type Side = "w" | "b";

/** Each side's magic. */
export const MAGIC: Record<Side, Color> = { w: new Color(0x7fe3ff), b: new Color(0xc07bff) };

export class Fig {
  /** On the square: position and facing. */
  readonly root = new Group();
  /** Inside root, for squashing, swaying and bobbing without losing the square. */
  readonly body = new Group();
  mats: Material[] = [];
  /** Rooks: their stones, each with its home in userData.home. */
  stones: Mesh[] = [];
  core?: Mesh;
  runes: Mesh[] = [];
  /** The arm that holds the staff or sword, and a staff's orb. */
  arm?: Group;
  orb?: Mesh;
  glow?: Sprite;
  /** Soldiers' legs and arms (they walk), the horse's legs (FL, FR, BL, BR). */
  legs: Group[] = [];
  arms: Group[] = [];
  hooves: Group[] = [];
  /** Fire that flickers (the horseman's flames). */
  flames: Mesh[] = [];
  /** Parts with a rest pose (userData.rest) to go back to. */
  private posed: Object3D[] = [];
  /** Robes and gowns sway; floating figures bob. */
  robed = false;
  floating = false;
  private t = Math.random() * 10;

  constructor(
    readonly role: Role,
    readonly side: Side,
    readonly height: number,
  ) {
    this.root.add(this.body);
  }

  pose(...parts: Object3D[]) {
    for (const p of parts) {
      p.userData.rest = p.rotation.clone();
      this.posed.push(p);
    }
  }

  /** Back to standing still on the square, whole. */
  rest() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    for (const p of this.posed) p.rotation.copy(p.userData.rest as Euler);
    for (const s of this.stones) {
      s.position.copy(s.userData.home.pos);
      s.rotation.set(0, s.userData.home.rot, 0);
    }
    this.core?.scale.set(1, 1, 1);
    this.core?.position.setY(0.4);
    for (const r of this.runes) r.visible = false;
    this.floating = false;
    clipAbove(this.mats, null);
  }

  update(ms: number) {
    this.t += ms / 1000;
    if (this.orb) {
      const m = this.orb.material as MeshStandardMaterial;
      m.emissiveIntensity = Math.max(1.6 + Math.sin(this.t * 3) * 0.5, m.emissiveIntensity * 0.96);
    }
    if (this.robed) this.body.rotation.z = Math.sin(this.t * 1.3) * 0.025;
    if (this.floating) this.body.position.y = Math.sin(this.t * 5) * 0.03;
    for (const f of this.flames) {
      (f.material as MeshStandardMaterial).emissiveIntensity = 1.8 + Math.random() * 1.4;
      f.scale.y = 0.85 + Math.random() * 0.3;
    }
  }

  /** Staff holders: raise the staff, the orb flaring (a bigger flare to kill). */
  async cast(clock: Clock, kind: "order" | "kill") {
    if (!this.arm || !this.orb) return;
    const orb = this.orb.material as MeshStandardMaterial;
    const flare = kind === "kill" ? 8 : 5;
    const rest = (this.arm.userData.rest as Euler).x;
    await tween(clock, 260, (t) => {
      this.arm!.rotation.x = rest + (-1.5 - rest) * t;
      orb.emissiveIntensity = 1.6 + flare * t;
      this.glow!.scale.setScalar(0.4 + 0.6 * t);
    });
    void tween(clock, 450, (t) => {
      this.arm!.rotation.x = -1.5 + (rest + 1.5) * t;
      this.glow!.scale.setScalar(1 - 0.6 * t);
    });
  }

  /** Sword holders: a chop from overhead, or a slash across; resolves at the hit. */
  async swing(clock: Clock, kind: "chop" | "slash") {
    const a = this.arm;
    if (!a) return;
    const rest = (a.userData.rest as Euler).clone();
    if (kind === "chop") {
      await tween(clock, 240, (t) => (a.rotation.x = rest.x + (-2.7 - rest.x) * t), ease.out);
      await tween(clock, 120, (t) => (a.rotation.x = -2.7 + 2.5 * t), ease.in);
    } else {
      await tween(
        clock,
        240,
        (t) => {
          a.rotation.x = rest.x + (-1.5 - rest.x) * t;
          a.rotation.y = 1.4 * t;
        },
        ease.out,
      );
      await tween(clock, 140, (t) => (a.rotation.y = 1.4 - 2.8 * t), ease.in);
    }
    void tween(clock, 300, (t) => {
      const now = a.rotation.clone();
      a.rotation.set(now.x + (rest.x - now.x) * t, now.y + (rest.y - now.y) * t, now.z + (rest.z - now.z) * t);
    });
  }

  /** Where a staff's magic leaves from. */
  staffTip(): Vector3 {
    if (this.orb) return this.orb.getWorldPosition(new Vector3());
    return this.root.position.clone().add(new Vector3(0, this.height * 1.05, 0));
  }

  /** The figure's middle, where magic strikes it. */
  middle(): Vector3 {
    return this.root.position.clone().add(new Vector3(0, this.height * 0.6, 0));
  }
}

// ---------- Parts ----------

const std = (color: number, o: Partial<{ rough: number; metal: number; emissive: number; ei: number; side: typeof DoubleSide }> = {}) =>
  new MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.75,
    metalness: o.metal ?? 0,
    flatShading: true,
    emissive: o.emissive ?? 0,
    emissiveIntensity: o.ei ?? 0,
    ...(o.side ? { side: o.side } : {}),
  });
const glowing = (color: number, ei = 2) => std(color, { emissive: color, ei });
const gold = () => std(0xd4a82a, { rough: 0.4, metal: 0.3, emissive: 0x4a3200, ei: 0.6 });
const iron = () => std(0x3c3c44, { rough: 0.45, metal: 0.4 });

const lathe = (pts: [number, number][], segs = 20) =>
  new LatheGeometry(
    pts.map(([x, y]) => new Vector2(x, y)),
    segs,
  );

function mesh(geo: ConstructorParameters<typeof Mesh>[0], mat: Material, x = 0, y = 0, z = 0) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** An arm or leg: a group pivoting at its top (x, y, z), hanging len down. */
function limb(len: number, r: number, mat: Material, x: number, y: number, z = 0) {
  const g = new Group();
  g.position.set(x, y, z);
  g.add(mesh(new CylinderGeometry(r, r * 0.8, len, 7), mat, 0, -len / 2, 0));
  return g;
}

let glowTexture: CanvasTexture | null = null;
function glowMap() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.5)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return (glowTexture = new CanvasTexture(c));
}

/** A band with points, r wide, its foot at 0; a jewel in front if given. */
function crown(r: number, mat: Material, jewel?: number, tall = 1) {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(r, r * 1.08, r * 0.38, 14, 1, true), mat, 0, r * 0.19, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new ConeGeometry(r * 0.19, r * 0.56 * tall, 5), mat, Math.cos(a) * r, r * (0.38 + 0.28 * tall), Math.sin(a) * r));
  }
  if (jewel !== undefined) g.add(mesh(new SphereGeometry(r * 0.13, 8, 6), glowing(jewel, 1.5), 0, r * 0.2, r * 1.05));
  return g;
}

/** A head with a face looking +z: kind or evil brows, eyes (glowing for the evil), a beard or goatee. */
function head(o: { r: number; skin: number; evil?: boolean; eyes?: number; beard?: number; goatee?: boolean; brows?: number }) {
  const g = new Group();
  const r = o.r;
  g.add(mesh(new SphereGeometry(r, 14, 10), std(o.skin, { rough: 0.8 })));
  const eye = o.eyes !== undefined ? glowing(o.eyes, 3) : std(0x1a1410);
  for (const s of [-1, 1]) {
    g.add(mesh(new SphereGeometry(r * 0.13, 6, 4), eye, s * r * 0.36, r * 0.12, r * 0.9));
    const brow = mesh(new BoxGeometry(r * 0.42, r * 0.09, r * 0.1), std(o.brows ?? o.beard ?? 0x3a2a1a), s * r * 0.36, r * 0.36, r * 0.9);
    // Evil brows slope down to the middle; kind ones up.
    brow.rotation.z = s * (o.evil ? 0.45 : -0.15);
    g.add(brow);
  }
  g.add(mesh(new SphereGeometry(r * 0.14, 6, 4), std(o.skin), 0, -r * 0.05, r * 1.0));
  if (o.beard !== undefined) {
    const beard = mesh(new ConeGeometry(o.goatee ? r * 0.28 : r * 0.6, o.goatee ? r * 0.8 : r * 1.1, 8), std(o.beard), 0, -r * (o.goatee ? 1.0 : 0.95), r * 0.55);
    beard.rotation.x = Math.PI;
    g.add(beard);
  } else g.add(mesh(new BoxGeometry(r * 0.4, r * 0.06, r * 0.05), std(0x8a2a3a), 0, -r * 0.4, r * 0.92));
  return g;
}

/** A sword in the hand at the group's origin, the blade along -y (the arm's way). */
function sword(side: Side, len: number) {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.012, 0.012, 0.07, 6), std(0x3b2a1e), 0, -0.035, 0));
  g.add(mesh(new BoxGeometry(0.1, 0.02, 0.025), side === "w" ? gold() : iron(), 0, -0.07, 0));
  const blade = side === "w" ? std(0xf2f4f8, { rough: 0.25, metal: 0.3, emissive: 0x334455, ei: 0.4 }) : std(0x4a4d55, { rough: 0.4, metal: 0.4, emissive: 0x400000, ei: 0.5 });
  g.add(mesh(new BoxGeometry(0.026, len, 0.008), blade, 0, -0.08 - len / 2, 0));
  return g;
}

/** A staff of len with an orb on top, held at the group's origin; the orb is returned for casting. */
function staff(len: number, wood: number, trim: Material, orbColor: number, orbR: number) {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.022, 0.028, len, 6), std(wood), 0, len * 0.35, 0));
  g.add(mesh(new TorusGeometry(orbR + 0.01, 0.014, 6, 14), trim, 0, len * 0.85 + 0.02, 0));
  const orb = mesh(new SphereGeometry(orbR, 12, 8), glowing(orbColor, 1.6), 0, len * 0.85 + 0.04, 0);
  const glow = new Sprite(new SpriteMaterial({ map: glowMap(), color: orbColor, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.4);
  orb.add(glow);
  g.add(orb);
  return { g, orb, glow };
}

/** The arm holding a staff: raised to cast. */
function staffArm(f: Fig, sleeve: Material, hand: Material, x: number, y: number, s: ReturnType<typeof staff>) {
  const arm = limb(0.36, 0.065, sleeve, x, y);
  arm.add(mesh(new SphereGeometry(0.04, 8, 6), hand, 0, -0.38, 0.02));
  s.g.position.set(0.0, -0.38, 0.04);
  arm.add(s.g);
  arm.rotation.x = -0.25;
  f.arm = arm;
  f.orb = s.orb;
  f.glow = s.glow;
  f.pose(arm);
  return arm;
}

// ---------- King ----------

/** A sorcerer king: robe, crown, a face (kindly and bearded, or grey and cruel), a staff taller than he is. */
function king(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("k", side, 1.45);
  f.robed = true;
  const robe = std(w ? 0x2c4fa8 : 0x3a0d14);
  const trim = std(w ? 0xf4f1ea : 0x151317);
  const skin = std(w ? 0xe8c1a0 : 0x97a296);
  const b = f.body;
  b.add(
    mesh(
      lathe([
        [0, 0],
        [0.4, 0],
        [0.39, 0.08],
        [0.3, 0.4],
        [0.22, 0.75],
        [0.2, 0.9],
        [0.1, 0.99],
        [0, 1.0],
      ]),
      robe,
    ),
  );
  const hem = mesh(new TorusGeometry(0.385, 0.04, 6, 24), trim, 0, 0.05, 0);
  hem.rotation.x = Math.PI / 2;
  b.add(hem, mesh(new CylinderGeometry(0.22, 0.29, 0.12, 16), trim, 0, 0.88, 0));
  const h = head({ r: 0.15, skin: w ? 0xe8c1a0 : 0x97a296, evil: !w, eyes: w ? undefined : 0xff3030, beard: w ? 0xf0f0f0 : 0x161616, goatee: !w });
  h.position.y = 1.1;
  const c = crown(0.15, w ? gold() : iron(), w ? 0x3060ff : 0xff2020, w ? 1 : 1.5);
  c.position.y = 1.19;
  b.add(h, c);
  const left = limb(0.36, 0.065, robe, -0.25, 0.88);
  left.rotation.set(-0.35, 0, 0.12);
  left.add(mesh(new SphereGeometry(0.04, 8, 6), skin, 0, -0.38, 0.02));
  f.pose(left);
  b.add(left, staffArm(f, robe, skin, 0.25, 0.88, staff(1.4, w ? 0x7a5532 : 0x24170f, w ? gold() : iron(), MAGIC[side].getHex(), 0.09)));
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Queen ----------

/** A queen in a long gown with a tiara (white) or a spiked crown and collar (black). */
function queen(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("q", side, 1.25);
  f.robed = true;
  const gown = std(w ? 0xf3ead8 : 0x1c1222, { rough: 0.6 });
  const accent = std(w ? 0x3d6fd0 : 0x8a1530);
  const skin = std(w ? 0xf0d0b5 : 0xc9c4cf);
  const b = f.body;
  b.add(
    mesh(
      lathe([
        [0, 0],
        [0.36, 0],
        [0.35, 0.05],
        [0.24, 0.3],
        [0.13, 0.56],
        [0.11, 0.63],
        [0.14, 0.8],
        [0.09, 0.88],
        [0, 0.9],
      ]),
      gown,
    ),
  );
  const sash = mesh(new TorusGeometry(0.115, 0.022, 6, 18), accent, 0, 0.62, 0);
  sash.rotation.x = Math.PI / 2;
  b.add(sash);
  if (!w)
    for (let i = 0; i < 7; i++) {
      // A high collar of spikes behind the head.
      const a = Math.PI * (0.15 + (i / 6) * 0.7) + Math.PI;
      const s = mesh(new ConeGeometry(0.025, 0.2, 4), accent, Math.cos(a) * 0.12, 0.95, Math.sin(a) * 0.12);
      s.rotation.set(Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5);
      b.add(s);
    }
  const h = head({ r: 0.12, skin: w ? 0xf0d0b5 : 0xc9c4cf, evil: !w, eyes: w ? undefined : 0xff3030, brows: w ? 0xb08a3a : 0x0d0d10 });
  h.position.y = 1.0;
  const hair = std(w ? 0xe8c66a : 0x0d0d10);
  b.add(h, mesh(new SphereGeometry(0.13, 12, 8), hair, 0, 1.02, -0.03), mesh(new SphereGeometry(0.07, 8, 6), hair, 0, 1.1, -0.11));
  const c = crown(0.1, w ? gold() : iron(), w ? 0x60a0ff : 0xff2020, w ? 0.8 : 1.6);
  c.position.y = 1.09;
  b.add(c);
  for (const s of [-1, 1]) {
    const arm = limb(0.3, 0.035, w ? skin : gown, s * 0.14, 0.82);
    arm.rotation.set(-0.3, 0, s * 0.2);
    arm.add(mesh(new SphereGeometry(0.03, 8, 6), skin, 0, -0.31, 0));
    f.pose(arm);
    b.add(arm);
  }
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Bishop ----------

/** Black's bishop: a hooded sorcerer in a dark robe, glowing eyes, a staff with a glowing orb. */
function darkSorcerer(): Fig {
  const f = new Fig("b", "b", 1.15);
  f.robed = true;
  const robe = std(0x3a2352);
  const magic = MAGIC.b.getHex();
  const b = f.body;
  b.add(
    mesh(
      lathe([
        [0, 0],
        [0.36, 0],
        [0.35, 0.07],
        [0.27, 0.35],
        [0.2, 0.7],
        [0.17, 0.92],
        [0, 0.96],
      ]),
      robe,
    ),
  );
  const belt = mesh(new TorusGeometry(0.205, 0.025, 6, 20), gold(), 0, 0.62, 0);
  belt.rotation.x = Math.PI / 2;
  b.add(belt);
  b.add(
    mesh(
      lathe(
        [
          [0.21, 0.88],
          [0.2, 1.02],
          [0.16, 1.18],
          [0.07, 1.3],
          [0, 1.33],
        ],
        14,
      ),
      robe,
    ),
  );
  b.add(mesh(new SphereGeometry(0.13, 10, 8), std(0x0d0912), 0, 1.06, 0.07));
  const eye = glowing(magic, 3);
  b.add(mesh(new SphereGeometry(0.018, 6, 4), eye, -0.045, 1.08, 0.19), mesh(new SphereGeometry(0.018, 6, 4), eye, 0.045, 1.08, 0.19));
  const left = limb(0.4, 0.07, robe, -0.21, 0.84);
  left.rotation.set(-0.4, 0, 0.15);
  f.pose(left);
  b.add(left, staffArm(f, robe, std(0x0d0912), 0.21, 0.84, staff(1.05, 0x3b2a1e, gold(), magic, 0.06)));
  b.scale.setScalar(0.85);
  f.mats = ownMaterials(b);
  return f;
}

/** White's bishop: a holy man in white and gold, a halo and wings, a staff with a golden light. */
function holyMan(): Fig {
  const f = new Fig("b", "w", 1.15);
  f.robed = true;
  const robe = std(0xf6f3ea, { rough: 0.6 });
  const g = gold();
  const skin = std(0xf0d2b8);
  const b = f.body;
  b.add(
    mesh(
      lathe([
        [0, 0],
        [0.33, 0],
        [0.32, 0.06],
        [0.24, 0.35],
        [0.17, 0.68],
        [0.15, 0.8],
        [0, 0.83],
      ]),
      robe,
    ),
  );
  b.add(mesh(new BoxGeometry(0.07, 0.72, 0.02), g, 0, 0.42, 0.24).rotateX(-0.12));
  const h = head({ r: 0.12, skin: 0xf0d2b8, beard: 0xf4f4f4 });
  h.position.y = 0.94;
  b.add(h);
  const halo = mesh(new TorusGeometry(0.15, 0.016, 6, 28), std(0xffe27a, { emissive: 0xffd34a, ei: 2.2 }), 0, 1.07, -0.08);
  halo.rotation.x = -0.25;
  b.add(halo);
  // Wings: feathered shapes from the shoulders, swept back.
  const wing = new Shape();
  wing.moveTo(0, 0);
  wing.bezierCurveTo(0.12, 0.25, 0.3, 0.35, 0.42, 0.32);
  wing.lineTo(0.36, 0.22);
  wing.lineTo(0.4, 0.16);
  wing.lineTo(0.32, 0.08);
  wing.lineTo(0.34, 0.0);
  wing.lineTo(0.22, -0.02);
  wing.bezierCurveTo(0.14, -0.1, 0.06, -0.12, 0, 0);
  const wingGeo = new ExtrudeGeometry(wing, { depth: 0.015, bevelEnabled: false });
  const feather = std(0xffffff, { rough: 0.5, emissive: 0xfff4d0, ei: 0.25, side: DoubleSide });
  for (const s of [-1, 1]) {
    const m = mesh(wingGeo, feather, s * 0.06, 0.7, -0.14);
    m.scale.x = s;
    m.rotation.y = s * -0.6;
    b.add(m);
  }
  const left = limb(0.32, 0.06, robe, -0.19, 0.76);
  left.rotation.set(-0.5, 0, 0.12);
  left.add(mesh(new SphereGeometry(0.035, 8, 6), skin, 0, -0.33, 0.02));
  f.pose(left);
  b.add(left, staffArm(f, robe, skin, 0.19, 0.76, staff(1.0, 0xe8e0c8, g, 0xffe27a, 0.06)));
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Knight ----------

/** A horse (white, or black with burning eyes, mane and tail); its legs pivot at the hips. */
function horse(f: Fig, w: boolean) {
  const hide = std(w ? 0xf1ede4 : 0x18161c, { rough: 0.7 });
  const fire = std(0xff4a10, { emissive: 0xff4a10, ei: 2 });
  const b = f.body;
  const torso = mesh(new CapsuleGeometry(0.13, 0.32, 4, 10), hide, 0, 0.5, 0);
  torso.rotation.x = Math.PI / 2;
  const neck = mesh(new CylinderGeometry(0.065, 0.1, 0.3, 8), hide, 0, 0.66, 0.2);
  neck.rotation.x = 0.6;
  const muzzle = mesh(new BoxGeometry(0.1, 0.11, 0.24), hide, 0, 0.8, 0.32);
  muzzle.rotation.x = 0.5;
  b.add(torso, neck, muzzle);
  for (const s of [-1, 1]) {
    b.add(mesh(new ConeGeometry(0.022, 0.07, 4), hide, s * 0.03, 0.9, 0.25));
    b.add(mesh(new SphereGeometry(0.014, 6, 4), w ? std(0x111111) : glowing(0xff2a10, 3), s * 0.052, 0.84, 0.36));
  }
  const mane = mesh(new BoxGeometry(0.03, 0.3, 0.07), w ? std(0xd8d0c0) : fire, 0, 0.72, 0.14);
  mane.rotation.x = 0.6;
  const tail = mesh(new ConeGeometry(0.04, 0.3, 6), w ? std(0xd8d0c0) : fire, 0, 0.47, -0.32);
  tail.rotation.x = -2.4;
  b.add(mane, tail);
  if (!w) f.flames.push(mane, tail);
  for (const [x, z] of [
    [-0.075, 0.17],
    [0.075, 0.17],
    [-0.075, -0.17],
    [0.075, -0.17],
  ]) {
    const leg = limb(0.4, 0.033, hide, x, 0.42, z);
    leg.add(mesh(new CylinderGeometry(0.03, 0.035, 0.04, 6), std(0x2a2420), 0, -0.39, 0));
    f.hooves.push(leg);
    f.pose(leg);
    b.add(leg);
  }
  b.add(mesh(new BoxGeometry(0.29, 0.16, 0.26), std(w ? 0x2f5fb3 : 0x4a0d10), 0, 0.56, -0.02));
}

/** A knight on horseback: a valiant knight with plume and shield, or a headless horseman with fire at his neck. */
function knight(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("n", side, 1.15);
  horse(f, w);
  const armor = w ? std(0xdfe4ec, { rough: 0.3, metal: 0.3 }) : iron();
  const cloth = std(w ? 0x2f5fb3 : 0x2a0a0d, { side: DoubleSide });
  const b = f.body;
  for (const s of [-1, 1]) {
    const leg = limb(0.24, 0.035, armor, s * 0.12, 0.7, 0);
    leg.rotation.set(-0.5, 0, s * 0.35);
    b.add(leg);
  }
  b.add(mesh(new CylinderGeometry(0.08, 0.1, 0.24, 8), armor, 0, 0.82, -0.02));
  const cape = mesh(new PlaneGeometry(0.24, 0.42), cloth, 0, 0.74, -0.12);
  cape.rotation.x = 0.25;
  b.add(cape);
  if (w) {
    b.add(mesh(new SphereGeometry(0.075, 12, 8), armor, 0, 1.0, -0.02));
    b.add(mesh(new BoxGeometry(0.1, 0.014, 0.02), std(0x111111), 0, 1.0, 0.05));
    b.add(mesh(new BoxGeometry(0.02, 0.07, 0.18), std(0xd0283a), 0, 1.09, -0.04));
  } else {
    // No head: a stump with fire.
    b.add(mesh(new CylinderGeometry(0.04, 0.045, 0.03, 8), std(0x2a0a0d), 0, 0.955, -0.02));
    const flame = mesh(new ConeGeometry(0.05, 0.16, 7), std(0xff6a1a, { emissive: 0xff6a1a, ei: 2 }), 0, 1.04, -0.02);
    f.flames.push(flame);
    b.add(flame);
  }
  const arm = limb(0.22, 0.033, armor, 0.12, 0.92, -0.02);
  const sw = sword(side, 0.42);
  sw.position.y = -0.22;
  sw.rotation.x = -1.1;
  arm.add(sw);
  arm.rotation.x = -0.6;
  f.arm = arm;
  const left = limb(0.22, 0.033, armor, -0.12, 0.92, -0.02);
  left.rotation.x = -0.9;
  if (w) {
    const shield = mesh(new CylinderGeometry(0.1, 0.1, 0.02, 16), std(0xf4f4f4), -0.03, -0.16, 0.05);
    shield.rotation.x = Math.PI / 2;
    shield.add(mesh(new BoxGeometry(0.03, 0.03, 0.15), std(0x2f5fb3), 0, 0.012, 0), mesh(new BoxGeometry(0.15, 0.03, 0.03), std(0x2f5fb3), 0, 0.012, 0));
    left.add(shield);
  }
  f.pose(arm, left);
  b.add(arm, left);
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Pawn ----------

/** A foot soldier: shining armor, crest and cross shield, or black iron, horns and red eyes. */
function soldier(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("p", side, 0.8);
  const armor = w ? std(0xdfe4ec, { rough: 0.3, metal: 0.3 }) : std(0x34363d, { rough: 0.5, metal: 0.3 });
  const cloth = std(w ? 0x2f5fb3 : 0x5a0f12);
  const b = f.body;
  for (const s of [-1, 1]) {
    const leg = limb(0.28, 0.045, armor, s * 0.07, 0.28);
    f.legs.push(leg);
    f.pose(leg);
    b.add(leg);
  }
  b.add(mesh(new CylinderGeometry(0.12, 0.1, 0.26, 10), armor, 0, 0.41, 0), mesh(new BoxGeometry(0.2, 0.22, 0.02), cloth, 0, 0.4, 0.11));
  b.add(mesh(new SphereGeometry(0.095, 12, 8), armor, 0, 0.63, 0));
  b.add(mesh(new BoxGeometry(0.12, 0.02, 0.02), w ? std(0x111111) : glowing(0xff2020, 3), 0, 0.635, 0.088));
  if (w) b.add(mesh(new BoxGeometry(0.02, 0.06, 0.16), gold(), 0, 0.73, -0.01));
  else
    for (const s of [-1, 1]) {
      const horn = mesh(new ConeGeometry(0.025, 0.12, 6), std(0xd8cfb8), s * 0.09, 0.7, 0);
      horn.rotation.z = -s * 0.8;
      b.add(horn);
    }
  const arm = limb(0.22, 0.035, armor, 0.15, 0.52);
  const sw = sword(side, 0.3);
  sw.position.y = -0.22;
  sw.rotation.x = -1.2;
  arm.add(sw);
  arm.rotation.x = -0.4;
  f.arm = arm;
  const left = limb(0.22, 0.035, armor, -0.15, 0.52);
  left.rotation.x = -0.6;
  const shield = mesh(new CylinderGeometry(0.11, 0.11, 0.02, 16), w ? std(0xf4f4f4) : std(0x222226), -0.03, -0.14, 0.06);
  shield.rotation.x = Math.PI / 2;
  if (w) shield.add(mesh(new BoxGeometry(0.03, 0.03, 0.16), cloth, 0, 0.012, 0), mesh(new BoxGeometry(0.16, 0.03, 0.03), cloth, 0, 0.012, 0));
  else shield.add(mesh(new ConeGeometry(0.03, 0.08, 6), std(0x8a1c1c), 0, 0.05, 0));
  left.add(shield);
  f.arms.push(left, arm);
  f.pose(arm, left);
  b.add(arm, left);
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Rook ----------

/** A tower of loose stones (each can fall away and come back), runes glowing between rows when magic moves it. */
function stoneTower(side: Side): Fig {
  const f = new Fig("r", side, 1.0);
  const base = side === "b" ? 0x45424d : 0xd8d2c4;
  const magic = MAGIC[side].getHex();
  const block = new BoxGeometry(0.25, 0.19, 0.15);
  const merlon = new BoxGeometry(0.17, 0.16, 0.15);
  const R = 0.29;
  const add = (geo: BoxGeometry, a: number, y: number) => {
    const c = new Color(base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    const s = mesh(geo, std(c.getHex(), { rough: 0.9 }), Math.cos(a) * R, y, Math.sin(a) * R);
    s.rotation.y = -a + Math.PI / 2;
    s.userData.home = { pos: s.position.clone(), rot: s.rotation.y };
    f.stones.push(s);
    f.body.add(s);
  };
  for (let row = 0; row < 4; row++) for (let j = 0; j < 8; j++) add(block, ((j + (row % 2) * 0.5) / 8) * Math.PI * 2, 0.1 + row * 0.2);
  for (let j = 0; j < 4; j++) add(merlon, (j / 4) * Math.PI * 2 + Math.PI / 4, 0.88);
  f.core = mesh(new CylinderGeometry(0.25, 0.27, 0.8, 8), std(side === "b" ? 0x1d1b22 : 0x9a9488), 0, 0.4, 0);
  f.body.add(f.core);
  f.body.add(mesh(new CircleGeometry(0.27, 8).rotateX(-Math.PI / 2), std(side === "b" ? 0x2a2730 : 0xb8b1a3), 0, 0.8, 0));
  for (let row = 1; row < 4; row++) {
    const r = mesh(new TorusGeometry(0.33, 0.012, 4, 24), std(magic, { emissive: magic, ei: 0 }), 0, row * 0.2, 0);
    r.rotation.x = Math.PI / 2;
    r.visible = false;
    f.runes.push(r);
    f.body.add(r);
  }
  f.mats = ownMaterials(f.body);
  return f;
}

export function makeFig(role: Role, side: Side): Fig {
  const f =
    role === "k" ? king(side) : role === "q" ? queen(side) : role === "r" ? stoneTower(side) : role === "b" ? (side === "w" ? holyMan() : darkSorcerer()) : role === "n" ? knight(side) : soldier(side);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}
