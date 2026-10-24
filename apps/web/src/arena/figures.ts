// Arena figures. White's king and rooks are free CC0 models (KayKit, see
// public/arena/CREDITS.txt); black's are built here from shapes, to compare the
// two. The other pieces are plain turned stand-ins until they get their own figures.
import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type AnimationAction,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ownMaterials, tween, wait, type Clock } from "./fx";

export type Role = "k" | "q" | "r" | "b" | "n" | "p";
export type Side = "w" | "b";

/** Each side's magic. */
export const MAGIC: Record<Side, Color> = { w: new Color(0x7fe3ff), b: new Color(0xc07bff) };

const HEIGHT: Record<Role, number> = { k: 1.45, q: 1.2, r: 1.0, b: 1.0, n: 0.9, p: 0.72 };

export class Fig {
  /** On the square: position and facing. */
  readonly root = new Group();
  /** Inside root, for squashing and swaying without losing the square. */
  readonly body = new Group();
  mats: Material[] = [];
  mixer?: AnimationMixer;
  actions: Record<string, AnimationAction> = {};
  private current?: AnimationAction;
  /** Coded rooks: their stones, each with its home in userData.home. */
  stones: Mesh[] = [];
  core?: Mesh;
  runes: Mesh[] = [];
  /** Coded king: the arm that holds the staff, and the orb on top. */
  arm?: Group;
  orb?: Mesh;
  glow?: Sprite;
  private t = Math.random() * 10;
  floating = false;

  constructor(
    readonly role: Role,
    readonly side: Side,
    readonly kind: "model" | "code" | "plain",
    readonly height: number,
  ) {
    this.root.add(this.body);
  }

  update(ms: number) {
    this.t += ms / 1000;
    this.mixer?.update(ms / 1000);
    if (this.orb) {
      const pulse = 1.6 + Math.sin(this.t * 3) * 0.5;
      (this.orb.material as MeshStandardMaterial).emissiveIntensity = Math.max(pulse, (this.orb.material as MeshStandardMaterial).emissiveIntensity * 0.96);
    }
    // The coded king's robe sways; floating, he bobs.
    if (this.kind === "code" && this.role === "k") {
      this.body.rotation.z = Math.sin(this.t * 1.3) * 0.03;
      if (this.floating) this.body.position.y = Math.sin(this.t * 5) * 0.03;
    }
  }

  /** Model figures: crossfades to a clip (looping, or once and back to idle). */
  play(name: string, once = false) {
    const a = this.actions[name];
    if (!a || !this.mixer) return 0;
    a.reset();
    a.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
    a.clampWhenFinished = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, 0.2, false);
    a.play();
    this.current = a;
    if (once) {
      const back = () => {
        this.mixer?.removeEventListener("finished", back);
        if (this.current === a) this.play("Idle");
      };
      this.mixer.addEventListener("finished", back);
    }
    return a.getClip().duration * 1000;
  }

  /** Kings: the gesture that sends a piece (order) or strikes one down (kill). */
  async cast(clock: Clock, kind: "order" | "kill") {
    if (this.mixer) {
      this.play(kind === "kill" ? "Spellcast_Shoot" : "Spellcast_Raise", true);
      await wait(clock, 450);
      return;
    }
    if (!this.arm || !this.orb) return;
    const orb = this.orb.material as MeshStandardMaterial;
    await tween(clock, 260, (t) => {
      this.arm!.rotation.x = -1.5 * t;
      orb.emissiveIntensity = 1.6 + 5 * t;
      this.glow!.scale.setScalar(0.35 + 0.5 * t);
    });
    void tween(clock, 450, (t) => {
      this.arm!.rotation.x = -1.5 * (1 - t);
      this.glow!.scale.setScalar(0.85 - 0.5 * t);
    });
  }

  /** Where the king's magic leaves from: the top of the staff. */
  staffTip(): Vector3 {
    if (this.orb) return this.orb.getWorldPosition(new Vector3());
    return this.root.position.clone().add(new Vector3(0, this.height * 1.05, 0));
  }

  /** The figure's middle, where magic strikes it. */
  middle(): Vector3 {
    return this.root.position.clone().add(new Vector3(0, this.height * 0.6, 0));
  }
}

// ---------- Models ----------

export interface Models {
  mage: GLTF | null;
  tower: GLTF | null;
}

let loading: Promise<Models> | null = null;

