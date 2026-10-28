// Wood, drawn once on canvases: the Staunton tribe's turned pieces and its
// tournament board. Grain is long streaks along the texture's v (so a turned
// piece's grain runs up it), wavering with noise, with a few darker rings.
import { CanvasTexture, ClampToEdgeWrapping, Color, RepeatWrapping, SRGBColorSpace } from "three";

function noise(seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = Array.from({ length: 512 }, () => rnd());
  const at = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    return p[i & 511] + (p[(i + 1) & 511] - p[i & 511]) * t;
  };
  return (x: number, y: number) => at(x + at(y * 0.37 + 11) * 7) * 0.6 + at(x * 2.1 + y * 0.9) * 0.4;
}

const made = new Map<string, CanvasTexture>();

/**
 * Wood grain painted on a canvas: cathedral rings that wander and bunch,
 * long fibers along the grain, and fine pores. dir "v" runs the grain along the
 * texture's v (up a turned piece), "u" along u (along a table).
 */
function paint(w: number, h: number, base: string, grain: string, seed: number, fine: number, dir: "u" | "v", contrast: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const n = noise(seed);
  const a = new Color(base);
  const b = new Color(grain);
  const out = new Color();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Across the grain (p) and along it (q), each 0..1.
      const p = (dir === "v" ? x / w : y / h) * fine;
      const q = dir === "v" ? y / h : x / w;
      // Rings: lines where a warped coordinate crosses whole numbers, sharp on one side as in real growth rings.
      const warp = n(p * 1.5 + 3, q * 0.6) * 2.4 + n(p * 5, q * 1.5) * 0.5;
      const t = p * 9 + warp;
      const f = t - Math.floor(t);
      const rings = Math.pow(f, 3) * (1 - Math.pow(f, 14)) * 1.15;
      // Long fibers and pores along the grain.
      const fibers = n(p * 90, q * 2.5) - 0.5;
      const pores = n(p * 260 + 17, q * 7) > 0.78 ? 0.18 : 0;
      const tone = (n(p * 2.2 + 9, q * 0.9) - 0.5) * 0.28;
      const k = Math.max(0, Math.min(1, (rings * 0.55 + fibers * 0.32 + pores) * contrast));
      out
        .copy(a)
        .offsetHSL(0, 0, tone * 0.2)
        .lerp(b, k);
      const i = (y * w + x) * 4;
      img.data[i] = out.r * 255;
      img.data[i + 1] = out.g * 255;
      img.data[i + 2] = out.b * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A tiling wood texture: base and grain colors (CSS), a seed, and how many growth rings across (fine). */
export function woodTexture(base: string, grain: string, seed: number, fine = 1) {
  const key = `${base}${grain}${seed}${fine}`;
  let t = made.get(key);
  if (t) return t;
  t = paint(512, 512, base, grain, seed, fine, "v", 1.25);
  t.wrapS = t.wrapT = RepeatWrapping;
  made.set(key, t);
  return t;
}

/**
 * One plank of wood, not repeating, for something big like a table: map it once
 * over its whole top (set the texture's repeat to 1 over the size, so grain
 * runs along the long way).
 */
export function woodPanel(base: string, grain: string, seed: number) {
  const key = `panel${base}${grain}${seed}`;
  let t = made.get(key);
  if (t) return t;
  t = paint(1536, 864, base, grain, seed, 1.7, "u", 1.1);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  made.set(key, t);
  return t;
}

/** The Staunton set's two woods: boxwood for light, ebonized for dark. */
export const pieceWood = (light: boolean) => (light ? woodTexture("#efd9ae", "#a3743a", 3, 1.6) : woodTexture("#3a281d", "#0a0605", 9, 1.6));
