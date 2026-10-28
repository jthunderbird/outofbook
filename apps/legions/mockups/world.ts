// Epoch Drifters' world, drawn in code at low resolution and scaled up with
// nearest-neighbor filtering: a dusk sky, far mountains, a castle on a hill,
// forested hills, clouds, and the board's tiles and floating-island base.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
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
  for (const [x, y, rad, col] of [[w * 0.78, h * 0.18, 9, "#f6e8ff"], [w * 0.88, h * 0.3, 4, "#ffd9c2"]] as const) {
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
  for (const [x, y] of [[50, 30], [58, 20], [64, 30], [70, 40], [34, 24], [84, 24], [14, 14], [110, 14]] as const) win(x, base - y - 2);
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
