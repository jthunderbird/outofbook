// Courts: a board and the scenery around it, which come (and unlock) together.
// Every tribe has a home court; the plain ones are the classic marble board under
// a gradient sky. A court dresses the board the scene built (its squares and
// walls) and adds its scenery; the scene updates it each frame and takes it all
// away again for another court. Art made with Meshy AI lives in ../courts/<id>/.
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  Fog,
  Path,
  PointLight,
  LinearFilter,
  PlaneGeometry,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  ShadowMaterial,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
  type Material,
  type Scene,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BACKGROUNDS, backgroundTexture } from "./backgrounds";
import type { Board } from "./board";
import { glowMap } from "./figures";
import { woodPanel, woodTexture } from "./wood";
import { leafGeo, leafMaterials } from "./thornwood";
import { Backdrop, cliff, FlatMap, hiTile } from "./pixel/world";
import { theWake } from "./wakeCourt";

export interface Court {
  id: string;
  name: string;
  /** The tribe whose home this is, if any. */
  tribe?: string;
  /** The skin it was made for, if any (it comes with the skin). */
  skin?: string;
  /** Colors for menus and for the scene behind it until its art has loaded. */
  top: string;
  bottom: string;
  /** A picture of it for menus. */
  preview?: string;
  /** Dresses the board and adds the scenery; null for the plain marble board. */
  dress?: (scene: Scene, board: Board) => CourtSet;
}

/** A court in the scene: updated each frame, removed for another. */
export interface CourtView {
  /** The camera is fixed (no orbiting) at this angle. */
  fixed: boolean;
  /** Angle above the board, radians; distance from its center; lens; height of the point looked at. */
  pitch: number;
  dist: number;
  fov: number;
  ty: number;
  /** Where on the ground, along z, the camera looks, when not at the board's center. */
  tz?: number;
}

export interface CourtSet {
  /** Where the camera stands for this court, instead of the usual place. */
  view?: CourtView;
  /** The board is drawn by the court's own picture: the board's meshes only hide what lies beneath them (depth, no color), its labels hidden. */
  bare?: boolean;
  /** The screen's size changed (for a background fitted to cover it). */
  resize?(w: number, h: number): void;
  /** Height at which move markers lie, when the squares stand proud of the board. */
  markY?: number;
  /** How far (radians) the camera may turn either way from the player's side; unlimited if not given. */
  turn?: number;
  /** The player's side: 1 for white, -1 for black (a court with a front turns to face them). */
  orient?(s: 1 | -1): void;
  update(ms: number): void;
  dispose(): void;
}

const ART = import.meta.glob<string>("../courts/*/*", { eager: true, query: "?url", import: "default" });
const art = (court: string, file: string) => ART[`../courts/${court}/${file}`];

const textures = new Map<string, Promise<Texture>>();
function texture(url: string, color = true) {
  let t = textures.get(url);
  if (!t) {
    t = new TextureLoader().loadAsync(url).then((x) => {
      if (color) x.colorSpace = SRGBColorSpace;
      x.anisotropy = 4;
      return x;
    });
    textures.set(url, t);
  }
  return t;
}

const props = new Map<string, Promise<Group>>();

// ---------- What every dressed court is made of ----------

