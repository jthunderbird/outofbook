// The puzzle trek's world: a long track of floating stepping stones through
// space, one stone for each challenge and a gate at the start of each stage,
// with the player's king walking it. Behind, in layers that slide by at their
// own speeds: far stars, nebulae, tears in space through which other worlds
// show (the Storm Keep's sky, the Heartwood's forest, the Epoch Plains), and
// asteroids drifting near the track.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { court } from "./courts";
import { glowMap, type Fig } from "./figures";
import { Backdrop } from "./pixel/world";
import type { Tribe } from "./tribe";

export interface TrekStop {
  stage: number;
  /** Passed, the next to play, open to replay, or not reached. */
  state: "done" | "next" | "open" | "locked";
}

const STEP = 2.6;
/** Rips in space passed over the whole trek, and the way between them. */
const RIPS = 20;
const RIP_GAP = 32;
/** Pictures for the rips: battle scenes and courts rendered in the game (scripts in mockups/battle.ts). */
const RIP_ART = import.meta.glob<string>("../rips/*.webp", { eager: true, query: "?url", import: "default" });
/** The extra way between stages, where a stage's gate stands. */
const GATE = 3.4;
const STATE_COLOR: Record<TrekStop["state"], number> = { done: 0xffc94a, next: 0x7fe3ff, open: 0xffe3a0, locked: 0x3a3f58 };

