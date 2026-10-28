// Epoch Drifters' world, drawn in code at low resolution and scaled up with
// nearest-neighbor filtering: a dusk sky, far mountains, a castle on a hill,
// forested hills, clouds, and the board's tiles and floating-island base.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** Dusk sky: banded gradient with ordered dithering between bands, a few stars and two small moons. */
export function sky(w: number, h: number) {
  const { c, g } = canvas(w, h);
  const stops = ["#1a1445", "#3b2a78", "#7a3f98", "#c45a96", "#f08a7a", "#ffc38a"].map(hex);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (y / (h - 1)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(t));
      const f = t - i;
      const col = BAYER[(y & 3) * 4 + (x & 3)] / 16 < f ? stops[i + 1] : stops[i];
      const k = (y * w + x) * 4;
      img.data.set([col[0], col[1], col[2], 255], k);
    }
  g.putImageData(img, 0, 0);
  const r = rng(7);
  for (let i = 0; i < w / 5; i++) {
    g.fillStyle = r() < 0.2 ? "#ffffff" : "#c9c4ff";
    g.fillRect(Math.floor(r() * w), Math.floor(r() * h * 0.45), 1, 1);
  }
  for (const [x, y, rad, col] of [
    [w * 0.78, h * 0.18, 9, "#f6e8ff"],
    [w * 0.88, h * 0.3, 4, "#ffd9c2"],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, rad, 0, 7);
    g.fill();
    g.fillStyle = "rgba(60,40,120,.35)";
    g.beginPath();
    g.arc(x + rad * 0.35, y - rad * 0.2, rad * 0.8, 0, 7);
    g.fill();
  }
  return c;
}

/** A ridge of peaks with snowy tops, two tones. */
export function mountains(w: number, h: number, seed: number, col: string, shade: string, amp: number, snow = true) {
  const { c, g } = canvas(w, h);
  const r = rng(seed);
  const peaks: number[] = [];
  for (let x = 0; x <= w; x += 1) peaks[x] = 0;
  let x = 0;
  while (x < w) {
    const pw = 24 + r() * 40;
    const ph = amp * (0.5 + r() * 0.5);
    for (let i = 0; i < pw && x + i < w; i++) peaks[x + i] = Math.max(peaks[x + i], ph * (1 - Math.abs(i / pw - 0.5) * 2));
    x += pw * 0.55;
  }
  for (let px = 0; px < w; px++) {
    const top = Math.round(h - peaks[px]);
    g.fillStyle = col;
    g.fillRect(px, top, 1, h - top);
    // The shaded side: pixels right of a rising slope.
    if (px > 0 && peaks[px] < peaks[px - 1]) {
      g.fillStyle = shade;
      g.fillRect(px, top, 1, h - top);
    }
    if (snow && peaks[px] > amp * 0.72) {
      g.fillStyle = "#f4ecff";
      g.fillRect(px, top, 1, Math.max(1, Math.round((peaks[px] - amp * 0.72) * 0.9)));
    }
  }
  return c;
}

/** Rolling forested hills: a dark ridge with rows of small round trees along it. */
export function hills(w: number, h: number, seed: number, base: string, tree: string, treeLight: string) {
  const { c, g } = canvas(w, h);
  const r = rng(seed);
  const ph = r() * 6;
  const top = (x: number) => h * 0.45 + Math.sin(x / 31 + ph) * 5 + Math.sin(x / 13 + ph * 2) * 2;
  for (let x = 0; x < w; x++) {
    g.fillStyle = base;
    g.fillRect(x, Math.round(top(x)), 1, h);
  }
  for (let x = 0; x < w; x += 3 + Math.floor(r() * 3)) {
    const y = Math.round(top(x)) - 1;
    const rad = 3 + r() * 3;
    g.fillStyle = tree;
    g.beginPath();
    g.arc(x, y - rad * 0.5, rad, 0, 7);
    g.fill();
    g.fillStyle = treeLight;
    g.fillRect(Math.round(x - rad * 0.4), Math.round(y - rad * 1.2), Math.max(1, Math.round(rad * 0.6)), 1);
  }
  return c;
}

