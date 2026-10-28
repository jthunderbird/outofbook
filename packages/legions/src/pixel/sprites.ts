import { CanvasTexture, NearestFilter } from "three";

// Epoch Drifters sprites, drawn in code: each piece is a 32x32 pixel figure
// built from filled shapes with rim shading (light on the upper left edge, dark
// on the lower right) and a one pixel outline, so a side is just a palette swap.

export type Ramp = [light: string, mid: string, dark: string];
export const SIZE = 32;
export const OUTLINE = "#1d1530";

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function css(h: number, s: number, l: number) {
  return `hsl(${Math.round((h + 360) % 360)} ${Math.round(Math.max(0, Math.min(1, s)) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`;
}
/** A three tone ramp from one color: highlights drift warm, shadows drift toward violet, as in 16-bit palettes. */
export function ramp(hex: string): Ramp {
  const [h, s, l] = hsl(hex);
  return [css(h + 8, s * 0.9, Math.min(0.9, l + 0.17)), hex, css(h - 14, s * 0.85, Math.max(0.08, l - 0.2))];
}

type Mask = Uint8Array;
const W = SIZE;
const empty = (): Mask => new Uint8Array(W * W);

/**
 * The pose a shape is drawn in: moved by (dx, dy) and turned by a radians
 * about (px, py), for frames of a walk or a strike. Shapes read it as they are made.
 */
interface Tf {
  dx: number;
  dy: number;
  a: number;
  px: number;
  py: number;
}
let T: Tf = { dx: 0, dy: 0, a: 0, px: 0, py: 0 };
const xf = (x: number, y: number): [number, number] => {
  const c = Math.cos(T.a);
  const s = Math.sin(T.a);
  const X = x - T.px;
  const Y = y - T.py;
  return [T.px + X * c - Y * s + T.dx, T.py + X * s + Y * c + T.dy];
};
/** Draws what fn draws moved and turned; poses nest, adding their moves (the innermost turn wins). */
function posed(tf: Partial<Tf>, fn: () => void) {
  const prev = T;
  T = { dx: prev.dx + (tf.dx ?? 0), dy: prev.dy + (tf.dy ?? 0), a: tf.a ?? prev.a, px: tf.px ?? prev.px, py: tf.py ?? prev.py };
  fn();
  T = prev;
}

function polyRaw(pts: [number, number][]): Mask {
  const m = empty();
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) m[y * W + x] = 1;
    }
  return m;
}
export const rect = (x0: number, y0: number, x1: number, y1: number): Mask => {
  if (T.a) return polyRaw([xf(x0, y0), xf(x1 + 1, y0), xf(x1 + 1, y1 + 1), xf(x0, y1 + 1)]);
  const m = empty();
  const dx = Math.round(T.dx);
  const dy = Math.round(T.dy);
  for (let y = y0 + dy; y <= y1 + dy; y++) for (let x = x0 + dx; x <= x1 + dx; x++) if (x >= 0 && y >= 0 && x < W && y < W) m[y * W + x] = 1;
  return m;
};
export const ell = (cx: number, cy: number, rx: number, ry: number): Mask => {
  const [ex, ey] = xf(cx, cy);
  const m = empty();
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1) m[y * W + x] = 1;
  return m;
};
export const poly = (pts: [number, number][]): Mask => polyRaw(pts.map(([x, y]) => xf(x, y)));
export const or = (...ms: Mask[]): Mask => {
  const m = empty();
  for (const a of ms) for (let i = 0; i < m.length; i++) if (a[i]) m[i] = 1;
  return m;
};

class Paint {
  px: (string | null)[] = new Array(W * W).fill(null);
  draw(m: Mask, [light, mid, dark]: Ramp | [string, string, string]) {
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        if (!m[y * W + x]) continue;
        const up = x > 0 && y > 0 && m[(y - 1) * W + x - 1];
        const dn = x < W - 1 && y < W - 1 && m[(y + 1) * W + x + 1];
        this.px[y * W + x] = !up ? light : !dn ? dark : mid;
      }
  }
  dot(x: number, y: number, c: string) {
    const [X, Y] = xf(x, y).map(Math.round);
    if (X >= 0 && Y >= 0 && X < W && Y < W) this.px[Y * W + X] = c;
  }
  /** The finished sprite on a canvas, outlined. */
  finish() {
    const c = document.createElement("canvas");
    c.width = c.height = W;
    const g = c.getContext("2d")!;
    const out = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && this.px[y * W + x] !== null;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const v = this.px[y * W + x];
        if (v) g.fillStyle = v;
        else if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) g.fillStyle = OUTLINE;
        else continue;
        g.fillRect(x, y, 1, 1);
      }
    return c;
  }
}

