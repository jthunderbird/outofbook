// The Thornwood: an ancient forest court, the second campaign tribe. Its figures
// are of the forest (models made with Meshy AI): the Elder Oak king, the Dryad
// Queen, Thornpriest bishops, Great Stag knights, treant rooks and Thornling
// pawns. Its victims turn to wood, crack and fall apart into leaves: thorns
// drag them under, a treant flattens them, a flytrap flower swallows them, a
// tree grows up through them. Bishops travel under the board as roots.
import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Texture,
} from "three";
import { Actor, lerpAngle } from "./actor";
import { squareAt } from "./board";
import type { Fig, Role, Side } from "./figures";
import { ease, tween, wait } from "./fx";
import { loadModels, modelFig } from "./models";
import { staunton } from "./staunton";
import type { Tribe, TribeMove } from "./tribe";

const MODEL: Record<Role, string> = { k: "thornwood-king", q: "thornwood-queen", b: "thornwood-bishop", n: "thornwood-knight", r: "thornwood-rook", p: "thornwood-pawn" };
/** Heights on the board: the king above the queen, the treant a broad tower. */
const HEIGHT: Record<Role, number> = { k: 1.85, q: 1.65, b: 1.4, n: 1.15, r: 1.35, p: 0.8 };
/** How the stag model is turned to face +z like every figure. */
const STAG_TURN = 0;
/** The forest's magic: spring gold-green for light, deep glowing green for dark. */
const GLOW: Record<Side, number> = { w: 0xd8ff8a, b: 0x6dff7a };
const BARK = new Color(0x4a3220);
const SAWDUST = 0xc8a878;

function thornFigure(role: Role, side: Side): Fig {
  const f = modelFig(MODEL[role], role, side, HEIGHT[role], { light: "birch", turn: role === "n" ? STAG_TURN : 0 });
  // Until the models load, the wooden starter set stands in.
  if (!f) return staunton.figure(role, side);
  f.root.rotation.y = side === "w" ? Math.PI : 0;
  return f;
}

export const thornwood: Tribe = {
  id: "thornwood",
  name: "The Thornwood",
  figure: thornFigure,
  ready: () => loadModels("thornwood-"),
  play: (stage, move) => new Grove(stage).play(move),
};

// ---------- Art ----------

const ART = import.meta.glob<string>("../effects/*.webp", { eager: true, query: "?url", import: "default" });
const textures = new Map<string, Texture>();
function art(name: string) {
  let t = textures.get(name);
  if (!t) {
    t = new TextureLoader().load(ART[`../effects/${name}.webp`]);
    t.colorSpace = SRGBColorSpace;
    textures.set(name, t);
  }
  return t;
}

/** One material per leaf on the 4 by 4 sheet, cut a little inside each cell (also the Grove's falling leaves). */
let leafMats: MeshBasicMaterial[] | null = null;
export function leafMaterials() {
  if (!leafMats) {
    const sheet = art("leaves");
    leafMats = [];
    for (let i = 0; i < 16; i++) {
      const t = sheet.clone();
      t.repeat.set(0.22, 0.22);
      t.offset.set((i % 4) * 0.25 + 0.015, 1 - (Math.floor(i / 4) + 1) * 0.25 + 0.015);
      leafMats.push(new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, side: DoubleSide }));
    }
  }
  return leafMats;
}
export const leafGeo = new PlaneGeometry(1, 1);

/** The Thornwood's moves and kills, acted out on a stage. */
class Grove extends Actor {
  async play({ mover, to, victim, castle, promotion }: TribeMove) {
    if (castle) {
      await this.walk(mover, squareAt(to), mover.role === "k" ? 520 : 420);
      await this.treantWalk(castle.rook, castle.to);
      return;
    }
    switch (mover.role) {
      case "p":
        await this.thornling(mover, to, victim);
        break;
      case "n":
        await this.bound(mover, to, victim);
        break;
      case "b":
        await this.burrow(mover, to, victim);
        break;
      case "r":
        await this.treantWalk(mover, to, victim);
        break;
      case "q":
        await this.bloom(mover, to, victim);
        break;
      case "k":
        await this.elder(mover, to, victim);
        break;
    }
    if (promotion) {
      this.sound.play("order", { rate: 1.3 });
      this.leaves(squareAt(to).setY(0.6), 24, { speed: 1.4, up: 2 });
    }
  }