/** A hilltop castle: curtain wall, towers with cone roofs, flags and lit windows. */
export function castle(w: number, h: number) {
  const { c, g } = canvas(w, h);
  const wall = "#6a5e92";
  const wallL = "#8c80b6";
  const wallD = "#4a4070";
  const roof = "#c23a52";
  const box = (x: number, y: number, bw: number, bh: number) => {
    g.fillStyle = wall;
    g.fillRect(x, y, bw, bh);
    g.fillStyle = wallL;
    g.fillRect(x, y, 1, bh);
    g.fillStyle = wallD;
    g.fillRect(x + bw - 1, y, 1, bh);
  };
  const win = (x: number, y: number) => {
    g.fillStyle = "#ffd36b";
    g.fillRect(x, y, 1, 2);
  };
  const tower = (x: number, y: number, tw: number, th: number, roofH: number, flag = false) => {
    box(x, y, tw, th);
    for (let i = 0; i < roofH; i++) {
      g.fillStyle = roof;
      const inset = Math.round((i * (tw / 2 + 1)) / roofH);
      g.fillRect(x - 1 + inset, y - i - 1, tw + 2 - inset * 2, 1);
    }
    if (flag) {
      g.fillStyle = "#ffd36b";
      g.fillRect(x + Math.floor(tw / 2), y - roofH - 5, 1, 5);
      g.fillStyle = "#e03a4a";
      g.fillRect(x + Math.floor(tw / 2) + 1, y - roofH - 5, 4, 2);
    }
    win(x + Math.floor(tw / 2), y + 5);
  };
  const base = h - 4;
  box(8, base - 22, 104, 22); // curtain wall
  for (let x = 8; x < 112; x += 4) {
    g.fillStyle = wall;
    g.fillRect(x, base - 25, 2, 3);
  }
  g.fillStyle = "#2b2148"; // gate
  g.fillRect(56, base - 12, 8, 12);
  g.fillRect(57, base - 14, 6, 2);
  tower(2, base - 36, 12, 36, 10, true);
  tower(106, base - 36, 12, 36, 10);
  tower(30, base - 44, 10, 44, 9);
  tower(80, base - 44, 10, 44, 9, true);
  box(46, base - 54, 28, 54); // keep
  tower(52, base - 76, 16, 22, 16, true);
  for (const [x, y] of [
    [50, 30],
    [58, 20],
    [64, 30],
    [70, 40],
    [34, 24],
    [84, 24],
    [14, 14],
    [110, 14],
  ] as const)
    win(x, base - y - 2);
  return c;
}

/** Soft puffy clouds lit pink from below, on a transparent canvas. */
export function clouds(w: number, h: number, seed: number, lit: string, shade: string) {
  const { c, g } = canvas(w, h);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const cx = 36 + (i / 5) * (w - 72) + r() * 24;
    const cy = h * 0.35 + r() * h * 0.4;
    const n = 4 + Math.floor(r() * 3);
    for (const col of [shade, lit]) {
      g.fillStyle = col;
      for (let k = 0; k < n; k++) {
        const bx = cx + (k - n / 2) * 7;
        const by = cy - Math.sin((k / (n - 1)) * Math.PI) * 5 + (col === shade ? 2 : 0);
        g.beginPath();
        g.ellipse(bx, by, 7 + r() * 3, 4 + r() * 2.5, 0, 0, 7);
        g.fill();
      }
    }
  }
  return c;
}