export interface Palette {
  cloth: Ramp;
  trim: Ramp;
  hair: Ramp;
  glow: string;
}
/** The two sides: Dawn (blue and cream) and Dusk (crimson and violet), the same figures in other clothes. */
export const SIDES: Record<"w" | "b", Palette> = {
  w: { cloth: ramp("#3f78d6"), trim: ramp("#f4efe2"), hair: ramp("#d9a441"), glow: "#7fe9ff" },
  b: { cloth: ramp("#c23a52"), trim: ramp("#5b3a8f"), hair: ramp("#2d2a4a"), glow: "#ff7fb2" },
};
const SKIN = ramp("#f0c49a");
const GOLD = ramp("#f2c230");
const STEEL = ramp("#b4bdd0");
const WHITE = ramp("#f4efe2");
const RUBY = ramp("#e03a4a");
const STONE = ramp("#8d93a8");
const BROWN = ramp("#7a4a2a");
const FIRE = ramp("#ffb13b");
const INK = "#241b33";

/**
 * One frame of a figure: bob (the body sinks this many pixels; feet stay),
 * step (1: left foot lifted, -1: right foot lifted), act (a strike: 1 wind-up,
 * 2 the blow, 3 recovering; 0 none).
 */
export interface Frame {
  bob: number;
  step: number;
  act: number;
  /** Flying (the dragon): the wings' beat, up (-) or down (+); the legs tucked up. */
  wing?: number;
}
export type Motion = "idle" | "walk" | "attack" | "fly";
/** Two frames of breathing, four of a walk, three of a strike. */
export const FRAMES: Record<Motion, Frame[]> = {
  idle: [
    { bob: 0, step: 0, act: 0 },
    { bob: 1, step: 0, act: 0 },
  ],
  walk: [
    { bob: 0, step: 1, act: 0 },
    { bob: -1, step: 0, act: 0 },
    { bob: 0, step: -1, act: 0 },
    { bob: -1, step: 0, act: 0 },
  ],
  attack: [
    { bob: 1, step: 0, act: 1 },
    { bob: -1, step: 1, act: 2 },
    { bob: 0, step: 0, act: 3 },
  ],
  fly: [
    { bob: -1, step: 0, act: 0, wing: -4 },
    { bob: 0, step: 0, act: 0, wing: -1 },
    { bob: 1, step: 0, act: 0, wing: 3 },
    { bob: 0, step: 0, act: 0, wing: -1 },
  ],
};

/** Two feet (boots), the lifted one a pixel up. */
function feet(p: Paint, f: Frame, l: [number, number], r: [number, number], w: number, ramp: Ramp) {
  p.draw(rect(l[0], l[1] - (f.step > 0 ? 1 : 0), l[0] + w - 1, 30 - (f.step > 0 ? 1 : 0)), ramp);
  p.draw(rect(r[0], r[1] - (f.step < 0 ? 1 : 0), r[0] + w - 1, 30 - (f.step < 0 ? 1 : 0)), ramp);
}

