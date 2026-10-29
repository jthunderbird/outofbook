// The Wake: the Restless's home court, a graveyard at night. Built from the ground up,
// one piece at a time. So far: the ground, and the board set into it. The pale squares
// are old marble slabs, filthy and cracked, ivy growing over them; the dark squares are
// plain mud, level with the soil round them; the rest of the ground is bumpy dirt.
// Everything is made in code (canvas textures with normal maps worked out from them).
import {
  CanvasTexture,
  Color,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Fog,
  Group,
  HemisphereLight,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Scene,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Board } from "./board";
import type { CourtSet } from "./courts";

/** Where the dirt lies under the board; the slabs and the mud sit in it. */
export const GROUND = -0.05;
/** The haze the far ground and the sky's foot meet in. */
export const HAZE = 0x424c54;

/** A steady pseudo-random stream from a seed. */
export function stream(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ----- Noise -----

function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, repeating every `per` cells. */
function vnoise(x: number, y: number, s: number, per: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % per) + per) % per;
  const a = hash(w(ix), w(iy), s);
  const b = hash(w(ix + 1), w(iy), s);
  const c = hash(w(ix), w(iy + 1), s);
  const d = hash(w(ix + 1), w(iy + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Layered noise in 0..1; repeats every `per` cells of the first layer. */
export function fbm(x: number, y: number, s: number, per: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let tot = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, s + o * 17, per * f);
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / tot;
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, g: c.getContext("2d", { willReadFrequently: true })! };
}

