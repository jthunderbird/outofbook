// The Wake: the Restless's home court, a graveyard at night you stand in. The board
// is part of the ground (dark soil squares and broken-headstone squares); all round
// are swaying dead trees, headstones of every kind, crypts, a rusted fence and a few
// lanterns, in layers of drifting ground fog with wisps among them; beyond them the
// painted sky turns slowly with the moon crossing it, and the ruined castle stands in
// the haze behind the black side. Everything is made in code but the sky, the castle
// and the creatures that watch (pictures made with a free AI, cut out for this).
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Scene,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Board } from "./board";
import type { CourtSet } from "./courts";
import { glowMap } from "./figures";
import { headGeometry, headstone, stoneTexture, HEAD_KINDS, type HeadKind } from "./wake";

const ART = import.meta.glob<string>("../courts/wake/*", { eager: true, query: "?url", import: "default" });
const art = (file: string) => ART[`../courts/wake/${file}`];
const loaded = new Map<string, Promise<Texture>>();
function texture(url: string) {
  let t = loaded.get(url);
  if (!t) {
    t = new TextureLoader().loadAsync(url).then((x) => {
      x.colorSpace = SRGBColorSpace;
      x.anisotropy = 4;
      return x;
    });
    loaded.set(url, t);
  }
  return t;
}