function king(p: Paint, c: Palette, f: Frame) {
  feet(p, f, [11, 28], [18, 28], 4, BROWN);
  posed({ dy: f.bob }, () => {
    // The scepter: raised high to call down the blow, then swept forward.
    const a = f.act === 1 ? -0.9 : f.act === 2 ? 0.7 : f.act === 3 ? 0.25 : 0;
    posed({ a, px: 24, py: 26, dy: f.act === 1 ? -2 : 0 }, () => {
      p.draw(rect(26, 12, 26, 29), GOLD);
      p.draw(ell(26, 10, f.act === 2 ? 3.2 : 2.4, f.act === 2 ? 3.2 : 2.4), f.act === 2 ? ramp("#ffe85c") : RUBY);
    });
    p.draw(
      poly([
        [8, 29],
        [11, 15],
        [21, 15],
        [24, 29],
      ]),
      c.cloth,
    );
    p.draw(rect(6, 17, 10, 25), c.cloth);
    p.draw(rect(22, 17, 26, 25 - (f.act === 1 ? 4 : 0)), c.cloth);
    p.draw(rect(11, 23, 21, 24), c.trim);
    p.dot(16, 23, GOLD[0]);
    p.draw(rect(7, 25, 9, 27), SKIN);
    p.draw(rect(23, 25 - (f.act === 1 ? 4 : 0), 25, 27 - (f.act === 1 ? 4 : 0)), SKIN);
    p.draw(ell(16, 10.5, 4.6, 5), SKIN);
    p.draw(
      poly([
        [11.5, 11],
        [20.5, 11],
        [19.5, 18],
        [16, 20.5],
        [12.5, 18],
      ]),
      WHITE,
    );
    p.draw(ell(16, 16, 7, 2.4), WHITE);
    for (const x of [12, 16, 20]) p.dot(x, 16, INK);
    p.dot(14, 9, INK);
    p.dot(18, 9, INK);
    if (f.act === 2) p.draw(rect(15, 13, 17, 13), RUBY);
    p.draw(rect(12, 4, 20, 6), GOLD);
    for (const x of [12, 16, 20]) p.draw(rect(x, 2, x, 3), GOLD);
    p.draw(rect(15, 1, 17, 3), GOLD);
    p.dot(16, 5, RUBY[0]);
  });
}

function queen(p: Paint, c: Palette, f: Frame) {
  p.draw(
    poly([
      [5, 30],
      [12, 17],
      [20, 17],
      [27, 30],
    ]),
    c.cloth,
  ); // the gown's hem sways, the feet are hidden
  p.draw(rect(10 + (f.step > 0 ? 1 : f.step < 0 ? -1 : 0), 29, 22 + (f.step > 0 ? 1 : f.step < 0 ? -1 : 0), 30), c.trim);
  posed({ dy: f.bob }, () => {
    p.draw(ell(16, 14, 8, 9), c.hair);
    p.draw(rect(8, 14, 11, 24), c.hair);
    p.draw(rect(21, 14, 24, 24), c.hair);
    p.draw(
      poly([
        [12, 17],
        [20, 17],
        [19, 23],
        [13, 23],
      ]),
      c.trim,
    );
    p.draw(rect(12, 22, 20, 23), GOLD);
    p.draw(ell(16, 11, 4.4, 5), SKIN);
    p.draw(
      poly([
        [11, 8],
        [21, 8],
        [21, 11],
        [18, 9],
        [14, 9],
        [11, 12],
      ]),
      c.hair,
    );
    p.dot(14, 11, INK);
    p.dot(18, 11, INK);
    p.dot(16, 13, RUBY[2]);
    p.dot(13, 12, "#f59aa8");
    p.dot(19, 12, "#f59aa8");
    p.draw(rect(13, 5, 19, 6), GOLD);
    p.draw(rect(15, 3, 17, 4), GOLD);
    p.dot(16, 5, ramp(c.glow)[0]);
    // Hands clasped; raised to gather a charm, then thrown open with sparkles.
    if (f.act === 1) {
      p.draw(rect(14, 14, 18, 16), SKIN);
      p.draw(ell(16, 12, 2, 2), ramp(c.glow));
    } else if (f.act === 2) {
      p.draw(rect(5, 16, 9, 18), SKIN);
      p.draw(rect(23, 16, 27, 18), SKIN);
      for (const [x, y] of [
        [3, 13],
        [29, 13],
        [5, 10],
        [27, 10],
        [2, 17],
        [30, 17],
      ])
        p.dot(x, y, x % 2 ? "#ffffff" : ramp(c.glow)[0]);
    } else p.draw(rect(14, 19, 18, 21), SKIN);
  });
}

