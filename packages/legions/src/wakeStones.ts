// The Wake's gravestones, made in code: carved, chipped and eroded stone shapes with
// engraved inscriptions, and one weathering shader that works on any mesh (these, or a
// model imported from elsewhere): grime streaked down from above, dirt splashed up from
// the ground, moss on the tops and in patches (green, rotten dark at its fringe) and a
// fine pitted bump over everything.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { canvas, clamp01, fbm, normalFrom, smooth, stream } from "./wakeKit";

// ----- The weathering shader -----

const NOISE = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNor;
float h31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
`;

const WEATHER = /* glsl */ `
{
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNor);
  float up = clamp(wn.y, 0.0, 1.0);
  float n1 = fbm3(wp * 2.6);
  float n2 = fbm3(wp * 13.0);
  float n3 = fbm3(vec3(wp.x * 5.0, wp.y * 0.9, wp.z * 5.0));
  float low = 1.0 - smoothstep(-0.05, 0.55, wp.y - uBase);
  // Grime, streaked down the stone from its top, and dirt splashed up from the ground.
  float grime = smoothstep(0.3, 0.75, n3) * 0.65 + smoothstep(0.45, 0.72, n1) * 0.35;
  diffuseColor.rgb *= 1.0 - grime * 0.65;
  float splash = low * smoothstep(0.3, 0.62, n2 * 0.6 + n1 * 0.5 + low * 0.45);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.09, 0.065), clamp(splash * 1.3, 0.0, 1.0));
  // Moss: on tops, up from the foot, in patches; rot at its fringe.
  float mm = up * 0.5 + low * 0.4 + (n1 - 0.5) * 0.95 + (n2 - 0.5) * 0.3 - (1.0 - uMoss) * 0.6;
  float moss = smoothstep(0.34, 0.5, mm);
  float rot = smoothstep(0.2, 0.34, mm) * (1.0 - moss);
  vec3 mossCol = mix(vec3(0.03, 0.06, 0.02), vec3(0.09, 0.15, 0.04), n2);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.036, 0.022), rot * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, moss);
  roughnessFactor = mix(max(roughnessFactor, 0.85), 1.0, max(moss, 0.4));
  // Pitted, fuzzy bump over it all (fuzzier on the moss).
  float h = n2 * 0.5 + fbm3(wp * 42.0) * 0.35 + moss * fbm3(wp * 95.0) * 0.7;
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * uBump);
}
`;

/** Weathers a standard material: moss (0..1, how much), how hard the bump bites, and the height of the ground it stands on (dirt splashes up from there). */
export function weather<T extends MeshStandardMaterial>(mat: T, moss = 0.6, bump = 0.02, base = -0.05): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMoss = { value: moss };
    sh.uniforms.uBump = { value: bump };
    sh.uniforms.uBase = { value: base };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uMoss;\nuniform float uBump;\nuniform float uBase;\n${NOISE}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${WEATHER}`);
  };
  mat.customProgramCacheKey = () => "wake-weather";
  // What the bake step needs to make this material again.
  mat.userData.weather = { moss, bump, base };
  return mat;
}

// ----- Inscriptions -----

export type Carving = "rip" | "cross" | "scroll" | "name" | "skull" | "none";