/** A sea of drifting noise far below the board (cloud or mist), lit where a flash lands; colors are linear RGB. */
type RGB = [number, number, number];
function sea(dark: RGB, light: RGB, glow: RGB, y: number) {
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      flash: { value: 0 },
      flashAt: { value: new Vector3() },
      dark: { value: new Color(...dark) },
      light: { value: new Color(...light) },
      glow: { value: new Color(...glow) },
    },
    vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform float flash; uniform vec3 flashAt; uniform vec3 dark; uniform vec3 light; uniform vec3 glow; varying vec3 vPos;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vPos.xz * 0.06;
        float c = fbm(p + vec2(time * 0.012, time * 0.006) + fbm(p * 1.7 - time * 0.01));
        vec3 col = mix(dark, light, smoothstep(0.35, 0.8, c));
        float d = length(vPos.xz - flashAt.xz);
        col += glow * flash * smoothstep(18.0, 0.0, d) * (0.4 + c);
        float edge = smoothstep(46.0, 30.0, length(vPos.xz));
        gl_FragColor = vec4(col, edge);
      }`,
  });
  const m = new Mesh(new CircleGeometry(48, 64).rotateX(-Math.PI / 2), mat);
  m.position.y = y;
  return m;
}

/** The painted sky round about: a wide painting mirrored round a cylinder. */
function skyDome(url: string, tint: number, radius = 50, repeat = 4) {
  const mat = new MeshBasicMaterial({ side: BackSide, fog: false, color: tint });
  void texture(url).then((t) => {
    t.wrapS = MirroredRepeatWrapping;
    t.repeat.set(repeat, 1);
    mat.map = t;
    mat.needsUpdate = true;
  });
  const dome = new Mesh(new CylinderGeometry(radius, radius, (44 * radius) / 50, 64, 1, true), mat);
  dome.position.y = 6 * (radius / 50);
  return { dome, mat };
}

/**
 * The squares in a court's stone: each a different part of its texture, so no
 * two look alike; glow maps make their veins shine, through shader if given.
 */
function dressSquares(
  group: Group,
  board: Board,
  o: {
    dark: string;
    light: string;
    darkGlow?: string;
    lightGlow?: string;
    darkVein: number;
    lightVein: number;
    darkVeinI: number;
    lightVeinI: number;
    lightTint?: number;
    rough: [number, number];
    shader?: (m: MeshStandardMaterial) => void;
  },
) {
  void Promise.all([texture(o.dark), texture(o.light), o.darkGlow ? texture(o.darkGlow, false) : null, o.lightGlow ? texture(o.lightGlow, false) : null]).then(([dark, light, darkGlow, lightGlow]) => {
    if (!group.parent) return;
    for (const t of [dark, light, darkGlow, lightGlow]) if (t) t.wrapS = t.wrapT = RepeatWrapping;
    for (const sq of board.squares.values()) {
      const isLight = sq.userData.light as boolean;
      const ox = Math.random() * 0.62;
      const oy = Math.random() * 0.62;
      const turn = Math.floor(Math.random() * 4) * (Math.PI / 2);
      const cut = (t: Texture) => {
        const c = t.clone();
        c.repeat.set(0.38, 0.38);
        c.offset.set(ox, oy);
        c.center.set(0.5, 0.5);
        c.rotation = turn;
        return c;
      };
      const m = new MeshStandardMaterial({ map: cut(isLight ? light : dark), roughness: o.rough[isLight ? 0 : 1], metalness: 0.05 });
      if (isLight && o.lightTint !== undefined) m.color.setHex(o.lightTint);
      const glow = isLight ? lightGlow : darkGlow;
      if (glow) {
        m.emissive = new Color(isLight ? o.lightVein : o.darkVein);
        m.emissiveMap = cut(glow);
        m.emissiveIntensity = isLight ? o.lightVeinI : o.darkVeinI;
        o.shader?.(m);
      }
      (sq.material as MeshStandardMaterial).dispose();
      sq.material = m;
    }
  });
}

/** The plinth's walls: a carved frieze on the long faces, a stone top. */
function dressWalls(group: Group, board: Board, frieze: string, top: string, topColor: number) {
  void Promise.all([texture(frieze), texture(top)]).then(([fr, tp]) => {
    if (!group.parent) return;
    const topMat = new MeshStandardMaterial({ map: tp, color: topColor, roughness: 0.6 });
    for (const w of board.walls) {
      const f = fr.clone();
      f.wrapS = MirroredRepeatWrapping;
      f.repeat.set(3, 1);
      const side = new MeshStandardMaterial({ map: f, roughness: 0.6, metalness: 0.1 });
      // Box faces: +x, -x, +y, -y, +z, -z; the long faces carry the frieze.
      const alongX = (w.geometry as unknown as { parameters: { width: number } }).parameters.width > 1;
      (w.material as MeshStandardMaterial).dispose();
      w.material = alongX ? [topMat, topMat, topMat, topMat, side, side] : [side, side, topMat, topMat, topMat, topMat];
    }
  });
}

/** A prop model at each of the plinth's four corners, height H, facing the board; a glow at height glowAt if a color is given. */
function corners(group: Group, url: string, H: number, glow?: { color: number; at: number; size: number }) {
  const glows: Sprite[] = [];
  let p = props.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene as unknown as Group);
    props.set(url, p);
  }
  void p.then((src) => {
    if (!group.parent) return;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const o = src.clone();
        o.traverse((c) => {
          c.castShadow = true;
          c.receiveShadow = true;
        });
        o.rotation.y = Math.atan2(-x, -z);
        o.updateMatrixWorld(true);
        const box = new Box3().setFromObject(o);
        const c0 = box.getCenter(new Vector3());
        o.scale.setScalar(H / (box.max.y - box.min.y));
        // Centered on the plinth's corner, its foot on the plinth.
        const k = o.scale.x;
        o.position.set(x * 4.35 - c0.x * k, -box.min.y * k, z * 4.35 - c0.z * k);
        group.add(o);
        if (!glow) continue;
        const g = new Sprite(new SpriteMaterial({ map: glowMap(), color: new Color(glow.color).multiplyScalar(2.5), blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
        g.scale.setScalar(glow.size);
        g.position.set(x * 4.35, H * glow.at, z * 4.35);
        group.add(g);
        glows.push(g);
      }
  });
  return glows;
}

// ---------- The Stormcourt's home: Storm Keep ----------
/** A jagged bolt from the sky down into the clouds, at a point on a wide ring round the board. */
function bolt(color: Color) {
  const a = Math.random() * Math.PI * 2;
  const r = 22 + Math.random() * 14;
  const end = new Vector3(Math.cos(a) * r, -7, Math.sin(a) * r);
  const start = end.clone().add(new Vector3((Math.random() - 0.5) * 8, 30, (Math.random() - 0.5) * 8));
  const pts: Vector3[] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const p = start.clone().lerp(end, i / N);
    if (i > 0 && i < N) p.add(new Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4));
    pts.push(p);
  }
  // A flat ribbon facing the board's middle, wide enough to read from far off.
  const pos: number[] = [];
  const side = new Vector3(-Math.sin(a), 0, Math.cos(a));
  for (let i = 0; i < N; i++) {
    const w = 0.28 * (1 - (i / N) * 0.6);
    const [p, q] = [pts[i], pts[i + 1]];
    const [pa, pb, qa, qb] = [p.clone().addScaledVector(side, -w), p.clone().addScaledVector(side, w), q.clone().addScaledVector(side, -w), q.clone().addScaledVector(side, w)];
    pos.push(...pa.toArray(), ...pb.toArray(), ...qa.toArray(), ...pb.toArray(), ...qb.toArray(), ...qa.toArray());
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  const m = new Mesh(g, new MeshBasicMaterial({ color: color.clone().multiplyScalar(4), transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2, toneMapped: false }));
  return { mesh: m, at: end };
}

/**
 * The squares' veins carry the storm: light flows along them in slow waves, and
 * a strike sends a surge rippling out across the board from where it lands.
 * One set of uniforms drives every square.
 */
function veinShader(m: MeshStandardMaterial, u: VeinUniforms) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nuniform float veinTime;\nuniform vec3 surge;\nuniform float veinFlash;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
        {
          vec2 p = vWorld.xz;
          // Slow waves of light running along the veins, two directions crossing.
          float a = pow(0.5 + 0.5 * sin(dot(p, vec2(0.8, 0.6)) * 1.1 - veinTime * 2.2), 6.0);
          float b = pow(0.5 + 0.5 * sin(dot(p, vec2(-0.5, 0.85)) * 0.9 - veinTime * 1.6 + 2.0), 8.0);
          // The surge: a ring racing out from the strike (surge.xy), fading as it goes (surge.z: its radius).
          float d = distance(p, surge.xy);
          float ring = surge.z > 0.0 ? exp(-pow((d - surge.z) / 0.7, 2.0)) * smoothstep(13.0, 3.0, surge.z) : 0.0;
          totalEmissiveRadiance *= 0.8 + 1.6 * (a + b) + 4.0 * ring + 0.8 * veinFlash;
        }`,
    );
  };
  m.customProgramCacheKey = () => "storm-veins";
}

interface VeinUniforms {
  veinTime: { value: number };
  surge: { value: Vector3 };
  veinFlash: { value: number };
  [k: string]: { value: unknown };
}

/** A small arc crawling over the board's surface, between two points a square or three apart. */
function crawler(color: Color, from?: Vector3) {
  const a = from ?? new Vector3((Math.random() - 0.5) * 7.6, 0, (Math.random() - 0.5) * 7.6);
  const ang = Math.random() * Math.PI * 2;
  const len = 1.2 + Math.random() * 2.2;
  const b = a.clone().add(new Vector3(Math.cos(ang) * len, 0, Math.sin(ang) * len));
  b.x = Math.max(-3.9, Math.min(3.9, b.x));
  b.z = Math.max(-3.9, Math.min(3.9, b.z));
  const N = 14;
  const side = new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
  const pts: Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const p = a.clone().lerp(b, i / N);
    if (i > 0 && i < N) p.addScaledVector(side, (Math.random() - 0.5) * 0.35);
    p.y = 0.012;
    pts.push(p);
  }
  // Flat on the board: widened across the board's plane.
  const pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const dir = q.clone().sub(p);
    const n = new Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.05);
    const [pa, pb, qa, qb] = [p.clone().sub(n), p.clone().add(n), q.clone().sub(n), q.clone().add(n)];
    pos.push(...pa.toArray(), ...pb.toArray(), ...qa.toArray(), ...pb.toArray(), ...qb.toArray(), ...qa.toArray());
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return new Mesh(g, new MeshBasicMaterial({ color: color.clone().multiplyScalar(3.5), transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2, toneMapped: false }));
}