export type TileKind = "grass" | "grass2" | "water" | "path";
/** One board tile, w x h pixels (32x22 flat, 32x32 for the diorama); water has four frames. */
export function tile(kind: TileKind, w: number, h: number, frame = 0) {
  const { c, g } = canvas(w, h);
  const r = rng(kind === "water" ? 3 : kind === "path" ? 11 : kind === "grass" ? 5 : 9);
  const px = (x: number, y: number, col: string, n = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, n, 1);
  };
  if (kind === "grass" || kind === "grass2") {
    const [a, b, d] = kind === "grass" ? ["#78c850", "#9be26a", "#4f9a3c"] : ["#5fb347", "#86d35e", "#3f8434"];
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.07; i++) px(Math.floor(r() * w), Math.floor(r() * h), r() < 0.5 ? b : d);
    for (let i = 0; i < w * h * 0.012; i++) {
      const x = Math.floor(r() * (w - 3));
      const y = Math.floor(r() * (h - 3)) + 1;
      px(x, y, d);
      px(x + 1, y - 1, d);
      px(x + 2, y, d);
    }
    for (let i = 0; i < 2; i++) {
      const x = 3 + Math.floor(r() * (w - 6));
      const y = 3 + Math.floor(r() * (h - 6));
      const col = ["#fff6a8", "#ffffff", "#ff9ec2"][Math.floor(r() * 3)];
      px(x, y, col);
      px(x - 1, y + 1, col, 3);
      px(x, y + 2, col);
      px(x, y + 1, "#f2c230");
    }
  } else if (kind === "water") {
    g.fillStyle = "#2f7fd0";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      g.fillStyle = y % 6 < 3 ? "#2a74c4" : "#3589da";
      g.fillRect(0, y, w, 1);
    }
    // Ripples drifting across, four frames.
    for (let i = 0; i < 6; i++) {
      const y = 2 + Math.floor((h - 4) * (i / 6) + (i % 2) * 2);
      const x = (Math.floor(r() * w) + frame * 2 + i * 7) % w;
      px(x, y, "#a8e4ff", 5);
      px((x + 2) % w, y + 1, "#6cc1f0", 3);
    }
    px(Math.floor(r() * w), Math.floor(r() * h), "#ffffff", 2);
    g.fillStyle = "rgba(20,40,90,.35)";
    g.fillRect(0, 0, w, 1);
    g.fillRect(0, 0, 1, h);
  } else {
    g.fillStyle = "#d8b878";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const sx = Math.floor(r() * (w - 8));
      const sy = Math.floor(r() * (h - 5));
      g.fillStyle = r() < 0.5 ? "#c4a165" : "#e6cb92";
      g.fillRect(sx, sy, 6 + Math.floor(r() * 3), 3);
      g.fillStyle = "#a88650";
      g.fillRect(sx, sy + 3, 7, 1);
    }
  }
  return c;
}

/** The island's rock side: strata, roots and hanging stones, w x h. */
export function cliff(w: number, h: number) {
  const { c, g } = canvas(w, h);
  const r = rng(21);
  g.fillStyle = "#6b4a34";
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    g.fillStyle = y % 5 < 2 ? "#7e5a40" : "#5a3d2b";
    g.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < w * h * 0.03; i++) {
    g.fillStyle = r() < 0.5 ? "#9a7452" : "#3f2a1e";
    g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 1);
  }
  for (let i = 0; i < w / 14; i++) {
    let x = Math.floor(r() * w);
    g.fillStyle = "#3d7a2e";
    for (let y = 0; y < h * (0.3 + r() * 0.6); y++) {
      x += r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = "#78c850"; // grass lip
  g.fillRect(0, 0, w, 2);
  g.fillStyle = "#4f9a3c";
  g.fillRect(0, 2, w, 1);
  return c;
}

/** A tile at 128 px: the 32 px tile softened up, with fine detail (blades, ripples, grit) drawn over it, as HD-2D environments are high resolution under chunky sprites. */
export function hiTile(kind: TileKind, frame = 0) {
  const src = tile(kind, 32, 32, frame);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, 128, 128);
  let seed = kind.length * 977 + frame * 31 + 7;
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  if (kind === "grass" || kind === "grass2") {
    for (let i = 0; i < 520; i++) {
      const x = r() * 128;
      const y = r() * 128;
      g.strokeStyle = r() < 0.5 ? "rgba(30,90,30,.35)" : "rgba(190,240,120,.35)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5);
      g.stroke();
    }
  } else if (kind === "water") {
    for (let i = 0; i < 40; i++) {
      const x = r() * 128;
      const y = r() * 128;
      g.strokeStyle = r() < 0.5 ? "rgba(200,240,255,.35)" : "rgba(10,50,120,.3)";
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 2, x + 16 + r() * 8, y);
      g.stroke();
    }
  } else
    for (let i = 0; i < 700; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(120,90,50,.3)" : "rgba(255,240,200,.3)";
      g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2);
    }
  return c;
}