/** Per-pixel color at a lower resolution, scaled up smooth: the stone's or soil's body, before the sharp detail goes on. */
function body(size: number, low: number, color: (u: number, v: number) => [number, number, number]) {
  const { c, g } = canvas(size);
  const lo = canvas(low);
  const img = lo.g.createImageData(low, low);
  for (let y = 0; y < low; y++)
    for (let x = 0; x < low; x++) {
      const [r, gr, b] = color(x / low, y / low);
      const i = (y * low + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  lo.g.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(lo.c, 0, 0, size, size);
  return { c, g };
}

/** A normal map worked out from a canvas's light and dark: what is dark sinks, what is light stands. */
export function normalFrom(src: HTMLCanvasElement, strength: number, wrap: boolean) {
  const size = Math.min(1024, src.width);
  const { c, g } = canvas(size);
  g.drawImage(src, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size);
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) lum[i] = (0.299 * px.data[i * 4] + 0.587 * px.data[i * 4 + 1] + 0.114 * px.data[i * 4 + 2]) / 255;
  const at = (x: number, y: number) => lum[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  const wrapAt = (x: number, y: number) => lum[((y + size) % size) * size + ((x + size) % size)];
  const get = wrap ? wrapAt : at;
  const out = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (get(x + 1, y) - get(x - 1, y)) * strength;
      const dy = (get(x, y + 1) - get(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return new CanvasTexture(c);
}

/** Runs a drawing at a spot and again at the wrapped copies of it, so a tiling picture has no seam. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -r && px < size + r && py > -r && py < size + r) draw(px, py);
    }
}

// ----- The dirt -----

/** Bumpy dirt that tiles: clods, pebbles, grit and dead twigs on a mottled brown. */
export function dirtMaps(seed: number) {
  const size = 1024;
  const r = stream(seed);
  const { c, g } = body(size, 512, (u, v) => {
    const big = fbm(u * 4, v * 4, seed, 4, 5);
    const fine = fbm(u * 16, v * 16, seed + 5, 16, 3);
    const t = clamp01(big * 0.8 + fine * 0.4 - 0.1);
    const damp = smooth(0.55, 0.8, fbm(u * 3, v * 3, seed + 9, 3, 3));
    const k = mix(0.55, 1.15, t) * mix(1, 0.62, damp);
    return [66 * k, 56 * k, 46 * k];
  });
  // Clods, each lit from the upper left, with a shadow under it.
  for (let i = 0; i < 700; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 6 + r() * r() * 30;
    const tint = 0.7 + r() * 0.6;
    wrapped(size, x, y, rad * 1.4, (px, py) => {
      g.fillStyle = "rgba(10,8,6,0.2)";
      g.beginPath();
      g.ellipse(px + rad * 0.3, py + rad * 0.35, rad, rad * 0.8, 0, 0, 7);
      g.fill();
      const grad = g.createRadialGradient(px - rad * 0.3, py - rad * 0.3, rad * 0.1, px, py, rad);
      grad.addColorStop(0, `rgba(${84 * tint},${72 * tint},${60 * tint},0.55)`);
      grad.addColorStop(1, `rgba(${40 * tint},${33 * tint},${27 * tint},0.55)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, 7);
      g.fill();
    });
  }
  // Pebbles.
  for (let i = 0; i < 110; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 1.5 + r() * r() * 6;
    const base = 62 + r() * 44;
    wrapped(size, x, y, rad * 2, (px, py) => {
      g.fillStyle = "rgba(6,6,6,0.5)";
      g.beginPath();
      g.ellipse(px + rad * 0.3, py + rad * 0.4, rad, rad * 0.75, 0.4, 0, 7);
      g.fill();
      const grad = g.createRadialGradient(px - rad * 0.35, py - rad * 0.35, 0.5, px, py, rad);
      grad.addColorStop(0, `rgb(${base + 40},${base + 38},${base + 30})`);
      grad.addColorStop(1, `rgb(${base - 30},${base - 32},${base - 36})`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, rad, rad * 0.78, 0.4, 0, 7);
      g.fill();
    });
  }
  // Dead twigs and rootlets.
  g.lineCap = "round";
  for (let i = 0; i < 60; i++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * 6.3;
    g.strokeStyle = `rgba(${28 + r() * 22},${22 + r() * 16},${16 + r() * 10},0.9)`;
    g.lineWidth = 1 + r() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * (8 + r() * 12);
      y += Math.sin(a) * (8 + r() * 12);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Grit.
  for (let i = 0; i < 60000; i++) {
    const d = r() < 0.5 ? 1 : -1;
    const v = d > 0 ? 120 + r() * 60 : 10 + r() * 30;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},${0.25 + r() * 0.4})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.anisotropy = 8;
  const normal = normalFrom(c, 5, true);
  normal.wrapS = normal.wrapT = RepeatWrapping;
  normal.anisotropy = 8;
  return { map, normal };
}

/** Wet, dark mud for a square: smooth swirls, a few puddle sheens, dried cracks, a pebble or two. */
function mudMaps(seed: number) {
  const size = 512;
  const r = stream(seed);
  const { c, g } = body(size, 256, (u, v) => {
    const warp = fbm(u * 3 + 5, v * 3, seed, 1 << 16, 3);
    const t = fbm(u * 5 + warp * 2, v * 5 - warp, seed + 3, 1 << 16, 5);
    const pool = smooth(0.55, 0.68, fbm(u * 2.5, v * 2.5, seed + 7, 1 << 16, 3));
    const k = mix(0.5, 1.1, t);
    // Standing water gives back a little of the cold sky.
    return [mix(46 * k, 58, pool * 0.45), mix(36 * k, 56, pool * 0.45), mix(27 * k, 54, pool * 0.45)];
  });
  g.lineCap = "round";
  // Drying cracks.
  g.strokeStyle = "rgba(12,9,7,0.7)";
  for (let k = 0; k < 7; k++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * 6.3;
    g.lineWidth = 1 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 8; i++) {
      a += (r() - 0.5) * 1.3;
      x += Math.cos(a) * (10 + r() * 14);
      y += Math.sin(a) * (10 + r() * 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // A few stones pressed into it.
  for (let i = 0; i < 12; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 2 + r() * 5;
    const base = 70 + r() * 50;
    g.fillStyle = "rgba(4,4,4,0.5)";
    g.beginPath();
    g.ellipse(x + rad * 0.3, y + rad * 0.4, rad, rad * 0.75, 0.4, 0, 7);
    g.fill();
    g.fillStyle = `rgb(${base},${base - 2},${base - 8})`;
    g.beginPath();
    g.ellipse(x, y, rad, rad * 0.78, 0.4, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const v = r() < 0.5 ? 80 + r() * 40 : 8 + r() * 20;
    g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},${0.2 + r() * 0.3})`;
    g.fillRect(r() * size, r() * size, 1 + r(), 1 + r());
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return { map, normal: normalFrom(c, 2.4, false) };
}

// ----- The marble -----

/** An old paving slab: stained pale marble, veined, cracked, grimed along its edges and in its dips. Moss is added in 3D. */
function marbleMaps(seed: number) {
  const size = 1024;
  const r = stream(seed);
  const { c, g } = body(size, 512, (u, v) => {
    const w1 = fbm(u * 3 + 9, v * 3, seed, 1 << 16, 3);
    const w2 = fbm(u * 3, v * 3 + 7, seed + 1, 1 << 16, 3);
    const cloud = fbm(u * 4 + w1, v * 4 + w2, seed + 2, 1 << 16, 5);
    let [cr, cg, cb] = [mix(96, 150, cloud), mix(93, 146, cloud), mix(84, 134, cloud)];
    // Warm yellow-grey age stains.
    const stain = smooth(0.52, 0.72, fbm(u * 2.5 + 3, v * 2.5, seed + 4, 1 << 16, 4));
    cr = mix(cr, 156, stain * 0.55);
    cg = mix(cg, 142, stain * 0.55);
    cb = mix(cb, 112, stain * 0.55);
    // Veins.
    const vein = 1 - Math.abs(2 * fbm(u * 2.2 + w2 * 1.5, v * 2.2 + w1 * 1.5, seed + 6, 1 << 16, 4) - 1);
    const vv = smooth(0.9, 0.97, vein) * 0.6;
    cr = mix(cr, 96, vv);
    cg = mix(cg, 94, vv);
    cb = mix(cb, 92, vv);
    // Grime: in the dips and thick along the edges.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const grime = Math.max(smooth(0.26, 0.0, edge) * (0.7 + 0.3 * fbm(u * 8, v * 8, seed + 8, 1 << 16, 3)), smooth(0.5, 0.7, fbm(u * 3.5, v * 3.5, seed + 10, 1 << 16, 4)) * 0.85);
    return [mix(cr, 52, grime), mix(cg, 46, grime), mix(cb, 36, grime)];
  });
  // Fine grain.
  for (let i = 0; i < 16000; i++) {
    const v = r() < 0.5 ? 205 : 30;
    g.fillStyle = `rgba(${v},${v},${v * 0.95},${0.08 + r() * 0.16})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // Cracks: a dark seam, a lit lip beside it and dirt packed in.
  const crack = (x: number, y: number, ang: number, n: number, w: number) => {
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < n; i++) {
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang) * (14 + r() * 20);
      y += Math.sin(ang) * (14 + r() * 20);
      pts.push([x, y]);
      if (r() < 0.16 && n > 4) crack(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r()), Math.floor(n / 2), w * 0.7);
    }
    const trace = (dx: number, dy: number) => {
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
      g.stroke();
    };
    g.strokeStyle = "rgba(220,218,208,0.35)";
    g.lineWidth = w;
    trace(1.5, 1.5);
    g.strokeStyle = "rgba(36,28,20,0.85)";
    g.lineWidth = w * 1.5;
    trace(0, 0);
    g.strokeStyle = "rgba(8,6,4,0.9)";
    g.lineWidth = w * 0.6;
    trace(0, 0);
  };
  for (let k = 0; k < 3 + Math.floor(r() * 3); k++) crack(r() * size, r() < 0.5 ? 0 : size, r() * 6.3, 12 + Math.floor(r() * 8), 2.2);
  // Chipped corners and edges, the dark soil showing through.
  g.fillStyle = "rgba(34,28,22,0.95)";
  for (let k = 0; k < 14; k++) {
    const side = Math.floor(r() * 4);
    const t = r() * size;
    const d = 8 + r() * 26;
    const w = 14 + r() * 40;
    g.beginPath();
    if (side < 2) {
      const e = side === 0 ? 0 : size;
      const s = side === 0 ? 1 : -1;
      g.moveTo(e, t);
      g.lineTo(e + s * d, t + w * 0.3);
      g.lineTo(e + s * d * 0.5, t + w);
      g.lineTo(e, t + w);
    } else {
      const e = side === 2 ? 0 : size;
      const s = side === 2 ? 1 : -1;
      g.moveTo(t, e);
      g.lineTo(t + w * 0.3, e + s * d);
      g.lineTo(t + w, e + s * d * 0.5);
      g.lineTo(t + w, e);
    }
    g.closePath();
    g.fill();
  }
  // Dirt and moss caught along the edges.
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4);
    const t = r() * size;
    const x = side === 0 ? r() * 30 : side === 1 ? size - r() * 30 : t;
    const y = side === 2 ? r() * 30 : side === 3 ? size - r() * 30 : t;
    const rad = 10 + r() * 34;
    const moss = r() < 0.35;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, moss ? `rgba(${50 + r() * 20},${84 + r() * 30},${36},0.6)` : "rgba(40,32,24,0.65)");
    grad.addColorStop(1, "rgba(30,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // The worn dark rim.
  g.strokeStyle = "rgba(16,12,8,0.75)";
  g.lineWidth = 12;
  g.strokeRect(0, 0, size, size);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return { map, normal: normalFrom(c, 2.8, false) };
}

// ----- The court -----

export function theWake(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const dispose: { dispose(): void }[] = [];
  const rng = stream(2024);

  // ----- The ground: dirt, humped and bumpy, level with the board where the board lies -----
  const dirt = dirtMaps(900);
  dirt.map.repeat.set(22, 22);
  dirt.normal.repeat.set(22, 22);
  const size = 200;
  const segs = 320;
  const geo = new PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Flat under the board, rising into humps and hollows beyond it.
    const out = smooth(4.4, 9, Math.max(Math.abs(x), Math.abs(z)));
    const hump = fbm(x * 0.18 + 40, z * 0.18, 5, 1 << 16, 5) - 0.42;
    const ridge = fbm(x * 0.6, z * 0.6 + 70, 6, 1 << 16, 3) - 0.5;
    pos.setY(i, GROUND + out * (hump * 1.6 + ridge * 0.25) + 0.004 * (1 - out) * Math.sin(x * 7) * Math.cos(z * 5));
    // Patches of the dirt darker, damper or paler, to break up its tiling.
    const k = mix(0.7, 1.12, fbm(x * 0.25, z * 0.25, 12, 1 << 16, 4));
    colors.set([k, k * 0.98, k * 0.95], i * 3);
  }
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const soil = new MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normal, vertexColors: true, roughness: 1, color: 0xb0aaa2 });
  soil.normalScale.set(2, 2);
  const ground = new Mesh(geo, soil);
  ground.receiveShadow = true;
  group.add(ground);
  dispose.push(soil, dirt.map, dirt.normal, geo);

  // ----- The board, set into the ground -----
  const squares = new Set(board.squares.values());
  for (const o of board.group.children) if (!squares.has(o as Mesh)) o.visible = false;
  const marble = [0, 1, 2, 3, 4].map((i) => marbleMaps(300 + i * 53));
  const mud = [0, 1, 2].map((i) => mudMaps(700 + i * 29));
  for (const m of [...marble, ...mud]) dispose.push(m.map, m.normal);
  const slabMats = marble.map((m) => new MeshStandardMaterial({ map: m.map, normalMap: m.normal, color: 0xe6e0d4, roughness: 1, metalness: 0 }));
  const mudMats = mud.map((m) => new MeshStandardMaterial({ map: m.map, normalMap: m.normal, roughness: 0.38, metalness: 0 }));
  dispose.push(...slabMats, ...mudMats);
  const light: Mesh[] = [];
  for (const sq of board.squares.values()) {
    const isLight = !!sq.userData.light;
    const was = sq.material as MeshStandardMaterial;
    const mats = isLight ? slabMats : mudMats;
    sq.material = mats[Math.floor(rng() * mats.length)];
    was.map?.dispose();
    was.dispose();
    // Each square's picture turned a quarter-turn or so, so no two read alike.
    const g = sq.geometry.clone();
    const uv = g.getAttribute("uv");
    const turn = Math.floor(rng() * 4);
    const flip = rng() < 0.5 ? -1 : 1;
    for (let i = 8; i < 12; i++) {
      let u = uv.getX(i) - 0.5;
      let v = uv.getY(i) - 0.5;
      for (let k = 0; k < turn; k++) [u, v] = [-v, u];
      uv.setXY(i, 0.5 + u * flip, 0.5 + v);
    }
    sq.geometry = g;
    dispose.push(g);
    if (isLight) {
      // The slabs stand a hair apart and a touch out of true, their tops just above the dirt.
      sq.scale.set(0.96, 1, 0.96);
      sq.rotation.set((rng() - 0.5) * 0.014, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.014);
      sq.position.y = -0.075;
      sq.castShadow = false;
      light.push(sq);
    } else {
      // Mud: flush with the dirt around it.
      sq.position.y = -0.082;
    }
  }

  // ----- Moss: cushions of it along the slabs' edges and corners and in patches on them; green, with dark rotten bits at the rims -----
  const blobs: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const b = new IcosahedronGeometry(0.5 + rng() * 0.4, 1);
    b.scale(1, 0.55 + rng() * 0.2, 1);
    b.translate((rng() - 0.5) * 0.9, 0, (rng() - 0.5) * 0.9);
    const p = b.getAttribute("position");
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.85 + rng() * 0.3), p.getY(k) * (0.7 + rng() * 0.6), p.getZ(k) * (0.85 + rng() * 0.3));
    blobs.push(b);
  }
  const tuft = mergeVertices(mergeGeometries(blobs.map((b) => b.toNonIndexed()))!, 0.01);
  blobs.forEach((b) => b.dispose());
  tuft.computeVertexNormals();
  const fuzz = canvas(256);
  const fr = stream(77);
  fuzz.g.fillStyle = "#808080";
  fuzz.g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = fr() * 255;
    fuzz.g.fillStyle = `rgba(${v},${v},${v},0.7)`;
    fuzz.g.fillRect(fr() * 256, fr() * 256, 1 + fr() * 2, 1 + fr() * 3);
  }
  const fuzzTex = new CanvasTexture(fuzz.c);
  fuzzTex.wrapS = fuzzTex.wrapT = RepeatWrapping;
  const mossMat = new MeshStandardMaterial({ bumpMap: fuzzTex, bumpScale: 2.4, roughness: 1 });
  const places: { m: Matrix4; c: Color }[] = [];
  const q = new Quaternion();
  const eu = new Euler();
  const clump = (x: number, z: number, near: number) => {
    // near: 0 well inside the slab, 1 right at its rim; the rim is where the rot is.
    const rot = rng() < 0.12 + near * 0.5;
    const s = (rot ? 0.035 : 0.05) + rng() * 0.06;
    eu.set(0, rng() * 6.3, 0);
    q.setFromEuler(eu);
    const sy = s * (0.6 + rng() * 0.8);
    places.push({
      m: new Matrix4().compose(new Vector3(x, -0.026 + sy * 0.15, z), q, new Vector3(s, sy, s)),
      c: rot ? new Color().setHSL(0.06 + rng() * 0.05, 0.3 + rng() * 0.2, 0.04 + rng() * 0.06) : new Color().setHSL(0.24 + rng() * 0.07, 0.4 + rng() * 0.2, 0.03 + rng() * 0.06),
    });
  };
  for (const sq of light) {
    const cx = sq.position.x;
    const cz = sq.position.z;
    for (let i = 0; i < 26; i++) {
      // Along an edge, packed in near it and thinning inward (a little spilling out over it).
      const side = Math.floor(rng() * 4);
      const along = (rng() - 0.5) * 0.92;
      const depth = Math.abs((rng() + rng() - 1) * 0.22) + (rng() < 0.15 ? -0.05 : 0.02);
      const e = 0.47 - depth;
      const x = side < 2 ? (side === 0 ? -e : e) : along;
      const z = side >= 2 ? (side === 2 ? -e : e) : along;
      clump(cx + x, cz + z, clamp01(1 - depth / 0.25));
    }
    // Corners gather more.
    for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) clump(cx + (k % 2 ? 1 : -1) * (0.47 - rng() * 0.16), cz + (k < 2 ? 1 : -1) * (0.47 - rng() * 0.16), 0.8);
    // A patch or two out on the face.
    for (let k = 0; k < 2; k++) {
      const px = (rng() - 0.5) * 0.6;
      const pz = (rng() - 0.5) * 0.6;
      if (rng() < 0.5) continue;
      for (let i = 0; i < 8; i++) clump(cx + px + (rng() - 0.5) * 0.26, cz + pz + (rng() - 0.5) * 0.26, 0.1);
    }
  }
  const moss = new InstancedMesh(tuft, mossMat, places.length);
  places.forEach((p, i) => {
    moss.setMatrixAt(i, p.m);
    moss.setColorAt(i, p.c);
  });
  moss.receiveShadow = true;
  moss.frustumCulled = false;
  group.add(moss);
  dispose.push(tuft, mossMat, fuzzTex, moss);

  // ----- Light and haze -----
  const moonLight = new DirectionalLight(0xb4c8d8, 1.5);
  moonLight.position.set(-9, 3.5, 5);
  moonLight.castShadow = true;
  Object.assign(moonLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
  moonLight.shadow.mapSize.set(1024, 1024);
  const hemi = new HemisphereLight(0x6a7e8c, 0x0c1012, 0.7);
  group.add(moonLight, moonLight.target, hemi);
  const prevBg = scene.background;
  const prevFog = scene.fog;
  scene.background = new Color(HAZE);
  scene.fog = new Fog(HAZE, 10, 60);

  return {
    markY: 0.02,
    view: { fixed: false, pitch: 0.5, dist: 11, fov: 50, ty: 0.6 },
    update() {},
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      scene.fog = prevFog;
      dispose.forEach((d) => d.dispose());
    },
  };
}