function stormKeep(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const vu: VeinUniforms = { veinTime: { value: 0 }, surge: { value: new Vector3(0, 0, -1) }, veinFlash: { value: 0 } };
  const BOLT = new Color(0xb8a8ff);

  // The squares: storm slate with lightning veins, and veined marble (a touch off white, so its blue veins show).
  dressSquares(group, board, {
    dark: art("stormcourt", "slate.webp"),
    light: art("stormcourt", "marble.webp"),
    darkGlow: art("stormcourt", "slate-veins.webp"),
    lightGlow: art("stormcourt", "marble-veins.webp"),
    darkVein: 0x4f8cff,
    lightVein: 0x3f86ff,
    darkVeinI: 1,
    lightVeinI: 1.2,
    lightTint: 0xd4d9e4,
    rough: [0.32, 0.4],
    shader: (m) => veinShader(m, vu),
  });
  // The walls: a carved basalt frieze of storm runes inlaid with gold.
  dressWalls(group, board, art("stormcourt", "frieze.webp"), art("stormcourt", "slate.webp"), 0x8890a0);
  // Storm pillars at the four corners, a storm crystal on each.
  const crystals = corners(group, art("stormcourt", "pillar.glb"), 2.1, { color: 0xa070ff, at: 0.86, size: 0.9 });

  // The sky round about, and the clouds below.
  const { dome, mat: sky } = skyDome(art("stormcourt", "sky.webp"), 0x9098a8);
  const clouds = sea([0.03, 0.035, 0.06], [0.2, 0.2, 0.3], [0.55, 0.45, 1.0], -7);
  group.add(dome, clouds);
  const strikeLight = new DirectionalLight(0xc8b8ff, 0);
  strikeLight.position.set(-6, 10, -4);
  group.add(strikeLight);
  const prevBg = scene.background;
  scene.background = new Color(0x05060a);

  let t = 0;
  let next = 2500;
  let flash = 0;
  let bolts: { mesh: Mesh; life: number }[] = [];
  let crawl = 4000;
  /** Where the last strike's surge started, and how far it has run. */
  const surge = vu.surge.value;
  const spark = (from?: Vector3) => {
    const m = crawler(BOLT, from);
    group.add(m);
    bolts.push({ mesh: m, life: 140 + Math.random() * 120 });
  };
  const seaU = (clouds.material as ShaderMaterial).uniforms;
  return {
    update(ms) {
      t += ms;
      seaU.time.value = t / 1000;
      next -= ms;
      if (next <= 0) {
        // A strike: a bolt (sometimes two in quick succession), a flash over the clouds and the board.
        next = 3500 + Math.random() * 6000;
        const b = bolt(BOLT);
        group.add(b.mesh);
        bolts.push({ mesh: b.mesh, life: 260 });
        seaU.flashAt.value.copy(b.at);
        flash = 1;
        // The surge comes in from the board's edge nearest the strike, with arcs where it lands.
        const edge = b.at.clone().setY(0).normalize().multiplyScalar(4);
        surge.set(edge.x, edge.z, 0);
        spark(edge.clone().multiplyScalar(0.95));
      }
      // Now and then a small arc crawls over the board on its own.
      crawl -= ms;
      if (crawl <= 0) {
        crawl = 5000 + Math.random() * 7000;
        spark();
      }
      if (surge.z >= 0) surge.z = surge.z > 14 ? -1 : surge.z + ms * 0.009;
      // Arcs follow the surge's front now and then.
      if (surge.z > 1 && surge.z < 9 && Math.random() < ms / 1500) {
        const a = Math.random() * Math.PI * 2;
        const p = new Vector3(surge.x + Math.cos(a) * surge.z, 0, surge.y + Math.sin(a) * surge.z);
        if (Math.abs(p.x) < 3.9 && Math.abs(p.z) < 3.9) spark(p);
      }
      for (const b of bolts) {
        b.life -= ms;
        // Flickers as it dies.
        (b.mesh.material as MeshBasicMaterial).opacity = b.life > 0 ? (Math.random() < 0.25 ? 0.3 : 1) : 0;
      }
      bolts = bolts.filter((b) => {
        if (b.life > 0) return true;
        b.mesh.removeFromParent();
        b.mesh.geometry.dispose();
        (b.mesh.material as MeshBasicMaterial).dispose();
        return false;
      });
      flash = Math.max(0, flash - ms / 700);
      const f = flash * (0.6 + 0.4 * Math.random());
      seaU.flash.value = f * 0.6;
      sky.color.setHex(0x9098a8).multiplyScalar(1 + f * 0.5);
      strikeLight.intensity = f * 0.5;
      vu.veinTime.value = t / 1000;
      vu.veinFlash.value = f;
      for (const c of crystals) c.material.opacity = 0.55 + 0.2 * Math.sin(t / 300 + c.position.x) + f * 0.45;
    },
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      for (const b of bolts) b.mesh.geometry.dispose();
    },
  };
}

// ---------- The Thornwood's home: Heartwood Grove ----------

/** A model placed on the forest floor at x, z, height H, turned by turn. */
function plant(group: Group, url: string | undefined, x: number, z: number, H: number, turn: number, floor: number) {
  if (!url) return;
  let p = props.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene as unknown as Group);
    props.set(url, p);
  }
  void p.then((src) => {
    if (!group.parent) return;
    const o = src.clone();
    o.traverse((c) => {
      c.castShadow = true;
      c.receiveShadow = true;
    });
    o.rotation.y = turn;
    o.updateMatrixWorld(true);
    const box = new Box3().setFromObject(o);
    const c0 = box.getCenter(new Vector3());
    const k = H / (box.max.y - box.min.y);
    o.scale.setScalar(k);
    o.position.set(x - c0.x * k, floor - box.min.y * k, z - c0.z * k);
    group.add(o);
  });
}

/** Cloud shadows drifting over a surface: slow soft patches of shade, by world position and time. */
function cloudShade(m: Material, u: { cloudTime: { value: number } }, fill?: string) {
  const s = m as MeshStandardMaterial;
  s.onBeforeCompile = (sh) => {
    sh.uniforms.cloudTime = u.cloudTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCloudPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvCloudPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCloudPos;
        uniform float cloudTime;
        float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        ${
          // Where the model's texture is near black (gaps in the turf), a living green instead.
          fill
            ? `{ float lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
        diffuseColor.rgb = mix(${fill}, diffuseColor.rgb, smoothstep(0.04, 0.22, lum)); }`
            : ""
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
          vec2 p = vCloudPos.xz * 0.11 + vec2(cloudTime * 0.045, cloudTime * 0.02);
          float c = cn(p) * 0.6 + cn(p * 2.1 + 5.0) * 0.4;
          outgoingLight *= 1.0 - 0.42 * smoothstep(0.5, 0.72, c);
        }
        #include <opaque_fragment>`,
      );
  };
  s.customProgramCacheKey = () => `cloud-shade-${fill ?? ""}`;
}

/**
 * Heartwood Grove: the board is a raised bed of earth in a forest clearing,
 * its squares meadow grass and bare forest soil. Old oaks stand round it on the
 * forest floor with ferns and undergrowth at their feet; beyond, the painted
 * forest in late-afternoon sun, pollen drifting and leaves falling.
 */