export function loadModels(): Promise<Models> {
  const loader = new GLTFLoader();
  const get = (f: string) => loader.loadAsync(`/arena/${f}`).catch(() => null);
  return (loading ??= Promise.all([get("Mage.glb"), get("building_tower_A_blue.gltf")]).then(([mage, tower]) => ({ mage, tower })));
}

/** Scales and sets obj so it stands on the origin, height tall. */
function stand(obj: Object3D, height: number) {
  obj.updateMatrixWorld(true);
  const box = new Box3().setFromObject(obj, true);
  const s = height / (box.max.y - box.min.y);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj, true);
  const c = box.getCenter(new Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
}

const shadows = (obj: Object3D) =>
  obj.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned meshes move outside their bounds
    }
  });

function mageKing(gltf: GLTF): Fig {
  const f = new Fig("k", "w", "model", HEIGHT.k);
  const m = cloneSkinned(gltf.scene);
  // The sorcerer king keeps the staff; a crown for the hat, no book, no wand.
  m.traverse((o) => {
    if (["Mage_Hat", "Spellbook", "Spellbook_open", "1H_Wand"].includes(o.name)) o.visible = false;
  });
  const c = crown(0.46, std(0xe0b230, { rough: 0.4, metal: 0.3, emissive: 0x4a3200, ei: 0.6 }));
  c.position.y = 0.8;
  m.getObjectByName("head")?.add(c);
  f.mixer = new AnimationMixer(m);
  for (const clip of gltf.animations) f.actions[clip.name] = f.mixer.clipAction(clip);
  f.play("Idle");
  f.mixer.update(0);
  stand(m, HEIGHT.k);
  shadows(m);
  f.body.add(m);
  f.mats = ownMaterials(m);
  return f;
}

function modelTower(gltf: GLTF, side: Side): Fig {
  const f = new Fig("r", side, "model", HEIGHT.r);
  const m = gltf.scene.clone(true);
  stand(m, HEIGHT.r);
  shadows(m);
  f.body.add(m);
  f.mats = ownMaterials(m);
  return f;
}

// ---------- Coded figures ----------

const std = (color: number, o: Partial<{ rough: number; metal: number; emissive: number; ei: number }> = {}) =>
  new MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, flatShading: true, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 0 });

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

let glowTexture: SpriteMaterial["map"] = null;
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

/** A gold band with points, r wide, its foot at 0. */
function crown(r: number, gold: Material) {
  const g = new Group();
  g.add(mesh(new CylinderGeometry(r, r * 1.08, r * 0.38, 14, 1, true), gold, 0, r * 0.19, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new ConeGeometry(r * 0.19, r * 0.56, 5), gold, Math.cos(a) * r, r * 0.6, Math.sin(a) * r));
  }
  return g;
}