function knight(p: Paint, c: Palette, f: Frame) {
  // A young dragon on its haunches: wings beat as it walks; it rears back, then breathes fire.
  const flap = f.wing ?? (f.step !== 0 ? -2 : 0);
  const rear = f.act === 1 ? -2 : f.act === 2 ? 1 : 0;
  posed({ dy: f.bob }, () => {
    posed({ dy: flap }, () =>
      p.draw(
        poly([
          [17, 9],
          [29, 3],
          [26, 12],
          [30, 18],
          [22, 15],
          [17, 17],
        ]),
        c.trim,
      ),
    );
    p.draw(
      poly([
        [5, 26],
        [3, 20],
        [8, 15],
        [12, 21],
      ]),
      c.cloth,
    );
    p.draw(
      poly([
        [3, 28],
        [8, 23],
        [11, 27],
      ]),
      c.cloth,
    );
    p.draw(ell(13, 21, 8.5, 7), c.cloth);
    p.draw(ell(15, 23, 5, 5), ramp("#f3d98a"));
    posed({ dy: flap }, () => {
      p.draw(
        poly([
          [6, 8],
          [16, 14],
          [14, 20],
          [4, 14],
        ]),
        c.trim,
      );
      p.draw(
        poly([
          [4, 8],
          [8, 12],
          [6, 15],
        ]),
        c.cloth,
      );
    });
  });
  if (f.wing === undefined) feet(p, f, [10, 27], [18, 26], 4, c.cloth);
  else {
    // In flight the legs are tucked up under the belly.
    p.draw(rect(11, 25 + f.bob, 14, 27 + f.bob), c.cloth);
    p.draw(rect(17, 25 + f.bob, 20, 27 + f.bob), c.cloth);
  }
  posed({ dy: f.bob + rear, dx: f.act === 2 ? 1 : 0 }, () => {
    p.draw(ell(21, 12, 5.5, 4.5), c.cloth);
    p.draw(rect(24, 12, 29, f.act === 2 ? 13 : 15), c.cloth);
    if (f.act === 2) {
      // Jaw dropped, fire pouring out.
      p.draw(rect(24, 15, 29, 16), c.cloth);
      p.draw(
        poly([
          [29, 13],
          [31, 10],
          [31, 18],
        ]),
        FIRE,
      );
      p.dot(30, 14, "#ffffff");
    }
    p.draw(
      poly([
        [17, 9],
        [15, 3],
        [20, 7],
      ]),
      WHITE,
    );
    p.draw(
      poly([
        [22, 8],
        [22, 2],
        [25, 7],
      ]),
      WHITE,
    );
    p.dot(22, 11, "#ffe85c");
    p.dot(23, 11, INK);
    p.dot(28, 13, INK);
    p.dot(29, 13, INK);
    if (f.act !== 2)
      for (const [x, y] of [
        [26, 15],
        [28, 15],
      ])
        p.dot(x, y, WHITE[0]);
  });
}

function bishop(p: Paint, c: Palette, f: Frame) {
  feet(p, f, [11, 29], [18, 29], 3, BROWN);
  posed({ dy: f.bob }, () => {
    // The staff lifts to call the light, its orb blazing at the blow.
    const lift = f.act === 1 ? -4 : f.act === 2 ? -6 : f.act === 3 ? -2 : 0;
    posed({ dy: lift }, () => {
      p.draw(rect(25, 8, 25, 29), BROWN);
      p.draw(ell(25, 6, f.act === 2 ? 3.6 : 2.6, f.act === 2 ? 3.6 : 2.6), ramp(f.act === 2 ? "#ffffff" : c.glow));
      p.dot(24, 5, "#ffffff");
      if (f.act === 2)
        for (const [x, y] of [
          [25, 0],
          [20, 6],
          [30, 6],
          [21, 2],
          [29, 2],
        ])
          p.dot(x, y, "#fff6a8");
    });
    p.draw(
      poly([
        [8, 30],
        [11, 14],
        [21, 14],
        [24, 30],
      ]),
      c.cloth,
    );
    p.draw(
      poly([
        [14, 14],
        [18, 14],
        [20, 30],
        [12, 30],
      ]),
      c.trim,
    );
    p.draw(rect(6, 17, 10, 24), c.cloth);
    p.draw(rect(22, 17 + lift, 24, 24 + lift), c.cloth);
    p.draw(rect(7, 24, 9, 26), SKIN);
    p.draw(rect(23, 24 + lift, 25, 26 + lift), SKIN);
    p.draw(
      poly([
        [16, 1],
        [22, 8],
        [23, 15],
        [9, 15],
        [10, 8],
      ]),
      c.cloth,
    );
    p.draw(ell(16, 11, 3.6, 4), SKIN);
    p.draw(rect(12, 5, 20, 7), c.trim);
    p.dot(14, 11, INK);
    p.dot(18, 11, INK);
    p.dot(16, 4, GOLD[0]);
    p.draw(rect(14, 14, 18, 15), GOLD);
  });
}

