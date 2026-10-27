// The arena board: polished blue marble squares (pale and deep blue, veined,
// drawn once on canvases) on a hollow dark stone plinth with a gold inlay. The
// plinth is hollow so a square can open: the queen's pit to hell is a hole
// where its square was, a glowing shaft down into the plinth.
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector3,
  type Scene,
} from "three";
import { ease, tween, type Clock } from "./fx";

/** The middle of a square (a1..h8) on the board, at floor height. */
export const squareAt = (sq: string) => new Vector3("abcdefgh".indexOf(sq[0]) - 3.5, 0, 3.5 - (+sq[1] - 1));

// ---------- Marble ----------

function noise(seed: number) {
  const p = new Uint8Array(512);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const perm = [...Array(256).keys()].sort(() => rnd() - 0.5);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const v = (x: number, y: number) => p[p[x & 255] + (y & 255)] / 255;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      sum += at(x * f, y * f) * amp;
      amp /= 2;
      f *= 2;
    }
    return sum;
  };
}

/** A veined marble texture: base color, vein color, a seed. */
function marble(base: string, vein: string, seed: number, strength = 1, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const n = noise(seed);
  const b = new Color(base);
  const v = new Color(vein);
  const out = new Color();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = y / size;
      // Veins where a turbulent sine crosses zero; a soft cloud under them.
      const turb = n(u * 4, w * 4);
      const s = Math.abs(Math.sin((u * 3 + w * 1.6 + turb * 3.2) * Math.PI));
      const veins = Math.pow(1 - s, 7) * 0.9 + Math.pow(1 - Math.abs(Math.sin((u * 7 - w * 5 + n(w * 9, u * 9) * 4) * Math.PI)), 14) * 0.35;
      const cloud = (n(u * 2 + 9, w * 2 + 3) - 0.5) * 0.18;
      out
        .copy(b)
        .offsetHSL(0, 0, cloud)
        .lerp(v, Math.min(1, veins * strength));
      const i = (y * size + x) * 4;
      img.data[i] = out.r * 255;
      img.data[i + 1] = out.g * 255;
      img.data[i + 2] = out.b * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

let textures: { light: CanvasTexture; dark: CanvasTexture } | null = null;

export interface Board {
  /** Everything of the board, to add to the scene (and take out for another court). */
  group: Group;
  /** The 64 squares by name (a1..h8). */
  squares: Map<string, Mesh>;
  /** The plinth's four walls, and its two kinds of squares' materials, for a court to dress. */
  walls: Mesh[];
}

/** Builds the plinth and the 64 squares. */
export function buildBoard(): Board {
  const group = new Group();
  const walls: Mesh[] = [];
  textures ??= { light: marble("#d3dcec", "#8a9cc0", 7), dark: marble("#1f2d58", "#4a63a0", 21, 0.6) };
  const stone = new MeshStandardMaterial({ color: 0x0e1426, roughness: 0.35, metalness: 0.1 });
  // A hollow plinth: four sides and a floor; the squares are its top.
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m = stone) => {
    const o = new Mesh(new BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    group.add(o);
    return o;
  };
  for (const s of [-1, 1]) {
    walls.push(add(9.4, 1.4, 0.7, 0, -0.71, s * 4.35), add(0.7, 1.4, 8, s * 4.35, -0.71, 0));
  }
  add(8, 0.05, 8, 0, -1.38, 0);
  // A thin gold line around the squares.
  const gold = new MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.25, metalness: 1 });
  for (const s of [-1, 1]) {
    add(8.12, 0.02, 0.06, 0, -0.0, s * 4.03, gold);
    add(0.06, 0.02, 8.12, s * 4.03, -0.0, 0, gold);
  }
  const squares = new Map<string, Mesh>();
  const geo = new BoxGeometry(1, 0.1, 1);
  for (let f = 0; f < 8; f++)
    for (let k = 0; k < 8; k++) {
      const t = ((f + k) % 2 ? textures.light : textures.dark).clone();
      t.repeat.set(0.3, 0.3);
      t.offset.set(Math.random(), Math.random());
      t.rotation = Math.floor(Math.random() * 4) * (Math.PI / 2);
      const m = new Mesh(geo, new MeshStandardMaterial({ map: t, roughness: 0.18, metalness: 0.05 }));
      m.position.set(f - 3.5, -0.05, 3.5 - k);
      m.receiveShadow = true;
      m.userData.light = (f + k) % 2 === 1;
      group.add(m);
      squares.set("abcdefgh"[f] + (k + 1), m);
    }
  return { group, squares, walls };
}

