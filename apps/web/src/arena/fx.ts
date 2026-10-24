// Arena effects: a frame clock that drives tweens, and the pieces of magic the
// figures share (particles, the king's arc, portals, dust). Everything runs off
// the arena's render loop, so it stops with the page and speeds up with SPEED.
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  QuadraticBezierCurve3,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from "three";

/** Every arena animation runs at this speed (2 = twice as fast). */
export const SPEED = 1;

type Tick = (ms: number) => boolean | void;

export class Clock {
  private ticks = new Set<Tick>();
  /** Runs fn each frame with the frame's milliseconds until it returns true. */
  add(fn: Tick) {
    this.ticks.add(fn);
  }
  update(ms: number) {
    for (const t of [...this.ticks]) if (t(ms * SPEED)) this.ticks.delete(t);
  }
  clear() {
    this.ticks.clear();
  }
}

export const ease = {
  linear: (t: number) => t,
  in: (t: number) => t * t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  back: (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
};

/** Calls fn with 0..1 (eased) over ms; resolves at 1. */
export function tween(clock: Clock, ms: number, fn: (t: number) => void, e: (t: number) => number = ease.inOut): Promise<void> {
  return new Promise((done) => {
    let at = 0;
    fn(e(0));
    clock.add((dt) => {
      at += dt;
      const t = Math.min(1, at / ms);
      fn(e(t));
      if (t >= 1) {
        done();
        return true;
      }
    });
  });
}

export const wait = (clock: Clock, ms: number) => tween(clock, ms, () => {});

/** Gives each mesh under obj its own copies of its materials (for clipping and fading one figure). */
export function ownMaterials(obj: Object3D): Material[] {
  const out: Material[] = [];
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    out.push(...(Array.isArray(m.material) ? m.material : [m.material]));
  });
  return out;
}

/** Hides everything above y (world) on these materials, or nothing with null. */
export function clipAbove(mats: Material[], y: number | null) {
  const planes = y === null ? null : [new Plane(new Vector3(0, -1, 0), y)];
  for (const m of mats) m.clippingPlanes = planes;
}

// ---------- Particles ----------

const cube = new BoxGeometry(1, 1, 1);
const ball = new SphereGeometry(1, 6, 4);

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  life: number;
  age: number;
  gravity: number;
  drag: number;
  shrink: boolean;
}

export class Particles {
  private list: Particle[] = [];
  constructor(private scene: Scene) {}

