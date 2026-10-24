// Arena figures, all built here from smooth shapes so every one can be tweaked:
// turned (lathe) bodies from spline profiles, polished metal that reflects the
// scene's environment, faces hidden behind helms, masks and hoods. White is
// bright and noble, black dark and evil. Figures face +z; the scene turns
// white's around.
import {
  AdditiveBlending,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  SplineCurve,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Euler,
  type Material,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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
  /** Soldiers' legs (they walk); the horse's legs FL, FR, BL, BR, each with its knee as userData.knee. */
  legs: Group[] = [];
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
    if (this.robed) this.body.rotation.z = Math.sin(this.t * 1.3) * 0.02;
    if (this.floating) this.body.position.y = Math.sin(this.t * 5) * 0.03;
    for (const f of this.flames) {
      (f.material as MeshStandardMaterial).emissiveIntensity = 2 + Math.random() * 1.5;
      f.scale.y = f.userData.sy * (0.85 + Math.random() * 0.3);
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
      await tween(clock, 220, (t) => (a.rotation.x = rest.x + (-2.7 - rest.x) * t), ease.out);
      await tween(clock, 110, (t) => (a.rotation.x = -2.7 + 2.5 * t), ease.in);
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

// ---------- Materials ----------

type Look = Partial<{ rough: number; metal: number; emissive: number; ei: number; two: boolean; opacity: number }>;

const mat = (color: number, o: Look = {}) =>
  new MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0,
    emissiveIntensity: o.ei ?? 0,
    ...(o.two ? { side: DoubleSide } : {}),
    ...(o.opacity !== undefined ? { transparent: true, opacity: o.opacity } : {}),
  });
const cloth = (color: number, two = false) => mat(color, { rough: 0.55, two });
const glow = (color: number, ei = 2.5) => mat(color, { emissive: color, ei });
/** Polished plate: bright silver for white, blackened steel for black. */
const steel = (side: Side) => (side === "w" ? mat(0xe4eaf2, { rough: 0.2, metal: 0.95 }) : mat(0x34363f, { rough: 0.3, metal: 0.9 }));
const gold = () => mat(0xe6b84a, { rough: 0.22, metal: 1 });
const darkIron = () => mat(0x22232a, { rough: 0.35, metal: 0.9 });

// ---------- Shapes ----------

/** A turned shape from a smooth spline through (radius, height) points; phi gives a part of the turn (0 is +z, the front). */
function lathe(pts: [number, number][], phi?: [number, number], segs = 24): BufferGeometry {
  const curve = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y)));
  return new LatheGeometry(curve.getPoints(Math.max(12, pts.length * 4)), segs, phi?.[0] ?? 0, phi?.[1] ?? Math.PI * 2);
}

/** Lathe's phi 0 is +z; this gives the start for a part centered on the front (0) or the back (PI). */
const around = (center: number, width: number): [number, number] => [center - width / 2, width];

function mesh(geo: BufferGeometry, m: Material, x = 0, y = 0, z = 0) {
  const o = new Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

const ball = (r: number, m: Material, x = 0, y = 0, z = 0) => mesh(new SphereGeometry(r, 16, 10), m, x, y, z);

/** A smooth ellipsoid. */
function egg(rx: number, ry: number, rz: number, m: Material, x = 0, y = 0, z = 0) {
  const o = ball(1, m, x, y, z);
  o.scale.set(rx, ry, rz);
  return o;
}

/** An arm or leg: a group pivoting at its top (x, y, z), a capsule hanging len down. */
function limb(len: number, r: number, m: Material, x: number, y: number, z = 0) {
  const g = new Group();
  g.position.set(x, y, z);
  g.add(mesh(new CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 3, 10), m, 0, -len / 2, 0));
  return g;
}

