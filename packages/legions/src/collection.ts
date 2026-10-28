// The Collection's room: a wall of a bedroom at night with a shelf for each kind
// of item (tribes, courts, more later). A tribe stands on its shelf all together
// (a still of its figures, cut out), a court leans in a frame (a still of it seen
// steep and tall), and the modes float in front of the window as pixel tokens
// (Retro mode's gamepad). Locked items are grayed with what unlocks them above.
// Drag to look along the shelves, pinch or scroll to zoom, tap an item to pick it.
//
// The stills are rendered in the game itself (apps/legions/mockups/shelf.ts) to
// packages/legions/shelf/<kind>-<id>.webp, so the room costs a few pictures,
// however many tribes come; an item without one shows its name on a card.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  ImageLoader,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { pixelTexture, tokenCanvas } from "./tokens";
import { woodPanel, woodTexture } from "./wood";

export interface ShelfItem {
  /** "tribe:stormcourt", "court:night", "mode:retro", ... */
  id: string;
  name: string;
  /** Not won yet: grayed, with note (what unlocks it) above. */
  locked: boolean;
  note?: string;
  /** In use (the tribe led, the court played on, the mode on). */
  on: boolean;
}

export interface ShelfRow {
  title: string;
  /** Figures stand on the shelf; pictures lean in frames. */
  kind: "figures" | "pictures";
  items: ShelfItem[];
}

const ART = import.meta.glob<string>("../shelf/*.webp", { eager: true, query: "?url", import: "default" });
/** The still of an item, if it has one ("tribe:thornwood" is shelf/tribe-thornwood.webp). */
export const shelfArt = (id: string): string | undefined => ART[`../shelf/${id.replace(":", "-")}.webp`];

/** How wide a tribe stands and a court's picture is, and the room each takes on its shelf. */
const FIG_W = 2.5;
const FIG_SLOT = 2.75;
const PIC_W = 1.05;
const PIC_H = 1.575;
const PIC_SLOT = 1.55;
/** The room for the shelf's sign at its left end. */
const SIGN_SLOT = 1.35;
const SHELF_D = 0.55;
const FLOOR = -2.9;
/** The window left of the shelves, and the room between the modes floating in front of it. */
const WIN_W = 2.6;
const FLOAT_GAP = 1.95;
const LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
function tex(c: HTMLCanvasElement, nearest = false) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (nearest) t.magFilter = t.minFilter = NearestFilter;
  return t;
}

