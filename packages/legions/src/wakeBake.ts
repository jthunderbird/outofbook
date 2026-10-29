// The Wake's baked pieces. Building the court from scratch takes ages on a phone (the
// textures are painted pixel by pixel, the stones, angels, crypts, chapel and trees are
// carved and eroded vertex by vertex), so a build step runs that work once and saves it:
// each grave kind and tree as a scene graph with its geometry, and every texture. At
// runtime the court loads those files instead and only places them. Nothing is lost: the
// code that makes the pieces is the same code; if a piece is not in the pack (or the pack
// is missing) it is made on the spot, as before.
//
//   npm run bake:wake   (scripts/bake-wake.mjs: opens the bake page, saves the pack to courts/wake/baked/)
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  type Material,
  type Object3D,
} from "three";
import { weather } from "./wakeStones";
import { barkMaterial, type Look } from "./wakeTrees";

// ---------- The pack's description ----------

interface AttrDesc {
  /** 8 or 16 bits per value (normals and masks are 8). */
  bits?: 8 | 16;
  items: number;
  min: number;
  max: number;
  off: number;
  count: number;
}
interface GeoDesc {
  attrs: Record<string, AttrDesc>;
  index?: { off: number; count: number; wide: boolean };
  groups?: { start: number; count: number; materialIndex: number }[];
}
interface TexDesc {
  file: string;
  colorSpace: string;
  wrap: boolean;
  aniso: number;
  repeat: [number, number];
}
interface MatDesc {
  color: number;
  roughness: number;
  metalness: number;
  side: number;
  map?: string;
  normalMap?: string;
  normalScale?: [number, number];
  weather?: { moss: number; bump: number; base: number };
  bark?: Look;
}
interface NodeDesc {
  t: "g" | "m";
  pos: number[];
  rot: number[];
  scale: number[];
  cast?: boolean;
  receive?: boolean;
  geo?: string;
  mats?: number[] | number;
  kids?: NodeDesc[];
}
export interface PackIndex {
  geos: Record<string, GeoDesc>;
  mats: MatDesc[];
  tex: Record<string, TexDesc>;
  nodes: Record<string, NodeDesc>;
  maps: Record<string, Record<string, string>>;
  geoByKey: Record<string, string>;
}

// ---------- At runtime: loading and rebuilding ----------

const BASE = `${import.meta.env.BASE_URL ?? "/"}`;
const FILES = import.meta.glob<string>("../courts/wake/baked/*", { eager: true, query: "?url", import: "default" });
const fileUrl = (name: string) => FILES[`../courts/wake/baked/${name}`];

let pack: { index: PackIndex; bin: ArrayBuffer; tex: Map<string, Texture> } | null = null;
let loading: Promise<void> | null = null;
const geoCache = new Map<string, BufferGeometry>();
const matCache = new Map<number, Material>();

/** Loads the pack, if one has been made; the court builds what is missing itself. */
export function loadWakeBake(): Promise<void> {
  loading ??= (async () => {
    // Baking makes everything fresh: no pack.
    if (rec()) return;
    const indexUrl = fileUrl("index.json");
    const binUrl = fileUrl("geometry.bin");
    if (!indexUrl || !binUrl) return;
    try {
      const [index, bin] = await Promise.all([fetch(indexUrl).then((r) => r.json() as Promise<PackIndex>), fetch(binUrl).then((r) => r.arrayBuffer())]);
      const tex = new Map<string, Texture>();
      await Promise.all(
        Object.entries(index.tex).map(async ([key, d]) => {
          const url = fileUrl(d.file);
          if (!url) return;
          const img = new Image();
          img.src = url;
          await img.decode();
          const t = new Texture(img);
          t.colorSpace = d.colorSpace === "srgb" ? SRGBColorSpace : "";
          if (d.wrap) t.wrapS = t.wrapT = RepeatWrapping;
          t.anisotropy = d.aniso;
          t.repeat.set(d.repeat[0], d.repeat[1]);
          t.needsUpdate = true;
          tex.set(key, t);
        }),
      );
      pack = { index, bin, tex };
    } catch (e) {
      console.warn("the Wake's baked pack did not load; building it instead", e);
    }
  })();
  void BASE;
  return loading;
}

function decodeGeo(id: string): BufferGeometry | null {
  const cached = geoCache.get(id);
  if (cached) return cached;
  const d = pack?.index.geos[id];
  if (!pack || !d) return null;
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(d.attrs)) {
    const wide = a.bits !== 8;
    const q = wide ? new Uint16Array(pack.bin, a.off, a.count * a.items) : new Uint8Array(pack.bin, a.off, a.count * a.items);
    const out = new Float32Array(q.length);
    const k = (a.max - a.min) / (wide ? 65535 : 255);
    for (let i = 0; i < q.length; i++) out[i] = a.min + q[i] * k;
    g.setAttribute(name, new BufferAttribute(out, a.items));
  }
  if (d.index)
    g.setIndex(
      new BufferAttribute(
        d.index.wide ? new Uint32Array(pack.bin.slice(d.index.off, d.index.off + d.index.count * 4)) : new Uint16Array(pack.bin.slice(d.index.off, d.index.off + d.index.count * 2)),
        1,
      ),
    );
  if (d.groups) for (const gr of d.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  geoCache.set(id, g);
  return g;
}