// ---------- The pit to hell ----------

/** A pit opening where a square was: a scorched rim, a glowing shaft down into the plinth, lava at the bottom. */
export class Pit {
  private rim: Mesh;
  private shaft: Mesh;
  private lava: Mesh;
  private r = 0.02;
  constructor(
    private clock: Clock,
    private scene: Scene,
    private square: Mesh,
  ) {
    const at = square.position;
    this.rim = new Mesh(this.rimShape(), new MeshStandardMaterial({ color: 0x1a0d0a, roughness: 0.9, emissive: 0xff3a00, emissiveIntensity: 0.5 }));
    this.rim.rotation.x = -Math.PI / 2;
    this.rim.position.set(at.x, 0.002, at.z);
    // The shaft: dark at the top, glowing at the bottom (vertex colors), seen from inside.
    const g = new CylinderGeometry(0.44, 0.36, 1.3, 40, 8, true);
    const pos = g.getAttribute("position");
    const col: number[] = [];
    const hot = new Color(0xff5a10);
    const dark = new Color(0x120404);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + 0.65) / 1.3;
      const c = hot.clone().lerp(dark, Math.pow(t, 0.6));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    this.shaft = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: BackSide }));
    this.shaft.position.set(at.x, -0.65, at.z);
    this.lava = new Mesh(new CircleGeometry(0.36, 32), new MeshBasicMaterial({ color: 0xffa020 }));
    this.lava.rotation.x = -Math.PI / 2;
    this.lava.position.set(at.x, -1.29, at.z);
    this.shaft.scale.set(0.01, 1, 0.01);
    this.lava.scale.setScalar(0.01);
    scene.add(this.rim, this.shaft, this.lava);
    clock.add((ms) => {
      (this.lava.material as MeshBasicMaterial).color.setHSL(0.07 + Math.sin(performance.now() / 150) * 0.015, 1, 0.55);
      void ms;
      return !this.rim.parent;
    });
  }

  private rimShape() {
    const s = new Shape();
    s.moveTo(-0.5, -0.5);
    s.lineTo(0.5, -0.5);
    s.lineTo(0.5, 0.5);
    s.lineTo(-0.5, 0.5);
    s.closePath();
    // A ragged hole, so the floor looks broken open.
    const hole = new Path();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = this.r * (1 + Math.sin(a * 7) * 0.05 + Math.sin(a * 3 + 1) * 0.04);
      if (i === 0) hole.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else hole.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.holes.push(hole);
    return new ShapeGeometry(s, 32);
  }

  private set(r: number) {
    this.r = Math.max(0.02, r);
    this.rim.geometry.dispose();
    this.rim.geometry = this.rimShape();
    const k = this.r / 0.44;
    this.shaft.scale.set(k, 1, k);
    this.lava.scale.setScalar(k);
  }

  open(ms = 450) {
    this.square.visible = false;
    return tween(this.clock, ms, (t) => this.set(0.44 * t), ease.out);
  }

  async close(ms = 400) {
    await tween(this.clock, ms, (t) => this.set(0.44 * (1 - t)), ease.in);
    this.square.visible = true;
    for (const m of [this.rim, this.shaft, this.lava]) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
}