/** A soft round star. */
function starMap() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.8)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** A cloud of colored gas for the nebulae. */
function nebulaMap(a: string, b: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 14; i++) {
    const x = 60 + Math.random() * 136;
    const y = 60 + Math.random() * 136;
    const rr = 40 + Math.random() * 70;
    const r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, i % 2 ? a : b);
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A sign on a stage's gate: "Stage 3" over its rating. */
function signMap(title: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.shadowColor = "rgba(0,0,0,.8)";
  g.shadowBlur = 12;
  g.fillStyle = "#ffd36a";
  g.font = "bold 84px system-ui, sans-serif";
  g.fillText(title, 256, 92);
  g.fillStyle = "#cfe6ff";
  g.font = "600 52px system-ui, sans-serif";
  g.fillText(sub, 256, 162);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// A tear in space: the world behind shows through a ragged hole with a glowing, flickering rim.
const RIP_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIP_FRAG = `
uniform sampler2D map; uniform vec3 rim; uniform float time; uniform float seed; uniform vec2 shift;
varying vec2 vUv;
float edge(float a) {
  return 0.34 + 0.05 * sin(a * 3.0 + seed + time * 0.25) + 0.035 * sin(a * 7.0 + seed * 2.3 + time * 0.7)
    + 0.02 * sin(a * 17.0 + seed * 5.1 - time * 0.9) + 0.012 * sin(a * 31.0 - time * 1.7);
}
void main() {
  vec2 p = vUv - 0.5;
  float a = atan(p.y, p.x);
  float r = length(p * vec2(1.0, 1.25));
  float e = edge(a);
  if (r > e + 0.16) discard;
  vec3 world = texture2D(map, clamp(vUv * 0.78 + 0.11 + shift, 0.0, 1.0)).rgb;
  // The world fades out into space over a wide soft edge; round it a faint, shifting glow of color, no hard line.
  float inside = 1.0 - smoothstep(e - 0.1, e + 0.015, r);
  float glow = exp(-pow((r - e) / 0.06, 2.0)) * (0.55 + 0.45 * sin(time * 2.0 + a * 4.0 + seed));
  vec3 c = world * inside + rim * glow * 0.35;
  gl_FragColor = vec4(c, clamp(inside + glow * 0.3, 0.0, 1.0));
}`;

export class TrekScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(46, 1, 0.1, 600);
  private stops: TrekStop[] = [];
  private points: Vector3[] = [];
  private track = new Group();
  private tiles?: InstancedMesh;
  private rings?: InstancedMesh;
  private hero: Fig | null = null;
  /** The hero's place on the track, in stops (fractions while walking). */
  private at = 0;
  private walkTo = 0;
  /** Where the camera looks along the track, in stops; eased toward aim. */
  private view = 0;
  private aim = 0;
  private selected = -1;
  private marker: Mesh;
  private layers: { g: Object3D; k: number }[] = [];
  private rips: { mat: ShaderMaterial; mesh: Mesh }[] = [];
  private pixel = new Backdrop();
  private pixelTex = new CanvasTexture(this.pixel.cv);
  private raf = 0;
  private ro: ResizeObserver;
  private t = 0;
  private gone = false;

  constructor(
    private host: HTMLElement,
    private onPick: (i: number) => void,
  ) {
    const r = (this.renderer = new WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = ACESFilmicToneMapping;
    r.outputColorSpace = SRGBColorSpace;
    r.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
    host.appendChild(r.domElement);
    this.scene.background = new Color(0x04030c);
    const pmrem = new PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.scene.add(new HemisphereLight(0xb8c4ff, 0x1a1030, 1.1), new AmbientLight(0x404060, 0.6));
    const sun = new DirectionalLight(0xfff0dd, 2.2);
    sun.position.set(-6, 10, 8);
    this.scene.add(sun);
    // A cool light that keeps pace with the hero, so the king is always well lit.
    this.heroLight.position.set(0, 3, 3);
    this.scene.add(this.heroLight, this.track);
    this.pixelTex.magFilter = NearestFilter;
    this.pixelTex.colorSpace = SRGBColorSpace;
    this.space();
    this.marker = new Mesh(new TorusGeometry(0.72, 0.04, 8, 48).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    this.marker.visible = false;
    this.scene.add(this.marker);

    r.domElement.addEventListener("pointerdown", this.down);
    r.domElement.addEventListener("pointermove", this.move);
    r.domElement.addEventListener("pointerup", this.up);
    r.domElement.addEventListener("wheel", this.wheel, { passive: true });
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
  private heroLight = new PointLight(0xc8dcff, 6, 9, 1.4);

  /** Where stop i stands: along x, rising and falling and winding a little. */
  private place(i: number) {
    let x = 0;
    for (let j = 1; j <= i; j++) x += STEP + (this.stops[j] && this.stops[j].stage !== this.stops[j - 1].stage ? GATE : 0);
    return new Vector3(x, Math.sin(x * 0.11) * 0.9, Math.sin(x * 0.045) * 2.2);
  }
  /** A point along the track at a fractional stop. */
  private along(s: number) {
    const i = Math.max(0, Math.min(this.points.length - 1, Math.floor(s)));
    const j = Math.min(this.points.length - 1, i + 1);
    const p = this.points[i].clone().lerp(this.points[j], s - i);
    // A little hop over each stepping stone between stops.
    p.y += Math.abs(Math.sin((s - i) * Math.PI * 3)) * 0.12 * (j > i ? 1 : 0);
    return p;
  }

  /** The challenges along the track, in order, and how far each is. */
  setStops(stops: TrekStop[]) {
    const fresh = stops.length !== this.stops.length;
    this.stops = stops;
    if (fresh) this.build();
    const c = new Color();
    stops.forEach((s, i) => {
      this.rings!.setColorAt(i, c.set(STATE_COLOR[s.state]));
      this.tiles!.setColorAt(i, c.set(s.state === "locked" ? 0x4a4a58 : 0x9a94a8));
    });
    this.rings!.instanceColor!.needsUpdate = true;
    this.tiles!.instanceColor!.needsUpdate = true;
  }

  private build() {
    for (const o of [...this.track.children]) {
      o.removeFromParent();
      o.traverse((m) => (m as Mesh).geometry?.dispose());
    }
    this.points = this.stops.map((_, i) => this.place(i));
    // The rips' layer keeps pace with the camera so that, from the first stop to the last, the trek passes all of them.
    const length = this.points[this.points.length - 1]?.x ?? 0;
    if (length) this.ripLayer.k = Math.max(0, 1 - ((RIPS - 1) * RIP_GAP) / length);
    const n = this.stops.length;
    const dummy = new Object3D();
    const tiles = new InstancedMesh(new CylinderGeometry(0.62, 0.5, 0.26, 10), new MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }), n);
    const rocks = new InstancedMesh(new ConeGeometry(0.5, 1.1, 7).rotateX(Math.PI), new MeshStandardMaterial({ color: 0x4a3f55, roughness: 1, flatShading: true }), n);
    const rings = new InstancedMesh(new TorusGeometry(0.6, 0.045, 6, 32).rotateX(Math.PI / 2), new MeshBasicMaterial({ toneMapped: false }), n);
    this.points.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
      dummy.position.y -= 0.68;
      dummy.scale.set(1, 0.8 + ((i * 37) % 10) / 20, 1);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(p).setY(p.y + 0.14);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
    });
    tiles.setColorAt(0, new Color());
    rings.setColorAt(0, new Color());
    // Stepping stones between stops.
    const between: Vector3[] = [];
    for (let i = 0; i + 1 < n; i++) for (const k of [0.33, 0.66]) between.push(this.points[i].clone().lerp(this.points[i + 1], k));
    const stones = new InstancedMesh(new DodecahedronGeometry(0.22).scale(1, 0.45, 1), new MeshStandardMaterial({ color: 0x6a6078, roughness: 1, flatShading: true }), between.length);
    between.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(0.9 + (i % 3) * 0.15);
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    });
    this.track.add(tiles, rocks, rings, stones);
    this.tiles = tiles;
    this.rings = rings;
    // A gate at the start of each stage: two glowing pillars and a sign.
    const pillar = new CylinderGeometry(0.12, 0.16, 2.6, 8);
    const stone = new MeshStandardMaterial({ color: 0x5a5470, roughness: 0.7, metalness: 0.2 });
    this.stops.forEach((s, i) => {
      if (i > 0 && s.stage === this.stops[i - 1].stage) return;
      const p = this.points[i].clone().lerp(i > 0 ? this.points[i - 1] : this.points[i].clone().setX(this.points[i].x - STEP), 0.5);
      for (const dz of [-1, 1]) {
        const m = new Mesh(pillar, stone);
        m.position.set(p.x, p.y + 1.1, p.z + dz * 0.95);
        const orb = new Sprite(new SpriteMaterial({ map: glowMap(), color: 0x9fd0ff, blending: AdditiveBlending, depthWrite: false }));
        orb.position.set(0, 1.45, 0);
        orb.scale.setScalar(0.7);
        m.add(orb);
        this.track.add(m);
      }
      const sign = new Sprite(new SpriteMaterial({ map: signMap(`Stage ${s.stage}`, `Rating ${400 + 100 * (s.stage - 1)}`), depthWrite: false }));
      sign.position.set(p.x, p.y + 3.1, p.z);
      sign.scale.set(2.4, 0.9, 1);
      this.track.add(sign);
    });
  }

  /** The space behind the track, in layers that keep up with the camera at their own pace (k: 1 stays with it, 0 is fixed). */
  private space() {
    const stars = starMap();
    for (const [k, count, z, size] of [
      [0.97, 1400, -260, 1.6],
      [0.9, 900, -170, 1.3],
      [0.75, 500, -110, 1.1],
    ] as const) {
      const pos: number[] = [];
      const col: number[] = [];
      const c = new Color();
      for (let i = 0; i < count; i++) {
        pos.push((Math.random() - 0.5) * 520, (Math.random() - 0.35) * 260, z + (Math.random() - 0.5) * 40);
        c.setHSL(0.55 + Math.random() * 0.2, 0.5, 0.75 + Math.random() * 0.25);
        col.push(c.r, c.g, c.b);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new Float32BufferAttribute(col, 3));
      const pts = new Points(geo, new PointsMaterial({ size, map: stars, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
      this.add(pts, k);
    }
    // Nebulae: great soft clouds of violet, teal and rose far behind.
    const nebulae = new Group();
    const kinds = [nebulaMap("rgba(120,60,200,.5)", "rgba(40,120,200,.4)"), nebulaMap("rgba(200,60,140,.45)", "rgba(90,40,160,.4)"), nebulaMap("rgba(40,170,160,.4)", "rgba(60,80,200,.4)")];
    for (let i = 0; i < 14; i++) {
      const s = new Sprite(new SpriteMaterial({ map: kinds[i % 3], transparent: true, depthWrite: false, opacity: 0.8 }));
      s.position.set(-120 + i * 34 + Math.random() * 20, -10 + Math.random() * 50, -140);
      s.scale.setScalar(70 + Math.random() * 60);
      nebulae.add(s);
    }
    this.add(nebulae, 0.85);
    // The rips: other worlds behind tears in space, each showing a picture drawn at random on every visit
    // (the courts, battle scenes rendered in the game, the live Epoch Plains), spread so that the whole
    // trek passes about RIPS of them (the layer's pace is set once the track's length is known).
    const loader = new TextureLoader();
    const load = (url: string): Texture => {
      const t = loader.load(url);
      t.colorSpace = SRGBColorSpace;
      return t;
    };
    const pool: (() => Texture)[] = [...Object.values(RIP_ART).map((url) => () => load(url)), () => load(court("stormcourt").preview!), () => load(court("thornwood").preview!), () => this.pixelTex];
    const order: (() => Texture)[] = [];
    while (order.length < RIPS) order.push(...[...pool].sort(() => Math.random() - 0.5).filter((x, i) => i > 0 || x !== order[order.length - 1]));
    const made = new Map<() => Texture, Texture>();
    const rims = [0x9b7bff, 0x6fe0c8, 0xff7fb8, 0xffb35a, 0x7fb4ff];
    const rips = new Group();
    for (let i = 0; i < RIPS; i++) {
      const pick = order[i];
      if (!made.has(pick)) made.set(pick, pick());
      const mat = new ShaderMaterial({
        vertexShader: RIP_VERT,
        fragmentShader: RIP_FRAG,
        uniforms: { map: { value: made.get(pick) }, rim: { value: new Color(rims[i % rims.length]) }, time: { value: 0 }, seed: { value: Math.random() * 40 }, shift: { value: new Vector2() } },
        transparent: true,
        depthWrite: false,
      });
      const size = 16 + Math.random() * 8;
      const mesh = new Mesh(new PlaneGeometry(size * 1.6, size), mat);
      mesh.position.set(-6 + i * RIP_GAP + (Math.random() - 0.5) * 8, (i % 2 ? 10 : -1) + Math.random() * 5, -55 - Math.random() * 15);
      mesh.rotation.z = (Math.random() - 0.5) * 0.4;
      rips.add(mesh);
      this.rips.push({ mat, mesh });
    }
    this.ripLayer = { g: rips, k: 0.5 };
    this.scene.add(rips);
    this.layers.push(this.ripLayer);
    // Asteroids drifting near the track, above and below it.
    const rock = new MeshStandardMaterial({ color: 0x5b5068, roughness: 1, flatShading: true });
    const asteroids = new Group();
    for (let i = 0; i < 160; i++) {
      const m = new Mesh(new DodecahedronGeometry(0.3 + Math.random() * 1.1, 0), rock);
      const above = Math.random() < 0.5;
      m.position.set(-20 + Math.random() * 760, above ? 5 + Math.random() * 8 : -4 - Math.random() * 8, -6 - Math.random() * 22);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.userData.spin = (Math.random() - 0.5) * 0.4;
      asteroids.add(m);
    }
    this.add(asteroids, 0);
    this.asteroids = asteroids;
  }
  private asteroids = new Group();
  private ripLayer!: { g: Object3D; k: number };
  private add(o: Object3D, k: number) {
    this.scene.add(o);
    this.layers.push({ g: o, k });
  }

  /** The hero: the tribe's king, standing on stop at (and walking to later stops). */
  async setHero(tribe: Tribe, at: number) {
    await tribe.ready?.();
    if (this.gone) return;
    if (this.hero) this.hero.root.removeFromParent();
    const f = tribe.figure("k", "b");
    f.root.scale.setScalar(0.62);
    this.scene.add(f.root);
    this.hero = f;
    this.at = this.walkTo = at;
    this.view = this.aim = at;
  }

  /** Walks the hero to stop i (and the camera with it). */
  goTo(i: number) {
    this.walkTo = i;
    this.aim = i;
  }

  /** Points the camera at stop i (a tap on the meter) and rings it. */
  select(i: number) {
    this.selected = i;
    this.aim = i;
  }

  private step(ms: number) {
    this.t += ms / 1000;
    const dt = ms / 1000;
    // The hero walks a stop a second or so.
    const f = this.hero;
    if (f) {
      const d = this.walkTo - this.at;
      const walking = Math.abs(d) > 0.01;
      if (walking) this.at += Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
      const p = this.along(this.at);
      const ahead = this.along(this.at + (d >= 0 ? 0.1 : -0.1));
      f.root.position.copy(p).setY(p.y + 0.13 + (walking && !f.anim ? Math.abs(Math.sin(this.t * 9)) * 0.06 : 0));
      // Facing the way it walks; standing, turned toward the camera.
      f.root.rotation.y = walking ? Math.atan2(ahead.x - p.x, ahead.z - p.z) : 0.5;
      const act = f.root.userData.act as { motion: string; flip: boolean } | undefined;
      if (act) {
        act.motion = walking ? "walk" : "idle";
        act.flip = d < 0;
      }
      if (f.anim) {
        const want = walking && f.anim.clips.has("Walking") ? "Walking" : f.anim.idle;
        if (f.anim.current?.getClip().name !== want) void f.play(want, { loop: true, fade: 0.25 });
      }
      f.update(ms);
      this.heroLight.position.copy(p).add(new Vector3(0.5, 2.5, 2.5));
      if (walking) this.aim = this.at;
    }
    this.view += (this.aim - this.view) * Math.min(1, dt * 3);
    const look = this.along(Math.max(0, Math.min(this.points.length - 1, this.view)));
    // Wide screens look a little ahead along the track; tall ones keep the hero in the middle, from further back.
    const ahead = this.camera.aspect < 1 ? 0 : 1.2;
    this.camera.position.set(look.x - ahead, look.y + 2.6, look.z + (this.camera.aspect < 1 ? 10 : 8.5));
    this.camera.lookAt(look.x + ahead, look.y + 0.9, look.z);
    for (const l of this.layers) l.g.position.x = this.camera.position.x * l.k;
    for (const a of this.asteroids.children) a.rotation.y += a.userData.spin * dt;
    // The worlds behind the rips shift a little as the camera passes (depth), and the pixel world drifts on.
    for (const r of this.rips) {
      r.mat.uniforms.time.value = this.t;
      const sx = (this.camera.position.x - (r.mesh.position.x + r.mesh.parent!.position.x)) * 0.0015;
      r.mat.uniforms.shift.value.set(Math.max(-0.1, Math.min(0.1, sx)), 0);
    }
    if (Math.floor(this.t * 20) !== Math.floor((this.t - dt) * 20)) {
      this.pixel.draw(this.t);
      this.pixelTex.needsUpdate = true;
    }
    if (this.selected >= 0 && this.points[this.selected]) {
      this.marker.visible = true;
      this.marker.position.copy(this.points[this.selected]).setY(this.points[this.selected].y + 0.2);
      this.marker.scale.setScalar(1 + Math.sin(this.t * 4) * 0.06);
    } else this.marker.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  // Dragging slides the view along the track; a tap on a stop picks it.
  private drag: { x: number; view: number; moved: boolean } | null = null;
  private down = (e: PointerEvent) => {
    this.drag = { x: e.clientX, view: this.aim, moved: false };
  };
  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    if (Math.abs(dx) > 6) this.drag.moved = true;
    if (this.drag.moved) this.aim = Math.max(0, Math.min(this.points.length - 1, this.drag.view - dx / 70));
  };
  private up = (e: PointerEvent) => {
    const tap = this.drag && !this.drag.moved;
    this.drag = null;
    if (!tap || !this.tiles) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hit = ray.intersectObject(this.tiles)[0];
    if (hit?.instanceId !== undefined) this.onPick(hit.instanceId);
  };
  private wheel = (e: WheelEvent) => {
    this.aim = Math.max(0, Math.min(this.points.length - 1, this.aim + (e.deltaY + e.deltaX) / 120));
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Tall screens: a wider view, so a few stops still show either side of the hero.
    this.camera.fov = w / h < 1 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