  // ---------- Moving ----------

  /** Walks from where f stands to b with its walk clip, ms a square; onStep at each footfall. */
  private async walk(f: Fig, b: Vector3, ms: number, o: { speed?: number; onStep?: (at: Vector3) => void; stopShort?: number } = {}) {
    const a = f.root.position.clone();
    const dist = a.distanceTo(b);
    if (dist < 0.01) return;
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z));
    const end = o.stopShort ? this.along(a, b, Math.max(0, 1 - o.stopShort / dist)) : b;
    void f.play("Walking", { loop: true, speed: o.speed ?? 1.1 });
    let phase = 0;
    let foot = 0;
    const stop = this.loop((dt) => {
      phase += dt / (ms * 0.5);
      if (Math.floor(phase) !== foot) {
        foot = Math.floor(phase);
        this.sound.play(`step${1 + (foot % 3)}` as "step1", { gain: 0.35, rate: 0.8 });
        o.onStep?.(f.root.position.clone());
      }
    });
    await this.line(f, end, end.distanceTo(a) * ms);
    stop();
    void f.play(f.anim?.idle ?? "Idle", { loop: true, fade: 0.25 });
  }

  /** Back to facing the opponent, standing still. */
  private async settle(f: Fig) {
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /** Plays an attack clip; resolves at its blow (fraction at of the clip). */
  private async strike(f: Fig, clip: string, at: number, speed = 1.2) {
    const c = f.anim?.clips.get(clip);
    if (!c) {
      await wait(this.clock, 250);
      return;
    }
    void f.play(clip, { speed });
    await wait(this.clock, (c.duration / speed) * 1000 * at);
  }

  // ---------- Pawns ----------

  /** Thornlings walk; to take, a spear thrust and thorns drag the piece under. */
  private async thornling(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    if (victim) {
      await this.walk(f, b, 380, { stopShort: 0.65 });
      this.sound.play("swing", { gain: 0.5, delay: 80 });
      await this.strike(f, "Thrust_Slash", 0.45, 1.3);
      this.sound.play("slash", { gain: 0.5 });
      await this.thorns(victim, f.side);
      await wait(this.clock, 200);
    }
    await this.walk(f, b, 380);
    await this.settle(f);
  }

  // ---------- Knights ----------

  /**
   * The Great Stag bounds through its L in two leaps, flowers springing up where
   * it lands. To take, the second leap is a charge: the antlers toss the piece,
   * which bursts into leaves.
   */
  private async bound(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const d = b.clone().sub(a);
    const corner = Math.abs(d.x) > Math.abs(d.z) ? new Vector3(b.x, 0, a.z) : new Vector3(a.x, 0, b.z);
    await this.leap(f, corner, 0.75, 480);
    this.sound.play("land", { gain: 0.45 });
    this.flowers(corner, f.side, 6);
    if (victim) {
      this.sound.play("whoosh", { gain: 0.6 });
      await this.leap(f, b.clone().lerp(corner, 0.45 / corner.distanceTo(b)), 0.18, 260, true);
      void this.toss(victim, b.clone().sub(corner).normalize());
      await this.leap(f, b, 0.05, 220, true);
    } else await this.leap(f, b, 0.75, 480);
    this.sound.play("land", { gain: 0.55 });
    this.fx.dust(b, 8, 0x6a7a40);
    this.flowers(b, f.side, 8);
    f.body.rotation.x = 0;
    await this.settle(f);
  }

  /** One leap to b, peaking at height h; the body pitches up, then down to land. */
  private async leap(f: Fig, b: Vector3, h: number, ms: number, charge = false) {
    const a = f.root.position.clone();
    const face = f.root.rotation.y;
    const dir = Math.atan2(b.x - a.x, b.z - a.z);
    await tween(
      this.clock,
      ms,
      (t) => {
        f.root.position.set(a.x + (b.x - a.x) * t, Math.sin(Math.PI * t) * h, a.z + (b.z - a.z) * t);
        f.root.rotation.y = lerpAngle(face, dir, Math.min(1, t * 4));
        // Head up taking off, down coming in; a charge keeps the antlers low.
        f.body.rotation.x = charge ? 0.18 : -0.35 * Math.cos(Math.PI * t);
      },
      charge ? ease.in : ease.inOut,
    );
  }

  /** Tossed up and away along dir, spinning, and gone in a burst of leaves. */
  private async toss(v: Fig, dir: Vector3) {
    this.die(v);
    this.sound.play("wood2", { gain: 0.7 });
    const p = v.root.position.clone();
    const axis = new Vector3(dir.z, 0, -dir.x);
    const q = v.root.quaternion.clone();
    await tween(this.clock, 520, (t) => {
      v.root.position.set(p.x + dir.x * 0.9 * t, Math.sin(Math.PI * t * 0.8) * 1.4, p.z + dir.z * 0.9 * t);
      v.root.quaternion.copy(q);
      v.root.rotateOnWorldAxis(axis, 2.2 * t);
    });
    this.burstApart(v);
  }

  /** A ring of little flowers springing up and fading back into the board. */
  private flowers(at: Vector3, side: Side, n: number) {
    const petal = art("petal");
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.25 + Math.random() * 0.2;
      const m = new Mesh(leafGeo, new MeshBasicMaterial({ map: petal, transparent: true, alphaTest: 0.3, side: DoubleSide, color: side === "w" ? 0xfff0f4 : 0xffffff }));
      m.position.set(at.x + Math.cos(a) * r, 0.02, at.z + Math.sin(a) * r);
      m.rotation.set(-Math.PI / 2 + 0.5, a, 0);
      this.scene.add(m);
      const size = 0.12 + Math.random() * 0.08;
      void tween(this.clock, 900, (t) => m.scale.setScalar(Math.max(0.001, size * Math.sin(Math.PI * Math.min(1, t * 1.6))))).then(() => {
        m.removeFromParent();
        (m.material as MeshBasicMaterial).dispose();
      });
    }
  }

  // ---------- Bishops ----------

  /**
   * Thornpriests sink into the ground and travel under the board as roots, a
   * ridge of them rippling along the diagonal, and grow up again on their
   * square. To take, thorns burst up round the piece first and crush it under.
   */
  private async burrow(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    this.sound.play("order", { gain: 0.6, rate: 0.8 });
    await this.strike(f, "mage_soell_cast", 0.35, 1.4);
    this.sound.play("grind", { gain: 0.35, rate: 1.4 });
    this.leaves(a.clone().setY(0.4), 8, { speed: 0.8, up: 1 });
    await tween(this.clock, 420, (t) => (f.root.position.y = -f.height * 1.05 * t), ease.in);
    const dist = a.distanceTo(b);
    const n = Math.max(2, Math.round(dist / 0.32));
    for (let i = 1; i <= n; i++) void this.root(this.along(a, b, i / n), b.clone().sub(a), (i * 520) / n);
    await wait(this.clock, 560);
    if (victim) {
      this.sound.play("slash", { gain: 0.4, rate: 0.7 });
      await this.thorns(victim, f.side);
    }
    f.root.position.set(b.x, -f.height * 1.05, b.z);
    this.fx.dust(b, 10, 0x5a4630);
    this.sound.play("grind", { gain: 0.3, rate: 1.6 });
    await tween(this.clock, 480, (t) => (f.root.position.y = -f.height * 1.05 * (1 - t)), ease.out);
    this.leaves(b.clone().setY(0.6), 10, { speed: 0.9, up: 1.2 });
    await this.settle(f);
  }

  /** One arched root breaking the surface at p (across dir) after delay, and sinking back. */
  private async root(p: Vector3, dir: Vector3, delay: number) {
    await wait(this.clock, delay);
    const m = new Mesh(new TorusGeometry(0.22, 0.05, 6, 14, Math.PI), new MeshStandardMaterial({ color: 0x5a4028, roughness: 0.95 }));
    m.position.set(p.x, -0.12, p.z);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(m);
    this.fx.dust(p, 3, 0x5a4630);
    await tween(this.clock, 260, (t) => (m.position.y = -0.12 + 0.1 * t), ease.out);
    await tween(this.clock, 420, (t) => (m.position.y = -0.2 * t), ease.in);
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as MeshStandardMaterial).dispose();
  }

  // ---------- Rooks ----------

  /** Treants walk, slow and heavy; the board shakes and leaves fall. To take, an overhead slam. */
  private async treantWalk(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    const heavy = (at: Vector3) => {
      this.shake = 50;
      this.sound.play("land", { gain: 0.35, rate: 0.7 });
      if (Math.random() < 0.6) this.leaves(at.setY(f.height * 0.95), 3, { speed: 0.4, up: 0.2 });
    };
    if (victim) {
      await this.walk(f, b, 600, { speed: 0.8, onStep: heavy, stopShort: 0.75 });
      this.sound.play("wood1", { gain: 0.5, rate: 0.6 });
      await this.strike(f, "Charged_Ground_Slam", 0.55, 1.2);
      await this.flatten(victim);
      await wait(this.clock, 250);
    }
    await this.walk(f, b, 600, { speed: 0.8, onStep: heavy });
    await this.settle(f);
  }

  /** Flattened under a treant's slam: squashed, a shockwave of leaves, gone into the board. */
  private async flatten(v: Fig) {
    const p = v.root.position.clone();
    this.die(v);
    this.sound.play("slam", { gain: 0.7 });
    this.sound.play("wood2", { gain: 0.6, rate: 0.6 });
    this.shake = 240;
    this.fx.dust(p, 18, 0x6a5a40);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.leaf(p.clone().setY(0.1), new Vector3(Math.cos(a) * 2.2, 0.6 + Math.random() * 0.5, Math.sin(a) * 2.2), 900);
    }
    await tween(this.clock, 140, (t) => v.root.scale.set(1 + 0.4 * t, 1 - 0.88 * t, 1 + 0.4 * t), ease.in);
    this.woodify(v, 300);
    await wait(this.clock, 500);
    await this.sink(v, 400, 0.3);
  }

  // ---------- Queen ----------

  /** The Dryad Queen glides on a carpet of vines and petals. To take, a flytrap flower swallows the piece. */
  private async bloom(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z));
    this.sound.play("whoosh", { gain: 0.4, rate: 0.7 });
    const dist = a.distanceTo(b);
    const end = victim ? this.along(a, b, Math.max(0, 1 - 0.9 / dist)) : b;
    let laid = 0;
    const lay = (to: Vector3) => {
      // A strip of vine every half square, growing along the path.
      while (laid + 0.5 <= a.distanceTo(to)) {
        laid += 0.5;
        void this.vineStrip(this.along(a, b, (laid - 0.25) / dist), b.clone().sub(a));
      }
    };
    await tween(
      this.clock,
      Math.max(400, end.distanceTo(a) * 300),
      (t) => {
        f.root.position.set(a.x + (end.x - a.x) * t, 0.08 * Math.sin(Math.PI * t), a.z + (end.z - a.z) * t);
        lay(f.root.position);
        if (Math.random() < 0.3) this.flowers(f.root.position.clone(), f.side, 1);
      },
      ease.inOut,
    );
    if (victim) {
      this.sound.play("order", { gain: 0.6, rate: 0.7 });
      await this.strike(f, "Charged_Spell_Cast", 0.45, 1.3);
      await this.flytrap(victim);
      await tween(this.clock, 380, (t) => f.root.position.lerpVectors(end, b, t), ease.inOut);
    }
    f.root.position.y = 0;
    await this.settle(f);
  }

  /** A strip of thorny vine lying along dir at p, growing out and withering away. */
  private async vineStrip(p: Vector3, dir: Vector3) {
    const t = art("vine");
    const m = new Mesh(leafGeo, new MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: DoubleSide }));
    m.position.set(p.x, 0.015, p.z);
    m.rotation.set(-Math.PI / 2, 0, -Math.atan2(dir.z, dir.x));
    this.scene.add(m);
    await tween(this.clock, 260, (k) => m.scale.set(0.62 * Math.max(0.01, k), 0.34, 1), ease.out);
    await wait(this.clock, 900);
    await tween(this.clock, 500, (k) => m.scale.set(0.62, 0.34 * (1 - k) + 0.001, 1));
    m.removeFromParent();
    (m.material as MeshBasicMaterial).dispose();
  }

  /** A giant flower opens under the piece, snaps shut over it, and sinks away with it. */
  private async flytrap(v: Fig) {
    const p = v.root.position.clone();
    const flower = new Group();
    flower.position.set(p.x, 0.01, p.z);
    const petal = art("petal");
    const mat = new MeshBasicMaterial({ map: petal, transparent: true, alphaTest: 0.3, side: DoubleSide });
    // Petals pivot at their base: the plane is moved up so its bottom edge sits on the pivot.
    const geo = new PlaneGeometry(0.75, 1.5).translate(0, 0.75, 0);
    const petals: Group[] = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const pivot = new Group();
      pivot.rotation.y = (i / N) * Math.PI * 2;
      const m = new Mesh(geo, mat);
      m.position.z = 0.22;
      pivot.add(m);
      flower.add(pivot);
      petals.push(pivot);
    }
    const tilt = (x: number) => petals.forEach((pv) => (pv.children[0].rotation.x = x));
    const h = Math.max(1, v.height * 0.85);
    flower.scale.set(1, 0.001, 1);
    tilt(1.45);
    this.scene.add(flower);
    this.sound.play("grind", { gain: 0.3, rate: 1.8 });
    // Opens flat round the piece, then rises, then snaps shut.
    await tween(this.clock, 380, (t) => flower.scale.set(0.4 + 0.6 * t, h * t, 0.4 + 0.6 * t), ease.out);
    await tween(this.clock, 260, (t) => tilt(1.45 - 0.7 * t));
    this.die(v);
    this.sound.play("knock", { gain: 0.8, rate: 0.7 });
    this.sound.play("wood2", { gain: 0.6, rate: 0.8 });
    await tween(this.clock, 150, (t) => tilt(0.75 - 0.95 * t), ease.in);
    this.shake = 120;
    v.root.visible = false;
    await wait(this.clock, 300);
    // Swallowed: the shut flower sinks into the board.
    await tween(this.clock, 520, (t) => (flower.position.y = -h * 1.3 * t), ease.in);
    v.root.removeFromParent();
    flower.removeFromParent();
    geo.dispose();
    mat.dispose();
    this.flowers(p, "b", 5);
  }

  // ---------- King ----------

  /** The Elder Oak walks slowly, grass springing up behind him. To take, a tree grows up through the piece. */
  private async elder(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    const grass = (at: Vector3) => {
      for (let i = 0; i < 3; i++)
        this.fx.spawn(at.clone().add(new Vector3((Math.random() - 0.5) * 0.4, 0.02, (Math.random() - 0.5) * 0.4)), {
          color: GLOW[f.side],
          size: 0.025,
          vel: new Vector3(0, 0.6 + Math.random() * 0.5, 0),
          life: 500,
          gravity: 0,
          glow: true,
        });
    };
    if (victim) {
      await this.walk(f, b, 520, { speed: 0.9, onStep: grass, stopShort: 0.8 });
      this.sound.play("order", { gain: 0.6, rate: 0.6 });
      await this.strike(f, "Charged_Ground_Slam", 0.5, 1.2);
      await this.overgrow(victim);
    }
    await this.walk(f, b, 520, { speed: 0.9, onStep: grass });
    await this.settle(f);
  }

  /** The ground cracks; a tree grows up through the piece, which turns to wood and crumbles to leaves and sawdust. */
  private async overgrow(v: Fig) {
    const p = v.root.position.clone();
    this.shake = 160;
    this.sound.play("rubble", { gain: 0.5 });
    this.fx.dust(p, 14, 0x5a4630);
    const bark = new MeshStandardMaterial({ color: 0x3e2a1a, roughness: 1 });
    const leafy = new MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.9 });
    const tree = new Group();
    const H = Math.max(2.2, v.height * 1.3);
    tree.add(new Mesh(new CylinderGeometry(0.1, 0.22, H, 9).translate(0, H / 2, 0), bark));
    for (let i = 0; i < 3; i++) {
      const branch = new Mesh(new CylinderGeometry(0.03, 0.07, 0.8, 6).translate(0, 0.4, 0), bark);
      branch.position.y = H * (0.55 + i * 0.12);
      branch.rotation.set(0.9, (i / 3) * Math.PI * 2, 0, "YXZ");
      tree.add(branch);
    }
    for (const [x, y, z, r] of [
      [0, H + 0.1, 0, 0.55],
      [0.35, H - 0.25, 0.1, 0.4],
      [-0.3, H - 0.2, -0.2, 0.42],
      [0.05, H - 0.3, -0.4, 0.36],
    ])
      tree.add(new Mesh(new SphereGeometry(r, 10, 8).translate(x, y, z), leafy));
    tree.position.copy(p);
    tree.scale.set(0.3, 0.001, 0.3);
    this.scene.add(tree);
    this.die(v);
    this.sound.play("grind", { gain: 0.45, rate: 0.6 });
    // Grows up through the piece, lifting it a little as it turns to wood.
    void this.woodify(v, 700);
    await tween(this.clock, 700, (t) => {
      tree.scale.set(0.3 + 0.7 * t, t, 0.3 + 0.7 * t);
      v.root.position.y = 0.25 * t;
    });
    this.sound.play("wood1", { gain: 0.6, rate: 0.7 });
    await wait(this.clock, 300);
    this.burstApart(v);
    this.leaves(p.clone().setY(H), 16, { speed: 1.2, up: 0.8 });
    await wait(this.clock, 500);
    await tween(this.clock, 600, (t) => (tree.position.y = -H * 1.1 * t), ease.in);
    tree.removeFromParent();
    tree.traverse((o) => (o as Mesh).geometry?.dispose());
    bark.dispose();
    leafy.dispose();
  }

  // ---------- Dying ----------

  /** The dying piece's cry: a horse's scream for a knight, a man's for the rest. */
  private die(v: Fig, delay = 0) {
    void v.play("Hit_Reaction", { speed: 1.4, hold: true });
    const rate = v.side === "b" ? 0.85 : 1;
    if (v.role === "n") this.sound.play("neigh", { gain: 0.5, rate: rate * 0.8, delay });
    else this.sound.play(Math.random() < 0.5 ? "death1" : "death2", { gain: 0.5, rate: v.role === "k" ? rate * 0.85 : rate, delay });
  }

  /** Turns a figure to bark over ms. */
  private woodify(v: Fig, ms: number) {
    const mats = this.standard(v.mats);
    const from = mats.map((m) => m.color.clone());
    return tween(this.clock, ms, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(BARK, 0.85 * t);
        m.emissiveIntensity *= 1 - t;
        m.roughness = Math.min(1, m.roughness + t * 0.5);
      }),
    );
  }

  /** Cracks and falls apart into leaves and sawdust, and is gone. */
  private burstApart(v: Fig) {
    const p = v.root.position.clone().setY(v.root.position.y + v.height * 0.5);
    this.sound.play("wood2", { gain: 0.6 });
    this.leaves(p, 14, { speed: 1.3, up: 1.2 });
    this.fx.burst(p, SAWDUST, 16, { speed: 1.2, size: 0.04, up: 1, life: 700 });
    v.root.removeFromParent();
  }

  /**
   * Thorny vines burst up in a spiral round the piece, wrap it, and drag it down
   * into the board as it turns to wood.
   */
  private async thorns(v: Fig, side: Side) {
    const p = v.root.position.clone();
    const h = v.height * 1.05;
    const vineTex = art("vine").clone();
    vineTex.repeat.set(3, 1);
    vineTex.wrapS = RepeatWrapping;
    const mat = new MeshBasicMaterial({ map: vineTex, transparent: true, alphaTest: 0.35, side: DoubleSide, color: side === "w" ? 0xe8ffd0 : 0xffffff });
    const vines: Mesh[] = [];
    for (let k = 0; k < 4; k++) {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const s = i / 16;
        const a = (k / 4) * Math.PI * 2 + s * Math.PI * 2.4;
        const r = 0.36 - 0.12 * s;
        pts.push(new Vector3(p.x + Math.cos(a) * r, -0.05 + s * h, p.z + Math.sin(a) * r));
      }
      const geo = new TubeGeometry(new CatmullRomCurve3(pts), 48, 0.05, 6);
      geo.setDrawRange(0, 0);
      const m = new Mesh(geo, mat);
      this.scene.add(m);
      vines.push(m);
    }
    const total = vines[0].geometry.index!.count;
    this.fx.dust(p, 10, 0x5a4630);
    this.sound.play("grind", { gain: 0.35, rate: 1.5 });
    await tween(this.clock, 380, (t) => vines.forEach((m) => m.geometry.setDrawRange(0, Math.floor((total * t) / 6) * 6)), ease.out);
    this.die(v);
    this.sound.play("wood1", { gain: 0.6 });
    void this.woodify(v, 500);
    await wait(this.clock, 250);
    // Dragged under, the vines going with it.
    await tween(
      this.clock,
      520,
      (t) => {
        v.root.position.y = -h * t;
        vines.forEach((m) => (m.position.y = -h * t));
      },
      ease.in,
    );
    v.root.removeFromParent();
    for (const m of vines) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    mat.dispose();
    vineTex.dispose();
    this.leaves(p.clone().setY(0.2), 6, { speed: 0.8, up: 0.8 });
  }

  // ---------- Leaves ----------

  /** n leaves flung from at, fluttering down. */
  private leaves(at: Vector3, n: number, o: { speed?: number; up?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (o.speed ?? 1) * (0.4 + Math.random() * 0.8);
      this.leaf(at.clone(), new Vector3(Math.cos(a) * s, (o.up ?? 1) * (0.5 + Math.random()), Math.sin(a) * s), 1200 + Math.random() * 800);
    }
  }

  /** One leaf: thrown with vel, then drifting down, swaying and turning, shrinking away at the end. */
  private leaf(at: Vector3, vel: Vector3, life: number) {
    const mats = leafMaterials();
    const m = new Mesh(leafGeo, mats[Math.floor(Math.random() * mats.length)]);
    const size = 0.09 + Math.random() * 0.06;
    m.scale.setScalar(size);
    m.position.copy(at);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(m);
    const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
    const sway = Math.random() * 6;
    let age = 0;
    this.clock.add((ms) => {
      const dt = ms / 1000;
      age += ms;
      // Air drag: the throw dies away and the leaf falls slowly.
      vel.multiplyScalar(Math.pow(0.15, dt));
      vel.y -= 1.2 * dt;
      vel.y = Math.max(vel.y, -0.45);
      m.position.addScaledVector(vel, dt);
      m.position.x += Math.sin(age / 220 + sway) * 0.004;
      m.position.y = Math.max(0.01, m.position.y);
      m.rotation.x += spin.x * dt;
      m.rotation.y += spin.y * dt;
      m.rotation.z += spin.z * dt;
      if (age > life * 0.7) m.scale.setScalar(size * Math.max(0.001, 1 - (age - life * 0.7) / (life * 0.3)));
      if (age < life) return;
      m.removeFromParent();
      return true;
    });
  }
}