function heartwoodGrove(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const FLOOR = -1.38;

  const cloud = { cloudTime: { value: 0 } };
  // Each square a modelled tile of meadow turf or forest soil (Meshy), turned at random, on a dark earth base; clouds drift over them.
  // Under the turf, a living green: wherever the model has gaps, it shows.
  const earth = new MeshStandardMaterial({ color: 0x2a2116, roughness: 1 });
  const turf = new MeshStandardMaterial({ color: 0x1e3d0d, roughness: 1 });
  for (const sq of board.squares.values()) {
    (sq.material as MeshStandardMaterial).dispose();
    sq.material = sq.userData.light ? turf : earth;
  }
  for (const [kind, url] of [
    ["light", art("thornwood", "tile-grass.glb")],
    ["dark", art("thornwood", "tile-dirt.glb")],
  ] as const) {
    if (!url) continue;
    let p = props.get(url);
    if (!p) {
      p = new GLTFLoader().loadAsync(url).then((g) => g.scene as unknown as Group);
      props.set(url, p);
    }
    void p.then((src) => {
      if (!group.parent) return;
      src.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as MeshStandardMaterial;
        // Grass a touch deeper, soil a touch lighter, so both pieces' colors stand out from both.
        if (!mat.userData.shaded) {
          mat.userData.shaded = true;
          mat.color.multiplyScalar(kind === "light" ? 0.8 : 1.45);
          cloudShade(mat, cloud, kind === "light" ? "vec3(0.08, 0.2, 0.04)" : undefined);
        }
      });
      const box = new Box3().setFromObject(src);
      const size = box.getSize(new Vector3());
      const sx = 0.98 / Math.max(size.x, size.z);
      const sy = 0.16 / size.y;
      for (const sq of board.squares.values()) {
        if ((sq.userData.light as boolean) !== (kind === "light")) continue;
        const o = src.clone();
        o.traverse((c) => (c.receiveShadow = true));
        o.scale.set(sx, sy, sx);
        o.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
        o.updateMatrixWorld(true);
        const b = new Box3().setFromObject(o);
        const c0 = b.getCenter(new Vector3());
        // Local to the square (whose top is at 0.05): the tile's foot on the square's foot.
        o.position.set(-c0.x, -0.1 - b.min.y - sq.position.y, -c0.z);
        sq.add(o);
      }
    });
  }
  // The bed's sides are earth, its rim grass.
  dressWalls(group, board, art("thornwood", "dirt.webp"), art("thornwood", "grass.webp"), 0x6f8f56);
  // Standing stones at the corners, their runes glowing: the stones that were paid for stay.
  const runes = corners(group, art("thornwood", "stone.glb"), 1.7, { color: 0x60ff90, at: 0.55, size: 0.55 });

  // The forest floor, out to the painted forest.
  const floor = new MeshStandardMaterial({ color: 0x8a7a60, roughness: 1 });
  cloudShade(floor, cloud);
  void texture(art("thornwood", "floor.webp")).then((t) => {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(12, 12);
    floor.map = t;
    floor.needsUpdate = true;
  });
  const ground = new Mesh(new CircleGeometry(24, 48).rotateX(-Math.PI / 2), floor);
  ground.position.y = FLOOR;
  ground.receiveShadow = true;
  // The painted forest stands close behind the trees, not far off.
  const { dome } = skyDome(art("thornwood", "forest.webp"), 0xd8d8c8, 22, 1.8);
  group.add(ground, dome);

  // Oaks along both flanks and in the far distance, undergrowth all round; nothing tall on the sides the players look across.
  for (const [x, z, h] of [
    [-7.2, -3.6, 4.6],
    [-7.8, 1.2, 5.2],
    [-6.8, 5.4, 4.2],
    [7.4, -4.8, 5],
    [7.0, 0.4, 4.4],
    [7.9, 4.6, 5.4],
    [-11, -9, 6.5],
    [10, -10, 6.8],
    [-10, 10, 6.2],
    [11, 9, 6.6],
    [-14, 0.5, 6.4],
    [14.5, -1, 6.6],
    [-3, -15, 6.8],
    [4, -15.5, 6.4],
    [-5, 15, 6.2],
    [3, 15.5, 6.6],
  ])
    plant(group, art("thornwood", "tree.glb"), x, z, h, Math.random() * Math.PI * 2, FLOOR);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const r = 5.6 + Math.random() * 1.2;
    plant(group, art("thornwood", "bush.glb"), Math.cos(a) * r, Math.sin(a) * r, 0.9 + Math.random() * 0.5, Math.random() * Math.PI * 2, FLOOR);
  }
  // Undergrowth scattered through the clearing's edge, so the ground reads as woodland, not tiles.
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 7.5 + Math.random() * 11;
    plant(group, art("thornwood", "bush.glb"), Math.cos(a) * r, Math.sin(a) * r, 0.8 + Math.random() * 0.9, Math.random() * Math.PI * 2, FLOOR);
  }
  const sun = new DirectionalLight(0xffd9a0, 0.6);
  sun.position.set(-10, 9, -6);
  group.add(sun);
  const prevBg = scene.background;
  scene.background = new Color(0x1c2414);

  // Pollen drifting in the sun.
  const motes: { s: Sprite; home: Vector3; phase: number }[] = [];
  const moteMat = new SpriteMaterial({ map: glowMap(), color: new Color(0xfff0b0).multiplyScalar(1.4), blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6 });
  for (let i = 0; i < 40; i++) {
    const s = new Sprite(moteMat);
    s.scale.setScalar(0.05 + Math.random() * 0.05);
    const home = new Vector3((Math.random() - 0.5) * 14, 0.4 + Math.random() * 3.5, (Math.random() - 0.5) * 14);
    group.add(s);
    motes.push({ s, home, phase: Math.random() * 20 });
  }

  // A few leaves always drifting down over the board.
  const leaves: { m: Mesh; y: number; x: number; z: number; spin: number; speed: number }[] = [];
  const mats = leafMaterials();
  const drop = (l: { m: Mesh; y: number; x: number; z: number; spin: number; speed: number }) => {
    l.x = (Math.random() - 0.5) * 9;
    l.z = (Math.random() - 0.5) * 9;
    l.y = 4 + Math.random() * 3;
    l.speed = 0.25 + Math.random() * 0.2;
    l.m.material = mats[Math.floor(Math.random() * mats.length)];
  };
  for (let i = 0; i < 6; i++) {
    const l = { m: new Mesh(leafGeo, mats[0]), y: 0, x: 0, z: 0, spin: Math.random() * 6, speed: 0 };
    l.m.scale.setScalar(0.12);
    drop(l);
    l.y = Math.random() * 6;
    group.add(l.m);
    leaves.push(l);
  }

  let t = 0;
  return {
    // The modelled tiles stand about 0.06 proud of the board; markers must lie above them.
    markY: 0.085,
    update(ms) {
      t += ms;
      const s = t / 1000;
      cloud.cloudTime.value = s;
      for (const r of runes) r.material.opacity = 0.45 + 0.25 * Math.sin(s * 1.2 + r.position.x);
      for (const m of motes) {
        const k = s * 0.15 + m.phase;
        m.s.position.set(m.home.x + Math.sin(k * 1.3) * 0.6, m.home.y + Math.sin(k * 0.9) * 0.3, m.home.z + Math.cos(k) * 0.6);
      }
      for (const l of leaves) {
        l.y -= (l.speed * ms) / 1000;
        if (l.y < 0.02) drop(l);
        l.m.position.set(l.x + Math.sin(s * 1.3 + l.spin) * 0.4, l.y, l.z + Math.cos(s + l.spin) * 0.2);
        l.m.rotation.set(s * 1.7 + l.spin, s + l.spin, s * 0.8);
      }
    },
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      moteMat.dispose();
    },
  };
}

// ---------- The Staunton tribe's home: the Tournament Hall ----------

/** A chess clock, its faces toward the board's side; built in code. */
function chessClock() {
  const g = new Group();
  const body = new MeshPhysicalMaterial({ map: woodTexture("#3a2416", "#1e120a", 21, 1.5), roughness: 0.4, clearcoat: 0.8 });
  const black = new MeshStandardMaterial({ color: 0x141414, roughness: 0.4 });
  const face = new MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.6 });
  const hand = new MeshStandardMaterial({ color: 0x111111 });
  const box = new Mesh(new BoxGeometry(1.2, 0.55, 0.5), body);
  box.position.y = 0.275;
  box.castShadow = true;
  g.add(box);
  for (const x of [-0.29, 0.29]) {
    const f = new Mesh(new CircleGeometry(0.19, 32), face);
    f.position.set(x, 0.3, 0.252);
    const h = new Mesh(new BoxGeometry(0.012, 0.15, 0.004), hand);
    h.position.set(x, 0.36, 0.256);
    h.rotation.z = x < 0 ? 0.6 : -1.9;
    const rim = new Mesh(new TorusGeometry(0.19, 0.012, 6, 32), black);
    rim.position.set(x, 0.3, 0.252);
    g.add(f, h, rim);
    const button = new Mesh(new CylinderGeometry(0.06, 0.06, x < 0 ? 0.1 : 0.04, 16), black);
    button.position.set(x, 0.55 + (x < 0 ? 0.05 : 0.02), 0);
    g.add(button);
  }
  return g;
}

