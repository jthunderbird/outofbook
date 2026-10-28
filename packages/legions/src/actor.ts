// What every tribe's acting shares: the stage's clock, scene, effects, sounds
// and lights, and the plain moves (turning, walking a line, falling over,
// sinking away) its own moves and kills are built from.
import { Vector3, type Material, type MeshStandardMaterial } from "three";
import type { Fig } from "./figures";
import { ease, tween } from "./fx";
import type { Stage } from "./tribe";

/** The angle from a toward b, the short way round, fraction t of the way. */
export const lerpAngle = (a: number, b: number, t: number) => a + (((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;

export class Actor {
  constructor(protected stage: Stage) {}

  protected get clock() {
    return this.stage.clock;
  }
  protected get scene() {
    return this.stage.scene;
  }
  protected get fx() {
    return this.stage.fx;
  }
  protected get sound() {
    return this.stage.sound;
  }
  protected get flash() {
    return this.stage.flash;
  }
  protected get squares() {
    return this.stage.squares;
  }
  protected set shake(ms: number) {
    this.stage.shake = ms;
  }

  /** The way a side's figures face when standing on their squares. */
  protected restFacing(f: Fig) {
    return f.side === "w" ? Math.PI : 0;
  }

  protected turn(f: Fig, to: number, ms = 180) {
    const from = f.root.rotation.y;
    return tween(this.clock, ms, (t) => (f.root.rotation.y = lerpAngle(from, to, t)));
  }

  /** Runs fn every frame until the returned function is called. */
  protected loop(fn: (ms: number) => void) {
    let on = true;
    this.clock.add((ms) => {
      if (!on) return true;
      fn(ms);
    });
    return () => {
      on = false;
    };
  }

  /** Straight from where f stands to b over ms, lifted by lift(t). */
  protected line(f: Fig, b: Vector3, ms: number, lift: (t: number) => number = () => 0, e = ease.linear) {
    const a = f.root.position.clone();
    return tween(this.clock, ms, (t) => f.root.position.set(a.x + (b.x - a.x) * t, lift(t), a.z + (b.z - a.z) * t), e);
  }

  /** The point fraction s of the way from a to b. */
  protected along = (a: Vector3, b: Vector3, s: number) => a.clone().lerp(b, s);

  protected standard = (mats: Material[]) => mats.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial);

  /** Falls over away from dir. */
  protected topple(v: Fig, dir: Vector3, ms = 320) {
    const axis = new Vector3(dir.z, 0, -dir.x).normalize();
    const start = v.root.quaternion.clone();
    return tween(
      this.clock,
      ms,
      (t) => {
        v.root.quaternion.copy(start);
        v.root.rotateOnWorldAxis(axis, (Math.PI / 2) * t);
      },
      ease.in,
    );
  }

  /** Sinks depth into the board and is gone. */
  protected async sink(v: Fig, ms = 400, depth = 0.4) {
    const y = v.root.position.y;
    await tween(this.clock, ms, (t) => (v.root.position.y = y - depth * t));
    v.root.removeFromParent();
  }

  /** The name of the square under a point. */
  protected squareOf(p: Vector3) {
    return "abcdefgh"[Math.round(p.x + 3.5)] + (Math.round(3.5 - p.z) + 1);
  }
}
