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
export const rect = (x0: number, y0: number, x1: number, y1: number): Mask => {
  const m = empty();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < W) m[y * W + x] = 1;
  return m;
};
export const ell = (cx: number, cy: number, rx: number, ry: number): Mask => {
  const m = empty();
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * W + x] = 1;
  return m;
};
export const poly = (pts: [number, number][]): Mask => {
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
};
export const or = (...ms: Mask[]): Mask => {
  const m = empty();
  for (const a of ms) for (let i = 0; i < m.length; i++) if (a[i]) m[i] = 1;
  return m;
};
export const sub = (a: Mask, b: Mask): Mask => a.map((v, i) => (v && !b[i] ? 1 : 0)) as Mask;

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
    if (x >= 0 && y >= 0 && x < W && y < W) this.px[y * W + x] = c;
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
const INK = "#241b33";

function king(p: Paint, c: Palette) {
  p.draw(rect(26, 12, 26, 29), GOLD); // scepter
  p.draw(ell(26, 10, 2.4, 2.4), RUBY);
  p.draw(rect(11, 28, 14, 30), BROWN);
  p.draw(rect(18, 28, 21, 30), BROWN);
  p.draw(
    poly([
      [8, 29],
      [11, 15],
      [21, 15],
      [24, 29],
    ]),
    c.cloth,
  ); // robe
  p.draw(rect(6, 17, 10, 25), c.cloth); // sleeves
  p.draw(rect(22, 17, 26, 25), c.cloth);
  p.draw(rect(11, 23, 21, 24), c.trim); // sash
  p.dot(16, 23, GOLD[0]);
  p.draw(rect(7, 25, 9, 27), SKIN); // hands
  p.draw(rect(23, 25, 25, 27), SKIN);
  p.draw(ell(16, 10.5, 4.6, 5), SKIN); // head
  p.draw(
    poly([
      [11.5, 11],
      [20.5, 11],
      [19.5, 18],
      [16, 20.5],
      [12.5, 18],
    ]),
    WHITE,
  ); // beard
  p.draw(ell(16, 16, 7, 2.4), WHITE); // ermine collar
  for (const x of [12, 16, 20]) p.dot(x, 16, INK);
  p.dot(14, 9, INK);
  p.dot(18, 9, INK);
  p.draw(rect(12, 4, 20, 6), GOLD); // crown
  for (const x of [12, 16, 20]) p.draw(rect(x, 2, x + 0, 3), GOLD);
  p.draw(rect(15, 1, 17, 3), GOLD);
  p.dot(16, 5, RUBY[0]);
}

function queen(p: Paint, c: Palette) {
  p.draw(ell(16, 14, 8, 9), c.hair); // hair behind
  p.draw(rect(8, 14, 11, 24), c.hair);
  p.draw(rect(21, 14, 24, 24), c.hair);
  p.draw(
    poly([
      [5, 30],
      [12, 17],
      [20, 17],
      [27, 30],
    ]),
    c.cloth,
  ); // gown
  p.draw(rect(10, 29, 22, 30), c.trim); // hem
  p.draw(
    poly([
      [12, 17],
      [20, 17],
      [19, 23],
      [13, 23],
    ]),
    c.trim,
  ); // bodice
  p.draw(rect(12, 22, 20, 23), GOLD); // belt
  p.draw(ell(16, 11, 4.4, 5), SKIN); // face
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
  ); // fringe
  p.dot(14, 11, INK);
  p.dot(18, 11, INK);
  p.dot(16, 13, RUBY[2]);
  p.dot(13, 12, "#f59aa8");
  p.dot(19, 12, "#f59aa8");
  p.draw(rect(13, 5, 19, 6), GOLD); // tiara
  p.draw(rect(15, 3, 17, 4), GOLD);
  p.dot(16, 5, ramp("#7fe9ff")[0]);
  p.draw(rect(14, 19, 18, 21), SKIN); // clasped hands
}

function knight(p: Paint, c: Palette) {
  // A young dragon, rearing on its haunches.
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
  ); // far wing
  p.draw(
    poly([
      [5, 26],
      [3, 20],
      [8, 15],
      [12, 21],
    ]),
    c.cloth,
  ); // tail
  p.draw(
    poly([
      [3, 28],
      [8, 23],
      [11, 27],
    ]),
    c.cloth,
  );
  p.draw(ell(13, 21, 8.5, 7), c.cloth); // body
  p.draw(ell(15, 23, 5, 5), ramp("#f3d98a")); // belly
  p.draw(
    poly([
      [6, 8],
      [16, 14],
      [14, 20],
      [4, 14],
    ]),
    c.trim,
  ); // near wing
  p.draw(
    poly([
      [4, 8],
      [8, 12],
      [6, 15],
    ]),
    c.cloth,
  );
  p.draw(rect(10, 27, 13, 30), c.cloth); // legs
  p.draw(rect(18, 26, 21, 30), c.cloth);
  p.draw(rect(9, 30, 14, 30), c.trim);
  p.draw(rect(17, 30, 22, 30), c.trim);
  p.draw(ell(21, 12, 5.5, 4.5), c.cloth); // head
  p.draw(rect(24, 12, 29, 15), c.cloth); // snout
  p.draw(
    poly([
      [17, 9],
      [15, 3],
      [20, 7],
    ]),
    WHITE,
  ); // horns
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
  for (const [x, y] of [
    [26, 15],
    [28, 15],
  ])
    p.dot(x, y, WHITE[0]);
}