/**
 * The Tournament Hall: a wooden board of maple and walnut on a long walnut
 * table, a chess clock beside it, under a warm lamp in a dim hall; far off,
 * the lights of the other tables.
 */
function tournamentHall(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const TABLE = -0.11;
  const maple = woodTexture("#e8d2a4", "#c8a26a", 5, 1.4);
  const walnut = woodTexture("#6e4628", "#3c2413", 7, 1.4);
  for (const sq of board.squares.values()) {
    const light = sq.userData.light as boolean;
    const t = (light ? maple : walnut).clone();
    t.repeat.set(0.4, 0.4);
    t.offset.set(Math.random() * 0.6, Math.random() * 0.6);
    // Squares of alternate grain, as on an inlaid board.
    t.center.set(0.5, 0.5);
    t.rotation = ((Math.round(sq.position.x + sq.position.z) & 1) * Math.PI) / 2;
    (sq.material as MeshStandardMaterial).dispose();
    sq.material = new MeshPhysicalMaterial({ map: t, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  }
  const frame = new MeshPhysicalMaterial({ map: woodTexture("#4a2c18", "#24140a", 11, 1), roughness: 0.4, clearcoat: 0.6 });
  for (const w of board.walls) {
    (w.material as MeshStandardMaterial).dispose();
    w.material = frame;
  }

  // The table: walnut, with a square hole where the board stands (so a pit can still open in it).
  const top = new Shape();
  top.moveTo(-16, -9);
  top.lineTo(16, -9);
  top.lineTo(16, 9);
  top.lineTo(-16, 9);
  top.closePath();
  const hole = new Path();
  hole.moveTo(-4.7, -4.7);
  hole.lineTo(-4.7, 4.7);
  hole.lineTo(4.7, 4.7);
  hole.lineTo(4.7, -4.7);
  hole.closePath();
  top.holes.push(hole);
  // One walnut plank over the whole top: grain along the table's length, no joins.
  const tableTex = woodPanel("#8a5a30", "#3a2010", 13).clone();
  tableTex.repeat.set(1 / 32, 1 / 18);
  tableTex.offset.set(0.5, 0.5);
  const table = new Mesh(new ShapeGeometry(top).rotateX(-Math.PI / 2), new MeshPhysicalMaterial({ map: tableTex, roughness: 0.65, clearcoat: 0.12, clearcoatRoughness: 0.5 }));
  table.position.y = TABLE;
  table.receiveShadow = true;
  group.add(table);
  const clock = chessClock();
  clock.position.set(6.1, TABLE, 0);
  clock.rotation.y = -Math.PI / 2;
  group.add(clock);

  // A warm lamp overhead; far off, the other tables' lamps, soft and out of focus.
  // Off to one side and high, so its reflection in the varnish falls away from both players' view.
  const lamp = new PointLight(0xffd8a0, 12, 34, 1.6);
  lamp.position.set(9, 11, 0);
  group.add(lamp);
  const glowMat = new SpriteMaterial({ map: glowMap(), color: new Color(0xffc880), blending: AdditiveBlending, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 22 + Math.random() * 14;
    const s = new Sprite(glowMat);
    s.position.set(Math.cos(a) * r, 2 + Math.random() * 6, Math.sin(a) * r);
    s.scale.setScalar(1.5 + Math.random() * 2);
    group.add(s);
  }
  const prevBg = scene.background;
  scene.background = hallGradient();
  return {
    update() {},
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      glowMat.dispose();
    },
  };
}

let hallBg: CanvasTexture | null = null;
/** The hall in the dark: warm brown overhead, near black below. */
function hallGradient() {
  if (hallBg) return hallBg;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#2a1d14");
  grad.addColorStop(0.6, "#120c08");
  grad.addColorStop(1, "#060403");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  hallBg = new CanvasTexture(c);
  hallBg.colorSpace = SRGBColorSpace;
  return hallBg;
}

// ---------- The Epoch Drifters' home: Epoch Plains, in 3D and in 2D ----------

/** Fits a background picture (16:9) to cover a screen of w x h without stretching, cropping its sides or top and bottom. */
function cover(t: Texture, w: number, h: number) {
  const a = w / h / (16 / 9);
  if (a > 1) {
    t.repeat.set(1, 1 / a);
    t.offset.set(0, (1 - 1 / a) / 2);
  } else {
    t.repeat.set(a, 1);
    t.offset.set((1 - a) / 2, 0);
  }
}

const chunky = (c: HTMLCanvasElement, repeat?: number) => {
  const t = new CanvasTexture(c);
  t.magFilter = t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
};

/**
 * Epoch Plains: a floating island of meadow and pond in a dusk sky, under the
 * usual camera. The squares are the 2D game's tiles softened and detailed (as
 * HD-2D games keep their worlds sharp under chunky sprites), the island's rock
 * steps down beneath, and the painted world of floating islands over a sea of
 * cloud fills the screen behind. Warm low sun, a violet sky light, a cool rim
 * light to set the figures off, and pollen drifting.
 */
function epochPlains(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const smooth = (c: HTMLCanvasElement) => {
    const t = new CanvasTexture(c);
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const grass = [new MeshStandardMaterial({ map: smooth(hiTile("grass")), roughness: 1 }), new MeshStandardMaterial({ map: smooth(hiTile("grass2")), roughness: 1 })];
  const frames = [0, 1, 2, 3].map((i) => smooth(hiTile("water", i)));
  const water = new MeshStandardMaterial({ map: frames[0], emissive: new Color(0x0a2a55), emissiveMap: frames[0], emissiveIntensity: 0.5, roughness: 0.6 });
  let n = 0;
  for (const sq of board.squares.values()) {
    (sq.material as MeshStandardMaterial).dispose();
    sq.material = sq.userData.light ? grass[n++ % 3 === 0 ? 1 : 0] : water;
  }
  const rock = new MeshStandardMaterial({ map: chunky(cliff(32, 32), 3), roughness: 1 });
  for (const w of board.walls) {
    (w.material as MeshStandardMaterial).dispose();
    w.material = rock;
  }
  const FLOOR = -1.4;
  for (const [w, h, y] of [
    [9, 0.5, FLOOR + 0.5],
    [7.8, 0.7, FLOOR - 0.1],
    [6.4, 0.8, FLOOR - 0.85],
    [4.8, 0.9, FLOOR - 1.7],
  ] as const) {
    const b = new Mesh(new BoxGeometry(w, h, w), rock);
    b.position.y = y;
    b.receiveShadow = true;
    group.add(b);
  }
  const tip = new Mesh(new ConeGeometry(2.3, 3.2, 7), rock);
  tip.rotation.x = Math.PI;
  tip.position.y = FLOOR - 3.6;
  group.add(tip);
  const sun = new DirectionalLight(0xffc890, 1.3);
  sun.position.set(-7, 9, 6);
  const rim = new DirectionalLight(0x8ab4ff, 1.1);
  rim.position.set(5, 6, -9);
  const sky = new HemisphereLight(0xb7a8ff, 0x6a3d5a, 0.6);
  const lamp = new PointLight(0xffd9a0, 10, 14, 1.6);
  lamp.position.set(0, 3.2, 1);
  group.add(sun, rim, sky, lamp);
  // Pollen drifting in the light.
  const motes: { s: Sprite; home: Vector3; phase: number }[] = [];
  const moteMat = new SpriteMaterial({ map: glowMap(), color: new Color(0xfff0b0).multiplyScalar(1.2), blending: AdditiveBlending, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < 36; i++) {
    const s = new Sprite(moteMat);
    s.scale.setScalar(0.05 + Math.random() * 0.05);
    const home = new Vector3((Math.random() - 0.5) * 12, 0.4 + Math.random() * 3.5, (Math.random() - 0.5) * 12);
    group.add(s);
    motes.push({ s, home, phase: Math.random() * 20 });
  }
  const back = new Backdrop();
  back.draw(0);
  const bg = chunky(back.cv);
  const prevBg = scene.background;
  scene.background = bg;
  let t = 0;
  return {
    resize: (w, h) => cover(bg, w, h),
    update(ms) {
      t += ms / 1000;
      const f = frames[Math.floor(t * 4) % 4];
      water.map = water.emissiveMap = f;
      for (const m of motes) {
        const k = t * 0.15 + m.phase;
        m.s.position.set(m.home.x + Math.sin(k * 1.3) * 0.6, m.home.y + Math.sin(k * 0.9) * 0.3, m.home.z + Math.cos(k) * 0.6);
      }
      back.draw(t);
      bg.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      bg.dispose();
      moteMat.dispose();
    },
  };
}

/**
 * Epoch Plains (2D): the board as a 16-bit RPG draws it. The page's whole
 * picture (FlatMap: backdrop, the board's island, 32 x 24 pixel tiles) hangs
 * behind everything, square to the camera, and the camera is fixed far off at
 * the angle (asin 0.75) and lens at which a square covers its tile exactly, so
 * the figures of any tribe stand on the picture's tiles. The board itself is
 * hidden; the figures' shadows still fall on the tiles.
 */
function epochFlat(scene: Scene, board: Board): CourtSet {
  void board;
  const group = new Group();
  scene.add(group);
  const map = new FlatMap();
  map.draw(0);
  const tex = chunky(map.cv);
  // So far off, through so narrow a lens, that the view is all but flat: every square the same size, as on the picture.
  const D = 400;
  // 32 pixels to a square: the picture is 20 x 11.25 squares where the camera looks; further back it is scaled up to match.
  // Cut out (not blended), so it is drawn first, behind everything.
  const pic = new Mesh(new PlaneGeometry(Backdrop.W / 32, Backdrop.H / 32), new MeshBasicMaterial({ map: tex, alphaTest: 0.5, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  pic.renderOrder = -10;
  const back = 25;
  const look = new Vector3();
  const dir = new Vector3();
  pic.onBeforeRender = (_r, _s, camera) => {
    dir.copy(camera.position).sub(look.set(0, 0, 0));
    const d = dir.length();
    dir.normalize();
    pic.position.copy(look).addScaledVector(dir, -back);
    pic.scale.setScalar((d + back) / d);
    pic.lookAt(camera.position);
    pic.updateMatrixWorld(true);
  };
  group.add(pic);
  const shade = new Mesh(new PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new ShadowMaterial({ opacity: 0.35 }));
  shade.position.y = 0.002;
  shade.receiveShadow = true;
  group.add(shade);
  const sun = new DirectionalLight(0xffe2b8, 1.4);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  group.add(sun);
  // The world beyond fills the whole screen, as on the other boards.
  const sky = new Backdrop();
  sky.draw(0);
  const bg = chunky(sky.cv);
  const prev = scene.background;
  scene.background = bg;
  let t = 0;
  return {
    bare: true,
    view: { fixed: true, pitch: Math.asin(0.75), dist: D, fov: (2 * Math.atan(4.5 / D) * 180) / Math.PI, ty: 0 },
    resize: (w, h) => cover(bg, w, h),
    update(ms) {
      t += ms / 1000;
      map.draw(t);
      tex.needsUpdate = true;
      sky.draw(t);
      bg.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      scene.background = prev;
      tex.dispose();
      bg.dispose();
    },
  };
}

// ---------- The skins' courts: a sketchbook desk (Sketch), a back alley (Noir) ----------

/** A Meshy prop: loaded once, then each copy scaled to h tall, its foot at (x, y, z), turned rot. */
function prop(group: Group, url: string, h: number, x: number, y: number, z: number, rot = 0) {
  let p = props.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene as unknown as Group);
    props.set(url, p);
  }
  void p.then((src) => {
    if (!group.parent) return;
    const o = src.clone();
    o.rotation.y = rot;
    o.updateMatrixWorld(true);
    const box = new Box3().setFromObject(o);
    const k = h / (box.max.y - box.min.y);
    const c = box.getCenter(new Vector3());
    o.scale.setScalar(k);
    o.position.set(x - c.x * k, y - box.min.y * k, z - c.z * k);
    o.traverse((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    group.add(o);
  });
}

/** A seamless picture, repeated over a surface w by h (world units), size units to a tile. */
function tiled(url: string, w: number, h: number, size: number, o: { roughness?: number; metalness?: number; color?: number } = {}) {
  const m = new MeshStandardMaterial({ roughness: o.roughness ?? 0.9, metalness: o.metalness ?? 0, color: o.color ?? 0xffffff });
  void texture(url).then((t) => {
    const r = t.clone();
    r.wrapS = r.wrapT = RepeatWrapping;
    r.repeat.set(w / size, h / size);
    r.needsUpdate = true;
    m.map = r;
    m.needsUpdate = true;
  });
  return m;
}

/** The night through a window: a deep gradient, stars and a moon over rooftops' lit windows. */
function nightView() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, "#070a1c");
  grad.addColorStop(1, "#24305a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    g.fillRect(Math.random() * 256, Math.random() * 220, 1.5, 1.5);
  }
  g.fillStyle = "#fff4d8";
  g.beginPath();
  g.arc(180, 70, 16, 0, Math.PI * 2);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A square of sketchbook paper: faint grain and, for a dark square, pencil hatching both ways. */
function paperSquare(dark: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3eee1";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,110,90,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  if (dark) {
    g.strokeStyle = "rgba(40,40,48,0.8)";
    g.lineCap = "round";
    for (const dir of [1, -1])
      for (let k = -256; k < 512; k += 7) {
        g.lineWidth = 1.2 + Math.random() * 0.8;
        g.beginPath();
        g.moveTo(k + (Math.random() - 0.5) * 3, dir > 0 ? 0 : 256);
        g.lineTo(k + 256 * dir + (Math.random() - 0.5) * 3, dir > 0 ? 256 : 0);
        g.stroke();
      }
  }
  // A drawn edge, not quite straight.
  g.strokeStyle = "rgba(40,40,48,0.7)";
  g.lineWidth = 2.5;
  g.strokeRect(2 + Math.random() * 2, 2 + Math.random() * 2, 251 - Math.random() * 3, 251 - Math.random() * 3);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The pencil drawings of the game's characters, made by the Sketch skin (mockups/shelf.html?drawing=...). */
const DRAWINGS = [
  "stormcourt-k",
  "stormcourt-q",
  "stormcourt-n",
  "stormcourt-b",
  "thornwood-k",
  "thornwood-q",
  "thornwood-n",
  "thornwood-r",
  "epoch-drifters-n",
  "epoch-drifters-p",
  "epoch-drifters-q",
  "epoch-drifters-r",
];

/** A drawing on a sheet of paper, size wide, a touch below white so the lamp and glow keep it readable. */
function sheet(name: string, size: number) {
  const m = new MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.95, side: DoubleSide });
  void texture(art("sketch", `draw-${name}.webp`)).then((t) => {
    m.map = t;
    m.needsUpdate = true;
  });
  const s = new Mesh(new PlaneGeometry(size, size), m);
  s.receiveShadow = true;
  return s;
}

/**
 * The Sketch skin's court: a board drawn in pencil on sketchbook paper, on a
 * study desk in the middle of a bedroom at night. Half the game's characters lie
 * drawn on the desk, some slipped under the board, with pencils and an eraser;
 * the other half are pinned to a corkboard on the wall. A bed, a bookshelf, a
 * chair and a window on the night stand round the room; a desk lamp lights it.
 */
function sketchDesk(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const DESK = -1.42;
  const FLOOR = -16;
  const R = 34;
  const paper = [paperSquare(false), paperSquare(true)];
  for (const sq of board.squares.values()) {
    (sq.material as MeshStandardMaterial).dispose();
    // A touch below white, so the board's lamp-lit paper keeps its pencil.
    sq.material = new MeshStandardMaterial({ map: paper[sq.userData.light ? 0 : 1], color: 0xc8c2b4, roughness: 0.95 });
  }
  const edge = new MeshStandardMaterial({ map: paperSquare(false), color: 0xb8b2a4, roughness: 0.95 });
  for (const w of board.walls) {
    (w.material as MeshStandardMaterial).dispose();
    w.material = edge;
  }
  // The desk: an oak top on four legs, the board standing on it.
  const oak = woodPanel("#a87444", "#5a3418", 23).clone();
  const top = new Mesh(new BoxGeometry(26, 0.9, 16), new MeshStandardMaterial({ map: oak, roughness: 0.55 }));
  top.position.y = DESK - 0.45;
  top.receiveShadow = top.castShadow = true;
  group.add(top);
  const legMat = new MeshStandardMaterial({ color: 0x6a4424, roughness: 0.6 });
  for (const x of [-12, 12])
    for (const z of [-7, 7]) {
      const leg = new Mesh(new BoxGeometry(0.9, DESK - 0.9 - FLOOR, 0.9), legMat);
      leg.position.set(x, (DESK - 0.9 + FLOOR) / 2, z);
      leg.castShadow = true;
      group.add(leg);
    }
  // Six drawings on the desk round the board, some partly under it.
  (
    [
      [-7.6, -3.6, 0.28],
      [7.4, 3.2, -0.22],
      [7.8, -4.2, 0.14],
      [-7.8, 3.8, -0.36],
      [-1.5, 6.6, 0.1],
      [2.4, -6.4, -0.18],
    ] as const
  ).forEach(([x, z, rot], i) => {
    const s = sheet(DRAWINGS[i * 2], 4);
    s.rotation.set(-Math.PI / 2, 0, rot);
    s.position.set(x, DESK + 0.01 + i * 0.002, z);
    group.add(s);
  });
  // Pencils and an eraser.
  const yellow = new MeshStandardMaterial({ color: 0xf2c22a, roughness: 0.5 });
  const wood = new MeshStandardMaterial({ color: 0xe8c890, roughness: 0.8 });
  const lead = new MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4 });
  for (const [x, z, a] of [
    [9.5, -0.4, 0.4],
    [-9.6, 0.9, -1.1],
  ]) {
    const pencil = new Group();
    const body = new Mesh(new CylinderGeometry(0.12, 0.12, 3.2, 6).rotateZ(Math.PI / 2), yellow);
    const tip = new Mesh(new ConeGeometry(0.12, 0.4, 6).rotateZ(-Math.PI / 2), wood);
    tip.position.x = 1.8;
    const point = new Mesh(new ConeGeometry(0.04, 0.12, 6).rotateZ(-Math.PI / 2), lead);
    point.position.x = 2.02;
    pencil.add(body, tip, point);
    pencil.position.set(x, DESK + 0.12, z);
    pencil.rotation.y = a;
    pencil.traverse((o) => (o.castShadow = true));
    group.add(pencil);
  }
  const eraser = new Mesh(new BoxGeometry(1, 0.3, 0.5), new MeshStandardMaterial({ color: 0xff8aa8, roughness: 0.9 }));
  eraser.position.set(-9.2, DESK + 0.15, -1.2);
  eraser.rotation.y = 0.5;
  eraser.castShadow = true;
  group.add(eraser);
  prop(group, art("sketch", "desk-lamp.glb"), 9, -10.5, DESK, -5.5, 0.6);
  const lamp = new PointLight(0xffc888, 12, 40, 1.5);
  lamp.position.set(-8, 6, -3.5);
  lamp.castShadow = true;
  group.add(lamp);

  // The room: papered walls, plank floor, a plain ceiling, and a warm glow from above.
  const H = 46;
  const floorTex = woodTexture("#9a6a3e", "#5a3a1e", 31, 1).clone();
  floorTex.repeat.set(6, 6);
  floorTex.needsUpdate = true;
  const floor = new Mesh(new PlaneGeometry(2 * R, 2 * R).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  group.add(floor);
  const ceiling = new Mesh(new PlaneGeometry(2 * R, 2 * R).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1 }));
  ceiling.position.y = FLOOR + H;
  group.add(ceiling);
  const paperWall = tiled(art("sketch", "wallpaper.webp"), 2 * R, H, 9);
  for (const [x, z, ry] of [
    [0, -R, 0],
    [0, R, Math.PI],
    [-R, 0, Math.PI / 2],
    [R, 0, -Math.PI / 2],
  ]) {
    const w = new Mesh(new PlaneGeometry(2 * R, H), paperWall);
    w.position.set(x, FLOOR + H / 2, z);
    w.rotation.y = ry;
    w.receiveShadow = true;
    group.add(w);
  }
  // The window on the far wall, the night beyond.
  const win = new Mesh(new PlaneGeometry(14, 16), new MeshBasicMaterial({ map: nightView(), toneMapped: false }));
  win.position.set(-12, FLOOR + 24, -R + 0.05);
  group.add(win);
  const trim = new MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.6 });
  for (const [w, h, x, y] of [
    [15, 0.8, 0, 8.2],
    [15, 1.2, 0, -8.4],
    [0.8, 17, -7.3, 0],
    [0.8, 17, 7.3, 0],
    [14, 0.4, 0, 0],
    [0.4, 16, 0, 0],
  ]) {
    const b = new Mesh(new BoxGeometry(w, h, 0.5), trim);
    b.position.set(-12 + x, FLOOR + 24 + y, -R + 0.25);
    group.add(b);
  }
  const moon = new PointLight(0x9fb4ff, 30, 50, 1.5);
  moon.position.set(-12, FLOOR + 22, -R + 6);
  group.add(moon);
  // The corkboard on the far wall with the other six drawings pinned to it.
  const cork = new Mesh(new BoxGeometry(18, 12, 0.4), new MeshStandardMaterial({ color: 0xb48a58, roughness: 1 }));
  cork.position.set(11, FLOOR + 25, -R + 0.2);
  group.add(cork);
  const pin = new MeshStandardMaterial({ color: 0xd02030, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const s = sheet(DRAWINGS[i * 2 + 1], 5);
    s.position.set(11 - 5.6 + (i % 3) * 5.6, FLOOR + 27.8 - Math.floor(i / 3) * 5.6, -R + 0.45 + i * 0.01);
    s.rotation.z = (Math.random() - 0.5) * 0.12;
    group.add(s);
    const p = new Mesh(new SphereGeometry(0.22, 8, 6), pin);
    p.position.set(s.position.x, s.position.y + 2.2, -R + 0.6);
    group.add(p);
  }
  // The furniture round the room.
  prop(group, art("sketch", "bed.glb"), 12, -R + 12, FLOOR, 14, Math.PI / 2);
  prop(group, art("sketch", "bookshelf.glb"), 30, R - 5, FLOOR, -8, -Math.PI / 2);
  prop(group, art("sketch", "chair.glb"), 14, 3, FLOOR, 12, Math.PI);
  const room = new PointLight(0xffe2b8, 16, 90, 1.2);
  room.position.set(0, FLOOR + H - 4, 6);
  group.add(room, new HemisphereLight(0xfff0dc, 0x3a2614, 0.25));
  const prevBg = scene.background;
  scene.background = new Color(0x1a1410);
  return {
    update() {},
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      paper.forEach((t) => t.dispose());
      edge.dispose();
    },
  };
}

