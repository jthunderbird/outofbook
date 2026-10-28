// Epoch Drifters mockups: the same short game drawn two ways, to compare.
//   Flat:  a true 16-bit JRPG look, 512x288 pixels scaled up, oblique board.
//   HD-2D: pixel sprites standing in a lit 3D diorama with shadows, depth of
//          field, bloom and a layered backdrop, as modern HD-2D RPGs do.
import { Chess } from "chess.js";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  PointLight,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RGBADepthPacking,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  PCFSoftShadowMap,
  type Texture,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import logo from "../src/assets/logos/epoch-drifters.webp";
import { NAMES, SIDES, normalMap, sprite, type Role } from "@outofbook/legions/pixel/sprites";
import { castle, clouds, cliff, hiTile, hills, mountains, sky, tile, type TileKind } from "@outofbook/legions/pixel/world";

const FILES = "abcdefgh";
type Side = "w" | "b";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- The game: one short scripted line with a capture by almost every piece ----------

const LINE = "e4 d5 exd5 Qxd5 Nc3 Qa5 Nf3 Nc6 Bb5 Bd7 O-O O-O-O Bxc6 Bxc6 Re1 Qxc3 dxc3 Bxf3 gxf3".split(" ");
const SAY: Record<Role, string> = {
  p: "The Hero strikes with a sword slash",
  n: "The Dragon breathes fire",
  b: "The Cleric calls down light",
  r: "The Stone Guardian smashes",
  q: "The Princess casts a charm",
  k: "The King commands",
};

interface Ev {
  san: string;
  side: Side;
  role: Role;
  from: string;
  to: string;
  victim?: { sq: string; role: Role; side: Side };
  castle?: { from: string; to: string };
}
function script(): Ev[] {
  const c = new Chess();
  const out: Ev[] = [];
  for (const san of LINE) {
    const m = c.move(san);
    const ev: Ev = { san: m.san, side: m.color, role: m.piece as Role, from: m.from, to: m.to };
    if (m.captured) ev.victim = { sq: m.flags.includes("e") ? m.to[0] + m.from[1] : m.to, role: m.captured as Role, side: m.color === "w" ? "b" : "w" };
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const r = m.color === "w" ? "1" : "8";
      ev.castle = m.flags.includes("k") ? { from: "h" + r, to: "f" + r } : { from: "a" + r, to: "d" + r };
    }
    out.push(ev);
  }
  return out;
}
const START: [string, Role, Side][] = [];
{
  const c = new Chess();
  for (const row of c.board()) for (const p of row) if (p) START.push([p.square, p.type as Role, p.color]);
}

// ---------- Shared pieces and particles (coordinates in tiles; heights in tiles, 1 = 32 px) ----------

interface Piece {
  role: Role;
  side: Side;
  col: number;
  row: number;
  ox: number;
  oz: number;
  hop: number;
  flash: number;
  gone: boolean;
}
const colRow = (sq: string) => ({ col: FILES.indexOf(sq[0]), row: 8 - Number(sq[1]) });
interface Particle {
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  vh: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
}

const anim = (ms: number, fn: (t: number) => void, ease = (t: number) => t) =>
  new Promise<void>((res) => {
    const s = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - s) / ms);
      fn(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else res();
    };
    step();
  });
const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