/** What is carved on a stone's face: a light picture with the letters dark, and a normal map from it so they sink in. */
function inscription(kind: Carving, seed: number) {
  const W = 512;
  const H = 768;
  const r = stream(seed);
  const src = canvas(W);
  src.c.height = H;
  const g = src.g;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  const ink = (alpha = 1) => `rgba(96,92,84,${alpha})`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const names = ["Ebenezer Marsh", "Hester Vane", "Josiah Crowe", "Mary Ann Thorne", "Silas Wick", "Agnes Hollow", "Thomas Blight", "Cordelia Ash"];
  const name = names[Math.floor(r() * names.length)];
  const years = () => {
    const born = 1720 + Math.floor(r() * 120);
    return `${born} · ${born + 18 + Math.floor(r() * 60)}`;
  };
  const line = (text: string, y: number, px: number, w = 400) => {
    g.font = `bold ${px}px Georgia, "Times New Roman", serif`;
    g.fillStyle = ink();
    g.fillText(text, W / 2, y, w);
  };
  if (kind === "rip") {
    line("R.I.P.", 210, 96);
    line(name, 360, 44);
    line(years(), 430, 38);
    g.fillStyle = ink(0.8);
    g.fillRect(150, 475, 212, 5);
    line("Rest in peace", 540, 30);
  } else if (kind === "cross") {
    // A cross carved in relief with a leaf-and-ring border, then a name below.
    g.strokeStyle = ink();
    g.lineWidth = 18;
    g.beginPath();
    g.moveTo(256, 120);
    g.lineTo(256, 400);
    g.moveTo(170, 205);
    g.lineTo(342, 205);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.arc(256, 205, 62, 0, 7);
    g.stroke();
    line(name, 500, 40);
    line(years(), 560, 34);
  } else if (kind === "scroll") {
    g.strokeStyle = ink();
    g.lineWidth = 6;
    g.strokeRect(46, 60, W - 92, H - 120);
    g.lineWidth = 2.5;
    g.strokeRect(62, 76, W - 124, H - 152);
    line("IN MEMORY OF", 170, 34);
    line(name, 270, 46);
    line(years(), 340, 36);
    g.fillRect(180, 385, 152, 3);
    const verse = ["Here lies one who walked", "these roads at night and", "was not seen again."];
    verse.forEach((v, i) => line(v, 450 + i * 46, 28));
    g.font = "40px serif";
    g.fillText("❦", W / 2, 640);
  } else if (kind === "skull") {
    // A memento mori: a skull over crossed bones, and a name.
    g.fillStyle = ink();
    g.strokeStyle = ink();
    g.lineWidth = 9;
    g.beginPath();
    g.ellipse(256, 210, 78, 88, 0, 0, 7);
    g.stroke();
    g.beginPath();
    g.ellipse(224, 205, 22, 28, 0, 0, 7);
    g.ellipse(288, 205, 22, 28, 0, 0, 7);
    g.fill();
    g.beginPath();
    g.moveTo(256, 232);
    g.lineTo(244, 262);
    g.lineTo(268, 262);
    g.closePath();
    g.fill();
    g.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(222 + i * 17, 280);
      g.lineTo(222 + i * 17, 300);
      g.stroke();
    }
    g.lineWidth = 14;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(150, 340);
    g.lineTo(362, 420);
    g.moveTo(362, 340);
    g.lineTo(150, 420);
    g.stroke();
    line("Memento mori", 500, 40);
    line(name, 580, 40);
    line(years(), 640, 34);
  } else if (kind === "name") {
    line(name, 250, 50);
    line(years(), 330, 40);
  }
  // Wear: the carving is filled with dirt and chipped away in places; the face is pitted.
  g.globalCompositeOperation = "lighten";
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 4 + r() * 22, 3 + r() * 14, r() * 3, 0, 7);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 1800; i++) {
    const v = r() * 255;
    g.fillStyle = `rgba(${v},${v},${v},0.12)`;
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
  }
  const soft = canvas(W);
  soft.c.height = H;
  soft.g.filter = "blur(2px)";
  soft.g.drawImage(src.c, 0, 0);
  // normalFrom needs a square; carve into a square canvas and use only the upper part.
  const sq = canvas(1024);
  sq.g.drawImage(soft.c, 0, 0, 1024, 1024 * (H / W));
  const normal = normalFrom(sq.c, 5.5, false);
  const map = new CanvasTexture(src.c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  normal.repeat.set(1, W / H);
  normal.anisotropy = 8;
  return { map, normal };
}

// ----- Shapes -----

type Top = "flat" | "arch" | "gothic" | "ogee" | "broken";

interface SlabOptions {
  top?: Top;
  /** How tall the shaped top is, from the shoulders up. */
  topH?: number;
  /** Edge rounding. */
  round?: number;
  chips?: number;
  /** How much the whole surface is eroded. */
  erode?: number;
  /** Narrower towards the top (0 none). */
  taper?: number;
  /** Vertices per unit; the default is fine for a headstone, less for a small block in a crowd. */
  res?: number;
  seed: number;
}