function material(i: number): Material {
  const hit = matCache.get(i);
  if (hit) return hit;
  const d = pack!.index.mats[i];
  let m: Material;
  if (d.bark) m = barkMaterial(d.bark);
  else {
    const s = new MeshStandardMaterial({ color: d.color, roughness: d.roughness, metalness: d.metalness, side: d.side as 0 | 1 | 2 });
    if (d.map) s.map = pack!.tex.get(d.map) ?? null;
    if (d.normalMap) s.normalMap = pack!.tex.get(d.normalMap) ?? null;
    if (d.normalScale) s.normalScale = new Vector2(...d.normalScale);
    m = d.weather ? weather(s, d.weather.moss, d.weather.bump, d.weather.base) : s;
  }
  matCache.set(i, m);
  return m;
}

function build(d: NodeDesc): Object3D | null {
  let o: Object3D;
  if (d.t === "m") {
    const g = decodeGeo(d.geo!);
    if (!g) return null;
    const mats = Array.isArray(d.mats) ? d.mats.map(material) : material(d.mats as number);
    o = new Mesh(g, mats);
    o.castShadow = !!d.cast;
    o.receiveShadow = !!d.receive;
  } else o = new Group();
  o.position.fromArray(d.pos);
  o.rotation.set(d.rot[0], d.rot[1], d.rot[2], "XYZ");
  o.scale.fromArray(d.scale);
  for (const k of d.kids ?? []) {
    const c = build(k);
    if (!c) return null;
    o.add(c);
  }
  return o;
}

/** A baked scene graph by key, or null if the pack has none (the caller then builds it). */
export function bakedGroup(key: string): Object3D | null {
  const d = pack?.index.nodes[key];
  return d ? build(d) : null;
}

/** A baked geometry by key, or null. */
export function bakedGeometry(key: string): BufferGeometry | null {
  const id = pack?.index.geoByKey[key];
  return id ? decodeGeo(id) : null;
}

/** A baked set of textures by key (each name to its texture), or null. */
export function bakedMaps(key: string): Record<string, Texture> | null {
  const m = pack?.index.maps[key];
  if (!m || !pack) return null;
  const out: Record<string, Texture> = {};
  for (const [name, tk] of Object.entries(m)) {
    const t = pack.tex.get(tk);
    if (!t) return null;
    out[name] = t;
  }
  return out;
}

// ---------- At bake time: recording ----------

interface Recorder {
  nodes: Record<string, NodeDesc>;
  geoByKey: Record<string, string>;
  geos: Map<BufferGeometry, string>;
  mats: MatDesc[];
  matIds: Map<Material, number>;
  matKeys: Map<string, number>;
  tex: Map<Texture, string>;
  maps: Record<string, Record<string, string>>;
}
const REC = "__wakeBake";
const rec = () => (globalThis as unknown as Record<string, Recorder | undefined>)[REC];

/** The bake page calls this first; from then on every baked-or-built piece is recorded. */
export function startRecording() {
  const r: Recorder = { nodes: {}, geoByKey: {}, geos: new Map(), mats: [], matIds: new Map(), matKeys: new Map(), tex: new Map(), maps: {} };
  (globalThis as unknown as Record<string, Recorder>)[REC] = r;
  return r;
}

function texKey(r: Recorder, t: Texture) {
  let k = r.tex.get(t);
  if (!k) {
    k = `t${r.tex.size}`;
    r.tex.set(t, k);
  }
  return k;
}

function recordGeo(r: Recorder, g: BufferGeometry) {
  let id = r.geos.get(g);
  if (!id) {
    id = `g${r.geos.size}`;
    r.geos.set(g, id);
  }
  return id;
}

function recordMat(r: Recorder, m: Material): number {
  const hit = r.matIds.get(m);
  if (hit !== undefined) return hit;
  const s = m as MeshStandardMaterial;
  const d: MatDesc = {
    color: s.color?.getHex() ?? 0xffffff,
    roughness: s.roughness ?? 1,
    metalness: s.metalness ?? 0,
    side: s.side === DoubleSide ? DoubleSide : s.side === BackSide ? BackSide : FrontSide,
  };
  if (s.map) d.map = texKey(r, s.map);
  if (s.normalMap) d.normalMap = texKey(r, s.normalMap);
  if (s.normalScale && (s.normalScale.x !== 1 || s.normalScale.y !== 1)) d.normalScale = [s.normalScale.x, s.normalScale.y];
  if (m.userData.weather) d.weather = m.userData.weather;
  if (m.userData.bark) d.bark = m.userData.bark;
  const key = JSON.stringify(d);
  let i = r.matKeys.get(key);
  if (i === undefined) {
    i = r.mats.length;
    r.mats.push(d);
    r.matKeys.set(key, i);
  }
  r.matIds.set(m, i);
  return i;
}