/** A tube along points (radius r), for plumes, manes, tails, crooks. */
const tube = (pts: [number, number, number][], r: number, m: Material) => mesh(new TubeGeometry(new CatmullRomCurve3(pts.map(([x, y, z]) => new Vector3(x, y, z))), 16, r, 7), m);

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
const halo = (color: number, size: number) => {
  const s = new Sprite(new SpriteMaterial({ map: glowMap(), color, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
};

/** A crown r wide, its foot at 0: a band with tall points (tall scales them) and jewels. */
function crown(r: number, m: Material, jewel: number, tall = 1) {
  const g = new Group();
  const band = m.clone();
  band.side = DoubleSide;
  g.add(mesh(new CylinderGeometry(r, r * 1.06, r * 0.36, 32, 1, true), band, 0, r * 0.18, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = r * 0.55 * tall * (i % 2 ? 0.65 : 1);
    g.add(mesh(new ConeGeometry(r * 0.13, h, 12), m, Math.sin(a) * r * 1.02, r * 0.36 + h / 2, Math.cos(a) * r * 1.02));
    if (i % 2 === 0) g.add(ball(r * 0.07, glow(jewel, 1.4), Math.sin(a) * r * 1.07, r * 0.18, Math.cos(a) * r * 1.07));
  }
  return g;
}

/** A head hidden in a hood: the hood open at the front, a mask (or darkness, or light) inside, two glowing eyes. */
function hooded(r: number, hood: Material, face: Material, eyes: number | null) {
  const g = new Group();
  g.add(
    mesh(
      lathe(
        [
          [r * 1.45, -r * 1.2],
          [r * 1.35, -r * 0.2],
          [r * 1.18, r * 0.75],
          [r * 0.6, r * 1.38],
          [0.001, r * 1.5],
        ],
        [0.75, Math.PI * 2 - 1.5],
      ),
      hood,
    ),
  );
  // The rim of the hood's opening.
  g.add(ball(r * 0.98, face, 0, 0, r * 0.12));
  if (eyes !== null)
    for (const s of [-1, 1]) {
      const e = egg(r * 0.16, r * 0.07, r * 0.05, glow(eyes, 3), s * r * 0.36, r * 0.12, r * 1.06);
      e.rotation.z = s * 0.25;
      g.add(e);
    }
  return g;
}

/** A closed helm: a smooth dome, a visor slit (dark, or glowing), a ridge down the front. */
function helm(r: number, side: Side, slit: Material) {
  const g = new Group();
  const m = steel(side);
  g.add(
    mesh(
      lathe([
        [0.001, r * 1.25],
        [r * 0.6, r * 1.15],
        [r * 0.95, r * 0.75],
        [r * 1.02, r * 0.1],
        [r * 0.98, -r * 0.6],
        [r * 0.9, -r * 0.95],
      ]),
      m,
    ),
  );
  g.add(mesh(new CylinderGeometry(r * 1.035, r * 1.035, r * 0.12, 32, 1, true, -0.65, 1.3), slit, 0, r * 0.15, 0));
  g.add(mesh(new CapsuleGeometry(r * 0.06, r * 1.4, 4, 8), m, 0, r * 0.2, r * 0.98));
  return g;
}

/** A sword in the hand at the group's origin, the blade along -y (the arm's way). */
function sword(side: Side, len: number) {
  const g = new Group();
  const blade = new Shape();
  blade.moveTo(-0.017, 0);
  blade.lineTo(0.017, 0);
  blade.lineTo(0.014, len * 0.85);
  blade.lineTo(0, len);
  blade.lineTo(-0.014, len * 0.85);
  blade.closePath();
  const geo = new ExtrudeGeometry(blade, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  geo.rotateX(Math.PI);
  const edge = side === "w" ? mat(0xf4f7fb, { rough: 0.12, metal: 1 }) : mat(0x3a3d46, { rough: 0.25, metal: 1, emissive: 0x500000, ei: 0.6 });
  g.add(mesh(new CapsuleGeometry(0.011, 0.05, 4, 8), cloth(0x3b2a1e), 0, -0.03, 0));
  const guard = mesh(new CapsuleGeometry(0.012, 0.08, 4, 8), side === "w" ? gold() : darkIron(), 0, -0.065, 0);
  guard.rotation.z = Math.PI / 2;
  g.add(guard, ball(0.017, side === "w" ? gold() : darkIron(), 0, 0.005, 0), mesh(geo, edge, 0, -0.07, 0));
  return g;
}

/** A heater shield facing +z: white with a gold cross, or black with a burning eye. */
function shield(side: Side, s: number) {
  const sh = new Shape();
  sh.moveTo(-0.1, 0.12);
  sh.lineTo(0.1, 0.12);
  sh.quadraticCurveTo(0.1, -0.04, 0, -0.14);
  sh.quadraticCurveTo(-0.1, -0.04, -0.1, 0.12);
  const geo = new ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
  const g = new Group();
  g.add(mesh(geo, side === "w" ? mat(0xf2f4f8, { rough: 0.3, metal: 0.2 }) : darkIron()));
  if (side === "w") {
    const bar = (w: number, h: number, y: number) => mesh(new CapsuleGeometry(w / 2, h, 4, 8), gold(), 0, y, 0.026);
    const across = bar(0.03, 0.1, 0.04);
    across.rotation.z = Math.PI / 2;
    g.add(bar(0.03, 0.17, 0.0), across);
  } else g.add(egg(0.04, 0.022, 0.012, glow(0xff2a10, 3), 0, 0.02, 0.026));
  g.scale.setScalar(s);
  return g;
}

/** A staff of len with an orb in a ring on top, held at the group's origin. */
function staff(len: number, wood: Material, trim: Material, orbColor: number, orbR: number) {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(0.018, 0.024, len, 16), wood, 0, len * 0.35, 0));
  const top = len * 0.85;
  const ring = mesh(new TorusGeometry(orbR * 1.25, 0.012, 6, 28), trim, 0, top + orbR * 0.4, 0);
  g.add(ring, mesh(new ConeGeometry(0.03, 0.08, 16), trim, 0, top - 0.04, 0));
  const orb = mesh(new SphereGeometry(orbR, 16, 10), glow(orbColor, 1.6), 0, top + orbR * 0.4, 0);
  const light = halo(orbColor, 0.4);
  orb.add(light);
  g.add(orb);
  return { g, orb, glow: light };
}

/** A bishop's crozier: a gold staff with a curled crook and a light in the curl. */
function crozier(len: number, color: number) {
  const g = new Group();
  const m = gold();
  g.add(mesh(new CylinderGeometry(0.016, 0.02, len, 16), m, 0, len * 0.35, 0));
  const top = len * 0.85;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 1.6;
    const r = 0.09 * (1 - i / 34);
    pts.push([Math.sin(a) * r, top + 0.09 - Math.cos(a) * r + (i === 0 ? -0.02 : 0), 0]);
  }
  g.add(tube(pts, 0.014, m));
  const orb = mesh(new SphereGeometry(0.035, 16, 10), glow(color, 1.6), 0.0, top + 0.09, 0);
  const light = halo(color, 0.4);
  orb.add(light);
  g.add(orb);
  return { g, orb, glow: light };
}

/** The arm holding a staff: raised to cast. */
function staffArm(f: Fig, sleeve: Material, glove: Material, x: number, y: number, s: { g: Group; orb: Mesh; glow: Sprite }) {
  const arm = limb(0.36, 0.055, sleeve, x, y);
  arm.add(ball(0.04, glove, 0, -0.37, 0.02));
  s.g.position.set(0, -0.37, 0.04);
  arm.add(s.g);
  arm.rotation.x = -0.25;
  f.arm = arm;
  f.orb = s.orb;
  f.glow = s.glow;
  f.pose(arm);
  return arm;
}

/** Round shoulder plates. */
function pauldrons(r: number, m: Material, x: number, y: number) {
  return [-1, 1].map((s) => {
    const p = mesh(new SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, s * x, y, 0);
    p.scale.set(1, 0.8, 1);
    p.rotation.z = -s * 0.35;
    return p;
  });
}

// ---------- King ----------

/** A sorcerer king: a robe and mantle, crown over a hood, a mask with glowing eyes, a staff taller than he is. */
function king(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("k", side, 1.45);
  f.robed = true;
  const robe = cloth(w ? 0x2848a8 : 0x3a0b14);
  const fur = mat(w ? 0xf6f3ee : 0x111013, { rough: 0.9 });
  const b = f.body;
  const profile: [number, number][] = [
    [0.001, 0],
    [0.42, 0],
    [0.41, 0.05],
    [0.32, 0.3],
    [0.24, 0.6],
    [0.2, 0.85],
    [0.14, 0.97],
    [0.001, 1.0],
  ];
  b.add(mesh(lathe(profile), robe));
  b.add(
    mesh(
      lathe(
        profile.map(([x, y]) => [x * 1.02, y]),
        around(0, 0.32),
      ),
      w ? gold() : mat(0x8a1020, { rough: 0.4 }),
    ),
  );
  const hem = mesh(new TorusGeometry(0.41, 0.04, 6, 28), fur, 0, 0.04, 0);
  hem.rotation.x = Math.PI / 2;
  b.add(hem);
  b.add(
    mesh(
      lathe(
        [
          [0.2, 0.98],
          [0.33, 0.88],
          [0.4, 0.55],
          [0.44, 0.12],
          [0.45, 0.03],
        ],
        around(Math.PI, 2.8),
      ),
      cloth(w ? 0x1a2f78 : 0x0d0507, true),
    ),
  );
  b.add(
    mesh(
      lathe([
        [0.06, 1.04],
        [0.2, 0.98],
        [0.28, 0.9],
        [0.27, 0.84],
      ]),
      fur,
    ),
  );
  b.add(...pauldrons(0.1, w ? gold() : darkIron(), 0.21, 0.9));
  const h = hooded(0.13, cloth(w ? 0x2848a8 : 0x3a0b14, true), w ? gold() : darkIron(), w ? 0x8fe8ff : 0xff2a1a);
  h.position.y = 1.12;
  const c = crown(0.15, w ? gold() : darkIron(), w ? 0x3070ff : 0xff2020, w ? 1 : 1.5);
  c.position.y = 1.22;
  b.add(h, c);
  const left = limb(0.36, 0.055, robe, -0.26, 0.88);
  left.rotation.set(-0.35, 0, 0.12);
  left.add(ball(0.04, w ? gold() : darkIron(), 0, -0.37, 0.02));
  f.pose(left);
  b.add(left, staffArm(f, robe, w ? gold() : darkIron(), 0.26, 0.88, staff(1.45, w ? mat(0xd8c9a8, { rough: 0.4 }) : darkIron(), w ? gold() : darkIron(), MAGIC[side].getHex(), 0.08)));
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Queen ----------

/** A queen: a slender gown and plate bodice, a tall crown over a veil, a mask with glowing eyes, a collar behind. */
function queen(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("q", side, 1.3);
  f.robed = true;
  const gown = cloth(w ? 0xf2ecdf : 0x15101c);
  const plate = steel(side);
  const b = f.body;
  const skirt: [number, number][] = [
    [0.001, 0],
    [0.38, 0],
    [0.36, 0.04],
    [0.26, 0.22],
    [0.16, 0.45],
    [0.115, 0.62],
    [0.001, 0.63],
  ];
  b.add(mesh(lathe(skirt), gown));
  b.add(
    mesh(
      lathe(
        skirt.map(([x, y]) => [x * 1.02, y]),
        around(0, 0.5),
      ),
      cloth(w ? 0x3d6fd0 : 0x8a1530),
    ),
  );
  b.add(
    mesh(
      lathe([
        [0.001, 0.58],
        [0.12, 0.6],
        [0.14, 0.72],
        [0.12, 0.84],
        [0.07, 0.9],
        [0.001, 0.92],
      ]),
      plate,
    ),
  );
  b.add(...pauldrons(0.065, plate, 0.13, 0.85));
  // A tall collar behind the head: a silver fan, or spikes.
  if (w)
    b.add(
      mesh(
        lathe(
          [
            [0.08, 0.86],
            [0.14, 0.98],
            [0.2, 1.14],
          ],
          around(Math.PI, 3.2),
        ),
        mat(0xe4eaf2, { rough: 0.2, metal: 0.95, two: true }),
      ),
    );
  else
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6 - 0.5) * 2.4;
      const s = mesh(new ConeGeometry(0.022, 0.24, 12), mat(0x8a1530, { rough: 0.3, metal: 0.4 }), Math.sin(a) * 0.12, 1.0, Math.cos(a) * 0.12);
      s.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
      b.add(s);
    }
  const veil = cloth(w ? 0xffffff : 0x1a0f20, true);
  veil.transparent = true;
  veil.opacity = 0.85;
  const h = hooded(0.11, veil, w ? mat(0xf6f2ee, { rough: 0.25 }) : mat(0x0e0d12, { rough: 0.15, metal: 0.4 }), w ? 0x9fd8ff : 0xff2a1a);
  h.position.y = 1.02;
  const c = crown(0.1, w ? gold() : darkIron(), w ? 0x70b0ff : 0xff2020, w ? 1.7 : 2.2);
  c.position.y = 1.1;
  b.add(h, c);
  for (const s of [-1, 1]) {
    const arm = limb(0.3, 0.03, gown, s * 0.15, 0.84);
    arm.rotation.set(-0.35, 0, s * 0.18);
    arm.add(ball(0.028, plate, 0, -0.3, 0));
    f.pose(arm);
    b.add(arm);
  }
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Bishop ----------

/** Black's bishop: a hooded sorcerer in a dark robe, glowing eyes in the dark, a staff with a glowing orb. */
function darkSorcerer(): Fig {
  const f = new Fig("b", "b", 1.2);
  f.robed = true;
  const robe = cloth(0x33204a);
  const magic = MAGIC.b.getHex();
  const b = f.body;
  b.add(
    mesh(
      lathe([
        [0.001, 0],
        [0.34, 0],
        [0.33, 0.06],
        [0.26, 0.35],
        [0.19, 0.68],
        [0.16, 0.86],
        [0.001, 0.9],
      ]),
      robe,
    ),
  );
  const belt = mesh(new TorusGeometry(0.2, 0.018, 6, 28), gold(), 0, 0.6, 0);
  belt.rotation.x = Math.PI / 2;
  b.add(
    belt,
    mesh(
      lathe([
        [0.18, 0.9],
        [0.24, 0.82],
        [0.26, 0.74],
      ]),
      robe,
    ),
  );
  const h = hooded(0.12, cloth(0x33204a, true), mat(0x050308, { rough: 1 }), magic);
  h.position.y = 0.99;
  // A pointed hood, folded back to a tip.
  const tip = mesh(new ConeGeometry(0.1, 0.22, 24), cloth(0x33204a), 0, 1.22, -0.06);
  tip.rotation.x = -0.5;
  b.add(h, tip);
  const left = limb(0.34, 0.055, robe, -0.21, 0.82);
  left.rotation.set(-0.4, 0, 0.15);
  f.pose(left);
  b.add(left, staffArm(f, robe, mat(0x050308), 0.21, 0.82, staff(1.15, mat(0x2a1d14, { rough: 0.7 }), gold(), magic, 0.055)));
  f.mats = ownMaterials(b);
  return f;
}

/** White's bishop: a noble bishop in a white and gold chasuble and mitre, his face lost in light, a gold crozier. */
function nobleBishop(): Fig {
  const f = new Fig("b", "w", 1.2);
  f.robed = true;
  const robe = cloth(0xf6f3ea);
  const g = gold();
  const b = f.body;
  const profile: [number, number][] = [
    [0.001, 0],
    [0.34, 0],
    [0.33, 0.05],
    [0.25, 0.32],
    [0.19, 0.62],
    [0.16, 0.8],
    [0.1, 0.88],
    [0.001, 0.9],
  ];
  b.add(mesh(lathe(profile), robe));
  for (const c of [0, Math.PI])
    b.add(
      mesh(
        lathe(
          profile.map(([x, y]) => [x * 1.02, y]),
          around(c, 0.26),
        ),
        g,
      ),
    );
  b.add(
    mesh(
      lathe([
        [0.001, 0.93],
        [0.17, 0.9],
        [0.27, 0.8],
        [0.25, 0.74],
      ]),
      cloth(0x9a1a2a),
    ),
  );
  const h = hooded(0.12, cloth(0xf6f3ea, true), mat(0xfff2cc, { emissive: 0xffe2a0, ei: 1.3 }), null);
  h.position.y = 0.99;
  h.add(halo(0xffe7a8, 0.5));
  b.add(h);
  // The mitre: two pointed panels with gold edges, a gold band and cross.
  const panel = new Shape();
  panel.moveTo(-0.11, 0);
  panel.lineTo(0.11, 0);
  panel.quadraticCurveTo(0.125, 0.17, 0, 0.3);
  panel.quadraticCurveTo(-0.125, 0.17, -0.11, 0);
  const geo = new ExtrudeGeometry(panel, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
  const mitre = new Group();
  mitre.position.y = 1.1;
  for (const z of [0.035, -0.047]) mitre.add(mesh(geo, robe, 0, 0, z));
  mitre.add(mesh(new CylinderGeometry(0.118, 0.118, 0.04, 32, 1, true), g, 0, 0.02, 0));
  const up = mesh(new CapsuleGeometry(0.011, 0.12, 4, 8), g, 0, 0.13, 0.058);
  const across = mesh(new CapsuleGeometry(0.011, 0.07, 4, 8), g, 0, 0.15, 0.058);
  across.rotation.z = Math.PI / 2;
  mitre.add(up, across);
  b.add(mitre);
  const left = limb(0.32, 0.05, robe, -0.19, 0.8);
  left.rotation.set(-0.5, 0, 0.12);
  left.add(ball(0.035, g, 0, -0.33, 0.02));
  f.pose(left);
  b.add(left, staffArm(f, robe, g, 0.19, 0.8, crozier(1.15, 0xffe7a8)));
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Knight ----------

/** A horse in a cloth drape (white with gold, or black with burning eyes, mane and tail); legs with knees. */
function horse(f: Fig, w: boolean) {
  const hide = mat(w ? 0xf2eee6 : 0x141217, { rough: 0.45 });
  const fire = mat(0xff5010, { emissive: 0xff4a10, ei: 2.5 });
  const b = f.body;
  b.add(egg(0.14, 0.15, 0.3, hide, 0, 0.53, 0), egg(0.13, 0.145, 0.13, hide, 0, 0.54, 0.2), egg(0.135, 0.145, 0.14, hide, 0, 0.56, -0.19));
  const neck = egg(0.07, 0.19, 0.095, hide, 0, 0.73, 0.27);
  neck.rotation.x = 0.55;
  const head = egg(0.06, 0.068, 0.16, hide, 0, 0.87, 0.37);
  head.rotation.x = 0.6;
  b.add(neck, head, egg(0.05, 0.05, 0.07, hide, 0, 0.8, 0.46));
  for (const s of [-1, 1]) {
    b.add(mesh(new ConeGeometry(0.018, 0.07, 12), hide, s * 0.03, 0.96, 0.3));
    b.add(ball(0.013, w ? mat(0x111111, { rough: 0.1 }) : glow(0xff2a10, 3), s * 0.05, 0.88, 0.41));
  }
  const mane = tube(
    [
      [0, 0.94, 0.3],
      [0, 0.88, 0.22],
      [0, 0.78, 0.14],
      [0, 0.66, 0.1],
    ],
    0.025,
    w ? mat(0xe2d9c6, { rough: 0.7 }) : fire,
  );
  const tail = tube(
    [
      [0, 0.6, -0.31],
      [0, 0.55, -0.4],
      [0, 0.4, -0.44],
      [0, 0.28, -0.42],
    ],
    0.025,
    w ? mat(0xe2d9c6, { rough: 0.7 }) : fire,
  );
  b.add(mane, tail);
  if (!w)
    for (const m of [mane, tail]) {
      m.userData.sy = 1;
      f.flames.push(m);
    }
  // The drape: a cloth skirt around the body, stretched along it, with a trim.
  const drape = mesh(
    lathe([
      [0.15, 0.62],
      [0.18, 0.5],
      [0.2, 0.36],
    ]),
    cloth(w ? 0x2f5fb3 : 0x3a0a10, true),
  );
  drape.scale.z = 1.9;
  const trim = mesh(new TorusGeometry(0.2, 0.012, 6, 28), w ? gold() : mat(0x8a1020, { rough: 0.4 }), 0, 0.36, 0);
  trim.rotation.x = Math.PI / 2;
  trim.scale.y = 1.9;
  b.add(drape, trim);
  for (const [x, z] of [
    [-0.08, 0.2],
    [0.08, 0.2],
    [-0.08, -0.2],
    [0.08, -0.2],
  ]) {
    const leg = limb(0.2, 0.034, hide, x, 0.45, z);
    const knee = limb(0.22, 0.024, hide, 0, -0.2, 0);
    knee.add(mesh(new CylinderGeometry(0.026, 0.032, 0.035, 16), mat(0x2a2420, { rough: 0.4 }), 0, -0.225, 0));
    leg.add(knee);
    leg.userData.knee = knee;
    f.hooves.push(leg);
    f.pose(leg, knee);
    b.add(leg);
  }
}

/** A knight on horseback: plate armor, plumed helm and shield, or a headless horseman with fire at his neck. */
function knight(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("n", side, 1.2);
  horse(f, w);
  const plate = steel(side);
  const b = f.body;
  for (const s of [-1, 1]) {
    const leg = limb(0.24, 0.032, plate, s * 0.13, 0.7, 0);
    leg.rotation.set(-0.5, 0, s * 0.3);
    b.add(leg);
  }
  b.add(
    mesh(
      lathe([
        [0.001, 0.67],
        [0.09, 0.68],
        [0.11, 0.76],
        [0.115, 0.86],
        [0.09, 0.93],
        [0.001, 0.95],
      ]),
      plate,
    ),
  );
  b.add(...pauldrons(0.06, plate, 0.11, 0.92));
  b.add(
    mesh(
      lathe(
        [
          [0.1, 0.94],
          [0.15, 0.8],
          [0.2, 0.62],
        ],
        around(Math.PI, 2.2),
      ),
      cloth(w ? 0x2f5fb3 : 0x1a0508, true),
    ),
  );
  if (w) {
    const h = helm(0.07, side, mat(0x0a0a0c));
    h.position.y = 1.03;
    b.add(
      h,
      tube(
        [
          [0, 1.12, 0.0],
          [0, 1.15, -0.06],
          [0, 1.12, -0.14],
          [0, 1.04, -0.2],
        ],
        0.02,
        cloth(0xd0283a),
      ),
    );
  } else {
    // No head: a gorget with fire rising out of it.
    b.add(mesh(new CylinderGeometry(0.05, 0.06, 0.04, 24), plate, 0, 0.97, 0));
    const flame = mesh(new ConeGeometry(0.045, 0.16, 20), mat(0xff6a1a, { emissive: 0xff6a1a, ei: 2.5, opacity: 0.9 }), 0, 1.07, 0);
    flame.userData.sy = 1;
    flame.add(halo(0xff7a2a, 0.35));
    f.flames.push(flame);
    b.add(flame);
  }
  const arm = limb(0.22, 0.03, plate, 0.13, 0.9, 0);
  const sw = sword(side, 0.42);
  sw.position.y = -0.22;
  sw.rotation.x = -1.1;
  arm.add(sw);
  arm.rotation.x = -0.6;
  f.arm = arm;
  const left = limb(0.22, 0.03, plate, -0.13, 0.9, 0);
  left.rotation.x = -0.9;
  if (w) {
    const s = shield(side, 0.75);
    s.position.set(-0.03, -0.16, 0.05);
    s.rotation.x = Math.PI / 2 - 0.9;
    left.add(s);
  }
  f.pose(arm, left);
  b.add(arm, left);
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Pawn ----------

/** A foot soldier in plate: shining with a plume and cross shield, or black with horns, a burning visor and a dark shield. */
function soldier(side: Side): Fig {
  const w = side === "w";
  const f = new Fig("p", side, 0.8);
  const plate = steel(side);
  const tabard = cloth(w ? 0x2f5fb3 : 0x5a0f12, true);
  const b = f.body;
  for (const s of [-1, 1]) {
    const leg = limb(0.29, 0.04, plate, s * 0.065, 0.3);
    leg.add(egg(0.04, 0.025, 0.06, plate, 0, -0.29, 0.02));
    f.legs.push(leg);
    f.pose(leg);
    b.add(leg);
  }
  b.add(
    mesh(
      lathe([
        [0.08, 0.36],
        [0.13, 0.3],
        [0.15, 0.2],
      ]),
      mat(w ? 0xb8c0cc : 0x2a2b31, { rough: 0.5, metal: 0.7, two: true }),
    ),
  );
  const torso: [number, number][] = [
    [0.001, 0.3],
    [0.1, 0.31],
    [0.12, 0.4],
    [0.125, 0.5],
    [0.1, 0.58],
    [0.001, 0.6],
  ];
  b.add(mesh(lathe(torso), plate));
  b.add(
    mesh(
      lathe(
        torso.map(([x, y]) => [x * 1.04, y - 0.08]),
        around(0, 0.9),
      ),
      tabard,
    ),
  );
  b.add(...pauldrons(0.055, plate, 0.12, 0.56));
  const h = helm(0.075, side, w ? mat(0x0a0a0c) : glow(0xff2010, 3));
  h.position.y = 0.67;
  b.add(h);
  if (w)
    b.add(
      tube(
        [
          [0, 0.76, 0.0],
          [0, 0.79, -0.05],
          [0, 0.76, -0.11],
        ],
        0.016,
        cloth(0x2f5fb3),
      ),
    );
  else
    for (const s of [-1, 1])
      b.add(
        tube(
          [
            [s * 0.06, 0.71, 0],
            [s * 0.11, 0.75, 0],
            [s * 0.12, 0.82, -0.01],
          ],
          0.012,
          mat(0xd8cfb8, { rough: 0.5 }),
        ),
      );
  const arm = limb(0.22, 0.03, plate, 0.15, 0.55);
  const sw = sword(side, 0.3);
  sw.position.y = -0.22;
  sw.rotation.x = -1.2;
  arm.add(sw);
  arm.rotation.x = -0.4;
  f.arm = arm;
  const left = limb(0.22, 0.03, plate, -0.15, 0.55);
  left.rotation.x = -0.6;
  const s = shield(side, 0.8);
  s.position.set(-0.02, -0.15, 0.05);
  s.rotation.x = Math.PI / 2 - 0.6;
  left.add(s);
  f.pose(arm, left);
  b.add(arm, left);
  f.mats = ownMaterials(b);
  return f;
}

// ---------- Rook ----------

/** A tower of loose dressed stones (each can fall away and come back), runes glowing between rows when magic moves it. */
function stoneTower(side: Side): Fig {
  const f = new Fig("r", side, 1.0);
  const base = side === "b" ? 0x3a3f4f : 0xe6e2da;
  const magic = MAGIC[side].getHex();
  const block = new RoundedBoxGeometry(0.25, 0.19, 0.15, 1, 0.025);
  const merlon = new RoundedBoxGeometry(0.17, 0.16, 0.15, 1, 0.025);
  const R = 0.29;
  const add = (geo: BufferGeometry, a: number, y: number) => {
    const c = new Color(base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
    const s = mesh(geo, mat(c.getHex(), { rough: 0.45 }), Math.cos(a) * R, y, Math.sin(a) * R);
    s.rotation.y = -a + Math.PI / 2;
    s.userData.home = { pos: s.position.clone(), rot: s.rotation.y };
    f.stones.push(s);
    f.body.add(s);
  };
  for (let row = 0; row < 4; row++) for (let j = 0; j < 8; j++) add(block, ((j + (row % 2) * 0.5) / 8) * Math.PI * 2, 0.1 + row * 0.2);
  for (let j = 0; j < 4; j++) add(merlon, (j / 4) * Math.PI * 2 + Math.PI / 4, 0.88);
  f.core = mesh(new CylinderGeometry(0.25, 0.27, 0.8, 24), mat(side === "b" ? 0x1a1d27 : 0xa8a49a), 0, 0.4, 0);
  f.body.add(f.core);
  f.body.add(mesh(new CylinderGeometry(0.27, 0.27, 0.01, 24), mat(side === "b" ? 0x262a36 : 0xc8c3b8), 0, 0.8, 0));
  for (let row = 1; row < 4; row++) {
    const r = mesh(new TorusGeometry(0.33, 0.01, 6, 28), mat(magic, { emissive: magic, ei: 0 }), 0, row * 0.2, 0);
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
    role === "k"
      ? king(side)
      : role === "q"
        ? queen(side)
        : role === "r"
          ? stoneTower(side)
          : role === "b"
            ? side === "w"
              ? nobleBishop()
              : darkSorcerer()
            : role === "n"
              ? knight(side)
              : soldier(side);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}