/** A hand-carved block: a subdivided box rounded at the edges, its top shaped, eroded and gouged. */
export function slab(w: number, h: number, d: number, o: SlabOptions): BufferGeometry {
  const r = stream(o.seed);
  // About 60% of the density the shapes were first tuned at: the bump in the shader carries the fine detail, and a phone carries fewer vertices.
  const res = (o.res ?? 64) * 0.6;
  const min = Math.max(2, Math.round((8 * res) / 64));
  const seg = [Math.max(min, Math.round(w * res)), Math.max(min, Math.round(h * res)), Math.max(Math.ceil(min / 2), Math.round(d * res * 0.75))];
  const geo = new BoxGeometry(w, h, d, seg[0], seg[1], seg[2]);
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const rad = o.round ?? 0.03;
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const topH = o.topH ?? 0;
  const shoulder = hy - topH;
  const chips: { c: Vector3; rad: number }[] = [];
  const p = new Vector3();
  // Where the carving is gouged: on the upper corners and edges.
  for (let i = 0; i < (o.chips ?? 0); i++) {
    const side = r() < 0.5 ? -1 : 1;
    chips.push({ c: new Vector3(side * hx * (0.55 + r() * 0.5), hy * (0.4 + r() * 0.65), (r() - 0.5) * d * 1.6), rad: 0.05 + r() * 0.12 });
  }
  const ex = o.erode ?? 1;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // Rounded edges.
    const inner = new Vector3(Math.max(-hx + rad, Math.min(hx - rad, p.x)), Math.max(-hy + rad, Math.min(hy - rad, p.y)), Math.max(-hz + rad, Math.min(hz - rad, p.z)));
    const out = p.clone().sub(inner);
    const edge = out.length() / rad;
    if (out.lengthSq() > 1e-10) p.copy(inner).addScaledVector(out.normalize(), rad);
    // The shaped top.
    if (topH > 0 && p.y > shoulder) {
      const u = Math.abs(p.x) / hx;
      let k = 1;
      if (o.top === "arch") k = Math.sqrt(Math.max(0, 1 - u * u));
      else if (o.top === "gothic") k = Math.pow(Math.max(0, 1 - u), 0.85);
      else if (o.top === "ogee") k = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI), 0.7) * (1 - 0.18 * Math.sin(u * Math.PI * 2));
      else if (o.top === "broken") k = clamp01(0.95 - 0.9 * ((p.x / hx) * 0.5 + 0.5) + (fbm(p.x * 9 + 40, 0.5, o.seed, 1 << 16, 4) - 0.5) * 0.7);
      const t = (p.y - shoulder) / (hy - shoulder);
      p.y = shoulder + t * topH * k;
    }
    if (o.taper) p.x *= 1 - o.taper * ((p.y + hy) / h);
    // Erosion: smooth waves everywhere, rougher and deeper at the edges.
    const dir = out.lengthSq() > 0 ? out : new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
    const wave = (fbm(p.x * 5 + 3, p.y * 5 + p.z * 5, o.seed, 1 << 16, 4) - 0.5) * 0.03;
    const rough = (fbm(p.x * 19, p.y * 19 + p.z * 19, o.seed + 1, 1 << 16, 3) - 0.45) * 0.045 * clamp01(edge);
    p.addScaledVector(dir.clone().normalize(), (wave + rough) * ex);
    for (const ch of chips) {
      const dist = p.distanceTo(ch.c);
      if (dist < ch.rad) p.addScaledVector(ch.c.clone().sub(p).normalize(), (ch.rad - dist) * 0.85 * (0.7 + 0.3 * fbm(p.x * 30, p.y * 30 + p.z * 30, o.seed + 2, 1 << 16, 2)));
    }
    pos.setXYZ(i, p.x, p.y + hy, p.z);
  }
  geo.computeVertexNormals();
  smoothSeams(geo);
  return geo;
}

/** Where a box's faces meet, their vertices sit together but lit apart; give those the same, averaged normal. */
export function smoothSeams(geo: BufferGeometry) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const sums = new Map<string, Vector3>();
  const key = (i: number) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? new Vector3();
    s.add(new Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)));
    sums.set(k, s);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = sums.get(key(i))!.clone().normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

// ----- The varieties -----

export interface StoneKind {
  id: string;
  name: string;
  note: string;
  /** How many of it may stand in the court (at most 3). */
  copies?: number;
  /** Room it takes on the ground, for placing. */
  radius?: number;
  build(): Group;
}

export const stoneColor = (seed: number) => {
  const r = stream(seed);
  return new Color().setHSL(0.09 + r() * 0.08, 0.06 + r() * 0.08, 0.2 + r() * 0.1);
};

/** The six materials of a box-shaped stone: the front (index 4) carries the inscription. */
export function faces(carving: Carving, seed: number, moss: number, tint = stoneColor(seed)): Material[] {
  const base = () => weather(new MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0 }), moss);
  const mats: Material[] = [0, 1, 2, 3, 5].map(base);
  const front = base() as MeshStandardMaterial;
  if (carving !== "none") {
    const ins = inscription(carving, seed + 9);
    front.map = ins.map;
    front.normalMap = ins.normal;
    front.normalScale = new Vector2(1.2, 1.2);
  }
  mats.splice(4, 0, front);
  return mats;
}