class Show {
  parts: Particle[] = [];
  pieces = new Map<string, Piece>();
  shake = 0;
  reset() {
    this.pieces.clear();
    this.parts = [];
    for (const [sq, role, side] of START) {
      const { col, row } = colRow(sq);
      this.pieces.set(sq, { role, side, col, row, ox: 0, oz: 0, hop: 0, flash: 0, gone: false });
    }
  }
  tick(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vh -= p.grav * dt;
      p.h = Math.max(0, p.h + p.vh * dt);
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt);
  }
  burst(x: number, z: number, h: number, colors: string[], n: number, speed: number, grav = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = speed * (0.3 + Math.random());
      this.parts.push({
        x,
        z,
        h,
        vx: Math.cos(a) * s,
        vz: Math.sin(a) * s * 0.6,
        vh: Math.random() * speed * 1.4,
        life: 0.5 + Math.random() * 0.5,
        max: 1,
        color: colors[i % colors.length],
        size: 1 + (i % 3 === 0 ? 1 : 0),
        grav,
      });
    }
  }
  stream(ax: number, az: number, bx: number, bz: number, colors: string[]) {
    for (let i = 0; i < 46; i++) {
      const d = 0.4 + Math.random() * 0.5;
      const dx = bx - ax;
      const dz = bz - az;
      this.parts.push({
        x: ax,
        z: az,
        h: 0.55,
        vx: (dx / d) * 1.1 + (Math.random() - 0.5) * 0.7,
        vz: (dz / d) * 1.1 + (Math.random() - 0.5) * 0.7,
        vh: (Math.random() - 0.4) * 0.8,
        life: d + Math.random() * 0.2,
        max: 1,
        color: colors[i % colors.length],
        size: 2,
        grav: -0.4,
      });
    }
  }
  slash(x: number, z: number) {
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      this.parts.push({
        x: x - 0.4 + t * 0.8,
        z,
        h: 0.95 - t * 0.7 + Math.sin(t * 3.14) * 0.15,
        vx: 0,
        vz: 0,
        vh: 0,
        life: 0.22 + t * 0.15,
        max: 1,
        color: i % 3 ? "#ffffff" : "#bfeaff",
        size: 2,
        grav: 0,
      });
    }
  }
  dissolve(src: HTMLCanvasElement, x: number, z: number) {
    const d = src.getContext("2d")!.getImageData(0, 0, 32, 32).data;
    for (let py = 0; py < 32; py++)
      for (let px = 0; px < 32; px++) {
        const i = (py * 32 + px) * 4;
        if (!d[i + 3]) continue;
        const ox = (px - 15.5) / 32;
        const h = (31 - py) / 32;
        this.parts.push({
          x: x + ox,
          z,
          h,
          vx: ox * 1.5 + (Math.random() - 0.5) * 0.4,
          vz: (Math.random() - 0.5) * 0.3,
          vh: 0.4 + Math.random() * 1.1,
          life: 0.6 + Math.random() * 0.7,
          max: 1,
          color: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`,
          size: 1,
          grav: 2.4,
        });
      }
  }
  /** The attack of a piece's kind on its victim's square, then the victim breaking into its own pixels. */
  async hit(a: Piece, v: Piece) {
    const ax = a.col + 0.5 + a.ox;
    const az = a.row + 0.5 + a.oz;
    const vx = v.col + 0.5;
    const vz = v.row + 0.5;
    if (a.role === "p") this.slash(vx, vz);
    else if (a.role === "n") this.stream(ax, az, vx, vz, ["#ffe85c", "#ffb13b", "#ff6a2a", "#ffffff"]);
    else if (a.role === "b") this.burst(vx, vz, 0.5, ["#fff6a8", "#ffffff", "#ffd36b"], 40, 0.9, 0);
    else if (a.role === "r") {
      this.shake = 0.3;
      this.burst(vx, vz, 0.1, ["#9097ad", "#c4c9d8", "#6b7088"], 36, 1.2, 4);
    } else if (a.role === "q") this.burst(vx, vz, 0.6, ["#ff9ec2", "#ffffff", "#ffd1e3", "#7fe9ff"], 44, 0.9, -0.6);
    else this.burst(vx, vz, 0.5, ["#f2c230", "#ffe9a0", "#ffffff"], 36, 1, 1);
    await anim(220, (t) => (v.flash = Math.sin(t * Math.PI * 3) * 0.5 + 0.5 * t));
    v.flash = 0;
    this.dissolve(sprite(v.role, v.side), vx, vz);
    v.gone = true;
  }
  async move(ev: Ev, say: (s: string) => void) {
    const p = this.pieces.get(ev.from)!;
    this.pieces.delete(ev.from);
    say(`${ev.san}: ${NAMES[ev.role]}${ev.victim ? ` takes ${NAMES[ev.victim.role]}. ${SAY[ev.role]}` : ""}`);
    const dest = colRow(ev.to);
    const dx = dest.col - p.col;
    const dz = dest.row - p.row;
    const dist = Math.hypot(dx, dz);
    const hopH = ev.role === "n" ? 0.9 : 0.12;
    const vic = ev.victim ? this.pieces.get(ev.victim.sq) : undefined;
    if (vic) {
      // Close in on the victim, strike, let it break apart, then step onto the square.
      const vx = colRow(ev.victim!.sq);
      const k = Math.max(0, 1 - 0.8 / Math.max(0.01, Math.hypot(vx.col - p.col, vx.row - p.row)));
      await anim(
        Math.max(260, dist * 160),
        (t) => {
          p.ox = (vx.col - p.col) * k * t;
          p.oz = (vx.row - p.row) * k * t;
          p.hop = Math.sin(t * Math.PI) * hopH;
        },
        inOut,
      );
      this.pieces.delete(ev.victim!.sq);
      await this.hit(p, vic);
      await anim(
        220,
        (t) => {
          p.ox = (vx.col - p.col) * k + (dx - (vx.col - p.col) * k) * t;
          p.oz = (vx.row - p.row) * k + (dz - (vx.row - p.row) * k) * t;
        },
        inOut,
      );
    } else
      await anim(
        Math.max(300, dist * 170),
        (t) => {
          p.ox = dx * t;
          p.oz = dz * t;
          p.hop = Math.sin(t * Math.PI) * hopH;
        },
        inOut,
      );
    p.col = dest.col;
    p.row = dest.row;
    p.ox = p.oz = p.hop = 0;
    this.pieces.set(ev.to, p);
    if (ev.castle) {
      const r = this.pieces.get(ev.castle.from)!;
      this.pieces.delete(ev.castle.from);
      const c = colRow(ev.castle.to);
      const sx = r.col;
      await anim(
        380,
        (t) => {
          r.ox = (c.col - sx) * t;
          r.hop = Math.sin(t * Math.PI) * 0.1;
        },
        inOut,
      );
      r.col = c.col;
      r.ox = r.hop = 0;
      this.pieces.set(ev.castle.to, r);
    }
    if (ev.victim && ev.victim.sq !== ev.to) this.pieces.delete(ev.victim.sq);
  }
}

// ---------- Flat: a 16-bit JRPG look ----------

const FW = 512;
const FH = 288;
const TW = 32;
const TH = 24;
const X0 = (FW - TW * 8) / 2;
const Y0 = 52;

type Style = "pond" | "path";
class Flat {
  cv = document.createElement("canvas");
  g = this.cv.getContext("2d")!;
  layers = {
    sky: sky(FW, FH),
    far: mountains(FW, 70, 4, "#6b58b0", "#5846a0", 52),
    near: mountains(FW, 56, 9, "#4a3f8c", "#3b3178", 40, false),
    castle: castle(120, 84),
    hills: hills(FW, 64, 3, "#2f6b4a", "#2f7a3c", "#58b050"),
    cloudA: clouds(FW, 60, 1, "#ffd0d8", "#c486c4"),
    cloudB: clouds(FW, 60, 2, "#ffe6ea", "#d9a0d0"),
    cliff: cliff(TW * 8 + 16, 40),
  };
  tiles: Record<string, HTMLCanvasElement | HTMLCanvasElement[]> = {};
  style: Style = "pond";
  constructor(private show: Show) {
    this.cv.width = FW;
    this.cv.height = FH;
    this.g.imageSmoothingEnabled = false;
    this.setStyle("pond");
  }
  setStyle(s: Style) {
    this.style = s;
    const f = (k: TileKind) => tile(k, TW, TH);
    this.tiles = { g1: f("grass"), g2: f("grass2"), dark: s === "pond" ? [0, 1, 2, 3].map((i) => tile("water", TW, TH, i)) : f("path") };
  }
  draw(t: number) {
    const g = this.g;
    const L = this.layers;
    const sh = this.show.shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
    g.save();
    g.translate(sh, 0);
    g.drawImage(L.sky, 0, 0);
    g.drawImage(L.far, 0, 70);
    g.drawImage(L.near, 0, 92);
    g.drawImage(L.castle, 392, 36);
    g.drawImage(L.hills, 0, 112);
    for (const [c, sp, y] of [
      [L.cloudA, 5, 20],
      [L.cloudB, 11, 160],
    ] as const) {
      const x = Math.floor((t * sp) % FW);
      g.drawImage(c, x, y);
      g.drawImage(c, x - FW, y);
    }
    // The drifting ship from the logo.
    const sx = ((t * 18) % (FW + 80)) - 40;
    this.ship(Math.floor(sx), 44 + Math.round(Math.sin(t * 2) * 2));
    // Island: rock below, tapering, then the board.
    const cw = TW * 8 + 16;
    for (let i = 0; i < 40; i += 1) {
      const inset = Math.floor(i * i * 0.07 + i * 0.5);
      g.drawImage(L.cliff, 0, i, cw, 1, X0 - 8 + inset, Y0 + TH * 8 + i - 4, cw - inset * 2, 1);
    }
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const dark = (r + c) % 2 === 1;
        const tl = dark ? this.tiles.dark : (r * 3 + c) % 3 === 0 ? this.tiles.g2 : this.tiles.g1;
        g.drawImage(Array.isArray(tl) ? tl[Math.floor(t * 4) % 4] : tl, X0 + c * TW, Y0 + r * TH);
      }
    g.strokeStyle = "rgba(20,10,40,.55)";
    g.strokeRect(X0 - 0.5, Y0 - 0.5, TW * 8 + 1, TH * 8 + 1);
    // Pieces back to front, with shadows and ripples.
    const ps = [...this.show.pieces.values()].filter((p) => !p.gone).sort((a, b) => a.row + a.oz - (b.row + b.oz));
    for (const p of ps) {
      const bx = X0 + (p.col + p.ox) * TW;
      const by = Y0 + (p.row + p.oz) * TH;
      g.fillStyle = "rgba(20,10,40,.4)";
      g.fillRect(Math.round(bx + 8), Math.round(by + TH - 6), 16, 3);
      g.fillRect(Math.round(bx + 10), Math.round(by + TH - 7), 12, 1);
      const wet = this.style === "pond" && (Math.round(p.row + p.oz) + Math.round(p.col + p.ox)) % 2 === 1;
      if (wet) {
        g.strokeStyle = "rgba(220,245,255,.7)";
        const k = Math.floor(t * 3) % 3;
        g.strokeRect(Math.round(bx + 8 - k), Math.round(by + TH - 8), 16 + k * 2, 5);
      }
      const spr = sprite(p.role, p.side);
      const y = Math.round(by - 11 - p.hop * 32);
      g.drawImage(spr, Math.round(bx), y);
      if (p.flash > 0) {
        g.globalAlpha = Math.min(1, p.flash);
        g.drawImage(whiten(spr), Math.round(bx), y);
        g.globalAlpha = 1;
      }
    }
    for (const q of this.show.parts) {
      g.globalAlpha = Math.min(1, q.life * 2.5);
      g.fillStyle = q.color;
      g.fillRect(Math.round(X0 + q.x * TW), Math.round(Y0 + q.z * TH - q.h * 32), q.size, q.size);
    }
    g.globalAlpha = 1;
    g.restore();
  }
  ship(x: number, y: number) {
    const g = this.g;
    const px = (dx: number, dy: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x + dx, y + dy, w, h);
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
const whites = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function whiten(s: HTMLCanvasElement) {
  let w = whites.get(s);
  if (!w) {
    w = document.createElement("canvas");
    w.width = w.height = 32;
    const g = w.getContext("2d")!;
    g.drawImage(s, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 32, 32);
    whites.set(s, w);
  }
  return w;
}

// ---------- HD-2D: pixel sprites standing in a lit 3D diorama ----------

const px = (c: HTMLCanvasElement, repeat?: [number, number]): Texture => {
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
};
/** A smooth, mipmapped texture: the environment's high resolution detail, against the chunky sprites. */
const hi = (c: HTMLCanvasElement, repeat?: [number, number]): Texture => {
  const t = new CanvasTexture(c);
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
};
const blob = (() => {
  let t: CanvasTexture | null = null;
  return () => {
    if (!t) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      r.addColorStop(0, "rgba(10,5,30,.75)");
      r.addColorStop(1, "rgba(10,5,30,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      t = new CanvasTexture(c);
    }
    return t;
  };
})();

const TILT_SHIFT = {
  uniforms: { tDiffuse: { value: null as Texture | null }, amount: { value: 0.012 }, focus: { value: 0.52 }, aspect: { value: 1.78 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  // Depth of field as a bokeh: a golden-angle spiral of samples whose radius grows with distance from a horizontal focus band (the board), rotated per pixel by interleaved gradient noise; bright samples weigh more, so highlights bloom into discs.
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform float focus; uniform float aspect; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float coc = smoothstep(0.2, 0.62, d) * amount;
      vec4 base = texture2D(tDiffuse, vUv);
      if (coc < 0.0006) { gl_FragColor = base; return; }
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = 0; i < 32; i++) {
        float r = sqrt((float(i) + 0.5) / 32.0);
        float a = float(i) * 2.39996 + ign * 6.2831;
        vec2 o = vec2(cos(a) * r / aspect, sin(a) * r) * coc;
        vec3 s = texture2D(tDiffuse, vUv + o).rgb;
        float w = 1.0 + dot(s, vec3(0.33)) * dot(s, vec3(0.33)) * 2.0;
        acc += s * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
};
const GRADE = {
  uniforms: { tDiffuse: { value: null as Texture | null } },
  vertexShader: TILT_SHIFT.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.06, 0.98, 0.9), 0.5);
      gl_FragColor = vec4(c.rgb * (0.6 + 0.4 * v), c.a);
    }`,
};

class Diorama {
  scene = new Scene();
  cam = new PerspectiveCamera(44, 16 / 9, 0.1, 600);
  renderer: WebGLRenderer;
  composer: EffectComposer;
  sprites = new Map<Piece, Mesh>();
  water: MeshStandardMaterial;
  dark: MeshStandardMaterial;
  mats: Record<string, MeshStandardMaterial> = {};
  waterTex: Texture[];
  pathTex: Texture;
  style: Style = "pond";
  drift: Mesh[] = [];
  dots: Points;
  mouse = new Vector2();
  constructor(
    private show: Show,
    host: HTMLElement,
  ) {
    const r = (this.renderer = new WebGLRenderer({ antialias: false }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    r.domElement.classList.add("gl");
    host.appendChild(r.domElement);
    const s = this.scene;
    s.background = new Color(0xe0839f);
    s.fog = new Fog(0xe9a0b8, 70, 420);
    s.add(new HemisphereLight(0xb7a8ff, 0x6a3d5a, 1.05));
    s.add(new AmbientLight(0xffffff, 0.15));
    const sun = new DirectionalLight(0xffc890, 3.2);
    sun.position.set(-7, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    s.add(sun);
    // A cool rim light from behind, to pick the figures out from the board and each other; and a warm point light over the field, which is how HD-2D lets figures throw shadows onto the ground.
    const rim = new DirectionalLight(0x8ab4ff, 1.6);
    rim.position.set(5, 6, -9);
    s.add(rim);
    const lamp = new PointLight(0xffd9a0, 18, 14, 1.6);
    lamp.position.set(0, 3.2, 1);
    s.add(lamp);
    this.waterTex = [0, 1, 2, 3].map((i) => hi(hiTile("water", i)));
    this.pathTex = hi(hiTile("path"));
    const std = (map: Texture | null, extra = {}) => new MeshStandardMaterial({ map, roughness: 1, ...extra });
    this.mats.g1 = std(hi(hiTile("grass")));
    this.mats.g2 = std(hi(hiTile("grass2")));
    this.dark = this.water = std(this.waterTex[0], { emissive: new Color(0x0a2a55), emissiveMap: this.waterTex[0], emissiveIntensity: 0.5 });
    // The board: a tile per square, raised a little off the island.
    const side = std(px(cliff(32, 32)));
    const box = new BoxGeometry(1, 0.4, 1);
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const dark = (row + col) % 2 === 1;
        const top = dark ? this.dark : (row * 3 + col) % 3 === 0 ? this.mats.g2 : this.mats.g1;
        const m = new Mesh(box, [side, side, top, side, side, side]);
        m.position.set(col - 3.5, -0.2, row - 3.5);
        m.receiveShadow = true;
        s.add(m);
      }
    // The island below: stepped, tapering rock.
    const rock = std(px(cliff(32, 32), [3, 1]));
    for (const [w, h, y] of [
      [8.5, 0.5, -0.65],
      [7.6, 0.7, -1.25],
      [6.4, 0.8, -1.95],
      [4.8, 0.9, -2.75],
    ] as const) {
      const b = new Mesh(new BoxGeometry(w, h, w), rock);
      b.position.set(0, y, 0);
      b.receiveShadow = true;
      s.add(b);
    }
    const tip = new Mesh(new ConeGeometry(2.3, 3.2, 7), std(px(cliff(32, 32), [4, 2]), { flatShading: true }));
    tip.rotation.x = Math.PI;
    tip.position.y = -4.8;
    s.add(tip);
    // Backdrop layers at different depths, drifting at different speeds.
    const layer = (c: HTMLCanvasElement, w: number, h: number, x: number, y: number, z: number, color = 0xffffff) => {
      const t = px(c);
      const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false, color }));
      m.position.set(x, y, z);
      s.add(m);
      return m;
    };
    // From the horizon down: dusk sky, far mountains, hills, a castle, and a sea of clouds the island floats above.
    layer(sky(512, 128), 420, 110, 0, 8, -150);
    layer(mountains(512, 70, 4, "#6b58b0", "#5846a0", 52), 330, 40, -15, -23, -125);
    layer(castle(120, 84), 40, 28, 38, -23, -105);
    layer(mountains(512, 56, 9, "#4a3f8c", "#3b3178", 40, false), 250, 26, 25, -23, -95);
    layer(hills(512, 64, 3, "#2f6b4a", "#2f7a3c", "#58b050"), 210, 26, -4, -29, -80);
    this.drift.push(layer(clouds(512, 60, 1, "#ffd0d8", "#c486c4"), 120, 14, -35, -9, -60));
    this.drift.push(layer(clouds(512, 60, 2, "#ffe6ea", "#d9a0d0"), 100, 12, 30, -16, -34));
    this.drift.push(layer(clouds(512, 60, 1, "#ffd0d8", "#c486c4"), 70, 8, -17, -10, -6));
    const sea = document.createElement("canvas");
    sea.width = sea.height = 256;
    const sg = sea.getContext("2d")!;
    sg.fillStyle = "#e0839f";
    sg.fillRect(0, 0, 256, 256);
    for (const [c, y] of [
      [clouds(512, 60, 2, "#ffe6ea", "#d9a0d0"), 0],
      [clouds(512, 60, 1, "#ffd0d8", "#c486c4"), 70],
      [clouds(512, 60, 2, "#ffe6ea", "#d9a0d0"), 140],
      [clouds(512, 60, 1, "#ffd0d8", "#c486c4"), 200],
    ] as const)
      sg.drawImage(c, 0, y, 256, 56);
    const seaMesh = new Mesh(new PlaneGeometry(900, 900), new MeshBasicMaterial({ map: px(sea, [6, 6]) }));
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.y = -30;
    s.add(seaMesh);
    // Pollen and embers drifting through the air.
    const n = 70;
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? Math.random() * 5 : (Math.random() - 0.5) * 12)),
        3,
      ),
    );
    this.dots = new Points(geo, new PointsMaterial({ color: 0xffe9a0, size: 0.07, blending: AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false }));
    s.add(this.dots);
    this.parts = new Points(new BufferGeometry(), new PointsMaterial({ size: 0.075, vertexColors: true, depthWrite: false }));
    this.parts.frustumCulled = false;
    s.add(this.parts);
    // Shafts of low sun slanting through the haze: long additive strips that shimmer.
    const gc = document.createElement("canvas");
    gc.width = 8;
    gc.height = 128;
    const gg = gc.getContext("2d")!;
    const gr = gg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,225,170,0.55)");
    gr.addColorStop(1, "rgba(255,225,170,0)");
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 8, 128);
    const shaftTex = new CanvasTexture(gc);
    for (let i = 0; i < 5; i++) {
      const m = new Mesh(
        new PlaneGeometry(1.3 + i * 0.35, 16),
        new MeshBasicMaterial({ map: shaftTex, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.35, side: DoubleSide }),
      );
      m.position.set(-9 + i * 3.2, 5.5, -3 - i * 0.7);
      m.rotation.z = -0.5;
      m.rotation.x = -0.2;
      this.shafts.push(m);
      s.add(m);
    }
    // Post: bloom, then tilt-shift blur and a grade.
    const c = (this.composer = new EffectComposer(r));
    c.addPass(new RenderPass(s, this.cam));
    c.addPass(new UnrealBloomPass(new Vector2(512, 288), 0.28, 0.7, 0.88));
    this.dof = new ShaderPass(TILT_SHIFT);
    c.addPass(this.dof);
    c.addPass(new ShaderPass(GRADE));
    c.addPass(new OutputPass());
    addEventListener("pointermove", (e) => this.mouse.set((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2));
  }
  parts: Points;
  shafts: Mesh[] = [];
  dof: ShaderPass;
  setStyle(s: Style) {
    this.style = s;
    const m = this.dark;
    m.emissive.set(s === "pond" ? 0x0a2a55 : 0x201408);
    m.map = s === "pond" ? this.waterTex[0] : this.pathTex;
    m.emissiveMap = m.map;
    m.needsUpdate = true;
  }
  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.dof.uniforms.aspect.value = w / h;
    this.cam.aspect = w / h;
    // Fit the board whatever the screen's shape: pull back on narrow ones.
    this.fit = Math.max(1, 1.7 / this.cam.aspect);
    this.cam.updateProjectionMatrix();
  }
  fit = 1;
  mesh(p: Piece) {
    let m = this.sprites.get(p);
    if (!m) {
      const t = px(sprite(p.role, p.side));
      const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
      m = new Mesh(
        geo,
        new MeshStandardMaterial({
          map: t,
          normalMap: normalMap(sprite(p.role, p.side)),
          normalScale: new Vector2(1.1, 1.1),
          transparent: false,
          alphaTest: 0.5,
          roughness: 0.85,
          emissive: new Color(0xffffff),
          emissiveMap: t,
          emissiveIntensity: 0.12,
          side: DoubleSide,
        }),
      );
      m.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: t, alphaTest: 0.5 });
      m.castShadow = true;
      m.rotation.x = -0.5;
      // A soft contact shadow where the figure meets the ground.
      const cs = new Mesh(new PlaneGeometry(0.95, 0.55), new MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }));
      cs.rotation.x = -Math.PI / 2 + 0.5;
      cs.position.set(0, 0.05, 0.05);
      m.add(cs);
      this.scene.add(m);
      this.sprites.set(p, m);
    }
    return m;
  }
  draw(t: number) {
    // Camera: a gentle sway with the pointer, pitched low enough to see the sky beyond.
    const k = this.fit;
    this.cam.position.set(this.mouse.x * 1.2, 5 * k + this.mouse.y * -0.4, 11 * k);
    this.cam.lookAt(0, 0.8, 0);
    const sh = this.show.shake > 0 ? Math.sin(t * 90) * 0.04 : 0;
    this.cam.position.x += sh;
    this.drift.forEach((d, i) => (d.position.x += (i + 1) * 0.004 * (d.position.x > 60 ? -30 : 1)));
    this.shafts.forEach((m, i) => ((m.material as MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(t * 0.6 + i * 1.7)));
    const frame = Math.floor(t * 4) % 4;
    if (this.style === "pond" && this.dark.map !== this.waterTex[frame]) this.dark.map = this.dark.emissiveMap = this.waterTex[frame];
    const dp = this.dots.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      dp.setY(i, (dp.getY(i) + 0.003 + Math.sin(t + i) * 0.001) % 5);
      dp.setX(i, dp.getX(i) + Math.sin(t * 0.5 + i) * 0.002);
    }
    dp.needsUpdate = true;
    const live = new Set<Piece>();
    for (const p of this.show.pieces.values()) {
      if (p.gone) continue;
      live.add(p);
      const m = this.mesh(p);
      m.position.set(p.col + p.ox - 3.5, p.hop - 0.03, p.row + p.oz - 3.5 + 0.1);
      (m.material as MeshStandardMaterial).emissiveIntensity = 0.12 + p.flash * 2.5;
    }
    for (const [p, m] of this.sprites)
      if (!live.has(p)) {
        m.removeFromParent();
        this.sprites.delete(p);
      }
    // Particles.
    const ps = this.show.parts;
    const pos = new Float32Array(ps.length * 3);
    const col = new Float32Array(ps.length * 3);
    const tmp = new Color();
    ps.forEach((q, i) => {
      pos.set([q.x - 4, q.h, q.z - 4 + 0.1], i * 3);
      tmp.set(q.color);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    });
    this.parts.geometry.setAttribute("position", new BufferAttribute(pos, 3));
    this.parts.geometry.setAttribute("color", new BufferAttribute(col, 3));
    this.composer.render();
  }
}

