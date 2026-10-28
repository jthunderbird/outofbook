// Wood, drawn once on canvases: the Staunton tribe's turned pieces and its
// tournament board. Grain is long streaks along the texture's v (so a turned
// piece's grain runs up it), wavering with noise, with a few darker rings.
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from "three";

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

/** A wood texture: base and grain colors (CSS), a seed, and how fine the grain is. */
export function woodTexture(base: string, grain: string, seed: number, fine = 1) {
  const key = `${base}${grain}${seed}${fine}`;
  let t = made.get(key);
  if (t) return t;
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  const n = noise(seed);
  const a = new Color(base);
  const b = new Color(grain);
  const out = new Color();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      // Streaks across u, bent by noise along v; rings where the streaks bunch up.
      const w = u * 40 * fine + n(v * 6, u * 3) * 4;
      const streak = Math.pow(Math.abs(Math.sin(w * Math.PI)), 6);
      const ring = Math.pow(Math.abs(Math.sin((u * 6 * fine + n(u * 2, v * 2) * 1.5) * Math.PI)), 18);
      const k = Math.min(1, streak * 0.18 + ring * 0.3 + (n(u * 30, v * 4) - 0.5) * 0.12);
      out.copy(a).lerp(b, Math.max(0, k));
      const i = (y * N + x) * 4;
      img.data[i] = out.r * 255;
      img.data[i + 1] = out.g * 255;
      img.data[i + 2] = out.b * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  made.set(key, t);
  return t;
}

/** The Staunton set's two woods: boxwood for light, ebony for dark. */
export const pieceWood = (light: boolean) => (light ? woodTexture("#ecd6ab", "#c39a62", 3, 1.6) : woodTexture("#2e211a", "#160e0a", 9, 1.6));
