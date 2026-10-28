// The Stormcourt: the first Chess Legions tribe. A king who rules by magic
// orders every move; rooks are torn down and rebuilt by it (or, to take,
// dropped through a portal onto the piece); bishops are gods of thunder and go
// by lightning; knights gallop through their L and cut the piece down; the
// queen opens a pit of fire; soldiers march and chop. The king floats to his
// square and withers what he takes.
import { AdditiveBlending, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Plane, QuadraticBezierCurve3, Vector3, type Material } from "three";
import { Actor, lerpAngle } from "./actor";
import { Pit, squareAt } from "./board";
import { MAGIC, makeFig, type Fig, type Side } from "./figures";
import { loadModels } from "./models";
import { Portal, clip, clipAbove, ease, flame, followClip, magicArc, ownMaterials, tween, wait } from "./fx";
import type { Tribe, TribeMove } from "./tribe";

const BODY: Record<Side, number> = { w: 0xefe6d6, b: 0x2b2730 };
const ASH = new Color(0x38332f);
/** Lightning's color: white gold for white, violet for black. */
const BOLT: Record<Side, number> = { w: 0xfff0a0, b: 0xc07bff };

export const stormcourt: Tribe = {
  id: "stormcourt",
  name: "The Stormcourt",
  figure: makeFig,
  ready: () => loadModels("stormcourt-"),
  play: (stage, move) => new Acts(stage).play(move),
};

/** The Stormcourt's moves and kills, acted out on a stage. */
class Acts extends Actor {
  async play({ mover, to, victim, king, castle, promotion }: TribeMove) {
    if (mover.role === "k") {
      if (castle) {
        await this.order(mover, castle.rook);
        await this.rookMove(castle.rook, castle.to);
      }
      await this.kingFloat(mover, to, victim);
      return;
    }
    if (king) await this.order(king, mover);
    await this.strike(mover, to, victim);
    if (promotion) {
      this.sound.play("order", { rate: 1.5 });
      this.fx.burst(squareAt(to).setY(0.6), MAGIC[mover.side], 30, { glow: true, speed: 1.5, up: 2.5, gravity: 1 });
    }
  }

  /** Moves a piece other than the king to a square, taking victim there its own way. */
  private strike(f: Fig, to: string, victim?: Fig) {
    if (f.role === "r") return victim ? this.portalKill(f, to, victim) : this.rookMove(f, to);
    if (f.role === "n") return this.gallop(f, to, victim);
    if (f.role === "b") return this.fly(f, to, victim);
    if (f.role === "q") return this.glide(f, to, victim);
    return this.march(f, to, victim);
  }

  // ---------- The king ----------

  /** The king sends a piece: a gesture and an arc of magic from his staff to it. */
  private async order(king: Fig, target: Fig) {
    void king.cast(this.clock, "order");
    this.sound.play("order", { gain: 0.3 });
    await wait(this.clock, 200);
    await magicArc(this.clock, this.scene, king.staffTip(), target.middle(), MAGIC[king.side], 480);
  }

  /** Rises a little and floats to the square; to take, stops short and withers the piece first. */
  private async kingFloat(k: Fig, to: string, victim?: Fig) {
    const a = k.root.position.clone();
    const b = squareAt(to);
    const face = k.root.rotation.y;
    const dir = Math.atan2(b.x - a.x, b.z - a.z);
    const H = 0.35;
    k.floating = true;
    const hum = this.sound.play("hum", { gain: 0.35, rate: 0.7, loop: true });
    let trail = 0;
    this.clock.add((ms) => {
      if ((trail += ms) > 45) {
        trail = 0;
        const p = k.root.position;
        this.fx.spawn(new Vector3(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.02, p.z + (Math.random() - 0.5) * 0.3), {
          color: MAGIC[k.side],
          size: 0.035,
          vel: new Vector3(0, -0.3, 0),
          life: 500,
          gravity: 0,
          glow: true,
        });
      }
      return !k.floating;
    });
    await tween(this.clock, 280, (t) => {
      k.root.position.y = H * t;
      k.root.rotation.y = lerpAngle(face, dir, t);
    });
    const dist = a.distanceTo(b);
    const glide = (from: number, until: number) =>
      tween(this.clock, Math.max(250, (until - from) * dist * 280), (t) => {
        const s = from + (until - from) * t;
        k.root.position.set(a.x + (b.x - a.x) * s, H, a.z + (b.z - a.z) * s);
      });
    if (victim) {
      const stop = Math.max(0, 1 - 0.8 / dist);
      await glide(0, stop);
      void k.cast(this.clock, "kill");
      this.sound.play("order", { rate: 0.8 });
      await wait(this.clock, 150);
      void magicArc(this.clock, this.scene, k.staffTip(), victim.middle(), MAGIC[k.side], 400);
      await this.wither(victim);
      await glide(stop, 1);
    } else await glide(0, 1);
    await tween(
      this.clock,
      280,
      (t) => {
        k.root.position.y = H * (1 - t);
        k.root.rotation.y = lerpAngle(dir, face, t);
      },
      ease.in,
    );
    k.floating = false;
    hum.stop(250);
    this.fx.dust(b, 10, 0xd8cdb8);
  }