/** A steady pseudo-random stream from a seed. */
function stream(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Weathered stone or soil: a base color, speckle and a few cracks. */
function groundTexture(base: [number, number, number], seed: number, cracks = 3) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = stream(seed);
  g.fillStyle = `rgb(${base})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const d = (r() - 0.5) * 44;
    g.fillStyle = `rgba(${base[0] + d},${base[1] + d},${base[2] + d},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  g.strokeStyle = "rgba(8,10,12,0.5)";
  g.lineWidth = 1.5;
  for (let k = 0; k < cracks; k++) {
    g.beginPath();
    let x = r() * 256;
    let y = 0;
    g.moveTo(x, y);
    for (let i = 0; i < 8; i++) {
      x += (r() - 0.5) * 50;
      y += 20 + r() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Dark bark with long ridges, to wrap along a branch. */
function barkTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  const r = stream(77);
  g.fillStyle = "rgb(46,40,38)";
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 90; i++) {
    const x = r() * 128;
    const w = 1 + r() * 4;
    const l = 40 + r() * 160;
    const y = r() * 256;
    const d = (r() - 0.5) * 60;
    g.fillStyle = `rgba(${46 + d},${40 + d},${38 + d},0.8)`;
    g.fillRect(x, y, w, l);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** One dead tree: a gnarled trunk with roots, forking twisting branches, merged into one geometry. `h` of each vertex is 0 at the foot to 1 at the top (for swaying). */
function treeGeometry(seed: number) {
  const r = stream(seed);
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const segment = (a: Vector3, b: Vector3, r0: number, r1: number) => {
    const len = a.distanceTo(b);
    const g = new CylinderGeometry(r1, r0, len, 5, 1, true);
    const q = new Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  };
  const branch = (from: Vector3, dir: Vector3, len: number, radius: number, depth: number) => {
    const n = depth === 0 ? 6 : 4;
    const p = from.clone();
    const d = dir.clone();
    let rad = radius;
    for (let i = 0; i < n; i++) {
      d.add(new Vector3((r() - 0.5) * 0.55, (r() - 0.5) * 0.3 + (depth === 0 ? 0.08 : -0.03), (r() - 0.5) * 0.55)).normalize();
      const end = p.clone().addScaledVector(d, len / n);
      const radEnd = rad * (depth === 0 ? 0.84 : 0.7);
      segment(p, end, rad, radEnd);
      if (depth < 4 && i >= (depth === 0 ? 1 : 1) && r() < 0.72) {
        const side = new Vector3(r() - 0.5, (r() - 0.3) * 0.5, r() - 0.5).normalize();
        const cd = d.clone().multiplyScalar(0.55).addScaledVector(side, 0.85).normalize();
        branch(end, cd, len * (0.5 + r() * 0.2), radEnd * 0.72, depth + 1);
      }
      p.copy(end);
      rad = radEnd;
    }
  };
  // Roots that grip the ground, then the trunk.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    segment(new Vector3(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5), new Vector3(0, 0.9, 0), 0.07, 0.22);
  }
  branch(new Vector3(0, 0.8, 0), new Vector3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize(), 5.5 + r() * 2.5, 0.46, 0);
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geo.computeBoundingBox();
  const top = geo.boundingBox!.max.y;
  const pos = geo.getAttribute("position");
  const h: number[] = [];
  for (let i = 0; i < pos.count; i++) h.push(Math.max(0, pos.getY(i)) / top);
  geo.setAttribute("sway", new Float32BufferAttribute(h, 1));
  return geo;
}

/** A wide soft ground fog: slow noise, thin near the board. */
function fogLayer(color: number, alpha: number, scale: number, speed: number, time: { value: number }) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time, uColor: { value: new Color(color) }, uAlpha: { value: alpha }, uScale: { value: scale }, uSpeed: { value: speed } },
    vertexShader: "varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uAlpha; uniform float uScale; uniform float uSpeed; varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
      void main(){
        vec2 p = vWorld.xz * uScale + vec2(uTime * uSpeed, uTime * uSpeed * 0.6);
        float n = smoothstep(0.32, 0.78, fbm(p));
        float d = length(vWorld.xz);
        float clear = smoothstep(3.5, 12.0, d);
        float far = 1.0 - smoothstep(55.0, 85.0, d);
        gl_FragColor = vec4(uColor, n * uAlpha * clear * far);
      }`,
  });
}

/** A soft round glow. */
function glow(color: number, opacity: number, w: number, h: number, additive = false) {
  const s = new Sprite(new SpriteMaterial({ map: glowMap(), color, opacity, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : undefined, toneMapped: false }));
  s.scale.set(w, h, 1);
  return s;
}

/** The creatures that watch from the dark: file, height, angle behind the board (deg), distance, lift, and how it behaves. */
const WATCHERS: [string, number, number, number, number, "peek" | "perch" | "float"][] = [
  ["zombie", 2.2, -62, 11, 0, "peek"],
  ["ghost", 3.1, -38, 13, 0.5, "float"],
  ["brute", 3.4, 8, 15, 0, "peek"],
  ["wraith", 3.2, 36, 12, 0.6, "float"],
  ["hound", 1.25, 62, 10, 0, "peek"],
  ["crawler", 1.5, -18, 9.6, 0, "peek"],
  ["zombie", 2.0, 80, 12.5, 0, "peek"],
  ["wraith", 2.9, -84, 13, 0.5, "float"],
  ["crow", 0.55, 24, 8.8, 0, "perch"],
  ["crow", 0.5, -50, 8.6, 0, "perch"],
  ["owl", 1.0, 0, 11, 3.6, "float"],
];

const GROUND = -0.02;
/** The haze: far ground, far trees and the sky's foot all meet in it. */
const HAZE = 0x3b6068;

export function theWake(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const dispose: { dispose(): void }[] = [];
  const rng = stream(2024);
  const time = { value: 0 };

  // ----- The board in the ground -----
  const squares = new Set(board.squares.values());
  for (const o of board.group.children) if (!squares.has(o as Mesh)) o.visible = false;
  const gravel = [0, 1, 2].map((i) => groundTexture([104 + i * 4, 112, 110], 200 + i * 40));
  const dirt = [0, 1, 2, 3].map((i) => groundTexture([36, 30, 27], 500 + i * 40));
  dispose.push(...gravel, ...dirt);
  const lightAt: Vector3[] = [];
  const darkAt: Vector3[] = [];
  for (const sq of board.squares.values()) {
    const was = sq.material as MeshStandardMaterial;
    const pool = sq.userData.light ? gravel : dirt;
    const map = pool[Math.floor(rng() * pool.length)].clone();
    map.needsUpdate = true;
    map.repeat.set(0.4, 0.4);
    map.offset.set(rng() * 0.6, rng() * 0.6);
    map.wrapS = map.wrapT = RepeatWrapping;
    dispose.push(map);
    sq.material = new MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
    was.dispose();
    (sq.userData.light ? lightAt : darkAt).push(sq.position.clone());
  }
  // Broken stone standing up from the pale squares, pebbles on the dirt, and a rim of fallen stone round the plot.
  const chunkGeo = new DodecahedronGeometry(0.5, 0);
  const chunkMat = new MeshStandardMaterial({ color: 0x5c6460, roughness: 1, flatShading: true });
  const total = lightAt.length * 7 + darkAt.length * 3 + 110;
  const chunks = new InstancedMesh(chunkGeo, chunkMat, total);
  const m4 = new Matrix4();
  const q4 = new Quaternion();
  const eu = new Euler();
  let n = 0;
  const chunk = (x: number, z: number, w: number, h: number, d: number, tint: number) => {
    eu.set((rng() - 0.5) * 0.7, rng() * 6.3, (rng() - 0.5) * 0.7);
    q4.setFromEuler(eu);
    m4.compose(new Vector3(x, h * 0.18, z), q4, new Vector3(w, h, d));
    chunks.setMatrixAt(n, m4);
    chunks.setColorAt(n, new Color().setScalar(tint));
    n++;
  };
  for (const p of lightAt) for (let i = 0; i < 7; i++) chunk(p.x + (rng() - 0.5) * 0.8, p.z + (rng() - 0.5) * 0.8, 0.14 + rng() * 0.24, 0.06 + rng() * 0.12, 0.14 + rng() * 0.22, 0.6 + rng() * 0.6);
  for (const p of darkAt) for (let i = 0; i < 3; i++) chunk(p.x + (rng() - 0.5) * 0.8, p.z + (rng() - 0.5) * 0.8, 0.07 + rng() * 0.09, 0.04 + rng() * 0.05, 0.07 + rng() * 0.09, 0.4 + rng() * 0.3);
  for (let i = 0; i < 110 && n < total; i++) {
    const side = Math.floor(rng() * 4);
    const along = (rng() - 0.5) * 9.4;
    const out = 4.15 + rng() * 0.7;
    chunk(side < 2 ? along : (side === 2 ? -1 : 1) * out, side < 2 ? (side === 0 ? -1 : 1) * out : along, 0.25 + rng() * 0.45, 0.15 + rng() * 0.3, 0.25 + rng() * 0.35, 0.5 + rng() * 0.5);
  }
  chunks.count = n;
  chunks.instanceMatrix.needsUpdate = true;
  if (chunks.instanceColor) chunks.instanceColor.needsUpdate = true;
  chunks.receiveShadow = true;
  chunks.frustumCulled = false;
  group.add(chunks);
  dispose.push(chunkGeo, chunkMat, chunks);

  // ----- Ground -----
  const soilMap = groundTexture([38, 33, 30], 900);
  soilMap.repeat.set(30, 30);
  const soil = new MeshStandardMaterial({ map: soilMap, color: 0x8c8a84, roughness: 1 });
  const ground = new Mesh(new CircleGeometry(95, 64).rotateX(-Math.PI / 2), soil);
  ground.position.y = GROUND;
  ground.receiveShadow = true;
  group.add(ground);
  dispose.push(soil, soilMap, ground.geometry);

  // ----- Sky, turning slowly, and the moon -----
  const skyMat = new MeshBasicMaterial({ side: BackSide, fog: false });
  const cloudMat = new MeshBasicMaterial({ side: BackSide, fog: false, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false });
  void texture(art("sky.webp")).then((t) => {
    const a = t.clone();
    a.wrapS = MirroredRepeatWrapping;
    a.repeat.set(2, 2);
    a.offset.set(0, -1);
    a.needsUpdate = true;
    skyMat.map = a;
    skyMat.needsUpdate = true;
    const b = t.clone();
    b.wrapS = MirroredRepeatWrapping;
    b.repeat.set(3, 2);
    b.offset.set(0.3, -1);
    b.needsUpdate = true;
    cloudMat.map = b;
    cloudMat.needsUpdate = true;
  });
  const sky = new Mesh(new SphereGeometry(100, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), skyMat);
  const clouds = new Mesh(new SphereGeometry(94, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat);
  for (const m of [sky, clouds]) {
    m.position.y = GROUND - 2;
    group.add(m);
  }
  sky.renderOrder = -10;
  clouds.renderOrder = -9;
  dispose.push(skyMat, cloudMat, sky.geometry, clouds.geometry);
  const moonMat = new SpriteMaterial({ fog: false, transparent: true, depthWrite: false });
  void texture(art("moon.webp")).then((t) => {
    moonMat.map = t;
    moonMat.needsUpdate = true;
  });
  const moonSprite = new Sprite(moonMat);
  moonSprite.scale.setScalar(13);
  moonSprite.renderOrder = -8;
  const halo = glow(0x9ae8ff, 0.3, 40, 40, true);
  halo.renderOrder = -8;
  group.add(moonSprite, halo);
  dispose.push(moonMat, halo.material);

  // ----- The ruined castle, far off behind the black side, in the haze -----
  const castleMat = new MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false, color: 0xbcd0d4, opacity: 0.85 });
  void texture(art("woods-castle.webp")).then((t) => {
    castleMat.map = t;
    castleMat.needsUpdate = true;
  });
  const castle = new Mesh(new PlaneGeometry(46, 56), castleMat);
  castle.position.set(8, GROUND + 20, -78);
  castle.renderOrder = -7;
  group.add(castle);
  dispose.push(castleMat, castle.geometry);

  // ----- Dead trees all round, swaying -----
  const bark = barkTexture();
  const barkMat = new MeshStandardMaterial({ map: bark, color: 0x9a928a, roughness: 1, side: DoubleSide });
  barkMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float sway;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.5;
        float amt = sway * sway;
        transformed.x += sin(uTime * 0.8 + ph + sway * 2.0) * amt * 0.55 + sin(uTime * 2.3 + ph * 2.0) * amt * sway * 0.08;
        transformed.z += cos(uTime * 0.6 + ph * 1.3) * amt * 0.4;`,
    );
  };
  dispose.push(bark, barkMat);
  const variants = [11, 23, 37, 51, 67].map((s) => treeGeometry(s));
  const perVariant = [10, 10, 10, 10, 10];
  variants.forEach((geo, v) => {
    const mesh = new InstancedMesh(geo, barkMat, perVariant[v] * 2);
    let k = 0;
    for (let i = 0; i < perVariant[v] * 2; i++) {
      // Near ones stand beyond the camera's reach; far ones thin out into the haze.
      const near = i < perVariant[v];
      const a = rng() * Math.PI * 2;
      const d = near ? 18 + rng() * 10 : 30 + rng() * 40;
      const sc = (near ? 1.0 : 1.4) + rng() * 0.8;
      eu.set((rng() - 0.5) * 0.12, rng() * 6.3, (rng() - 0.5) * 0.12);
      q4.setFromEuler(eu);
      m4.compose(new Vector3(Math.sin(a) * d, GROUND - 0.1, Math.cos(a) * d), q4, new Vector3(sc, sc * (0.9 + rng() * 0.4), sc));
      mesh.setMatrixAt(k++, m4);
    }
    mesh.frustumCulled = false;
    group.add(mesh);
    dispose.push(geo, mesh);
  });

  // ----- Headstones of every kind and size (a few draws): leaning, sunk, a few fallen -----
  const weight: HeadKind[] = ["arch", "arch", "arch", "slab", "slab", "round", "round", "cross", "cross", "stump", "stump", "obelisk", "tomb", "pillar"];
  const size: Record<HeadKind, [number, number]> = {
    arch: [0.7, 1.7],
    slab: [0.6, 1.6],
    round: [0.6, 1.5],
    obelisk: [0.8, 1.7],
    cross: [0.7, 1.9],
    stump: [0.8, 1.8],
    tomb: [0.8, 1.6],
    pillar: [0.9, 2.1],
  };
  const stones = new Map<HeadKind, Matrix4[]>();
  for (let i = 0; i < 80; i++) {
    const a = rng() * Math.PI * 2;
    const r = 5.6 + Math.pow(rng(), 0.8) * 11;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const kind = weight[Math.floor(rng() * weight.length)];
    let sc = size[kind][0] + rng() * (size[kind][1] - size[kind][0]);
    // Nothing tall between the camera and the board, whichever side it stands on.
    if (Math.abs(z) > 4.4 && Math.abs(x) < 8) sc = Math.min(sc, 0.75);
    const wob = rng() < 0.2 ? 0.45 : 0.18;
    const fallen = rng() < 0.07 && kind !== "tomb";
    eu.set(fallen ? -1.35 : (rng() - 0.5) * wob, Math.atan2(-x, -z) + (rng() - 0.5) * 0.9, fallen ? 0.2 : (rng() - 0.5) * wob * 1.4);
    q4.setFromEuler(eu);
    const m = new Matrix4().compose(new Vector3(x, GROUND - rng() * 0.18 * sc, z), q4, new Vector3(sc * (0.85 + rng() * 0.35), sc * (0.8 + rng() * 0.5), sc));
    stones.set(kind, [...(stones.get(kind) ?? []), m]);
  }
  const stoneMats = [0, 1, 2, 3].map((v) => {
    const m = new MeshStandardMaterial({ map: stoneTexture("b", v), color: 0x7c8284, roughness: 0.95 });
    dispose.push(m);
    return m;
  });
  HEAD_KINDS.forEach((kind, ki) => {
    const list = stones.get(kind);
    if (!list?.length) return;
    const mesh = new InstancedMesh(headGeometry(kind), stoneMats[ki % 4], list.length);
    list.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new Color().setScalar(0.55 + rng() * 0.6));
    });
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    dispose.push(mesh);
  });

  // ----- Crypts, a rusted fence, lanterns -----
  const stoneMat = new MeshStandardMaterial({ map: groundTexture([88, 94, 96], 77), color: 0x80888a, roughness: 1 });
  const darkMat = new MeshStandardMaterial({ color: 0x050808, roughness: 1 });
  const doorGlow = new MeshBasicMaterial({ color: 0x4af0c8, transparent: true, opacity: 0.5, toneMapped: false });
  dispose.push(stoneMat, darkMat, doorGlow);
  const crypt = (x: number, z: number, scale: number) => {
    const g = new Group();
    const add = (geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, px: number, py: number, pz: number) => {
      const m = new Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      dispose.push(geo);
      return m;
    };
    add(new BoxGeometry(3.6, 0.4, 3), stoneMat, 0, 0.2, 0);
    add(new BoxGeometry(3.2, 2.4, 2.6), stoneMat, 0, 1.6, 0);
    const roof = new Shape();
    roof.moveTo(-1.9, 0);
    roof.lineTo(1.9, 0);
    roof.lineTo(0, 1.3);
    const rg = new (class extends BufferGeometry {})();
    void rg;
    const prism = new Mesh(new ShapeGeometry(roof), stoneMat);
    prism.position.set(0, 2.8, 1.5);
    g.add(prism);
    const back = prism.clone();
    back.position.z = -1.5;
    g.add(back);
    add(new BoxGeometry(3.9, 0.12, 3.2), stoneMat, 0, 2.86, 0).rotation.z = 0;
    // The doorway: a dark arch with a cold glow inside.
    const arch = new Shape();
    arch.moveTo(-0.55, 0);
    arch.lineTo(0.55, 0);
    arch.lineTo(0.55, 1.1);
    arch.absarc(0, 1.1, 0.55, 0, Math.PI, false);
    arch.lineTo(-0.55, 0);
    const door = new Mesh(new ShapeGeometry(arch), darkMat);
    door.position.set(0, 0.4, 1.32);
    g.add(door);
    const inner = new Mesh(new ShapeGeometry(arch), doorGlow);
    inner.scale.setScalar(0.78);
    inner.position.set(0, 0.45, 1.33);
    g.add(inner);
    dispose.push(door.geometry, inner.geometry, prism.geometry);
    for (const s of [-1, 1]) add(new CylinderGeometry(0.16, 0.2, 2.4, 8), stoneMat, s * 1.05, 1.6, 1.4);
    g.position.set(x, GROUND, z);
    g.rotation.y = Math.atan2(-x, -z);
    g.scale.setScalar(scale);
    group.add(g);
  };
  crypt(-14, -15, 1.3);
  crypt(17, -11, 1.1);
  crypt(-3, 21, 1.2);
  // Fence: bars with spear tips and two rails, in broken runs round the graveyard.
  const barGeo = new BoxGeometry(0.05, 1.5, 0.05);
  const tipGeo = new ConeGeometry(0.06, 0.2, 4);
  const railGeo = new BoxGeometry(1, 0.05, 0.05);
  const ironMat = new MeshStandardMaterial({ color: 0x1c1a1a, roughness: 0.7, metalness: 0.5 });
  dispose.push(barGeo, tipGeo, railGeo, ironMat);
  const runs = [
    [-150, -95],
    [-70, -20],
    [10, 55],
    [85, 130],
    [160, 200],
    [230, 275],
  ];
  const bars: Matrix4[] = [];
  const rails: Matrix4[] = [];
  for (const [a0, a1] of runs) {
    const R = 15.5;
    for (let a = a0; a < a1; a += 1.8) {
      if (rng() < 0.12) continue;
      const ar = (a * Math.PI) / 180;
      eu.set((rng() - 0.5) * 0.08, ar, (rng() - 0.5) * (rng() < 0.15 ? 0.6 : 0.06));
      q4.setFromEuler(eu);
      bars.push(new Matrix4().compose(new Vector3(Math.sin(ar) * R, GROUND + 0.75, Math.cos(ar) * R), q4, new Vector3(1, 0.8 + rng() * 0.35, 1)));
    }
    for (const hgt of [0.35, 1.1])
      for (let a = a0; a < a1 - 5; a += 5.6) {
        const ar = ((a + 2.8) * Math.PI) / 180;
        eu.set(0, ar + Math.PI / 2, 0);
        q4.setFromEuler(eu);
        rails.push(new Matrix4().compose(new Vector3(Math.sin(ar) * R, GROUND + hgt, Math.cos(ar) * R), q4, new Vector3(1.55, 1, 1)));
      }
  }
  for (const [geo, list] of [
    [barGeo, bars],
    [railGeo, rails],
  ] as const) {
    const mesh = new InstancedMesh(geo, ironMat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    group.add(mesh);
    dispose.push(mesh);
  }
  const tips = new InstancedMesh(tipGeo, ironMat, bars.length);
  bars.forEach((m, i) => {
    const p = new Vector3().setFromMatrixPosition(m);
    const s = new Vector3().setFromMatrixScale(m);
    tips.setMatrixAt(i, new Matrix4().makeTranslation(p.x, p.y + 0.75 * s.y + 0.1, p.z));
  });
  tips.frustumCulled = false;
  group.add(tips);
  dispose.push(tips);
  // Lanterns on iron posts, their light shaking.
  const lamps: { light: PointLight; bloom: Sprite; phase: number }[] = [];
  for (const [x, z] of [
    [-7.5, -8],
    [8.5, -7],
  ]) {
    const post = new Mesh(new CylinderGeometry(0.05, 0.07, 2.6, 6), ironMat);
    post.position.set(x, GROUND + 1.3, z);
    const lantern = new Mesh(new BoxGeometry(0.28, 0.4, 0.28), new MeshBasicMaterial({ color: 0xffb860, toneMapped: false }));
    lantern.position.set(x, GROUND + 2.75, z);
    const light = new PointLight(0xffa850, 6, 12, 1.6);
    light.position.set(x, GROUND + 2.7, z);
    const bloom = glow(0xffa850, 0.55, 1.8, 1.8, true);
    bloom.position.copy(lantern.position);
    group.add(post, lantern, light, bloom);
    dispose.push(post.geometry, lantern.geometry, lantern.material as MeshBasicMaterial, bloom.material);
    lamps.push({ light, bloom, phase: rng() * 10 });
  }

  // ----- The watchers: each behind a stone of its own, looking out now and then -----
  interface Watcher {
    s: Sprite;
    mat: SpriteMaterial;
    hidden: Vector3;
    tan: Vector3;
    h: number;
    w: number;
    kind: "peek" | "perch" | "float";
    period: number;
    phase: number;
    side: number;
  }
  const watchers: Watcher[] = [];
  WATCHERS.forEach(([file, h, deg, dist, lift, kind], i) => {
    const url = art(`watch-${file}.webp`);
    if (!url) return;
    const a = Math.PI + (deg * Math.PI) / 180;
    const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
    const mat = new SpriteMaterial({ color: 0x9fb4bc, transparent: true, alphaTest: 0.14 });
    const s = new Sprite(mat);
    s.center.set(0.5, 0);
    const w: Watcher = {
      s,
      mat,
      hidden: dir
        .clone()
        .multiplyScalar(dist + 0.9)
        .setY(GROUND + lift),
      tan: new Vector3(dir.z, 0, -dir.x),
      h,
      w: h,
      kind,
      period: 14 + rng() * 16,
      phase: rng(),
      side: rng() < 0.5 ? -1 : 1,
    };
    void texture(url).then((t) => {
      mat.map = t;
      mat.needsUpdate = true;
      const img = t.image as { width: number; height: number };
      w.w = (h * img.width) / img.height;
    });
    const { group: cover } = headstone("b", [0, 0.02], kind === "perch" ? "slab" : i % 2 ? "slab" : "pillar", i % 4);
    const wide = kind === "perch" ? 1.0 : h > 2.5 ? 2.2 : 3.2;
    cover.scale.set(kind === "perch" ? 1.2 : wide / 0.7, kind === "perch" ? 1.0 : Math.max(1.2, h * 0.85 + 0.3), kind === "perch" ? 1.2 : 1.6);
    cover.position.copy(dir.clone().multiplyScalar(dist)).setY(GROUND - 0.05);
    cover.rotation.y = Math.atan2(-dir.x, -dir.z);
    group.add(cover);
    if (kind === "perch") w.hidden.copy(dir.clone().multiplyScalar(dist)).setY(GROUND + 1.05);
    group.add(s);
    s.position.copy(w.hidden);
    dispose.push(mat);
    watchers.push(w);
  });

  // A witch crosses the sky now and then, bats now and then.
  const witch = new Sprite(new SpriteMaterial({ fog: false, transparent: true, color: 0x020608 }));
  void texture(art("witch.webp")).then((t) => {
    witch.material.map = t;
    witch.material.needsUpdate = true;
  });
  witch.scale.set(3.4, 2.1, 1);
  witch.visible = false;
  const flock = new Sprite(new SpriteMaterial({ fog: false, transparent: true, color: 0x050a0c, opacity: 0.9 }));
  void texture(art("watch-bats.webp")).then((t) => {
    flock.material.map = t;
    flock.material.needsUpdate = true;
  });
  flock.scale.set(7, 5.2, 1);
  flock.visible = false;
  group.add(witch, flock);
  dispose.push(witch.material, flock.material);

  // ----- Fog on the ground, in layers, and wisps -----
  const layers = [
    { y: 0.12, color: 0x6a9096, alpha: 0.5, scale: 0.12, speed: 0.012 },
    { y: 0.7, color: 0x547c84, alpha: 0.4, scale: 0.08, speed: -0.008 },
    { y: 1.5, color: 0x486c76, alpha: 0.3, scale: 0.05, speed: 0.006 },
  ].map((l) => {
    const m = fogLayer(l.color, l.alpha, l.scale, l.speed, time);
    const p = new Mesh(new PlaneGeometry(190, 190).rotateX(-Math.PI / 2), m);
    p.position.y = GROUND + l.y;
    p.renderOrder = 2;
    group.add(p);
    dispose.push(m, p.geometry);
    return p;
  });
  void layers;
  const wisps = Array.from({ length: 22 }, (_, i) => {
    const s = glow(i % 3 ? 0x7af0d0 : 0x9ad0ff, 0.7, 0.35, 0.35, true);
    group.add(s);
    dispose.push(s.material);
    const a = rng() * Math.PI * 2;
    const d = 6 + rng() * 22;
    return { s, home: new Vector3(Math.sin(a) * d, GROUND + 0.6 + rng() * 1.8, Math.cos(a) * d), phase: rng() * 20, speed: 0.15 + rng() * 0.25 };
  });

  // ----- Light -----
  const moonLight = new DirectionalLight(0x9ad0e0, 1.0);
  moonLight.castShadow = true;
  Object.assign(moonLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
  moonLight.shadow.mapSize.set(1024, 1024);
  const hemi = new HemisphereLight(0x5a8a98, 0x0a1210, 0.55);
  group.add(moonLight, moonLight.target, hemi);

  const prevBg = scene.background;
  const prevFog = scene.fog;
  scene.background = new Color(HAZE);
  scene.fog = new Fog(HAZE, 9, 70);

  const ease3 = (x: number) => x * x * (3 - 2 * x);
  let t = 0;
  let nextWitch = 5000;
  let witchAt = -1;
  let nextFlock = 14000;
  let flockAt = -1;
  let nextBolt = 20000;
  return {
    // The rubble stands up to about 0.1 from the pale squares.
    markY: 0.12,
    view: { fixed: false, pitch: 0.28, dist: 16, fov: 50, ty: 1.8 },
    orient(side) {
      group.rotation.y = side > 0 ? 0 : Math.PI;
    },
    update(ms) {
      t += ms;
      const s = t / 1000;
      time.value = s;
      sky.rotation.y = s * 0.0016;
      clouds.rotation.y = -s * 0.0034;
      // The moon: round the sky behind the black side, a little up and down.
      const az = Math.PI + Math.sin(s * 0.0035) * 2.2;
      const el = 0.42 + 0.06 * Math.sin(s * 0.011);
      moonSprite.position.set(Math.sin(az) * Math.cos(el) * 88, GROUND + Math.sin(el) * 88, Math.cos(az) * Math.cos(el) * 88);
      halo.position.copy(moonSprite.position);
      halo.material.opacity = 0.26 + 0.05 * Math.sin(s * 0.5);
      moonLight.position.copy(moonSprite.position).multiplyScalar(0.2);
      // Lightning, rarely: the sky and the light jump.
      let flash = 0;
      if (t > nextBolt) {
        const k = (t - nextBolt) / 700;
        if (k > 1) nextBolt = t + 25000 + Math.random() * 35000;
        else flash = Math.max(0, Math.sin(k * 18) * (1 - k)) * 0.9;
      }
      hemi.intensity = 0.55 + flash * 1.4;
      skyMat.color.setScalar(1 + flash * 1.4);
      for (const l of lamps) {
        const f = 0.8 + 0.2 * Math.sin(s * 9 + l.phase) * Math.sin(s * 5.3 + l.phase * 2) + (Math.random() - 0.5) * 0.08;
        l.light.intensity = 6 * f;
        l.bloom.material.opacity = 0.45 * f;
      }
      for (const w of wisps) {
        const k = s * w.speed + w.phase;
        w.s.position.set(w.home.x + Math.sin(k) * 2.2, w.home.y + Math.sin(k * 1.7) * 0.4, w.home.z + Math.cos(k * 0.8) * 2.2);
        w.s.material.opacity = 0.35 + 0.35 * Math.sin(k * 2.3);
      }
      for (const w of watchers) {
        const u = (s / w.period + w.phase) % 1;
        const out = w.kind === "peek" ? (u < 0.4 ? 0 : u < 0.5 ? ease3((u - 0.4) / 0.1) : u < 0.78 ? 1 : u < 0.86 ? 1 - ease3((u - 0.78) / 0.08) : 0) : 0;
        const sway = Math.sin(s * 1.3 + w.phase * 20);
        const p = w.hidden.clone().addScaledVector(w.tan, w.side * (out * 1.7 + out * Math.sin(s * 0.6 + w.phase * 9) * 0.35));
        let breathe = 1 + 0.025 * Math.sin(s * 2.2 + w.phase * 11);
        if (w.kind === "float") {
          p.y += Math.sin(s * 0.7 + w.phase * 6) * 0.25 + 0.15;
          p.addScaledVector(w.tan, Math.sin(s * 0.25 + w.phase * 5) * 1.5);
          w.mat.opacity = 0.75 + 0.25 * Math.sin(s * 0.9 + w.phase * 8);
        } else if (w.kind === "perch") {
          p.y += Math.max(0, Math.sin(s * 1.9 + w.phase * 13)) > 0.96 ? 0.07 : 0;
          breathe = 1 + 0.06 * Math.max(0, Math.sin(s * 0.8 + w.phase * 5));
        } else p.y += out * Math.abs(Math.sin(s * 3 + w.phase * 7)) * 0.05;
        w.s.position.copy(p);
        w.mat.rotation = sway * 0.035 * (0.4 + out);
        w.s.scale.set(w.w * breathe * (w.side < 0 ? -1 : 1), w.h * (2 - breathe), 1);
      }
      if (witchAt < 0 && t > nextWitch) witchAt = t;
      if (witchAt >= 0) {
        const k = (t - witchAt) / 18000;
        if (k >= 1) {
          witch.visible = false;
          witchAt = -1;
          nextWitch = t + 40000 + Math.random() * 40000;
        } else {
          witch.visible = true;
          witch.position.set(-60 + 120 * k, GROUND + 26 + Math.sin(k * 9) * 1.4, -70);
        }
      }
      if (flockAt < 0 && t > nextFlock) flockAt = t;
      if (flockAt >= 0) {
        const k = (t - flockAt) / 22000;
        if (k >= 1) {
          flock.visible = false;
          flockAt = -1;
          nextFlock = t + 25000 + Math.random() * 35000;
        } else {
          flock.visible = true;
          flock.position.set(55 - 110 * k, GROUND + 20 + Math.sin(k * 14) * 1.2, -68);
        }
      }
    },
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      scene.fog = prevFog;
      dispose.forEach((d) => d.dispose());
    },
  };
}