export function solid(geo: BufferGeometry, mats: Material | Material[], at = new Vector3(), rot = new Vector3()) {
  const m = new Mesh(geo, mats);
  m.position.copy(at);
  m.rotation.set(rot.x, rot.y, rot.z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Roughens any smooth shape (a lathe, a sphere) into worn stone: waves and pits along its normals. */
export function erode(geo: BufferGeometry, seed: number, amp = 0.02, pit = 0.012) {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = (fbm(p.x * 4 + 3, p.y * 4 + p.z * 4, seed, 1 << 16, 4) - 0.5) * amp + (fbm(p.x * 22, p.y * 22 + p.z * 22, seed + 1, 1 << 16, 2) - 0.5) * pit;
    p.addScaledVector(n, d);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  smoothSeams(geo);
  return geo;
}

export const STONES: StoneKind[] = [
  {
    id: "arch",
    name: "Round-top headstone",
    note: "The classic slab: arched top, R.I.P., chipped corners.",
    build() {
      const g = new Group();
      g.add(solid(slab(0.95, 1.45, 0.2, { top: "arch", topH: 0.47, chips: 3, seed: 11 }), faces("rip", 11, 0.6)));
      g.rotation.set(0.02, 0.05, -0.04);
      return g;
    },
  },
  {
    id: "gothic",
    name: "Gothic pointed stone",
    note: "A pointed top with a cross carved in the face.",
    build() {
      const g = new Group();
      g.add(solid(slab(0.85, 1.75, 0.22, { top: "gothic", topH: 0.5, chips: 2, seed: 23 }), faces("cross", 23, 0.5)));
      g.rotation.set(-0.03, -0.1, 0.03);
      return g;
    },
  },
  {
    id: "ogee",
    name: "Scrolled stone",
    note: "Shaped shoulders, a bordered face and a verse.",
    build() {
      const g = new Group();
      g.add(solid(slab(1.05, 1.3, 0.2, { top: "ogee", topH: 0.34, chips: 3, seed: 37 }), faces("scroll", 37, 0.7)));
      g.rotation.set(0, 0.08, 0.05);
      return g;
    },
  },
  {
    id: "cross",
    name: "Ringed cross on a plinth",
    note: "A stone cross with a ring, on a stepped plinth.",
    build() {
      const g = new Group();
      const tint = stoneColor(41);
      const m = (c: Carving, s: number) => faces(c, s, 0.6, tint);
      g.add(solid(slab(0.95, 0.2, 0.7, { round: 0.02, chips: 2, seed: 41, erode: 0.8 }), m("none", 41)));
      g.add(solid(slab(0.72, 0.34, 0.5, { round: 0.02, seed: 42, erode: 0.8 }), m("name", 42), new Vector3(0, 0.2, 0)));
      g.add(solid(slab(0.24, 1.5, 0.22, { round: 0.03, chips: 2, seed: 43 }), m("none", 43), new Vector3(0, 0.54, 0)));
      g.add(solid(slab(0.84, 0.24, 0.22, { round: 0.03, chips: 3, seed: 44 }), m("none", 44), new Vector3(0, 1.22, 0)));
      const ring = solid(new TorusGeometry(0.3, 0.05, 20, 64), faces("none", 45, 0.5, tint)[0], new Vector3(0, 1.34, 0));
      g.add(ring);
      g.rotation.set(0.03, 0.2, -0.05);
      return g;
    },
  },
  {
    id: "obelisk",
    name: "Obelisk",
    note: "A tapering shaft with a pyramid tip, on two steps.",
    build() {
      const g = new Group();
      const tint = stoneColor(51);
      const m = (c: Carving, s: number) => faces(c, s, 0.55, tint);
      g.add(solid(slab(1.0, 0.18, 1.0, { round: 0.02, chips: 3, seed: 51, erode: 0.8 }), m("none", 51)));
      g.add(solid(slab(0.78, 0.4, 0.78, { round: 0.02, seed: 52, erode: 0.8 }), m("name", 52), new Vector3(0, 0.18, 0)));
      const shaft = slab(0.5, 1.9, 0.5, { round: 0.015, taper: 0.4, chips: 2, seed: 53 });
      g.add(solid(shaft, m("none", 53), new Vector3(0, 0.58, 0)));
      const tip = new CylinderGeometry(0.0, 0.17, 0.26, 4, 8).rotateY(Math.PI / 4);
      tip.translate(0, 0.13 + 0.58 + 1.9, 0);
      g.add(solid(tip, m("none", 54)[0]));
      g.rotation.set(0.02, 0, 0.06);
      return g;
    },
  },
  {
    id: "broken",
    name: "Broken stone",
    note: "Snapped off; the top lies in the dirt beside it.",
    build() {
      const g = new Group();
      const tint = stoneColor(61);
      g.add(solid(slab(0.9, 1.3, 0.2, { top: "broken", topH: 0.5, chips: 2, seed: 61, erode: 1.3 }), faces("rip", 61, 0.7, tint)));
      g.add(
        solid(slab(0.8, 0.5, 0.2, { top: "arch", topH: 0.28, chips: 2, seed: 62, erode: 1.3 }), faces("none", 62, 0.9, tint), new Vector3(0.1, 0.1, 0.55), new Vector3(-Math.PI / 2 + 0.08, 0.3, 2.9)),
      );
      g.rotation.set(0.04, 0, -0.1);
      return g;
    },
  },
  {
    id: "urn",
    name: "Urn on a pedestal",
    note: "A turned urn on a block; the ridged belly is lathed.",
    build() {
      const g = new Group();
      const tint = stoneColor(71);
      const m = (c: Carving, s: number) => faces(c, s, 0.55, tint);
      g.add(solid(slab(0.8, 0.22, 0.8, { round: 0.02, chips: 3, seed: 71, erode: 0.8 }), m("none", 71)));
      g.add(solid(slab(0.58, 0.8, 0.58, { round: 0.025, chips: 2, seed: 72 }), m("name", 72), new Vector3(0, 0.22, 0)));
      g.add(solid(slab(0.7, 0.12, 0.7, { round: 0.03, seed: 73, erode: 0.8 }), m("none", 73), new Vector3(0, 1.02, 0)));
      const prof: Vector2[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        // Foot, belly, shoulder, neck, flared lip.
        const belly = Math.sin(Math.pow(t, 0.8) * Math.PI) * 0.2;
        const rim = smooth(0.82, 1, t) * 0.12;
        const foot = 0.1 * (1 - smooth(0, 0.14, t));
        const ridge = 0.012 * Math.sin(t * 90);
        prof.push(new Vector2(0.05 + belly + rim + foot + ridge, t * 0.55));
      }
      const urn = new LatheGeometry(prof, 56);
      const up = urn.getAttribute("position");
      for (let i = 0; i < up.count; i++) {
        const x = up.getX(i);
        const y = up.getY(i);
        const z = up.getZ(i);
        const n = (fbm(x * 12 + 1, y * 12 + z * 12, 7, 1 << 16, 3) - 0.5) * 0.02;
        up.setXYZ(i, x * (1 + n), y, z * (1 + n));
      }
      urn.computeVertexNormals();
      urn.translate(0, 1.14, 0);
      g.add(solid(urn, m("none", 74)[0]));
      g.rotation.set(0, 0.3, 0.03);
      return g;
    },
  },
  {
    id: "ledger",
    name: "Table tomb",
    note: "A heavy lid on a base, cracked and furred with moss, with a small headstone.",
    build() {
      const g = new Group();
      const tint = stoneColor(81);
      const m = (c: Carving, s: number) => faces(c, s, 0.85, tint);
      g.add(solid(slab(1.0, 0.36, 1.9, { round: 0.03, chips: 3, seed: 81, erode: 1.1 }), m("none", 81)));
      g.add(solid(slab(1.14, 0.2, 2.04, { round: 0.04, chips: 5, seed: 82, erode: 1.2 }), m("none", 82), new Vector3(0, 0.36, 0), new Vector3(0, 0, 0.015)));
      g.add(solid(slab(0.7, 0.9, 0.16, { top: "arch", topH: 0.25, chips: 2, seed: 83 }), m("name", 83), new Vector3(0, 0.1, -1.1)));
      g.rotation.set(0, 0.5, 0);
      g.scale.setScalar(0.85);
      return g;
    },
  },
  {
    id: "sunken",
    name: "Sunken, leaning stone",
    note: "Centuries old: half-swallowed by the ground, tipped, crumbling.",
    build() {
      const g = new Group();
      g.add(solid(slab(0.9, 1.3, 0.22, { top: "arch", topH: 0.4, chips: 6, round: 0.05, erode: 1.8, seed: 91 }), faces("name", 91, 0.95)));
      g.position.y = -0.3;
      g.rotation.set(0.12, 0.2, -0.26);
      return g;
    },
  },
];

const META: Record<string, [number, number]> = {
  arch: [3, 0.7],
  gothic: [2, 0.7],
  ogee: [2, 0.8],
  cross: [2, 0.8],
  obelisk: [2, 0.8],
  broken: [2, 0.9],
  urn: [2, 0.7],
  ledger: [2, 1.2],
  sunken: [2, 0.7],
};
for (const k of STONES) [k.copies, k.radius] = META[k.id] ?? [2, 0.8];