// ---------- Page ----------

const show = new Show();
show.reset();
const host = $("stage");
const flat = new Flat(show);
let dio: Diorama | null = null;
let mode: "flat" | "hd" = "flat";
let style: Style = "pond";
const say = (s: string) => ($("say").textContent = s);
$<HTMLImageElement>("logo").src = logo;

const events = script();
let step = 0;
let busy = false;
let auto = false;

async function next() {
  if (busy) return;
  if (step >= events.length) {
    show.reset();
    step = 0;
    say("Back to the start");
    return;
  }
  busy = true;
  await show.move(events[step++], say);
  busy = false;
  if (auto) setTimeout(next, 500);
}

function setMode(m: "flat" | "hd") {
  mode = m;
  host.innerHTML = "";
  if (m === "flat") host.appendChild(flat.cv);
  else {
    dio ??= new Diorama(show, host);
    host.appendChild(dio.renderer.domElement);
    dio.setStyle(style);
    dio.resize();
  }
  fitFlat();
  buttons();
}
function fitFlat() {
  const s = Math.max(1, Math.min(innerWidth / FW, innerHeight / FH));
  flat.cv.style.width = `${FW * s}px`;
  flat.cv.style.height = `${FH * s}px`;
}
addEventListener("resize", () => {
  fitFlat();
  dio?.resize();
});