  /** The king's kill: the piece turns to ash and crumbles to the ground from the top down. */
  private async wither(v: Fig) {
    this.die(v);
    this.sound.play("rubble", { gain: 0.5, rate: 1.4, delay: 280 });
    const mats = v.mats.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial);
    const from = mats.map((m) => m.color.clone());
    await tween(this.clock, 280, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(ASH, t);
        m.emissive.setHex(0xff5a1a);
        m.emissiveIntensity = 0.9 * t;
      }),
    );
    const p = v.root.position;
    const top = v.height * 1.08;
    await tween(
      this.clock,
      750,
      (t) => {
        const y = top * (1 - t);
        clipAbove(v.mats, y);
        for (const m of mats) m.emissiveIntensity = 0.9 * (1 - t);
        for (let i = 0; i < 2; i++)
          this.fx.spawn(new Vector3(p.x + (Math.random() - 0.5) * 0.4 * (0.4 + t), y, p.z + (Math.random() - 0.5) * 0.4), {
            color: Math.random() < 0.2 ? 0xff7a2a : 0x4a443e,
            size: 0.03 + Math.random() * 0.04,
            vel: new Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6),
            life: 900,
            gravity: 3,
          });
      },
      ease.in,
    );
    v.root.removeFromParent();
    // A little pile of ash, gone after a moment.
    const pile = new Mesh(new ConeGeometry(0.22, 0.08, 10), new MeshStandardMaterial({ color: 0x3e3833, roughness: 1, transparent: true }));
    pile.position.copy(p).setY(0.04);
    this.scene.add(pile);
    void wait(this.clock, 900)
      .then(() => tween(this.clock, 600, (t) => ((pile.material as MeshStandardMaterial).opacity = 1 - t)))
      .then(() => pile.removeFromParent());
  }

  // ---------- Rooks ----------

  private async rookMove(r: Fig, to: string) {
    await this.tearDown(r);
    r.root.position.copy(squareAt(to));
    await this.rebuild(r);
  }

  /**
   * Keeps the rook's filled middle no higher than its wall: the top of the
   * highest stone still standing (in place, for "down"; landed, for "up").
   * Returns the function that stops it.
   */
  private coreTracksWall(r: Fig, standing: (s: Mesh) => boolean) {
    const core = r.core!;
    return this.loop(() => {
      let top = 0;
      for (const s of r.stones) if (standing(s)) top = Math.max(top, s.userData.home.pos.y + 0.095);
      const h = Math.min(0.8, top);
      // Eased toward the wall so a row leaving doesn't make it jump.
      core.scale.y = Math.max(0.001, core.scale.y + (h / 0.8 - core.scale.y) * 0.35);
    });
  }

  /** The rook's gold bands flare and melt away into sparks (out), or gather back out of sparks (in). */
  private async trim(r: Fig, out: boolean) {
    const magic = MAGIC[r.side];
    for (const t of r.trim) {
      t.visible = true;
      this.fx.burst(r.root.position.clone().setY(t.position.y), magic, 6, { glow: true, speed: 0.5, up: 0.4, gravity: 0, life: 450 });
    }
    await tween(this.clock, 260, (t) => {
      const k = out ? t : 1 - t;
      for (const b of r.trim) b.scale.setScalar(Math.max(0.001, 1 - k + 0.25 * Math.sin(k * Math.PI)));
    });
    for (const b of r.trim) b.visible = !out;
  }

  private async tearDown(r: Fig) {
    await this.trim(r, true);
    const p = r.root.position.clone();
    const stones = [...r.stones].sort((a, b) => b.userData.home.pos.y - a.userData.home.pos.y);
    const gone = new Set<Mesh>();
    const stop = this.coreTracksWall(r, (s) => !gone.has(s));
    this.sound.play("grind", { gain: 0.5, rate: 1.2 });
    await Promise.all(
      stones.map(async (s, i) => {
        await wait(this.clock, i * 18);
        gone.add(s);
        const start = s.position.clone();
        const out = new Vector3(start.x, 0, start.z).normalize();
        const spin = (Math.random() - 0.5) * 5;
        if (i % 6 === 0) this.fx.dust(p, 5, 0x6a6470);
        if (i % 10 === 0) this.stone(380, 0.35);
        await tween(
          this.clock,
          420,
          (t) => {
            s.position.set(start.x + out.x * 0.28 * t, start.y + 0.18 * Math.sin(t * Math.PI) - (start.y + 0.35) * t * t, start.z + out.z * 0.28 * t);
            s.rotation.x = spin * t;
          },
          ease.linear,
        );
      }),
    );
    stop();
    r.core!.scale.y = 0.001;
  }

  private async rebuild(r: Fig) {
    const p = r.root.position.clone();
    const magic = MAGIC[r.side];
    this.fx.dust(p, 10, 0xd8cdb8);
    const stones = [...r.stones].sort((a, b) => a.userData.home.pos.y - b.userData.home.pos.y);
    for (const s of stones) {
      s.position.copy(s.userData.home.pos).setY(-0.45);
      s.rotation.set(0, s.userData.home.rot, 0);
    }
    for (const t of r.trim) t.visible = false;
    for (const rune of r.runes) {
      rune.visible = true;
      (rune.material as MeshStandardMaterial).emissiveIntensity = 3;
    }
    r.core!.scale.y = 0.001;
    const landed = new Set<Mesh>();
    const stop = this.coreTracksWall(r, (s) => landed.has(s));
    this.sound.play("grind", { gain: 0.45 });
    await Promise.all(
      stones.map(async (s, i) => {
        await wait(this.clock, i * 16);
        const home = s.userData.home.pos.y;
        if (i % 4 === 0) this.fx.burst(p.clone().setY(home), magic, 3, { glow: true, speed: 0.8, up: 0.8, gravity: 0, life: 500 });
        await tween(this.clock, 380, (t) => (s.position.y = -0.45 + (home + 0.45) * t), ease.back);
        if (i % 10 === 0) this.stone(0, 0.3);
        landed.add(s);
      }),
    );
    stop();
    r.core!.scale.y = 1;
    await this.trim(r, false);
    await tween(this.clock, 400, (t) => r.runes.forEach((rune) => ((rune.material as MeshStandardMaterial).emissiveIntensity = 3 * (1 - t))));
    for (const rune of r.runes) rune.visible = false;
  }

  /** The rook's kill: it drops through a portal the king opens under it and falls out of another onto the piece. */
  private async portalKill(r: Fig, to: string, v: Fig) {
    const a = r.root.position.clone();
    const b = squareAt(to);
    const magic = MAGIC[r.side];
    const below = new Portal(this.clock, this.scene, a.clone().setY(0.015), magic);
    this.sound.play("portal", { gain: 0.7 });
    await below.open();
    await tween(this.clock, 520, (t) => (r.root.position.y = -(r.height + 0.3) * t), ease.in);
    const PY = 2.7;
    const above = new Portal(this.clock, this.scene, b.clone().setY(PY), magic);
    void below.close();
    this.sound.play("portal", { gain: 0.7, rate: 0.8 });
    await above.open(280);
    await wait(this.clock, 120);
    r.root.position.set(b.x, PY, b.z);
    clipAbove(r.mats, PY);
    let hit = false;
    await tween(
      this.clock,
      430,
      (t) => {
        r.root.position.y = PY * (1 - t);
        if (!hit && r.root.position.y <= v.height * 0.9) {
          hit = true;
          void this.crush(v);
        }
      },
      ease.in,
    );
    if (!hit) void this.crush(v);
    this.sound.play("boom", { gain: 0.9 });
    this.sound.play("rubble", { gain: 0.6 });
    this.shake = 260;
    this.fx.dust(b, 24);
    await tween(this.clock, 240, (t) => (r.body.scale.y = 1 - 0.16 * Math.sin(t * Math.PI)));
    clipAbove(r.mats, null);
    await above.close();
  }

  /** Killed by a rook: flattened, bits flying, then gone into the board. */
  private async crush(v: Fig) {
    this.die(v);
    const p = v.root.position.clone();
    this.fx.burst(p.clone().setY(0.25), BODY[v.side], 20, { speed: 2.6, size: 0.07, up: 2.4 });
    await tween(this.clock, 130, (t) => v.body.scale.set(1 + 0.45 * t, 1 - 0.88 * t, 1 + 0.45 * t), ease.out);
    await wait(this.clock, 400);
    await tween(this.clock, 350, (t) => (v.root.position.y = -0.3 * t));
    v.root.removeFromParent();
  }

  // ---------- Moving ----------

  /** Pawns: walk, legs and arms swinging; to take, stop short and chop the piece down. */
  private async march(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dist = a.distanceTo(b);
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z));
    let phase = 0;
    let walking = true;
    let foot = 0;
    // A modelled soldier walks with its walk clip; a built one swings its legs.
    let clip = false;
    const stop = this.loop((ms) => {
      if (walking) phase += ms * 0.012;
      // A footstep each time a leg passes under the body.
      if (walking && Math.floor(phase / Math.PI) !== foot) {
        foot = Math.floor(phase / Math.PI);
        this.sound.play(`step${1 + (foot % 3)}` as "step1", { gain: 0.45 });
      }
      if (f.anim) {
        if (walking !== clip) {
          clip = walking;
          if (walking) void f.play("Walking", { loop: true, speed: 1.2 });
        }
        return;
      }
      const s = walking ? Math.sin(phase) : 0;
      f.legs[0].rotation.x = s * 0.6;
      f.legs[1].rotation.x = -s * 0.6;
      f.body.position.y = Math.abs(s) * 0.025;
    });
    const pace = 380;
    if (victim) {
      const s = Math.max(0, 1 - 0.7 / dist);
      await this.line(f, this.along(a, b, s), s * dist * pace);
      walking = false;
      this.sound.play("swing", { gain: 0.6, delay: 120 });
      await f.swing(this.clock, "chop");
      this.sound.play("slash", { gain: 0.7 });
      void this.strikeDown(victim, b.clone().sub(a));
      await wait(this.clock, 300);
      walking = true;
      await this.line(f, b, (1 - s) * dist * pace);
    } else await this.line(f, b, dist * pace);
    stop();
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /**
   * Knights: one flowing curve through the L, a bounding leap over whatever is
   * in the way and down to a gallop. To take, the rider swings while still
   * riding, cuts the piece in half as he reaches it, and the horse rears up and
   * stops on its square.
   */
  private async gallop(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const d = b.clone().sub(a);
    const corner = Math.abs(d.x) > Math.abs(d.z) ? new Vector3(b.x, 0, a.z) : new Vector3(a.x, 0, b.z);
    // The corner pulled toward the middle: a curve that still reads as an L.
    const path = new QuadraticBezierCurve3(a, corner.lerp(a.clone().lerp(b, 0.5), 0.45), b);
    const L = path.getLength();
    let phase = 0;
    let running = true;
    const hooves = this.sound.play("gallop", { gain: 0.7, loop: true });
    const stop = this.loop((ms) => {
      if (!running) return;
      phase += ms * 0.02;
      const s = Math.sin(phase);
      const c = Math.sin(phase + 0.6);
      if (!f.hooves.length) {
        // A modelled horse (no legs to move): it surges, rocking fore and aft, and sheds lightning.
        f.body.rotation.x = s * 0.12;
        f.body.position.y = Math.max(0, s) * 0.08;
        if (Math.random() < 0.6)
          this.fx.spawn(f.middle().add(new Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4)), {
            color: BOLT[f.side],
            size: 0.03,
            vel: new Vector3((Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5),
            life: 300,
            gravity: 0,
            glow: true,
          });
        return;
      }
      const [fl, fr, bl, br] = f.hooves;
      fl.rotation.x = s * 0.7;
      fr.rotation.x = c * 0.7;
      bl.rotation.x = -s * 0.6;
      br.rotation.x = -c * 0.6;
      // Knees fold as a leg comes forward: front knees back, hind knees forward.
      fl.userData.knee.rotation.x = Math.max(0, -Math.cos(phase)) * 1.1;
      fr.userData.knee.rotation.x = Math.max(0, -Math.cos(phase + 0.6)) * 1.1;
      bl.userData.knee.rotation.x = -Math.max(0, Math.cos(phase)) * 0.9;
      br.userData.knee.rotation.x = -Math.max(0, Math.cos(phase + 0.6)) * 0.9;
      f.body.rotation.x = s * 0.07;
      f.body.position.y = Math.max(0, s) * 0.05;
    });
    const face = f.root.rotation.y;
    const ms = L * 330;
    // Moving: speed up and slow down. Taking: speed up and keep riding through.
    const speed = victim ? (t: number) => (t < 0.2 ? (t * t) / 0.4 : t - 0.1) / 0.9 : ease.inOut;
    // The hit lands half a square short of the piece; the swing takes 380 ms to get there.
    const hitAt = victim ? (1 - 0.55 / L) * 0.9 + 0.1 : 2;
    let swung = false;
    const tangent = new Vector3();
    await tween(
      this.clock,
      ms,
      (t) => {
        const u = Math.min(1, speed(t));
        const p = path.getPointAt(u);
        // A leap over the first stretch, then back on the ground for the run in.
        const leap = u < 0.7 ? Math.sin((Math.PI * u) / 0.7) * 0.3 : 0;
        f.root.position.set(p.x, leap, p.z);
        path.getTangentAt(u, tangent);
        f.root.rotation.y = lerpAngle(face, Math.atan2(tangent.x, tangent.z), Math.min(1, u / 0.12));
        if (victim && !swung && t * ms >= hitAt * ms - 380) {
          swung = true;
          const across = new Vector3(tangent.z, 0, -tangent.x);
          this.sound.play("swing", { gain: 0.6, delay: 150 });
          void f.swing(this.clock, "slash").then(() => this.slice(victim, across, true));
        }
      },
      ease.linear,
    );
    running = false;
    hooves.stop(victim ? 300 : 150);
    if (!victim) this.sound.play("land", { gain: 0.5 });
    f.rest();
    f.root.rotation.y = Math.atan2(tangent.x, tangent.z);
    if (victim) await this.rear(f);
    stop();
    f.rest();
    this.fx.dust(b, victim ? 14 : 8, 0xd8cdb8);
    await this.turn(f, this.restFacing(f));
  }

  /** The horse rears up on its hind legs, front hooves pawing, and comes down. */
  private async rear(f: Fig) {
    const [fl, fr, bl, br] = f.hooves;
    this.sound.play("neigh", { gain: 0.6 });
    // Pitched about the hind hooves (z -0.2 on the ground), not the middle.
    const pitch = (k: number, paw = 0) => {
      const th = -0.7 * k;
      f.body.rotation.x = th;
      f.body.position.set(0, -0.2 * Math.sin(th), -0.2 + 0.2 * Math.cos(th));
      if (!fl) return;
      for (const [leg, off] of [
        [fl, 0],
        [fr, 1.4],
      ] as const) {
        leg.rotation.x = -1.1 * k + Math.sin(paw + off) * 0.35 * k;
        leg.userData.knee.rotation.x = 1.4 * k;
      }
      // Hind legs stay upright under the pitched body.
      bl.rotation.x = br.rotation.x = 0.7 * k;
    };
    await tween(this.clock, 300, (t) => pitch(t), ease.out);
    await tween(this.clock, 420, (t) => pitch(1, t * 12), ease.linear);
    await tween(this.clock, 260, (t) => pitch(1 - t), ease.in);
    this.sound.play("land", { gain: 0.7 });
    this.shake = 120;
  }

  /**
   * Bishops, gods of thunder: they go by lightning. The bishop flashes away, a
   * bolt runs from his square to the new one, and he forms there out of the
   * electricity. To take, the bolt wraps the piece, drives it to the ground,
   * and he forms standing over it.
   */
  private async fly(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    const color = BOLT[f.side];
    const charge = this.electrify(f, color);
    this.sound.play("charge", { gain: 0.6 });
    void f.cast(this.clock, victim ? "kill" : "order");
    const sparks = this.sparkle(f, color);
    await tween(this.clock, 380, (t) => charge(t), ease.in);
    sparks();
    const from = f.middle();
    f.root.visible = false;
    this.fx.burst(from, color, 26, { glow: true, speed: 2.6, size: 0.035, life: 350, gravity: 0 });
    this.flashAt(from, color, 35);
    this.sound.play("thunder", { gain: victim ? 0.6 : 0.8 });
    this.shake = 90;
    const end = victim ? victim.middle() : b.clone().setY(0.5);
    await this.trail(from, end, color);
    if (victim) await this.envelop(victim, color, end.clone().sub(from).setY(0));
    f.root.position.copy(b);
    await this.form(f, color, charge);
    if (victim) void this.sink(victim);
    this.fx.dust(b, 8, 0xd8cdb8);
  }

  /** Makes f glow toward color by k (0..1); 0 puts its own glow back. */
  private electrify(f: Fig, color: number) {
    const mats = this.standard(f.mats);
    const base = mats.map((m) => ({ e: m.emissive.clone(), i: m.emissiveIntensity }));
    const c = new Color(color);
    return (k: number) =>
      mats.forEach((m, i) => {
        m.emissive.copy(base[i].e).lerp(c, k);
        m.emissiveIntensity = base[i].i + (2.2 - base[i].i) * k;
      });
  }

  /** Sparks crackling off a figure until the returned function is called. */
  private sparkle(f: Fig, color: number) {
    return this.loop(() => {
      for (let i = 0; i < 2; i++)
        this.fx.spawn(f.middle().add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * f.height, (Math.random() - 0.5) * 0.6)), {
          color,
          size: 0.025,
          vel: new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
          life: 220,
          gravity: 0,
          glow: true,
        });
    });
  }

  /** A flash of light at a point that dies away. */
  private flashAt(at: Vector3, color: number, power: number) {
    this.flash.color.setHex(color);
    this.flash.position.copy(at).setY(at.y + 0.6);
    this.flash.intensity = power;
    void tween(this.clock, 350, (t) => (this.flash.intensity = power * (1 - t)), ease.out);
  }

  /** The bolt the bishop travels as: it flickers from a to b, and its last stroke fades as he forms. */
  private async trail(a: Vector3, b: Vector3, color: number) {
    const n = Math.max(6, Math.round(a.distanceTo(b) * 3.5));
    for (let i = 0; i < 3; i++) {
      const bolt = this.bolt(a, b, color, n, 0.4);
      this.flash.intensity = Math.max(this.flash.intensity, 18);
      this.flash.position.copy(a).lerp(b, 0.5).setY(1.2);
      await wait(this.clock, 60);
      if (i < 2) bolt.remove();
      else void bolt.fade(450);
      await wait(this.clock, 30);
    }
  }

  /** Lightning wraps the piece, scorching it, then one stroke drives it to the ground. */
  private async envelop(v: Fig, color: number, dir: Vector3) {
    const p = v.root.position;
    const on = () => {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.12;
      return new Vector3(p.x + Math.cos(a) * r, 0.05 + Math.random() * v.height, p.z + Math.sin(a) * r);
    };
    void this.char(v, 0.7, 600);
    const wrap = this.electrify(v, color);
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) this.sound.play("zap", { gain: 0.5, rate: 0.9 + Math.random() * 0.3 });
      wrap(0.4 + Math.random() * 0.5);
      const arcs = [this.bolt(on(), on(), color, 4, 0.12), this.bolt(on(), on(), color, 4, 0.12)];
      this.flash.intensity = 8 + Math.random() * 10;
      await wait(this.clock, 55);
      for (const x of arcs) x.remove();
    }
    wrap(0);
    // The stroke from above, and down it goes.
    const top = v.middle().setY(v.height);
    const stroke = this.bolt(top.clone().setY(3.2), top, color, 7, 0.25);
    this.flashAt(top, color, 40);
    this.sound.play("thunder", { gain: 0.9, rate: 1.15 });
    this.die(v);
    this.shake = 200;
    this.fx.burst(top, color, 20, { glow: true, speed: 2.5, size: 0.04, life: 450 });
    void stroke.fade(300);
    await this.topple(v, dir, 220);
    this.fx.dust(p, 12);
  }

  /** The bishop forms on his square out of the electricity: sparks rush in, he appears from the feet up, and his glow settles. */
  private async form(f: Fig, color: number, charge: (k: number) => void) {
    const p = f.root.position;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const off = new Vector3(Math.cos(a), (Math.random() - 0.3) * 1.2, Math.sin(a)).multiplyScalar(0.5 + Math.random() * 0.4);
      this.fx.spawn(
        p
          .clone()
          .setY(f.height * 0.5)
          .add(off),
        { color, size: 0.03, vel: off.clone().multiplyScalar(-1 / 0.3), life: 300, gravity: 0, glow: true },
      );
    }
    await wait(this.clock, 200);
    this.sound.play("zap", { gain: 0.4, rate: 0.7 });
    charge(1);
    clipAbove(f.mats, 0);
    f.root.visible = true;
    const sparks = this.sparkle(f, color);
    await tween(this.clock, 420, (t) => clipAbove(f.mats, f.height * 1.15 * t), ease.out);
    clipAbove(f.mats, null);
    sparks();
    await tween(this.clock, 450, (t) => charge(1 - t));
  }

  /** Queens: a swift, smooth float, no turning; to take, a fiery hole opens under the piece as she comes. */
  private async glide(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dist = a.distanceTo(b);
    const ms = Math.max(500, dist * 170);
    f.floating = true;
    this.sound.play("whoosh", { gain: 0.5, rate: 0.8 });
    const lift = (s: number) => Math.sin(Math.PI * s) * 0.18;
    const path = (from: number, until: number, ms: number) =>
      tween(
        this.clock,
        ms,
        (t) => {
          const s = from + (until - from) * t;
          f.root.position.copy(this.along(a, b, s)).setY(lift(s));
        },
        ease.inOut,
      );
    if (victim) {
      const s = Math.max(0, 1 - 0.85 / dist);
      await path(0, s, ms * s + 1);
      await this.burn(victim);
      await path(s, 1, Math.max(300, ms * (1 - s)));
    } else await path(0, 1, ms);
    f.floating = false;
  }

  // ---------- Dying ----------

  /** The dying piece's cry: a horse's scream for a knight, a man's for the rest (lower for black). */
  private die(v: Fig, delay = 0) {
    void v.play("Hit_Reaction", { speed: 1.4, hold: true });
    const rate = v.side === "b" ? 0.85 : 1;
    if (v.role === "n") this.sound.play("neigh", { gain: 0.6, rate: rate * 0.8, delay });
    else this.sound.play(Math.random() < 0.5 ? "death1" : "death2", { gain: 0.55, rate: v.role === "k" ? rate * 0.85 : rate, delay });
  }

  /** A stone of a rook's wall knocking. */
  private stone(delay: number, gain: number) {
    this.sound.play(`stone${1 + Math.floor(Math.random() * 3)}` as "stone1", { gain, delay });
  }

  /** Darkens a figure toward char by amount, glowing like embers. */
  private char(v: Fig, amount: number, ms: number) {
    const mats = this.standard(v.mats);
    const from = mats.map((m) => m.color.clone());
    return tween(this.clock, ms, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(ASH, amount * t);
        m.emissive.setHex(0xff5a1a);
        m.emissiveIntensity = 0.8 * t;
      }),
    );
  }

  /** Killed by a pawn: knocked over away from the blow, then sunk into the board. */
  private async strikeDown(v: Fig, dir: Vector3) {
    this.fx.burst(v.middle(), 0xfff2c0, 8, { glow: true, speed: 1.5, size: 0.04, life: 300 });
    this.die(v);
    await this.topple(v, dir);
    this.sound.play("fall", { gain: 0.5 });
    this.fx.dust(v.root.position, 10);
    await wait(this.clock, 300);
    await this.sink(v);
  }

  /**
   * Killed by a knight: cut through the middle on a slant; the top slides off
   * toward dir and falls, then both go. Trampled: the horse comes onto the
   * square, so the bottom half sinks away at once.
   */
  private async slice(v: Fig, dir: Vector3, trampled = false) {
    this.sound.play("slash", { gain: 0.7 });
    this.die(v);
    const p = v.root.position.clone();
    const side = new Vector3(dir.z, 0, -dir.x).normalize();
    const n = new Vector3(0, 1, 0).addScaledVector(side, 0.35).normalize();
    const cut = p.clone().setY(v.height * 0.5);
    const top = v.root.clone(true);
    const topMats = ownMaterials(top);
    this.scene.add(top);
    const below = new Plane(n.clone().negate(), n.dot(cut));
    const above = new Plane(n.clone(), -n.dot(cut));
    clip(v.mats, [below]);
    clip(topMats, [above]);
    followClip(this.clock, v.root, below);
    followClip(this.clock, top, above);
    for (let i = 0; i < 16; i++)
      this.fx.spawn(cut.clone().addScaledVector(side, (Math.random() - 0.5) * 0.7), {
        color: 0xffffff,
        size: 0.03,
        vel: side.clone().multiplyScalar((Math.random() - 0.5) * 3),
        life: 300,
        gravity: 0,
        glow: true,
      });
    const start = top.position.clone();
    const q = top.quaternion.clone();
    if (trampled) void tween(this.clock, 300, (t) => (v.root.position.y = -v.height * 0.6 * t), ease.in);
    await tween(
      this.clock,
      550,
      (t) => {
        top.position.set(start.x + dir.x * 0.35 * t, start.y - v.height * 0.4 * t, start.z + dir.z * 0.35 * t);
        top.quaternion.copy(q);
        top.rotateOnWorldAxis(side, 1.45 * t);
      },
      ease.in,
    );
    this.fx.dust(p.clone().addScaledVector(dir, 0.4), 12);
    await wait(this.clock, 400);
    const y = v.root.position.y;
    await tween(this.clock, 400, (t) => {
      v.root.position.y = Math.min(y, -0.5 * t);
      top.position.y = start.y - v.height * 0.4 - 0.6 * t;
    });
    v.root.removeFromParent();
    top.removeFromParent();
  }

  /** A jagged bolt from a to b in n strokes (a core and a colored glow, a side branch); the caller removes it or fades it out. */
  private bolt(a: Vector3, b: Vector3, color: number, n = 9, spread = 0.3) {
    const g = new Group();
    const core = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const halo = new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false });
    const jag = (from: Vector3, to: Vector3, n: number, spread: number) => {
      const pts = [from];
      for (let i = 1; i < n; i++)
        pts.push(
          from
            .clone()
            .lerp(to, i / n)
            .add(new Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.3, (Math.random() - 0.5) * spread)),
        );
      pts.push(to);
      for (let i = 0; i < pts.length - 1; i++)
        for (const [mat, r] of [
          [core, 0.014],
          [halo, 0.045],
        ] as const) {
          const len = pts[i].distanceTo(pts[i + 1]);
          const m = new Mesh(new CylinderGeometry(r, r, len, 5), mat);
          m.position.copy(pts[i]).lerp(pts[i + 1], 0.5);
          m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), pts[i + 1].clone().sub(pts[i]).normalize());
          g.add(m);
        }
      return pts;
    };
    const pts = jag(a, b, n, spread);
    const fork = pts[Math.floor(n / 3 + Math.random() * (n / 3))];
    jag(fork, fork.clone().add(new Vector3((Math.random() - 0.5) * 0.8, -0.5, (Math.random() - 0.5) * 0.8)), 4, 0.15);
    this.scene.add(g);
    const remove = () => {
      g.removeFromParent();
      g.traverse((o) => (o as Mesh).geometry?.dispose());
      core.dispose();
      halo.dispose();
    };
    const fade = async (ms: number) => {
      await tween(this.clock, ms, (t) => {
        core.opacity = 1 - t;
        halo.opacity = 0.6 * (1 - t);
      });
      remove();
    };
    return { remove, fade };
  }

  /** Killed by the queen: a pit to hell opens under the piece; it falls in, burns up at the bottom, and the pit closes. */
  private async burn(v: Fig) {
    const p = v.root.position.clone();
    const square = this.squares.get(this.squareOf(p));
    if (!square) return this.strikeDown(v, new Vector3(0, 0, 1));
    const pit = new Pit(this.clock, this.scene, square);
    this.flash.color.setHex(0xff5a10);
    this.flash.position.set(p.x, 0.4, p.z);
    // Flames licking up out of the pit, all round its rim and from deep inside.
    const fire = new Group();
    const tongues: { m: Mesh; h: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const deep = i % 3 === 0;
      const h = deep ? 0.9 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3;
      const m = flame(deep ? 0.32 : 0.22, h, 1.2);
      const r = deep ? 0.12 : 0.3;
      m.position.set(p.x + Math.cos(a) * r, deep ? -0.7 : -0.12, p.z + Math.sin(a) * r);
      fire.add(m);
      tongues.push({ m, h });
    }
    this.scene.add(fire);
    const grow = (k: number) => tongues.forEach(({ m, h }) => (m.scale.y = Math.max(0.001, h * k)));
    grow(0);
    void tween(this.clock, 450, (t) => (this.flash.intensity = 10 * t));
    void tween(this.clock, 600, grow, ease.out);
    this.sound.play("fire", { gain: 0.7 });
    this.die(v, 500);
    await pit.open(450);
    await tween(
      this.clock,
      650,
      (t) => {
        v.root.position.y = -1.15 * t;
        v.body.rotation.x = t * 0.6;
      },
      ease.in,
    );
    // At the bottom: a pillar of fire roars up out of the pit, and the piece burns away to nothing.
    const pillar = flame(0.75, 0.001, 1.8);
    pillar.position.set(p.x, -1.15, p.z);
    fire.add(pillar);
    this.flash.intensity = 25;
    this.sound.play("roar", { gain: 0.8 });
    this.shake = 140;
    void tween(this.clock, 260, (t) => (pillar.scale.y = Math.max(0.001, 2.3 * t)), ease.out).then(() => tween(this.clock, 640, (t) => (pillar.scale.y = Math.max(0.001, 2.3 * (1 - t))), ease.in));
    void this.char(v, 1, 200);
    await tween(this.clock, 550, (t) => v.body.scale.setScalar(Math.max(0.01, 1 - t)));
    v.root.removeFromParent();
    void tween(this.clock, 400, (t) => (this.flash.intensity = 25 * (1 - t)));
    void tween(this.clock, 380, (t) => grow(1 - t), ease.in);
    this.sound.play("slam", { gain: 0.6, delay: 300 });
    await pit.close(400);
    fire.removeFromParent();
    fire.children.forEach((m) => ((m as Mesh).material as Material).dispose());
  }
}