/** Black's king: a hooded sorcerer in a dark robe, a crown on the hood, a staff with a glowing orb. */
function sorcerer(side: Side): Fig {
  const f = new Fig("k", side, "code", HEIGHT.k);
  const robe = std(side === "b" ? 0x3a2352 : 0xe9e4f2);
  const gold = std(0xc9a227, { rough: 0.4, metal: 0.3, emissive: 0x4a3200, ei: 0.6 });
  const dark = std(0x0d0912);
  const magic = MAGIC[side].getHex();
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
  const belt = mesh(new TorusGeometry(0.205, 0.025, 6, 20), gold, 0, 0.62, 0);
  belt.rotation.x = Math.PI / 2;
  b.add(belt);
  // Hood with a dark face in it and two glowing eyes.
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
  b.add(mesh(new SphereGeometry(0.13, 10, 8), dark, 0, 1.06, 0.07));
  const eye = std(magic, { emissive: magic, ei: 3 });
  b.add(mesh(new SphereGeometry(0.018, 6, 4), eye, -0.045, 1.08, 0.19), mesh(new SphereGeometry(0.018, 6, 4), eye, 0.045, 1.08, 0.19));
  const c = crown(0.16, gold);
  c.position.y = 1.14;
  b.add(c);
  // Arms; the right one holds the staff and raises it to cast.
  const left = new Group();
  left.position.set(-0.21, 0.84, 0);
  left.rotation.set(-0.4, 0, 0.15);
  left.add(mesh(new CylinderGeometry(0.06, 0.08, 0.4, 7), robe, 0, -0.18, 0));
  const arm = new Group();
  arm.position.set(0.21, 0.84, 0);
  arm.add(mesh(new CylinderGeometry(0.06, 0.08, 0.4, 7), robe, 0, -0.18, 0));
  const staff = new Group();
  staff.position.set(0.02, -0.38, 0.05);
  staff.add(mesh(new CylinderGeometry(0.02, 0.025, 1.05, 6), std(0x3b2a1e), 0, 0.2, 0));
  staff.add(mesh(new TorusGeometry(0.065, 0.012, 6, 14), gold, 0, 0.78, 0));
  const orb = mesh(new SphereGeometry(0.06, 12, 8), std(magic, { emissive: magic, ei: 1.6 }), 0, 0.8, 0);
  const glow = new Sprite(new SpriteMaterial({ map: glowMap(), color: magic, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.35);
  orb.add(glow);
  staff.add(orb);
  arm.add(staff);
  b.add(left, arm);
  f.arm = arm;
  f.orb = orb;
  f.glow = glow;
  f.mats = ownMaterials(b);
  return f;
}

/** Black's rook: a tower of loose stones (each can fall away and come back), runes glowing between rows when magic moves it. */
function stoneTower(side: Side): Fig {
  const f = new Fig("r", side, "code", HEIGHT.r);
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

/** The other pieces: plain turned pieces, until they get figures. */
function plain(role: Role, side: Side): Fig {
  const f = new Fig(role, side, "plain", HEIGHT[role]);
  const mat = std(side === "w" ? 0xefe6d6 : 0x2b2730, { rough: 0.45 });
  const foot: [number, number][] = [
    [0, 0],
    [0.33, 0],
    [0.33, 0.06],
    [0.26, 0.1],
    [0.22, 0.15],
  ];
  const b = f.body;
  if (role === "p") {
    b.add(mesh(lathe([...foot, [0.13, 0.34], [0.1, 0.44], [0.17, 0.47], [0.09, 0.5], [0, 0.5]]), mat));
    b.add(mesh(new SphereGeometry(0.13, 14, 10), mat, 0, 0.6, 0));
  } else if (role === "b") {
    b.add(mesh(lathe([...foot, [0.14, 0.45], [0.1, 0.62], [0.18, 0.66], [0.1, 0.7], [0, 0.7]]), mat));
    const head = mesh(new SphereGeometry(0.14, 14, 10), mat, 0, 0.84, 0);
    head.scale.y = 1.35;
    b.add(head, mesh(new SphereGeometry(0.04, 8, 6), mat, 0, 1.0, 0));
  } else if (role === "q") {
    b.add(mesh(lathe([...foot, [0.15, 0.55], [0.11, 0.8], [0.2, 0.86], [0.11, 0.9], [0.19, 1.08], [0, 1.08]]), mat));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(mesh(new SphereGeometry(0.03, 6, 4), mat, Math.cos(a) * 0.17, 1.1, Math.sin(a) * 0.17));
    }
    b.add(mesh(new SphereGeometry(0.05, 8, 6), mat, 0, 1.15, 0));
  } else {
    b.add(mesh(lathe([...foot, [0.2, 0.3], [0, 0.3]]), mat));
    const neck = mesh(new BoxGeometry(0.2, 0.42, 0.3), mat, 0, 0.5, -0.02);
    neck.rotation.x = 0.25;
    const snout = mesh(new BoxGeometry(0.18, 0.16, 0.34), mat, 0, 0.72, 0.1);
    snout.rotation.x = 0.35;
    const mane = mesh(new BoxGeometry(0.06, 0.4, 0.14), mat, 0, 0.62, -0.15);
    mane.rotation.x = 0.3;
    b.add(neck, snout, mane, mesh(new ConeGeometry(0.04, 0.1, 4), mat, 0.06, 0.86, -0.02), mesh(new ConeGeometry(0.04, 0.1, 4), mat, -0.06, 0.86, -0.02));
  }
  f.mats = ownMaterials(b);
  return f;
}

export function makeFig(role: Role, side: Side, models: Models): Fig {
  let f: Fig;
  if (side === "w" && role === "k" && models.mage) f = mageKing(models.mage);
  else if (side === "w" && role === "r" && models.tower) f = modelTower(models.tower, side);
  else if (role === "k") f = sorcerer(side);
  else if (role === "r") f = stoneTower(side);
  else f = plain(role, side);
  // Figures are built facing +z; white faces black, across the board (-z).
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}