/** A floating island seen from the side: a grass lip on top, rock strata tapering below, roots and vines hanging off it. Far ones are mixed toward the sky's haze. */
function island(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, depth: number, seed: number, haze: number) {
  const r = rng(seed);
  const tone = (hexa: string) => {
    const c = hex(hexa);
    const h = hex("#b07ab8");
    return `rgb(${c.map((v, i) => Math.round(v + (h[i] - v) * haze)).join(",")})`;
  };
  const w = x1 - x0;
  const bottom: number[] = [];
  for (let x = 0; x < w; x++) {
    const u = (x / (w - 1)) * 2 - 1;
    const d = depth * Math.pow(Math.max(0, 1 - u * u), 0.75) * (0.8 + 0.2 * Math.sin(x * 0.7 + seed) * Math.sin(x * 0.23));
    bottom.push(Math.round(top + 3 + d));
  }
  for (let x = 0; x < w; x++)
    for (let y = top; y <= bottom[x]; y++) {
      const band = (y - top) % 5 < 2;
      const deep = (y - top) / Math.max(1, bottom[x] - top);
      g.fillStyle = tone(deep > 0.6 ? "#4a3022" : band ? "#7e5a40" : "#5f412e");
      g.fillRect(x0 + x, y, 1, 1);
    }
  // The grass lip.
  g.fillStyle = tone("#6fbf4a");
  g.fillRect(x0, top, w, 2);
  g.fillStyle = tone("#3f8434");
  g.fillRect(x0, top + 2, w, 1);
  // Roots and vines hanging below, and a few loose stones.
  for (let i = 0; i < w / 9; i++) {
    let x = x0 + Math.floor(r() * w);
    const len = 6 + r() * 16;
    g.fillStyle = tone(r() < 0.5 ? "#3d7a2e" : "#5a3d2b");
    const start = bottom[Math.min(w - 1, x - x0)] - 2;
    for (let y = 0; y < len; y++) {
      x += r() < 0.25 ? (r() < 0.5 ? -1 : 1) : 0;
      g.fillRect(x, start + y, 1, 1);
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = x0 + w * (0.3 + r() * 0.4);
    const y = bottom[Math.floor(x - x0)] + 6 + r() * 10;
    g.fillStyle = tone("#5f412e");
    g.fillRect(Math.round(x), Math.round(y), 3, 2);
    g.fillRect(Math.round(x) + 1, Math.round(y) + 2, 1, 1);
  }
}

/** A row of the sea of cloud below the islands, its puffs drifting; back rows darker and pinker. */
function cloudRow(g: CanvasRenderingContext2D, w: number, y: number, row: number, t: number, lit: string, shade: string) {
  const r = rng(40 + row);
  const shift = (t * (3 + row * 2)) % 40;
  g.fillStyle = shade;
  g.fillRect(0, y, w, 400);
  for (let x = -40; x < w + 40; x += 22 + Math.floor(r() * 10)) {
    const rad = 12 + r() * 10;
    const px = x + shift;
    g.fillStyle = shade;
    g.beginPath();
    g.ellipse(px, y, rad, rad * 0.55, 0, 0, 7);
    g.fill();
    g.fillStyle = lit;
    g.beginPath();
    g.ellipse(px - 2, y - 2, rad * 0.8, rad * 0.4, 0, 0, 7);
    g.fill();
  }
}

/**
 * The world beyond the board, as one picture drawn each frame (640 x 360): a
 * dusk sky with high clouds, floating islands (one carrying mountains, one a
 * castle with a waterfall pouring off it, small islets), and a sea of cloud
 * below everything, drifting. The rocket from the logo crosses the sky.
 */
export class Backdrop {
  static readonly W = 640;
  static readonly H = 360;
  readonly cv = canvas(Backdrop.W, Backdrop.H).c;
  private g = this.cv.getContext("2d")!;
  private still = (() => {
    const { c, g } = canvas(Backdrop.W, Backdrop.H);
    g.imageSmoothingEnabled = false;
    g.drawImage(sky(Backdrop.W, 300), 0, 0);
    g.fillStyle = "#ffc38a";
    g.fillRect(0, 300, Backdrop.W, 60);
    // The far island with its mountains.
    const peaks = mountains(240, 80, 4, "#5a4796", "#47387f", 74);
    g.drawImage(peaks, 40, 152 - 80);
    island(g, 34, 286, 152, 46, 3, 0.45);
    // A small far islet.
    island(g, 300, 336, 120, 14, 7, 0.55);
    // The castle's island, nearer.
    const keep = castle(120, 84);
    g.drawImage(keep, 470, 174 - 82);
    island(g, 440, 620, 174, 52, 5, 0.15);
    // A nearer islet with a lone tree.
    island(g, 84, 140, 214, 18, 9, 0.05);
    g.fillStyle = "#2f7a3c";
    g.beginPath();
    g.arc(110, 204, 7, 0, 7);
    g.fill();
    g.fillStyle = "#58b050";
    g.fillRect(106, 199, 4, 1);
    g.fillStyle = "#5a3d2b";
    g.fillRect(109, 209, 2, 5);
    return c;
  })();
  private high = clouds(Backdrop.W, 60, 1, "#ffd0d8", "#c486c4");
  draw(t: number) {
    const g = this.g;
    const W = Backdrop.W;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.still, 0, 0);
    // High clouds drift through the sky, above the islands.
    const x = Math.floor((t * 4) % W);
    g.drawImage(this.high, x, 18, W, 46);
    g.drawImage(this.high, x - W, 18, W, 46);
    // The waterfall off the castle's island, pouring into the clouds.
    for (let y = 172; y < 262; y++) {
      const k = (y + Math.floor(t * 30)) % 6;
      g.fillStyle = k < 2 ? "#e8f8ff" : k < 4 ? "#9fd8f5" : "#6cbbe8";
      g.fillRect(598, y, 5, 1);
    }
    // The sea of cloud, three rows, back to front.
    cloudRow(g, W, 252, 0, t, "#e9a6c9", "#b97aae");
    cloudRow(g, W, 282, 1, t, "#f6c4d8", "#d495bd");
    cloudRow(g, W, 318, 2, t, "#ffe6ea", "#ecb6cc");
    // The rocket crossing the sky.
    const sx = Math.floor(((t * 18) % (W + 80)) - 40);
    const sy = 52 + Math.round(Math.sin(t * 2) * 2);
    const px = (dx: number, dy: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(sx + dx, sy + dy, w, h);
    };
    px(-1, 0, 14, 5, "#1d1530");
    px(0, 1, 12, 3, "#e03a4a");
    px(2, 1, 6, 1, "#ffd24a");
    px(9, 1, 3, 2, "#7fe9ff");
    px(3, -2, 5, 2, "#ffd24a");
    px(3, 4, 5, 2, "#ffd24a");
    px(-4, 1, 3, 2, "#ff9ec2");
    px(-7, 2, 3, 1, "#ffe9a0");
  }
}

