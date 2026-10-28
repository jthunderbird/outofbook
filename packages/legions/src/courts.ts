// Courts: a board and the scenery around it, which come (and unlock) together.
// Every tribe has a home court; the plain ones are the classic marble board under
// a gradient sky. A court dresses the board the scene built (its squares and
// walls) and adds its scenery; the scene updates it each frame and takes it all
// away again for another court. Art made with Meshy AI lives in ../courts/<id>/.
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  RepeatWrapping,
  ShaderMaterial,
  SpriteMaterial,
  Sprite,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Scene,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BACKGROUNDS, backgroundTexture } from "./backgrounds";
import type { Board } from "./board";
import { glowMap } from "./figures";

export interface Court {
  id: string;
  name: string;
  /** The tribe whose home this is, if any. */
  tribe?: string;
  /** Colors for menus and for the scene behind it until its art has loaded. */
  top: string;
  bottom: string;
  /** A picture of it for menus. */
  preview?: string;
  /** Dresses the board and adds the scenery; null for the plain marble board. */
  dress?: (scene: Scene, board: Board) => CourtSet;
}

/** A court in the scene: updated each frame, removed for another. */
export interface CourtSet {
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

const pillar = { glb: null as Promise<Group> | null };

// ---------- The Stormcourt's home: Storm Keep ----------

/** The sea of storm clouds the keep stands above: drifting noise, lit from inside by lightning. */
function cloudSea() {
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, flash: { value: 0 }, flashAt: { value: new Vector3() } },
    vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform float flash; uniform vec3 flashAt; varying vec3 vPos;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vPos.xz * 0.06;
        float c = fbm(p + vec2(time * 0.012, time * 0.006) + fbm(p * 1.7 - time * 0.01));
        vec3 col = mix(vec3(0.03, 0.035, 0.06), vec3(0.2, 0.2, 0.3), smoothstep(0.35, 0.8, c));
        float d = length(vPos.xz - flashAt.xz);
        col += vec3(0.55, 0.45, 1.0) * flash * smoothstep(18.0, 0.0, d) * (0.4 + c);
        float edge = smoothstep(46.0, 30.0, length(vPos.xz));
        gl_FragColor = vec4(col, edge);
      }`,
  });
  const m = new Mesh(new CircleGeometry(48, 64).rotateX(-Math.PI / 2), mat);
  m.position.y = -7;
  return m;
}

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
  const crystals: Sprite[] = [];
  const BOLT = new Color(0xb8a8ff);

  // The squares: storm slate with lightning veins, and veined marble.
  void Promise.all([
    texture(art("stormcourt", "slate.webp")),
    texture(art("stormcourt", "marble.webp")),
    texture(art("stormcourt", "slate-veins.webp"), false),
    texture(art("stormcourt", "marble-veins.webp"), false),
  ]).then(([slate, marble, glow, marbleGlow]) => {
    if (!group.parent) return;
    for (const t of [slate, marble, glow, marbleGlow]) t.wrapS = t.wrapT = RepeatWrapping;
    for (const sq of board.squares.values()) {
      const light = sq.userData.light as boolean;
      // Each square a different part of the stone, so no two look alike.
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
      const m = new MeshStandardMaterial({ map: cut(light ? marble : slate), roughness: light ? 0.22 : 0.3, metalness: 0.05 });
      // Electric blue in the slate, a paler silver-blue in the marble.
      m.emissive = new Color(light ? 0x3f86ff : 0x4f8cff);
      // A touch off white, so the marble's blue veins can show.
      if (light) m.color.setHex(0xd4d9e4);
      m.emissiveMap = cut(light ? marbleGlow : glow);
      m.emissiveIntensity = light ? 1.2 : 1;
      veinShader(m, vu);
      (sq.material as MeshStandardMaterial).dispose();
      sq.material = m;
    }
  });

  // The walls: a carved basalt frieze of storm runes inlaid with gold.
  void Promise.all([texture(art("stormcourt", "frieze.webp")), texture(art("stormcourt", "slate.webp"))]).then(([frieze, slate]) => {
    if (!group.parent) return;
    const top = new MeshStandardMaterial({ map: slate, color: 0x8890a0, roughness: 0.45 });
    for (const w of board.walls) {
      const f = frieze.clone();
      f.wrapS = MirroredRepeatWrapping;
      f.repeat.set(3, 1);
      const side = new MeshStandardMaterial({ map: f, roughness: 0.55, metalness: 0.15 });
      // Box faces: +x, -x, +y, -y, +z, -z; the long faces carry the frieze.
      const alongX = (w.geometry as unknown as { parameters: { width: number } }).parameters.width > 1;
      (w.material as MeshStandardMaterial).dispose();
      w.material = alongX ? [top, top, top, top, side, side] : [side, side, top, top, top, top];
    }
  });

  // Storm pillars at the four corners, a storm crystal on each.
  pillar.glb ??= new GLTFLoader().loadAsync(art("stormcourt", "pillar.glb")).then((g) => g.scene as unknown as Group);
  void pillar.glb.then((src) => {
    if (!group.parent) return;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const p = src.clone();
        p.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
        });
        const H = 2.1;
        // Its face to the board.
        p.rotation.y = Math.atan2(-x, -z);
        p.updateMatrixWorld(true);
        const box = new Box3().setFromObject(p);
        const c0 = box.getCenter(new Vector3());
        p.scale.setScalar(H / (box.max.y - box.min.y));
        // Centered on the plinth's corner, its foot on the plinth.
        const k = p.scale.x;
        p.position.set(x * 4.35 - c0.x * k, -box.min.y * k, z * 4.35 - c0.z * k);
        group.add(p);
        const c = new Sprite(new SpriteMaterial({ map: glowMap(), color: new Color(0xa070ff).multiplyScalar(2.5), blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
        c.scale.setScalar(0.9);
        c.position.set(x * 4.35, H * 0.86, z * 4.35);
        group.add(c);
        crystals.push(c);
      }
  });

  // The sky round about, and the clouds below.
  const sky = new MeshBasicMaterial({ side: BackSide, fog: false, color: 0x9098a8 });
  void texture(art("stormcourt", "sky.webp")).then((t) => {
    t.wrapS = MirroredRepeatWrapping;
    t.repeat.set(4, 1);
    sky.map = t;
    sky.needsUpdate = true;
  });
  const dome = new Mesh(new CylinderGeometry(50, 50, 44, 64, 1, true), sky);
  dome.position.y = 6;
  const sea = cloudSea();
  group.add(dome, sea);
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
  const seaU = (sea.material as ShaderMaterial).uniforms;
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

export const COURTS: Court[] = [
  ...BACKGROUNDS.map((b) => ({ id: b.id, name: b.name, top: b.top, bottom: b.bottom })),
  { id: "stormcourt", name: "Storm Keep", tribe: "stormcourt", top: "#3a3560", bottom: "#05060a", preview: art("stormcourt", "sky.webp"), dress: stormKeep },
];

export const court = (id: string) => COURTS.find((c) => c.id === id) ?? COURTS[0];

/** The plain courts' sky: their gradient. */
export const courtBackground = (id: string) => backgroundTexture(court(id).dress ? "night" : id);