/**
 * The Noir skin's court: a 1950s back alley at night, one 3D model (Meshy,
 * from a diorama picture): two brick tenements meeting at a corner behind the
 * board, the Blue Dahlia's door and sign, fire escapes, crates, trash cans, a
 * street lamp in the gap between them. The board stands on the alley's open
 * cobble square, turned so the corner is straight ahead and the buildings rise
 * on both sides; the camera turns only so far as the buildings close the view.
 */
function backAlley(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const GROUND = -1.41;
  // Black lacquer on the board's sides.
  const lacquer = new MeshPhysicalMaterial({ color: 0x0c0c10, roughness: 0.25, clearcoat: 0.8 });
  for (const w of board.walls) {
    (w.material as MeshStandardMaterial).dispose();
    w.material = lacquer;
  }
  // The squares' marble in black and white, as the film shows it.
  // Each square keeps its own part of the marble (its texture's repeat, offset and turn); the picture under them is made gray once.
  const grays = new Map<unknown, CanvasTexture>();
  const used: Texture[] = [];
  for (const sq of board.squares.values()) {
    const was = sq.material as MeshStandardMaterial;
    const src = was.map;
    let map: Texture | null = null;
    if (src) {
      let gray = grays.get(src.image);
      if (!gray) {
        const img = src.image as CanvasImageSource & { width: number; height: number };
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d")!;
        g.filter = sq.userData.light ? "grayscale(1) brightness(1.05)" : "grayscale(1) brightness(0.55) contrast(1.3)";
        g.drawImage(img, 0, 0);
        gray = new CanvasTexture(c);
        gray.colorSpace = SRGBColorSpace;
        grays.set(src.image, gray);
      }
      map = gray.clone();
      map.wrapS = src.wrapS;
      map.wrapT = src.wrapT;
      map.repeat.copy(src.repeat);
      map.offset.copy(src.offset);
      map.rotation = src.rotation;
      map.anisotropy = 4;
      used.push(map);
    }
    sq.material = new MeshStandardMaterial({ map, roughness: was.roughness, metalness: was.metalness });
    was.dispose();
  }
  // The alley: the model is 2 across, its cobbles at -0.8 and their open square's middle at (0.29, 0.29); turned so its corner is straight ahead.
  const S = 11;
  const alley = new GLTFLoader().loadAsync(art("noir", "alley.glb")).then((g) => {
    if (!group.parent) return;
    const m = g.scene;
    m.scale.setScalar(S);
    m.rotation.y = -Math.PI / 4;
    m.position.set(0, GROUND + 0.8 * S, -0.41 * S);
    m.traverse((o) => {
      o.receiveShadow = true;
      o.castShadow = true;
      // Night: the picture's colors dimmed, the stone a little wet.
      const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
      // The game's sun and studio light are meant for the board; the alley takes less of them.
      if (mat?.color) {
        mat.color.setScalar(0.32);
        mat.roughness = 0.6;
        mat.metalness = 0;
        mat.envMapIntensity = 0.15;
        // The picture it was made from had a white background, left on a few walls as white patches: night sky instead.
        mat.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.004, 0.005, 0.008), smoothstep(0.2, 0.26, lum));`,
          );
        };
      }
    });
    group.add(m);
  });
  void alley;
  // The street beyond the model's edges, dark and wet, lost in the night's mist.
  const street = new Mesh(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.45 }));
  street.position.y = GROUND - 0.03;
  street.receiveShadow = true;
  group.add(street);
  // The street lamp in the gap at the back, warm; the speakeasy's sign on the left; a cold moon over the roofs.
  const lamp = new PointLight(0xffe2b0, 18, 45, 1.3);
  lamp.position.set(1.5, GROUND + 10, -15);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  const sign = new PointLight(0xc8d8ff, 14, 16, 1.5);
  sign.position.set(-9, GROUND + 5, -3);
  const moon = new DirectionalLight(0x8a9ab8, 0.3);
  moon.position.set(6, 20, 12);
  moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  moon.shadow.mapSize.set(1024, 1024);
  group.add(lamp, sign, moon, moon.target, new HemisphereLight(0x5a6478, 0x08080c, 0.12));
  const prevBg = scene.background;
  const prevFog = scene.fog;
  scene.background = new Color(0x050608);
  scene.fog = new Fog(0x050608, 28, 70);
  return {
    turn: 0.7,
    // Lower than the usual view, so the buildings rise behind the board.
    view: { fixed: false, pitch: 0.68, dist: 17, fov: 36, ty: 0 },
    orient(side) {
      // The corner stays straight ahead, whichever side the player has.
      group.rotation.y = side > 0 ? 0 : Math.PI;
    },
    update() {},
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      scene.fog = prevFog;
      lacquer.dispose();
      grays.forEach((t) => t.dispose());
      used.forEach((t) => t.dispose());
    },
  };
}

export const COURTS: Court[] = [
  { id: "staunton", name: "Tournament Hall", tribe: "staunton", top: "#4a3020", bottom: "#060403", dress: tournamentHall },
  { id: "epoch-drifters", name: "Epoch Plains", tribe: "epoch-drifters", top: "#c45a96", bottom: "#3b2a78", dress: epochPlains },
  { id: "epoch-flat", name: "Epoch Plains (2D)", tribe: "epoch-drifters", skin: "retro", top: "#c45a96", bottom: "#3b2a78", dress: epochFlat },
  ...BACKGROUNDS.map((b) => ({ id: b.id, name: b.name, top: b.top, bottom: b.bottom })),
  { id: "stormcourt", name: "Storm Keep", tribe: "stormcourt", top: "#3a3560", bottom: "#05060a", preview: art("stormcourt", "sky.webp"), dress: stormKeep },
  { id: "thornwood", name: "Heartwood Grove", tribe: "thornwood", top: "#1f3a28", bottom: "#020604", preview: art("thornwood", "forest.webp"), dress: heartwoodGrove },
  { id: "sketch", name: "Sketchbook Desk", skin: "sketch", top: "#6a4a30", bottom: "#1a120a", dress: sketchDesk },
  { id: "noir", name: "Back Alley", skin: "noir", top: "#2a2e38", bottom: "#05060a", preview: art("noir", "alley.webp"), dress: backAlley },
];

/** Courts being built: playable where asked for by id (the mock pages), not yet in the Collection or the lists. */
const DRAFT_COURTS: Court[] = [{ id: "wake", name: "The Wake", tribe: "restless", top: "#14262c", bottom: "#030708", preview: art("wake", "sky.webp"), dress: theWake }];

export const court = (id: string) => COURTS.find((c) => c.id === id) ?? DRAFT_COURTS.find((c) => c.id === id) ?? COURTS[0];

/** The plain courts' sky: their gradient. */
export const courtBackground = (id: string) => backgroundTexture(court(id).dress ? "night" : id);