function bishop(p: Paint, c: Palette) {
  p.draw(rect(25, 8, 25, 29), BROWN); // staff
  p.draw(ell(25, 6, 2.6, 2.6), ramp(c.glow));
  p.dot(24, 5, "#ffffff");
  p.draw(
    poly([
      [8, 30],
      [11, 14],
      [21, 14],
      [24, 30],
    ]),
    c.cloth,
  ); // robe
  p.draw(
    poly([
      [14, 14],
      [18, 14],
      [20, 30],
      [12, 30],
    ]),
    c.trim,
  ); // tabard
  p.draw(rect(6, 17, 10, 24), c.cloth);
  p.draw(rect(22, 17, 24, 24), c.cloth);
  p.draw(rect(7, 24, 9, 26), SKIN);
  p.draw(rect(23, 24, 25, 26), SKIN);
  p.draw(
    poly([
      [16, 1],
      [22, 8],
      [23, 15],
      [9, 15],
      [10, 8],
    ]),
    c.cloth,
  ); // hood
  p.draw(ell(16, 11, 3.6, 4), SKIN);
  p.draw(rect(12, 5, 20, 7), c.trim);
  p.dot(14, 11, INK);
  p.dot(18, 11, INK);
  p.dot(16, 4, GOLD[0]);
  p.draw(rect(14, 14, 18, 15), GOLD); // clasp
}

function rook(p: Paint, c: Palette) {
  // A living tower: a stone guardian with a crenellated head.
  p.draw(rect(6, 15, 10, 28), STONE); // arms
  p.draw(rect(22, 15, 26, 28), STONE);
  p.draw(rect(5, 26, 11, 30), STONE); // fists
  p.draw(rect(21, 26, 27, 30), STONE);
  p.draw(rect(9, 13, 23, 30), STONE); // body
  for (const y of [18, 23, 28]) for (let x = 10; x < 23; x++) p.dot(x, y, STONE[2]);
  for (const [x, y] of [
    [13, 20],
    [19, 20],
    [11, 25],
    [16, 25],
    [21, 25],
  ])
    for (let k = y; k < y + 3; k++) p.dot(x, k, STONE[2]);
  p.draw(rect(10, 5, 22, 13), STONE); // head
  p.draw(or(rect(10, 2, 12, 5), rect(15, 2, 17, 5), rect(20, 2, 22, 5)), STONE); // merlons
  p.draw(rect(12, 8, 14, 9), ramp(c.glow));
  p.draw(rect(18, 8, 20, 9), ramp(c.glow));
  p.draw(rect(14, 11, 18, 11), STONE);
  p.draw(rect(14, 20, 18, 22), ramp("#ffd24a")); // chest gem
}

function pawn(p: Paint, c: Palette) {
  // The hero: a young swordsman with spiky hair.
  p.draw(rect(24, 7, 25, 20), STEEL); // blade
  p.draw(
    poly([
      [24, 7],
      [25, 7],
      [24.5, 4],
    ]),
    STEEL,
  );
  p.draw(rect(22, 21, 27, 22), GOLD); // guard
  p.draw(rect(24, 23, 25, 25), BROWN);
  p.draw(rect(10, 28, 14, 31), BROWN); // boots
  p.draw(rect(17, 28, 21, 31), BROWN);
  p.draw(rect(11, 24, 13, 28), WHITE);
  p.draw(rect(18, 24, 20, 28), WHITE);
  p.draw(rect(10, 16, 21, 25), c.cloth); // tunic
  p.draw(rect(10, 22, 21, 23), BROWN); // belt
  p.dot(15, 22, GOLD[0]);
  p.draw(rect(8, 17, 10, 23), c.cloth); // arms
  p.draw(rect(21, 17, 23, 23), c.cloth);
  p.draw(rect(8, 23, 10, 25), SKIN);
  p.draw(rect(21, 23, 23, 25), SKIN);
  p.draw(rect(6, 15, 11, 24), c.trim); // shield on the left arm
  p.dot(8, 19, GOLD[0]);
  p.draw(rect(13, 15, 18, 16), c.trim); // scarf
  p.draw(ell(15.5, 11, 4.4, 4.6), SKIN); // head
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
  ); // spiky hair
  p.dot(14, 11, INK);
  p.dot(18, 11, INK);
}

export type Role = "k" | "q" | "n" | "b" | "r" | "p";
const DRAW: Record<Role, (p: Paint, c: Palette) => void> = { k: king, q: queen, n: knight, b: bishop, r: rook, p: pawn };

const cache = new Map<string, HTMLCanvasElement>();
/** The sprite for a piece of a side, drawn once. */
export function sprite(role: Role, side: "w" | "b") {
  const key = role + side;
  let c = cache.get(key);
  if (!c) {
    const p = new Paint();
    DRAW[role](p, SIDES[side]);
    c = p.finish();
    cache.set(key, c);
  }
  return c;
}

export const NAMES: Record<Role, string> = { k: "King", q: "Princess", n: "Dragon", b: "Cleric", r: "Stone Guardian", p: "Hero" };