function buttons() {
  const bar = $("bar");
  bar.innerHTML = "";
  const add = (label: string, on: boolean, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (on) b.className = "on";
    b.onclick = fn;
    bar.appendChild(b);
  };
  add("Flat 16-bit", mode === "flat", () => setMode("flat"));
  add("HD-2D", mode === "hd", () => setMode("hd"));
  add("Meadow + pond", style === "pond", () => {
    style = "pond";
    flat.setStyle("pond");
    dio?.setStyle("pond");
    buttons();
  });
  add("Meadow + path", style === "path", () => {
    style = "path";
    flat.setStyle("path");
    dio?.setStyle("path");
    buttons();
  });
  add("Next move", false, () => void next());
  add(auto ? "Stop" : "Auto-play", auto, () => {
    auto = !auto;
    if (auto) void next();
    buttons();
  });
  add("Reset", false, () => {
    show.reset();
    step = 0;
    say("Back to the start");
  });
}

$("roster").innerHTML = (["k", "q", "n", "b", "r", "p"] as Role[]).map((r) => `${r.toUpperCase()} &rarr; ${NAMES[r]}`).join("<br>");

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  show.tick(dt);
  if (mode === "flat") flat.draw(now / 1000);
  else dio?.draw(now / 1000);
  requestAnimationFrame(loop);
}

if (location.search.includes("sheet")) {
  // A sprite sheet at 8x, for checking the art alone.
  host.innerHTML = "";
  const c = document.createElement("canvas");
  c.width = 32 * 6;
  c.height = 64;
  const g = c.getContext("2d")!;
  (["w", "b"] as Side[]).forEach((s, y) => (["k", "q", "n", "b", "r", "p"] as Role[]).forEach((r, x) => g.drawImage(sprite(r, s), x * 32, y * 32)));
  c.style.width = `${c.width * 8}px`;
  c.style.height = `${c.height * 8}px`;
  c.style.background = "#7a9a5a";
  host.appendChild(c);
  void SIDES;
} else {
  const q = new URLSearchParams(location.search).get("mode");
  setMode(q === "hd" ? "hd" : "flat");
  requestAnimationFrame(loop);
}