/** Wallpaper: deep blue with fine stripes and a small diamond between them. */
function wallpaper() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#26304c";
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = "rgba(255,255,255,0.045)";
    g.fillRect(x, 0, 22, 256);
    g.fillStyle = "rgba(255,215,140,0.10)";
    g.fillRect(x + 24, 0, 2, 256);
    g.fillRect(x + 60, 0, 2, 256);
  }
  g.fillStyle = "rgba(255,215,140,0.16)";
  for (let y = 0; y < 256; y += 64)
    for (const [x, dy] of [
      [43, 0],
      [43, 32],
    ]) {
      g.beginPath();
      g.moveTo(x, y + dy + 4);
      g.lineTo(x + 5, y + dy + 10);
      g.lineTo(x, y + dy + 16);
      g.lineTo(x - 5, y + dy + 10);
      g.fill();
    }
  const t = tex(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** The night beyond the window: a deep gradient, stars and a moon. */
function night() {
  const [c, g] = canvas(256, 384);
  const grad = g.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, "#070a1c");
  grad.addColorStop(1, "#1d2a52");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 384);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    g.fillRect(Math.random() * 256, Math.random() * 300, Math.random() < 0.15 ? 2 : 1, Math.random() < 0.15 ? 2 : 1);
  }
  const moon = g.createRadialGradient(170, 90, 4, 170, 90, 60);
  moon.addColorStop(0, "rgba(255,248,220,0.9)");
  moon.addColorStop(0.35, "rgba(255,240,200,0.25)");
  moon.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = moon;
  g.fillRect(100, 20, 140, 140);
  g.fillStyle = "#fff6dc";
  g.beginPath();
  g.arc(170, 90, 18, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** A soft round glow (the picked item, the lamp). */
function glowMap() {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** A brass plate with a name (gold and starred when the item is in use), w wide (its height is 0.215). */
function plate(text: string, on: boolean, locked: boolean, w: number) {
  const W = Math.round((72 * w) / 0.215);
  const [c, g] = canvas(W, 72);
  const grad = g.createLinearGradient(0, 0, 0, 72);
  grad.addColorStop(0, locked ? "#5b5b60" : "#d9b45a");
  grad.addColorStop(1, locked ? "#38383c" : "#8a6424");
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(2, 2, W - 4, 68, 10);
  g.fill();
  g.fillStyle = on ? "#3a1500" : locked ? "#1c1c20" : "#2c1d08";
  g.font = `${on ? 700 : 600} 34px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let s = on ? `★ ${text}` : text;
  while (g.measureText(s).width > W - 28 && s.length > 4) s = s.slice(0, -2) + "…";
  g.fillText(s, W / 2, 38);
  return tex(c);
}

/** A wooden sign with a shelf's title, carved in gold. */
function sign(text: string) {
  const [c, g] = canvas(320, 180);
  g.drawImage(woodPanel("#5a3820", "#2a160a", 21).image as CanvasImageSource, 0, 0, 320, 180);
  g.strokeStyle = "#c9a14a";
  g.lineWidth = 6;
  g.strokeRect(10, 10, 300, 160);
  g.fillStyle = "#f2cf74";
  g.shadowColor = "#000";
  g.shadowBlur = 6;
  g.font = "700 50px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 160, 92);
  return tex(c);
}

/** The card shown for an item without a still: its name. */
function card(name: string, tall: boolean) {
  const [c, g] = canvas(tall ? 256 : 512, tall ? 384 : 200);
  g.fillStyle = "#1a1730";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#c9a14a";
  g.lineWidth = 6;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = "#f2cf74";
  g.font = "600 36px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name, c.width / 2, c.height / 2, c.width - 40);
  return tex(c);
}

/** A picture's pixels in gray and dimmed, for an item not won yet. */
function grayed(img: HTMLImageElement | HTMLCanvasElement) {
  const [c, g] = canvas(img.width, img.height);
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) * 0.45;
    p[i] = l;
    p[i + 1] = l;
    p[i + 2] = l * 1.08;
  }
  g.putImageData(d, 0, 0);
  return c;
}

interface Placed {
  item: ShelfItem;
  group: Group;
  /** What a tap hits. */
  hit: Mesh;
  /** Where the lock note stands (top center), in the world. */
  top: Vector3;
  label?: HTMLDivElement;
  /** A mode floating in front of the window, bobbing about this height. */
  float?: number;
}

export class CollectionScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(40, 1, 0.1, 100);
  private room = new Group();
  private placed: Placed[] = [];
  private textures: Texture[] = [];
  private images = new Map<string, Promise<HTMLImageElement>>();
  private glow: Mesh;
  private selected: string | null = null;
  /** The wall's extent (x) and the shelves' (y), for the camera's limits. */
  private span = { x0: -4, x1: 4, y0: FLOOR + 0.6, y1: 4.5 };
  /** Where the camera looks on the wall and how far back it stands; eased toward aim. */
  private look = new Vector3(0, 1, 8);
  private aim = new Vector3(0, 1, 8);
  private fitted = false;
  private raf = 0;
  private ro: ResizeObserver;
  private t = 0;
  private version = 0;

  constructor(
    private host: HTMLElement,
    private onPick: (id: string | null) => void,
  ) {
    const r = (this.renderer = new WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = ACESFilmicToneMapping;
    r.outputColorSpace = SRGBColorSpace;
    r.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(r.domElement);
    this.scene.background = new Color(0x0c0e18);
    // Soft night light, and a warm lamp from above in front of the shelves.
    const lamp = new DirectionalLight(0xffd9a8, 1.6);
    lamp.position.set(1, 6, 8);
    this.scene.add(new HemisphereLight(0xc9d2ff, 0x3a2414, 1.9), new AmbientLight(0x505a80, 0.9), lamp, lamp.target, this.room);
    this.glow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glowMap(), color: 0xffd67a, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.glow.visible = false;
    this.scene.add(this.glow);

    const el = r.domElement;
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: false });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    let last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const ms = Math.max(0, Math.min(50, now - last));
      last = now;
      this.step(ms);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private image(url: string) {
    let p = this.images.get(url);
    if (!p) this.images.set(url, (p = new ImageLoader().loadAsync(url)));
    return p;
  }
  private own<T extends Texture>(t: T) {
    this.textures.push(t);
    return t;
  }

  /** The shelves, top to bottom, and the modes floating in front of the window. Rebuilt whenever anything about them changes. */
  setRows(rows: ShelfRow[], floats: ShelfItem[] = []) {
    const v = ++this.version;
    for (const p of this.placed) p.label?.remove();
    this.placed = [];
    this.room.traverse((o) => (o as Mesh).geometry?.dispose());
    this.room.clear();
    for (const t of this.textures) t.dispose();
    this.textures = [];

    const lengths = rows.map((r) => SIGN_SLOT + r.items.length * (r.kind === "figures" ? FIG_SLOT : PIC_SLOT) + 0.3);
    const len = Math.max(6, ...lengths);
    const x0 = -len / 2;
    const wood = woodPanel("#6b4527", "#2e1a0b", 7);
    const shelfMat = new MeshStandardMaterial({ map: wood, roughness: 0.6 });
    const brass = new MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.7, roughness: 0.35 });

    // Shelves stacked from the lowest up: each as tall as what stands on it, with room above for lock notes.
    const heights = rows.map((r) => (r.kind === "figures" ? 1.15 : PIC_H + 0.2) + 1.0);
    const shelfYs: number[] = [];
    let top = 0.3;
    for (let i = rows.length - 1; i >= 0; i--) {
      shelfYs[i] = top;
      top += heights[i];
    }
    rows.forEach((row, ri) => {
      const sy = shelfYs[ri];
      const shelf = new Mesh(new BoxGeometry(lengths[ri], 0.12, SHELF_D), shelfMat);
      shelf.position.set(x0 + lengths[ri] / 2, sy - 0.06, SHELF_D / 2);
      this.room.add(shelf);
      for (const bx of [0.5, lengths[ri] - 0.5, ...(lengths[ri] > 9 ? [lengths[ri] / 2] : [])]) {
        const b = new Mesh(new BoxGeometry(0.06, 0.32, SHELF_D * 0.8), brass);
        b.position.set(x0 + bx, sy - 0.28, SHELF_D * 0.4);
        this.room.add(b);
      }
      // The shelf's sign at its left end.
      const s = new Mesh(new PlaneGeometry(1.1, 0.62), new MeshStandardMaterial({ map: this.own(sign(row.title)), roughness: 0.7 }));
      s.position.set(x0 + 0.15 + 0.55, sy + 0.36, 0.22);
      s.rotation.x = -0.08;
      this.room.add(s);

      row.items.forEach((item, i) => {
        const slot = row.kind === "figures" ? FIG_SLOT : PIC_SLOT;
        const cx = x0 + SIGN_SLOT + slot * (i + 0.5);
        const g = new Group();
        g.position.set(cx, sy, SHELF_D * 0.5);
        this.room.add(g);
        const mat = new MeshBasicMaterial({ transparent: row.kind === "figures", alphaTest: row.kind === "figures" ? 0.04 : 0, toneMapped: false, side: DoubleSide });
        let hit: Mesh;
        let topY: number;
        if (row.kind === "figures") {
          const m = new Mesh(new PlaneGeometry(FIG_W, FIG_W * 0.33), mat);
          m.position.y = (FIG_W * 0.33) / 2 - 0.02;
          g.add(m);
          hit = m;
          topY = FIG_W * 0.33;
          this.dress(item, mat, m, v, FIG_W, false);
        } else {
          // A frame leaning back against the wall.
          const lean = new Group();
          lean.rotation.x = -0.12;
          lean.position.z = -0.08;
          g.add(lean);
          const frame = new Mesh(new BoxGeometry(PIC_W + 0.12, PIC_H + 0.12, 0.06), brass);
          frame.position.y = (PIC_H + 0.12) / 2;
          lean.add(frame);
          const m = new Mesh(new PlaneGeometry(PIC_W, PIC_H), mat);
          m.position.set(0, (PIC_H + 0.12) / 2, 0.032);
          lean.add(m);
          hit = frame;
          topY = PIC_H + 0.12;
          this.dress(item, mat, m, v, PIC_W, true);
        }
        // The name plate on the shelf's edge.
        const pw = row.kind === "figures" ? 1.9 : 1.3;
        const pl = new Mesh(new PlaneGeometry(pw, 0.215), new MeshBasicMaterial({ map: this.own(plate(item.name, item.on, item.locked, pw)), toneMapped: false }));
        pl.position.set(cx, sy - 0.07, SHELF_D + 0.005);
        this.room.add(pl);
        this.placed.push({ item, group: g, hit, top: new Vector3(cx, sy + topY + 0.1, SHELF_D * 0.5) });
      });
    });

    // The window, as tall as the shelves allow, and the modes floating in front of it, top down.
    const win = { x: x0 - 2.3, y: 0, h: Math.min(6.4, top - FLOOR - 1.9) };
    win.y = FLOOR + 1.6 + win.h / 2;
    floats.forEach((item, i) => {
      const y = win.y + ((floats.length - 1) / 2 - i) * FLOAT_GAP;
      const g = new Group();
      g.position.set(win.x, y, 0.9);
      const mat = new MeshBasicMaterial({ map: this.own(pixelTexture(item.locked ? grayed(tokenCanvas(item.id)) : tokenCanvas(item.id))), transparent: true, toneMapped: false, side: DoubleSide });
      const m = new Mesh(new PlaneGeometry(1.2, 0.74), mat);
      g.add(m);
      if (!item.locked) {
        const halo = new Mesh(
          new PlaneGeometry(2.2, 1.7),
          new MeshBasicMaterial({ map: this.own(glowMap()), color: 0x8a6bff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
        );
        halo.position.z = -0.05;
        g.add(halo);
      }
      const pl = new Mesh(new PlaneGeometry(1.3, 0.215), new MeshBasicMaterial({ map: this.own(plate(item.name, item.on, item.locked, 1.3)), toneMapped: false }));
      pl.position.y = -0.55;
      g.add(pl);
      this.room.add(g);
      this.placed.push({ item, group: g, hit: m, top: new Vector3(win.x, y + 0.45, 0.9), float: y });
    });

    this.walls(x0, len, top, win);
    this.span = { x0: x0 - 4, x1: x0 + len + 0.6, y0: FLOOR + 1.1, y1: top + 0.2 };
    for (const p of this.placed)
      if (p.item.locked && p.item.note) {
        const d = document.createElement("div");
        d.className = "shelf-lock";
        d.innerHTML = LOCK_SVG;
        const s = document.createElement("span");
        s.textContent = p.item.note;
        d.appendChild(s);
        this.host.appendChild(d);
        p.label = d;
      }
    if (!this.fitted) {
      this.fitted = true;
      this.fit(true);
    }
    this.select(this.selected);
  }

  /** An item's picture, once loaded (grayed if locked), or a card with its name. */
  private dress(item: ShelfItem, mat: MeshBasicMaterial, m: Mesh, v: number, w: number, tall: boolean) {
    const url = shelfArt(item.id);
    if (!url) {
      const t = card(item.name, tall);
      mat.map = this.own(item.locked ? tex(grayed(t.image as HTMLCanvasElement)) : t);
      if (!tall) m.scale.y = (200 / 512) * (w / (w * 0.33));
      return;
    }
    void this.image(url).then((img) => {
      if (v !== this.version) return;
      const t = this.own(item.locked ? tex(grayed(img)) : new Texture(img));
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      mat.map = t;
      mat.needsUpdate = true;
      if (!tall) {
        // A tribe's cutout keeps its own proportions, standing on the shelf.
        const h = (w * img.height) / img.width;
        m.scale.y = h / (w * 0.33);
        m.position.y = h / 2 - 0.02;
        const p = this.placed.find((q) => q.item.id === item.id);
        if (p) p.top.y = p.group.position.y + h + 0.1;
      }
    });
  }

  /** The bedroom round the shelves: papered wall, wainscot, floorboards, a window on the night. */
  private walls(x0: number, len: number, top: number, win: { x: number; y: number; h: number }) {
    const paper = this.own(wallpaper());
    const W = len + 40;
    paper.repeat.set(W / 1.6, 30 / 1.6);
    const wall = new Mesh(new PlaneGeometry(W, 30), new MeshStandardMaterial({ map: paper, roughness: 0.9 }));
    wall.position.set(x0 + len / 2, FLOOR + 15, 0);
    this.room.add(wall);
    // Wainscot: dark wood panels with a rail on top.
    const panel = woodTexture("#4a2e1a", "#1e1008", 13, 1.2).clone();
    this.own(panel);
    panel.repeat.set(W / 3, 1);
    panel.needsUpdate = true;
    const wains = new Mesh(new BoxGeometry(W, 1.2, 0.08), new MeshStandardMaterial({ map: panel, roughness: 0.7 }));
    wains.position.set(x0 + len / 2, FLOOR + 0.6, 0.04);
    this.room.add(wains);
    const rail = new Mesh(new BoxGeometry(W, 0.08, 0.14), new MeshStandardMaterial({ color: 0x3a2312, roughness: 0.5 }));
    rail.position.set(x0 + len / 2, FLOOR + 1.22, 0.07);
    this.room.add(rail);
    const boards = woodTexture("#6e4a2c", "#3a2414", 17, 1).clone();
    this.own(boards);
    boards.repeat.set(W / 2, 4);
    boards.needsUpdate = true;
    const floor = new Mesh(new PlaneGeometry(W, 12).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: boards, roughness: 0.75 }));
    floor.position.set(x0 + len / 2, FLOOR, 6);
    this.room.add(floor);
    // The window, left of the shelves.
    const { x: wx, y: wy, h: wh } = win;
    const pane = new Mesh(new PlaneGeometry(WIN_W, wh), new MeshBasicMaterial({ map: this.own(night()), toneMapped: false }));
    pane.position.set(wx, wy, 0.01);
    this.room.add(pane);
    const trim = new MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.6 });
    for (const [w, h, x, yy] of [
      [WIN_W + 0.3, 0.15, 0, wh / 2 + 0.05],
      [WIN_W + 0.3, 0.2, 0, -wh / 2 - 0.05],
      [0.15, wh + 0.2, -WIN_W / 2 - 0.07, 0],
      [0.15, wh + 0.2, WIN_W / 2 + 0.07, 0],
      [WIN_W, 0.07, 0, wh * 0.08],
      [0.07, wh, 0, 0],
    ]) {
      const b = new Mesh(new BoxGeometry(w, h, 0.1), trim);
      b.position.set(wx + x, wy + yy, 0.05);
      this.room.add(b);
    }
    // Moonlight through the window, and a warm lamp over the shelves.
    const moon = new PointLight(0x9fb4ff, 6, 9, 1.4);
    moon.position.set(wx + 0.5, wy, 2.5);
    const lamp = new PointLight(0xffc27a, 60, 26, 1.5);
    lamp.position.set(x0 + len / 2, top + 0.6, 4);
    this.room.add(moon, lamp);
  }

  /** The item to show as picked (a glow behind it), or none. */
  select(id: string | null) {
    this.selected = id;
    const p = this.placed.find((q) => q.item.id === id);
    this.glow.visible = !!p;
    if (!p) return;
    const box = p.top.y - p.group.position.y;
    const w = p.float !== undefined ? 2.2 : p.hit instanceof Mesh && p.hit.geometry instanceof PlaneGeometry ? FIG_W * 1.25 : PIC_W * 1.9;
    this.glow.scale.set(w, box * 1.5 + 0.6, 1);
    this.glow.position.set(p.group.position.x, p.group.position.y + box / 2, p.group.position.z - 0.12);
  }

  /** Looks at the whole wall's height; at the start, from the shelves' left end. */
  private fit(start = false) {
    const { y0, y1 } = this.span;
    const d = this.fitDistance();
    this.aim.set(this.aim.x, (y0 + y1) / 2, d);
    if (start) {
      const half = this.halfWidth(d);
      // A wide screen starts with the window in view; a narrow one at the shelves' signs.
      this.aim.x = this.span.x0 + half + (this.camera.aspect > 1 ? 0 : 3.6);
      this.clamp();
      this.look.copy(this.aim);
    }
  }
  private fitDistance() {
    const { y0, y1 } = this.span;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    // The wall's height fits the screen; on a wide screen, also its width, whichever is nearer.
    const byH = (y1 - y0) / 2 / tan;
    const byW = (this.span.x1 - this.span.x0) / 2 / (tan * this.camera.aspect);
    return Math.min(byH, Math.max(byW, 4));
  }
  private halfWidth(d: number) {
    return Math.tan((this.camera.fov * Math.PI) / 360) * d * this.camera.aspect;
  }
  private clamp() {
    const max = this.fitDistance();
    this.aim.z = Math.max(2.4, Math.min(max, this.aim.z));
    const hw = this.halfWidth(this.aim.z);
    const hh = Math.tan((this.camera.fov * Math.PI) / 360) * this.aim.z;
    const { x0, x1, y0, y1 } = this.span;
    this.aim.x = x1 - x0 <= hw * 2 ? (x0 + x1) / 2 : Math.max(x0 + hw, Math.min(x1 - hw, this.aim.x));
    this.aim.y = y1 - y0 <= hh * 2 ? (y0 + y1) / 2 : Math.max(y0 + hh, Math.min(y1 - hh, this.aim.y));
  }

  private step(ms: number) {
    this.t += ms / 1000;
    this.look.lerp(this.aim, 1 - Math.exp(-ms / 90));
    this.camera.position.set(this.look.x, this.look.y, this.look.z);
    this.camera.lookAt(this.look.x, this.look.y, 0);
    for (const p of this.placed)
      if (p.float !== undefined) {
        const i = p.group.position.x + p.float;
        p.group.position.y = p.float + Math.sin(this.t * 1.6 + i) * 0.08;
        p.group.rotation.y = Math.sin(this.t * 0.9 + i) * 0.25;
        p.top.y = p.group.position.y + 0.45;
      }
    if (this.glow.visible) {
      const p = this.placed.find((q) => q.item.id === this.selected);
      if (p?.float !== undefined) this.glow.position.y = p.group.position.y;
      (this.glow.material as MeshBasicMaterial).opacity = 0.55 + Math.sin(this.t * 3) * 0.15;
    }
    this.renderer.render(this.scene, this.camera);
    // Lock notes stand over their items, hidden off screen.
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = new Vector3();
    // Seen from far, the notes would run into each other: only the lock shows until the view comes closer.
    const perUnit = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.look.z);
    const tight = perUnit * PIC_SLOT < 125;
    for (const p of this.placed) {
      if (!p.label) continue;
      v.copy(p.top).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const show = v.z < 1 && x > -80 && x < w + 80 && y > 0 && y < h;
      p.label.style.display = show ? "" : "none";
      if (show) {
        p.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        p.label.classList.toggle("tight", tight);
      }
    }
  }

  // One finger drags the view along the wall; two pinch to zoom; a tap picks.
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { x: number; y: number; aim: Vector3; moved: boolean; pinch?: number; z?: number } | null = null;
  private down = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...this.pointers.values()];
    if (pts.length === 1) this.gesture = { x: e.clientX, y: e.clientY, aim: this.aim.clone(), moved: false };
    else if (pts.length === 2 && this.gesture) {
      this.gesture.moved = true;
      this.gesture.pinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.gesture.z = this.aim.z;
    }
  };
  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId) || !this.gesture) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...this.pointers.values()];
    const g = this.gesture;
    if (pts.length >= 2 && g.pinch) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.aim.z = g.z! * (g.pinch / Math.max(20, d));
      this.clamp();
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (!g.moved) return;
    // World units per pixel at the wall.
    const k = (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.aim.z) / (this.host.clientHeight || 1);
    this.aim.x = g.aim.x - dx * k;
    this.aim.y = g.aim.y + dy * k;
    this.clamp();
  };
  private up = (e: PointerEvent) => {
    const g = this.gesture;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1 && g) {
      // Back to one finger after a pinch: drag on from where it is.
      const [p] = [...this.pointers.values()];
      this.gesture = { x: p.x, y: p.y, aim: this.aim.clone(), moved: true };
      return;
    }
    if (this.pointers.size) return;
    this.gesture = null;
    if (!g || g.moved || e.type === "pointercancel") return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hits = ray.intersectObjects(this.placed.map((p) => p.hit as Object3D));
    const p = hits.length ? this.placed.find((q) => q.hit === hits[0].object) : undefined;
    this.onPick(p ? p.item.id : null);
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    // A trackpad's sideways swipe slides along the wall; the wheel zooms.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.aim.x += e.deltaX * 0.01;
    else this.aim.z *= Math.exp(e.deltaY * 0.0012);
    this.clamp();
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.clamp();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const p of this.placed) p.label?.remove();
    this.room.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