  spawn(at: Vector3, o: { color: Color | string | number; size: number; vel: Vector3; life: number; gravity?: number; glow?: boolean; round?: boolean; drag?: number; shrink?: boolean }) {
    const mat = new MeshBasicMaterial({ color: o.color, transparent: true, ...(o.glow ? { blending: AdditiveBlending, depthWrite: false } : {}) });
    const mesh = new Mesh(o.round ? ball : cube, mat);
    mesh.position.copy(at);
    mesh.scale.setScalar(o.size);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(mesh);
    this.list.push({
      mesh,
      vel: o.vel.clone(),
      spin: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8),
      life: o.life,
      age: 0,
      gravity: o.gravity ?? 9,
      drag: o.drag ?? 0,
      shrink: o.shrink ?? true,
    });
  }

  /** A burst of chunks flying out of a point. */
  burst(at: Vector3, color: Color | string | number, n: number, o: { speed?: number; size?: number; up?: number; glow?: boolean; life?: number; gravity?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      this.spawn(at, {
        color,
        size: (o.size ?? 0.06) * (0.6 + Math.random() * 0.8),
        vel: new Vector3(Math.cos(a) * s, (o.up ?? 2) * (0.5 + Math.random()), Math.sin(a) * s),
        life: (o.life ?? 900) * (0.7 + Math.random() * 0.6),
        glow: o.glow,
        gravity: o.gravity,
      });
    }
  }

  /** A low ring of dust rolling out over the board. */
  dust(at: Vector3, n = 16, color: Color | string | number = 0xb8a990) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const s = 0.8 + Math.random() * 0.6;
      this.spawn(new Vector3(at.x + Math.cos(a) * 0.2, 0.05, at.z + Math.sin(a) * 0.2), {
        color,
        size: 0.07 + Math.random() * 0.06,
        vel: new Vector3(Math.cos(a) * s, 0.15 + Math.random() * 0.25, Math.sin(a) * s),
        life: 700 + Math.random() * 400,
        gravity: 0,
        drag: 2.5,
        round: true,
      });
    }
  }

  update(ms: number) {
    const dt = ms / 1000;
    this.list = this.list.filter((p) => {
      p.age += ms;
      if (p.age >= p.life) {
        p.mesh.removeFromParent();
        (p.mesh.material as Material).dispose();
        return false;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      // Chunks come to rest on the board instead of falling through it.
      if (p.mesh.position.y < 0.02 && p.gravity > 0) {
        p.mesh.position.y = 0.02;
        p.vel.set(p.vel.x * 0.4, Math.abs(p.vel.y) * 0.2, p.vel.z * 0.4);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const k = p.age / p.life;
      (p.mesh.material as MeshBasicMaterial).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (p.shrink && k > 0.6) p.mesh.scale.multiplyScalar(0.985);
      return true;
    });
  }

  clear() {
    for (const p of this.list) p.mesh.removeFromParent();
    this.list = [];
  }
}

// ---------- The king's arc ----------

/** A beam of magic from the king's staff to a piece, drawn out from the staff and faded. */
export async function magicArc(clock: Clock, scene: Scene, from: Vector3, to: Vector3, color: Color | number, ms = 520) {
  const mid = from.clone().lerp(to, 0.5);
  mid.y += 0.8 + from.distanceTo(to) * 0.15;
  const geo = new TubeGeometry(new QuadraticBezierCurve3(from, mid, to), 48, 0.035, 6);
  const mat = new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const core = new Mesh(geo, mat);
  const halo = new Mesh(geo, mat.clone());
  halo.scale.setScalar(1);
  (halo.material as MeshBasicMaterial).opacity = 0.35;
  const g = new Group();
  g.add(core);
  scene.add(g);
  const count = geo.index!.count;
  await tween(clock, ms * 0.55, (t) => geo.setDrawRange(0, Math.ceil((count * t) / 6) * 6), ease.out);
  await tween(clock, ms * 0.45, (t) => (mat.opacity = 1 - t), ease.in);
  g.removeFromParent();
  geo.dispose();
  mat.dispose();
}

// ---------- Portals ----------

const PORTAL_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PORTAL_FRAG = `
uniform float time; uniform vec3 color; uniform float open;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float swirl = sin(a * 5.0 + r * 14.0 - time * 6.0) * 0.5 + 0.5;
  float rim = smoothstep(0.75, 1.0, r);
  float core = 1.0 - smoothstep(0.0, 0.85, r);
  vec3 c = mix(color * 0.25, color, swirl * (0.4 + rim)) + vec3(1.0) * rim * 0.6;
  // The middle is a dark hole, the rim bright.
  c *= mix(1.0, 0.15, core);
  gl_FragColor = vec4(c, (0.55 + 0.45 * rim) * open);
}`;

export class Portal {
  readonly obj: Group;
  private mat: ShaderMaterial;
  private ring: Mesh;
  constructor(
    private clock: Clock,
    scene: Scene,
    at: Vector3,
    color: Color,
  ) {
    this.mat = new ShaderMaterial({
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      uniforms: { time: { value: 0 }, color: { value: color }, open: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const disc = new Mesh(new CircleGeometry(0.48, 40), this.mat);
    disc.rotation.x = -Math.PI / 2;
    this.ring = new Mesh(new RingGeometry(0.46, 0.53, 40), new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.obj = new Group();
    this.obj.add(disc, this.ring);
    this.obj.position.copy(at);
    this.obj.scale.setScalar(0.001);
    scene.add(this.obj);
    clock.add((ms) => {
      this.mat.uniforms.time.value += ms / 1000;
      this.ring.rotation.z += ms / 400;
      return !this.obj.parent;
    });
  }
  open(ms = 300) {
    return tween(
      this.clock,
      ms,
      (t) => {
        this.obj.scale.setScalar(Math.max(0.001, t));
        this.mat.uniforms.open.value = t;
      },
      ease.back,
    );
  }
  async close(ms = 300) {
    await tween(
      this.clock,
      ms,
      (t) => {
        this.obj.scale.setScalar(Math.max(0.001, 1 - t));
        this.mat.uniforms.open.value = 1 - t;
      },
      ease.in,
    );
    this.obj.removeFromParent();
  }
}