function rook(p: Paint, c: Palette, f: Frame) {
  // A living tower: it raises both fists high and brings them down on the ground.
  const fist = f.act === 1 ? -9 : f.act === 2 ? 1 : f.act === 3 ? -3 : 0;
  feet(p, f, [10, 28], [18, 28], 5, STONE);
  posed({ dy: f.bob + (f.act === 2 ? 1 : 0) }, () => {
    p.draw(rect(6, 15 + Math.min(0, fist), 10, 26 + fist), STONE);
    p.draw(rect(22, 15 + Math.min(0, fist), 26, 26 + fist), STONE);
    p.draw(rect(5, 25 + fist, 11, 29 + fist), STONE);
    p.draw(rect(21, 25 + fist, 27, 29 + fist), STONE);
    p.draw(rect(9, 13, 23, 28), STONE);
    for (const y of [18, 23]) for (let x = 10; x < 23; x++) p.dot(x, y, STONE[2]);
    for (const [x, y] of [
      [13, 20],
      [19, 20],
      [11, 25],
      [16, 25],
      [21, 25],
    ])
      for (let k = y; k < y + 3; k++) p.dot(x, k, STONE[2]);
    p.draw(rect(10, 5, 22, 13), STONE);
    p.draw(or(rect(10, 2, 12, 5), rect(15, 2, 17, 5), rect(20, 2, 22, 5)), STONE);
    const eye = ramp(f.act === 2 ? "#ffffff" : c.glow);
    p.draw(rect(12, 8, 14, 9), eye);
    p.draw(rect(18, 8, 20, 9), eye);
    p.draw(rect(14, 11, 18, 11), STONE);
    p.draw(rect(14, 20, 18, 22), ramp("#ffd24a"));
  });
}

function pawn(p: Paint, c: Palette, f: Frame) {
  // The hero: the sword goes up over the head, then slashes down across.
  feet(p, f, [10, 28], [17, 28], 5, BROWN);
  p.draw(rect(11, 24, 13, 28 - (f.step > 0 ? 1 : 0)), WHITE);
  p.draw(rect(18, 24, 20, 28 - (f.step < 0 ? 1 : 0)), WHITE);
  posed({ dy: f.bob }, () => {
    const a = f.act === 1 ? -0.8 : f.act === 2 ? 2.1 : f.act === 3 ? 0.6 : 0;
    posed({ a, px: 24.5, py: 23, dy: f.act === 1 ? -6 : 0 }, () => {
      p.draw(rect(24, 7, 25, 20), STEEL);
      p.draw(
        poly([
          [24, 7],
          [26, 7],
          [25, 4],
        ]),
        STEEL,
      );
      p.draw(rect(22, 21, 27, 22), GOLD);
      p.draw(rect(24, 23, 25, 25), BROWN);
    });
    if (f.act === 2)
      for (const [x, y] of [
        [29, 26],
        [30, 22],
        [28, 29],
        [31, 25],
      ])
        p.dot(x, y, "#ffffff");
    p.draw(rect(10, 16, 21, 25), c.cloth);
    p.draw(rect(10, 22, 21, 23), BROWN);
    p.dot(15, 22, GOLD[0]);
    p.draw(rect(8, 17, 10, 23), c.cloth);
    p.draw(rect(21, 17, 23, 23), c.cloth);
    p.draw(rect(8, 23, 10, 25), SKIN);
    p.draw(rect(21, 23, 23, 25), SKIN);
    p.draw(rect(6, 15, 11, 24), c.trim);
    p.dot(8, 19, GOLD[0]);
    p.draw(rect(13, 15, 18, 16), c.trim);
    p.draw(ell(15.5, 11, 4.4, 4.6), SKIN);
    p.draw(
      poly([
        [10, 11],
        [11, 4],
        [14, 7],
        [16, 2],
        [18, 7],
        [21, 4],
        [21, 11],
        [18, 8],
        [13, 8],
      ]),
      c.hair,
    );
    p.dot(14, 11, INK);
    p.dot(18, 11, INK);
    if (f.act === 2) p.draw(rect(14, 13, 17, 13), ramp("#c0504a"));
  });
}

