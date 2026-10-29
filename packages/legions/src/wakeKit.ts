// Small tools shared by The Wake's court, stones and monuments: a seeded random
// stream, value noise, and canvas helpers for painted textures and normal maps.
import { CanvasTexture } from "three";

/** A steady pseudo-random stream from a seed. */
export function stream(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ----- Noise -----

export function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, repeating every `per` cells. */
export function vnoise(x: number, y: number, s: number, per: number) {
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
export function body(size: number, low: number, color: (u: number, v: number) => [number, number, number]) {
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
export function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -r && px < size + r && py > -r && py < size + r) draw(px, py);
    }
}