/**
 * The flat board's whole picture (640 x 360): the backdrop, then the board's
 * own floating island in the middle, its 64 tiles 32 x 24 pixels (meadow and
 * animated pond), the board's center at the picture's center.
 */
export class FlatMap {
  static readonly TW = 32;
  static readonly TH = 24;
  static readonly X0 = (Backdrop.W - 32 * 8) / 2;
  static readonly Y0 = (Backdrop.H - 24 * 8) / 2;
  private back = new Backdrop();
  readonly cv = canvas(Backdrop.W, Backdrop.H).c;
  private g = this.cv.getContext("2d")!;
  private rock = cliff(32 * 8 + 16, 48);
  private grass = [tile("grass", 32, 24), tile("grass2", 32, 24)];
  private water = [0, 1, 2, 3].map((i) => tile("water", 32, 24, i));
  draw(t: number) {
    const { TW, TH, X0, Y0 } = FlatMap;
    const g = this.g;
    g.imageSmoothingEnabled = false;
    this.back.draw(t);
    g.drawImage(this.back.cv, 0, 0);
    // The board's island: rock tapering down into the clouds.
    const cw = TW * 8 + 16;
    for (let i = 0; i < 48; i++) {
      const inset = Math.floor(i * i * 0.06 + i * 0.5);
      g.drawImage(this.rock, 0, i, cw, 1, X0 - 8 + inset, Y0 + TH * 8 + i - 4, Math.max(0, cw - inset * 2), 1);
    }
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const dark = (r + c) % 2 === 1;
        g.drawImage(dark ? this.water[Math.floor(t * 4) % 4] : this.grass[(r * 3 + c) % 3 === 0 ? 1 : 0], X0 + c * TW, Y0 + r * TH);
      }
    g.strokeStyle = "rgba(20,10,40,.55)";
    g.strokeRect(X0 - 0.5, Y0 - 0.5, TW * 8 + 1, TH * 8 + 1);
  }
}