export type Role = "k" | "q" | "n" | "b" | "r" | "p";
const DRAW: Record<Role, (p: Paint, c: Palette, f: Frame) => void> = { k: king, q: queen, n: knight, b: bishop, r: rook, p: pawn };

const cache = new Map<string, HTMLCanvasElement>();
/** One frame of a piece of a side (the first breathing frame by default), drawn once. */
export function sprite(role: Role, side: "w" | "b", motion: Motion = "idle", i = 0) {
  const key = `${role}${side}${motion}${i}`;
  let c = cache.get(key);
  if (!c) {
    const p = new Paint();
    DRAW[role](p, SIDES[side], FRAMES[motion][i % FRAMES[motion].length]);
    c = p.finish();
    cache.set(key, c);
  }
  return c;
}

export const NAMES: Record<Role, string> = { k: "King", q: "Princess", n: "Dragon", b: "Cleric", r: "Stone Guardian", p: "Hero" };

/**
 * A normal map for a flat sprite, so light wraps round it instead of lying
 * flat on a card: the sprite's blurred silhouette is a rounded bump, with its
 * own brightness carving small detail (the "paper-thin" fix HD-2D games rely on).
 */
export function normalMap(src: HTMLCanvasElement) {
  const n = src.width;
  const d = src.getContext("2d")!.getImageData(0, 0, n, n).data;
  let h = new Float32Array(n * n);
  const lum = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    h[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    lum[i] = d[i * 4 + 3] > 127 ? (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255 : 0;
  }
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < n && yy < n) {
              sum += h[yy * n + xx];
              cnt++;
            } else cnt++;
          }
        o[y * n + x] = sum / cnt;
      }
    h = o;
  }
  const at = (x: number, y: number) => {
    const i = Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x));
    return h[i] * 3.2 + lum[i] * 0.35;
  };
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 1.4;
      const ny = (at(x, y + 1) - at(x, y - 1)) * 1.4;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * n + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** Pixel fire, 32 x 48, six flickering frames: white at the heart through yellow, orange and red to dark tongues. */
export const flames = (() => {
  let made: HTMLCanvasElement[] | null = null;
  return () => {
    if (made) return made;
    made = [];
    const pal: [number, string][] = [
      [0.86, "#fffbe0"],
      [0.68, "#ffe85c"],
      [0.5, "#ffb13b"],
      [0.33, "#ff6a2a"],
      [0.2, "#b8302a"],
    ];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 48;
      const g = c.getContext("2d")!;
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 32; x++) {
          const u = (x - 15.5) / 16;
          const v = 1 - y / 47;
          const tongue = Math.sin(x * 0.9 + f * 1.7) * 0.12 + Math.sin(x * 0.37 - f * 1.1) * 0.1;
          const heat = (1 - Math.abs(u) * (0.9 + v * 0.8)) * (1.05 - v * (0.95 - tongue)) + (((x * 7 + y * 13 + f * 31) % 17) / 17 - 0.5) * 0.12;
          const hit = pal.find(([k]) => heat > k);
          if (!hit) continue;
          g.fillStyle = hit[1];
          g.fillRect(x, y, 1, 1);
        }
      made.push(c);
    }
    return made;
  };
})();

/** A pixel pillar of holy light, 24 x 96, three frames: a white core, gold edges that waver, sparks inside. */
export const beam = (() => {
  let made: HTMLCanvasElement[] | null = null;
  return () => {
    if (made) return made;
    made = [];
    for (let f = 0; f < 3; f++) {
      const c = document.createElement("canvas");
      c.width = 24;
      c.height = 96;
      const g = c.getContext("2d")!;
      for (let y = 0; y < 96; y++) {
        const w = 7 + Math.round(Math.sin(y * 0.3 + f * 2.1) * 1.5);
        for (let x = 0; x < 24; x++) {
          const d = Math.abs(x - 11.5);
          if (d > w + 2) continue;
          g.fillStyle = d < w * 0.45 ? "#ffffff" : d < w ? "#fff2a8" : "#f2c230";
          g.fillRect(x, y, 1, 1);
        }
      }
      for (let i = 0; i < 10; i++) {
        g.fillStyle = "#ffffff";
        g.fillRect(4 + ((i * 7 + f * 5) % 16), (i * 23 + f * 17) % 96, 1, 2);
      }
      made.push(c);
    }
    return made;
  };
})();