function recordNode(r: Recorder, o: Object3D): NodeDesc {
  const d: NodeDesc = { t: "g", pos: o.position.toArray(), rot: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray() };
  const m = o as Mesh;
  if (m.isMesh) {
    d.t = "m";
    d.geo = recordGeo(r, m.geometry);
    d.mats = Array.isArray(m.material) ? m.material.map((x) => recordMat(r, x)) : recordMat(r, m.material);
    d.cast = m.castShadow;
    d.receive = m.receiveShadow;
  }
  if (o.children.length) d.kids = o.children.map((c) => recordNode(r, c));
  return d;
}

/** Records a built piece under key (when baking) and returns it. */
export function recordGroup<T extends Object3D>(key: string, o: T): T {
  const r = rec();
  if (r) r.nodes[key] = recordNode(r, o);
  return o;
}

export function recordGeometry<T extends BufferGeometry>(key: string, g: T): T {
  const r = rec();
  if (r) r.geoByKey[key] = recordGeo(r, g);
  return g;
}

/** A set of textures: from the pack, or made (and recorded when baking). */
export function mapsOrMake<T extends Record<string, Texture>>(key: string, make: () => T): T {
  const baked = bakedMaps(key);
  if (baked) return baked as T;
  const made = make();
  const r = rec();
  if (r) r.maps[key] = Object.fromEntries(Object.entries(made).map(([n, t]) => [n, texKey(r, t)]));
  return made;
}

/** A piece's scene graph: from the pack, or made by build (and recorded when baking). */
export function groupOrMake(key: string, build: () => Group): Group {
  return (bakedGroup(key) as Group | null) ?? recordGroup(key, build());
}

/** A geometry: from the pack, or made (and recorded when baking). */
export function geometryOrMake(key: string, make: () => BufferGeometry): BufferGeometry {
  return bakedGeometry(key) ?? recordGeometry(key, make());
}

/** Everything recorded, as files: the index, one binary of geometry, and each texture's canvas (for the bake script to encode). */
export function finishRecording() {
  const r = rec()!;
  const chunks: ArrayBuffer[] = [];
  let off = 0;
  const geos: Record<string, GeoDesc> = {};
  const put = (buf: ArrayBuffer) => {
    const at = off;
    chunks.push(buf);
    off += buf.byteLength;
    if (off % 4) {
      chunks.push(new ArrayBuffer(4 - (off % 4)));
      off += 4 - (off % 4);
    }
    return at;
  };
  for (const [g, id] of r.geos) {
    const d: GeoDesc = { attrs: {} };
    for (const [name, a] of Object.entries(g.attributes)) {
      const at = a as BufferAttribute;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < at.array.length; i++) {
        const v = at.array[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max === min) max = min + 1e-6;
      const small = name === "normal" || name === "aMask";
      if (name === "normal") {
        min = -1;
        max = 1;
      }
      const q = small ? new Uint8Array(at.array.length) : new Uint16Array(at.array.length);
      const k = (small ? 255 : 65535) / (max - min);
      for (let i = 0; i < q.length; i++) q[i] = Math.round((at.array[i] - min) * k);
      d.attrs[name] = { items: at.itemSize, min, max, off: put(q.buffer), count: at.count, ...(small ? { bits: 8 as const } : {}) };
    }
    if (g.index) {
      const wide = g.getAttribute("position").count > 65535;
      const arr = wide ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array);
      d.index = { off: put(arr.buffer), count: arr.length, wide };
    }
    if (g.groups.length) d.groups = g.groups.map((x) => ({ start: x.start, count: x.count, materialIndex: x.materialIndex ?? 0 }));
    geos[id] = d;
  }
  const tex: Record<string, TexDesc> = {};
  const canvases: Record<string, CanvasImageSource> = {};
  for (const [t, key] of r.tex) {
    tex[key] = { file: `${key}.webp`, colorSpace: t.colorSpace === SRGBColorSpace ? "srgb" : "", wrap: t.wrapS === RepeatWrapping, aniso: t.anisotropy, repeat: [t.repeat.x, t.repeat.y] };
    canvases[key] = t.image as CanvasImageSource;
  }
  const bin = new Uint8Array(off);
  let p = 0;
  for (const c of chunks) {
    bin.set(new Uint8Array(c), p);
    p += c.byteLength;
  }
  const index: PackIndex = { geos, mats: r.mats, tex, nodes: r.nodes, maps: r.maps, geoByKey: r.geoByKey };
  return { index, bin, canvases };
}
