// The Chess Legions scene: a 3D board whose pieces act out each move. Each side's tribe
// (tribe.ts; the first is the Stormcourt) builds its figures and acts out its
// own moves and kills; the scene keeps the board, the camera, taps, the queue of
// positions and the check mark. Positions come in as FENs with the move that
// led there; a move that can't be acted out (a jump in history) snaps.
import { Chess, type Move, type Square } from "chess.js";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Box3,
  CanvasTexture,
  Color,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Sprite,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Clock, FIRE_TIME, Particles, SPEED } from "./fx";
import { court, courtBackground, type CourtSet } from "./courts";
import { lean } from "./epoch";
import { buildBoard, squareAt, type Board } from "./board";
import { type Fig, type Role, type Side } from "./figures";
import { stormcourt } from "./stormcourt";
import type { Stage, Tribe } from "./tribe";
import { LegionsSound } from "./sound";
import { dressFigure, type Look } from "./looks";
import { FIGURE_LAYER, SkinPass, type Mode } from "./modes";

const FILES = "abcdefgh";
const boardOf = (fen: string) => fen.split(" ")[0];

export interface SceneInput {
  movable?: Side | "both";
  onMove?: (uci: string) => void;
}

/** For a board drawn by its court's picture: writes depth, no color. */
const DEPTH_ONLY = new MeshBasicMaterial({ colorWrite: false });

/** Courts whose preload has finished. */
const PRELOADED = new Set<string>();

export class LegionsScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 220);
  private controls: OrbitControls;
  private clock = new Clock();
  private fx: Particles;
  private figs = new Map<string, Fig>();
  private board: Board;
  private get squares() {
    return this.board.squares;
  }
  /** The court: the board's dress and the scenery round it (courts.ts). */
  private courtId = "night";
  private court: CourtSet | null = null;
  private courtAfter = false;
  /** Glow (bloom) on bright light, lightning and fire; off by default (it costs frame time). */
  private composer: EffectComposer | null = null;
  /** Every figure in the scene, on a square or on its way to one. */
  private live = new Set<Fig>();
  private marks = new Group();
  private labels: Mesh;
  private disposed = false;
  private busy = false;
  private queue: { fen: string; lastMove?: string }[] = [];
  /** The latest position given, and the one on the board now. */
  private target = "";
  private lastMove?: string;
  private shown = "";
  private orientation: Side = "w";
  private input: SceneInput = {};
  private selected: string | null = null;
  private hint: string | null = null;
  private rebuildAfter = false;
  private shake = 0;
  /** Lightning's flash, dark until a bolt strikes. */
  private flash = new PointLight(0xffffff, 0, 8, 1.5);
  /** The red glow under a king in check (always in the scene, dark when not, so no shader recompiles). */
  private checkLight = new PointLight(0xff2020, 0, 2.6, 1.5);
  private checkGlow: Mesh[] = [];
  /** The key light, over the shoulder of the side the board is seen from (setOrientation), so polished squares never glare back. */
  private sun = new DirectionalLight(0xfff1dc, 2.4);
  private pulse = 0;
  private raf = 0;
  private ro: ResizeObserver;
  private down: [number, number] | null = null;
  /** The fight's sounds; on when the game's sound is. */
  readonly sound = new LegionsSound(() => this.hurry);
  /** Each side's tribe: its figures, and how they move and kill. */
  private tribes: Record<Side, Tribe> = { w: stormcourt, b: stormcourt };
  /** What a tribe acts its moves out on. */
  private stage: Stage;

  constructor(
    private host: HTMLElement,
    /** Told when the scene starts and stops acting out moves. */
    private onBusy?: (busy: boolean) => void,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.stage = {
      clock: this.clock,
      scene: this.scene,
      sound: this.sound,
      flash: this.flash,
      get camera() {
        return self.camera;
      },
      get court() {
        return self.courtId;
      },
      get squares() {
        return self.squares;
      },
      get fx() {
        return self.fx;
      },
      figures: () => [...self.figs.values()],
      portrait: (f) => self.portrait(f),
      get shake() {
        return self.shake;
      },
      set shake(ms: number) {
        self.shake = ms;
      },
    };
    const r = (this.renderer = new WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    r.localClippingEnabled = true;
    r.toneMapping = ACESFilmicToneMapping;
    r.outputColorSpace = SRGBColorSpace;
    r.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;border-radius:var(--board-radius,4px)";
    host.appendChild(r.domElement);
    this.fx = new Particles(this.scene);
    this.scene.background = courtBackground("night");
    // A soft studio environment for metal and marble to reflect.
    const pmrem = new PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xcfd8ff, 0x1a2038, 0.8));
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.flash.position.set(0, 2, 0);
    this.scene.add(this.flash, this.checkLight);

    this.board = buildBoard();
    this.scene.add(this.board.group);
    this.labels = new Mesh(new PlaneGeometry(9.4, 9.4).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.labels.position.y = 0.001;
    this.scene.add(this.labels, this.marks);

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, minDistance: 6, maxDistance: 20, minPolarAngle: 0.15, maxPolarAngle: 1.25 });
    this.setOrientation("w");

    r.domElement.addEventListener("pointerdown", this.onDown);
    r.domElement.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    let last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      // A frame stamp can come before the time the loop started: never a negative step.
      const ms = Math.max(0, Math.min(50, now - last));
      last = now;
      if (!this.manual) this.step(ms);
    };
    this.raf = requestAnimationFrame(frame);
    // Modelled figures replace code-built ones as soon as their models have loaded.
    this.loadTribes();
  }

  /** Dev (recording): time stands still and moves only by step(). */
  manual = false;

  /** A tap while moves are acted out: they run fast to the end. */
  private hurry = false;

  /** Advances everything ms and draws a frame. */
  step(frame: number) {
    const ms = this.hurry ? frame * 8 : frame;
    this.clock.update(ms);
    FIRE_TIME.value += (ms * SPEED) / 1000;
    this.fx.update(ms * SPEED);
    for (const f of this.live)
      if (f.root.parent) f.update(ms * SPEED);
      else this.live.delete(f);
    this.court?.update(frame);
    if (this.checkGlow.length) {
      this.pulse += frame / 1000;
      const k = 0.5 + 0.5 * Math.sin(this.pulse * 4.5);
      this.checkLight.intensity = 2.5 + 3 * k;
      (this.checkGlow[0].material as MeshBasicMaterial).opacity = 0.35 + 0.25 * k;
      (this.checkGlow[1].material as MeshBasicMaterial).opacity = 0.55 + 0.4 * k;
    }
    this.controls.update();
    const cam = this.camera.position.clone();
    if (this.shake > 0) {
      this.shake -= frame;
      this.camera.position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.12));
    }
    this.skinPass?.tick(frame);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.camera.position.copy(cam);
  }

  /** Nothing acting out and nothing waiting. */
  get idle() {
    return !this.busy && !this.queue.length;
  }

  dispose() {
    this.disposed = true;
    this.sound.stopAll();
    cancelAnimationFrame(this.raf);
    this.clock.clear();
    this.ro.disconnect();
    this.controls.dispose();
    this.court?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /**
   * A menu's still camera (a campaign page's hero shot): fixed where it is put,
   * whatever the court; null gives the game's camera back.
   */
  private oriented = false;

  setShowcase(v: { pos: [number, number, number]; target: [number, number, number]; fov: number } | null) {
    this.show = v;
    this.applyView();
  }
  private show: { pos: [number, number, number]; target: [number, number, number]; fov: number } | null = null;

  /** A figure off the board (a menu's hero), lit, animated and updated with the rest; removed with removeFigure. */
  addFigure(f: Fig) {
    f.root.traverse((o) => o.layers.enable(FIGURE_LAYER));
    this.scene.add(f.root);
    this.live.add(f);
  }
  removeFigure(f: Fig) {
    f.root.removeFromParent();
    this.live.delete(f);
  }

  /** A menu's hero: a figure off the board acting out its tribe's showcase; the returned function takes it away. */
  showHero(f: Fig) {
    this.addFigure(f);
    const stop = this.tribes[f.side].hero?.(this.stage, f);
    return () => {
      stop?.();
      this.removeFigure(f);
    };
  }

  /** Anything else for a menu's shot (its own lights): added to and removed from the scene. */
  addObject(o: Object3D) {
    this.scene.add(o);
  }

  /** The camera's place: a menu's showcase, else the court's own view if it has one (fixed or just a start), else the usual one. */
  private applyView() {
    if (this.show) {
      this.controls.enabled = false;
      // The orbit's limits would pull a menu's camera back into the game's range.
      Object.assign(this.controls, { minDistance: 0.5, maxDistance: 400, minPolarAngle: 0, maxPolarAngle: Math.PI });
      this.limitTurn();
      this.camera.fov = this.show.fov;
      this.camera.near = 0.1;
      this.camera.far = 220;
      this.camera.updateProjectionMatrix();
      lean.tilt = 0.3;
      lean.size = 1;
      this.camera.position.set(...this.show.pos);
      this.controls.target.set(...this.show.target);
      this.camera.lookAt(this.controls.target);
      // A menu's shot shows no file and rank letters.
      this.labels.visible = false;
      return;
    }
    const s = this.orientation === "w" ? 1 : -1;
    const v = this.court?.view;
    this.controls.enabled = !v?.fixed;
    Object.assign(this.controls, { minPolarAngle: 0.15, maxPolarAngle: 1.25 });
    this.limitTurn();
    // A fixed view sits far off, with a narrow lens, beyond the orbit's usual range.
    this.controls.minDistance = v?.fixed ? 1 : 6;
    this.controls.maxDistance = v?.fixed ? 400 : 20;
    this.camera.fov = v?.fov ?? 36;
    // A fixed view stands far off; its depth range moves with it.
    this.camera.near = v?.fixed ? v.dist - 40 : 0.1;
    this.camera.far = v?.fixed ? v.dist + 160 : 220;
    this.camera.updateProjectionMatrix();
    lean.tilt = v?.fixed ? v.pitch : 0.3;
    // In a fixed view the cards are drawn pixel for pixel: 32 pixels to a square.
    lean.size = v?.fixed ? 1 / 1.4 : 1;
    if (v) {
      // Pulled back on narrow screens so the board stays whole.
      const k = Math.max(1, 1.3 / this.camera.aspect);
      const tz = (v.tz ?? 0) * s;
      this.camera.position.set(0, v.ty + Math.sin(v.pitch) * v.dist * k, tz + Math.cos(v.pitch) * v.dist * k * s);
      this.controls.target.set(0, v.ty, tz);
    } else {
      this.camera.position.set(0, 12.6, 9.4 * s);
      this.controls.target.set(0, 0, 0.5 * s);
    }
  }

  /** A court with a front lets the camera turn only so far from the player's side. */
  private limitTurn() {
    const t = this.show ? undefined : this.court?.turn;
    const mid = this.orientation === "w" ? 0 : Math.PI;
    this.controls.minAzimuthAngle = t === undefined ? -Infinity : mid - t;
    this.controls.maxAzimuthAngle = t === undefined ? Infinity : mid + t;
  }

  setOrientation(o: Side) {
    // Turning to the other side keeps the player's own view (their zoom and angle), swung round to the other edge; only the first time, a menu's shot or a fixed view puts the camera in place.
    const turn = this.oriented && o !== this.orientation && !this.show && !this.court?.view?.fixed;
    this.oriented = true;
    this.orientation = o;
    const s = o === "w" ? 1 : -1;
    this.court?.orient?.(s);
    if (turn) {
      for (const v of [this.camera.position, this.controls.target]) v.set(-v.x, v.y, -v.z);
      this.camera.lookAt(this.controls.target);
      this.limitTurn();
    } else this.applyView();
    this.sun.position.set(4 * s, 12, 6 * s);
    this.controls.update();
    this.drawLabels();
  }

  /** Each side's tribe; the figures on the board are rebuilt in the new tribes. */
  setTribes(t: Record<Side, Tribe>) {
    if (t.w === this.tribes.w && t.b === this.tribes.b) return;
    this.tribes = t;
    this.loadTribes();
    this.rebuild();
  }

  /** Loads the tribes' models; their figures are built again once they have. */
  private loadTribes() {
    const t = this.tribes;
    void Promise.all([t.w.ready?.(), t.b.ready?.()]).then(() => !this.disposed && t === this.tribes && this.rebuild());
  }

  /** Builds every figure on the board again (new tribes, or models that have loaded). */
  private rebuild() {
    if (this.busy) {
      this.rebuildAfter = true;
      return;
    }
    for (const f of this.figs.values()) f.root.removeFromParent();
    this.figs.clear();
    if (this.shown) {
      const fen = this.shown;
      this.shown = "";
      this.sync(fen);
    }
  }

  /** The court: the board and the scenery round it (courts.ts). Changed between moves. */
  setCourt(id: string) {
    if (id === this.courtId && !this.courtAfter) return;
    this.courtId = id;
    // A court with baked pieces waits for them; the old court stays until they are in.
    const pre = court(id).preload;
    if (pre && !PRELOADED.has(id)) {
      void pre().then(() => {
        PRELOADED.add(id);
        if (this.courtId === id) {
          this.courtAfter = true;
          this.setCourt(id);
        }
      });
      return;
    }
    if (this.busy) {
      this.courtAfter = true;
      return;
    }
    this.courtAfter = false;
    this.court?.dispose();
    this.court = null;
    this.scene.remove(this.board.group);
    this.board = buildBoard();
    this.scene.add(this.board.group);
    this.scene.background = courtBackground(id);
    const c = court(id);
    if (c.dress) this.court = c.dress(this.scene, this.board);
    this.court?.orient?.(this.orientation === "w" ? 1 : -1);
    this.court?.resize?.(this.host.clientWidth || 1, this.host.clientHeight || 1);
    this.applyView();
    // A bare court is drawn over a picture the page supplies: no board, no labels, a clear background.
    this.labels.visible = !this.court?.bare && !this.show;
    if (this.court?.bare)
      // Depth only: the board still hides what goes beneath it (a tunnel, a pit), but the court's picture shows.
      this.board.group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.material = DEPTH_ONLY;
      });
    this.highlight();
  }

  /**
   * Glow on bright light, lightning and fire (bloom); costs frame time on phones.
   * Only what is brighter than lit white glows: emissive and unlit effects pushed past 1.
   */
  setGlow(on: boolean) {
    this.glow = on;
    this.post();
  }

  /**
   * Retro: the figures drawn at 288 pixels tall and scaled up without
   * smoothing, their colors cut to a 16-bit-style palette (the board as it is).
   * A way to see 3D figures as a 2D game would.
   */
  setPixel(on: boolean) {
    if (on === this.pixel) return;
    this.pixel = on;
    this.post();
    this.resize();
  }
  private glow = false;
  private pixel = false;

  /** A side's look (a finish and a color from the Collection); the figures are rebuilt in it. */
  setLooks(looks: Partial<Record<Side, Look>>) {
    if (JSON.stringify(looks) === JSON.stringify(this.looks)) return;
    this.looks = looks;
    this.rebuild();
  }
  private looks: Partial<Record<Side, Look>> = {};

  /** A way of drawing the whole picture (Noir, Sketch), or null. */
  setMode(mode: Mode | null) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.post();
  }
  private mode: Mode | null = null;
  private skinPass: SkinPass | null = null;

  /** The effects pipeline: a skin on the figures (Retro, Noir, Sketch), bloom for glow; none (plain rendering) when neither. */
  private post() {
    this.composer?.dispose();
    this.skinPass?.dispose();
    this.composer = null;
    this.skinPass = null;
    const skin = this.pixel ? "retro" : this.mode;
    if (!this.glow && !skin) return;
    const c = (this.composer = new EffectComposer(this.renderer));
    c.addPass(skin ? (this.skinPass = new SkinPass(this.scene, this.camera, () => this.live, skin)) : new RenderPass(this.scene, this.camera));
    if (this.glow) c.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.35, 1.5));
    c.addPass(new OutputPass());
    this.resize();
  }

  /** A suggested move (uci) to show on the board, or null. */
  setHint(uci: string | null) {
    this.hint = uci;
    this.highlight();
  }

  setInput(i: SceneInput) {
    this.input = i;
    this.highlight();
  }

  setPosition(fen: string, lastMove?: string) {
    if (fen === this.target) return;
    this.target = fen;
    this.lastMove = lastMove;
    this.selected = null;
    this.hint = null;
    this.queue.push({ fen, lastMove });
    void this.pump();
  }

  /**
   * The part of the canvas the board is framed in (an element over it), when the
   * scene fills more than the board's place, such as the whole screen; the
   * whole canvas when null.
   */
  setFrame(el: HTMLElement | null) {
    this.frame = el;
    if (el) this.ro.observe(el);
    this.resize();
  }
  private frame: HTMLElement | null = null;

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    const f = this.frame?.getBoundingClientRect();
    const host = this.host.getBoundingClientRect();
    if (f && f.width && f.height) {
      // The camera frames the board in the frame; the rest of the canvas shows what lies round it.
      this.camera.aspect = f.width / f.height;
      this.camera.setViewOffset(f.width, f.height, host.left - f.left, host.top - f.top, w, h);
    } else {
      this.camera.clearViewOffset();
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
    this.court?.resize?.(w, h);
    if (this.court?.view?.fixed) this.applyView();
  }

  private drawLabels() {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const g = c.getContext("2d")!;
    const px = 1024 / 9.4;
    g.fillStyle = "#8fa3cf";
    g.font = `bold ${px * 0.32}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const flip = this.orientation === "b";
    // The texture maps x to x and z to y; labels sit by the player's edge and left side, read from their seat.
    for (let i = 0; i < 8; i++) {
      const at = (4.7 + (i - 3.5)) * px;
      const near = (flip ? 0.35 : 9.05) * px;
      const side = (flip ? 9.05 : 0.35) * px;
      this.text(g, FILES[i], at, near, flip);
      this.text(g, String(8 - i), side, at, flip);
    }
    const mat = this.labels.material as MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = new CanvasTexture(c);
    mat.map.colorSpace = SRGBColorSpace;
    mat.needsUpdate = true;
  }

  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, flip: boolean) {
    g.save();
    g.translate(x, y);
    if (flip) g.rotate(Math.PI);
    g.fillText(s, 0, 0);
    g.restore();
  }

  // ---------- Input ----------

  private onDown = (e: PointerEvent) => {
    this.down = [e.clientX, e.clientY];
    this.sound.unlock();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 8) return;
    if (this.busy) {
      this.hurry = true;
      this.sound.stopAll();
      return;
    }
    const sq = this.squareAtPointer(e);
    if (sq) this.tap(sq);
  };

  private squareAtPointer(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    // A figure under the pointer is its square, even where it stands over the square behind.
    const roots = [...this.figs].map(([s, f]) => [s, f.root] as const);
    const hit = ray.intersectObjects(
      roots.map(([, r]) => r),
      true,
    )[0];
    if (hit) {
      let o: Object3D | null = hit.object;
      while (o && !roots.some(([, r]) => r === o)) o = o.parent;
      const found = roots.find(([, r]) => r === o);
      if (found) return found[0];
    }
    const p = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    if (!p) return null;
    const f = Math.round(p.x + 3.5);
    const k = Math.round(3.5 - p.z);
    return f >= 0 && f < 8 && k >= 0 && k < 8 ? FILES[f] + (k + 1) : null;
  }

  private game() {
    try {
      return new Chess(this.target);
    } catch {
      return null;
    }
  }

  private movesFrom(sq: string | null): Move[] {
    const c = this.game();
    const { movable, onMove } = this.input;
    if (!c || !sq || !movable || !onMove) return [];
    if (movable !== "both" && movable !== c.turn()) return [];
    return c.moves({ square: sq as Square, verbose: true });
  }

  private tap(sq: string) {
    const m = this.movesFrom(this.selected).find((x) => x.to === sq);
    if (m) {
      this.selected = null;
      this.input.onMove?.(m.from + m.to + (m.promotion ? "q" : ""));
    } else this.selected = sq !== this.selected && this.movesFrom(sq).length ? sq : null;
    this.highlight();
  }

  private highlight() {
    this.marks.clear();
    this.checkGlow = [];
    this.checkLight.intensity = 0;
    const mark = (sq: string, color: number, opacity: number, geo: CircleGeometry | RingGeometry | PlaneGeometry) => {
      const m = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.position.copy(squareAt(sq)).setY(this.court?.markY ?? 0.006);
      m.renderOrder = 1;
      this.marks.add(m);
    };
    const tile = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    if (this.lastMove) for (const s of [this.lastMove.slice(0, 2), this.lastMove.slice(2, 4)]) mark(s, 0xf6e27a, 0.38, tile);
    const c = this.game();
    if (c?.inCheck()) {
      const k = c
        .board()
        .flat()
        .find((p) => p?.type === "k" && p.color === c.turn());
      if (k) this.markCheck(k.square);
    }
    if (this.hint) {
      mark(this.hint.slice(0, 2), 0x3fd17a, 0.55, tile);
      mark(this.hint.slice(2, 4), 0x3fd17a, 0.8, new RingGeometry(0.3, 0.47, 32).rotateX(-Math.PI / 2));
    }
    if (this.selected) {
      mark(this.selected, 0x6fd36f, 0.5, tile);
      for (const m of this.movesFrom(this.selected)) {
        // A dark halo under each marker keeps it readable on any square, light or dark, grass or soil.
        mark(m.to, 0x000000, 0.45, m.captured ? new RingGeometry(0.34, 0.51, 32).rotateX(-Math.PI / 2) : new CircleGeometry(0.2, 24).rotateX(-Math.PI / 2));
        mark(m.to, 0x7dff7d, 0.95, m.captured ? new RingGeometry(0.38, 0.47, 32).rotateX(-Math.PI / 2) : new CircleGeometry(0.14, 20).rotateX(-Math.PI / 2));
      }
    }
  }

  /** A king in check: his square glows red and pulses, a red halo spills past it, and red light rises up the king. */
  private markCheck(sq: string) {
    const at = squareAt(sq);
    const tile = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    tile.position.copy(at).setY(0.007);
    const halo = new Mesh(
      new PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: haloTexture(), color: 0xff3020, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    halo.position.copy(at).setY(0.008);
    tile.renderOrder = halo.renderOrder = 1;
    this.marks.add(tile, halo);
    this.checkGlow = [tile, halo];
    this.checkLight.position.copy(at).setY(0.25);
    this.pulse = 0;
  }

  // ---------- Positions ----------

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    this.onBusy?.(true);
    // The war horn for check, the death knell for mate: heard even after a hurried fight.
    let call: "horn" | "knell" | null = null;
    while (this.queue.length && !this.disposed) {
      const next = this.queue.shift()!;
      let acted = false;
      // Far behind (a game loaded, moves flying in): catch up without acting.
      if (this.queue.length < 2) {
        try {
          acted = await this.act(next);
        } catch (e) {
          console.error("legions", e);
        }
      }
      this.sync(next.fen);
      if (!this.queue.length) {
        const mate = await this.regicide(next).catch((e) => console.error("legions", e));
        call = mate ? "knell" : acted && this.game()?.inCheck() ? "horn" : null;
      }
    }
    this.busy = false;
    this.hurry = false;
    if (this.rebuildAfter) {
      this.rebuildAfter = false;
      this.rebuild();
    }
    if (this.courtAfter) this.setCourt(this.courtId);
    if (call && !this.disposed) this.sound.play(call, { gain: call === "horn" ? 0.7 : 0.8 });
    this.onBusy?.(false);
    this.highlight();
  }

  /** Puts a figure for each piece of fen on its square, at rest; keeps the ones already right. */
  private sync(fen: string) {
    let c: Chess;
    try {
      c = new Chess(fen);
    } catch {
      // A display that is no game (one army alone, for a menu): place what is there.
      try {
        c = new Chess(fen, { skipValidation: true });
      } catch {
        return;
      }
    }
    const want = new Map<string, { role: Role; side: Side }>();
    for (const p of c.board().flat()) if (p) want.set(p.square, { role: p.type as Role, side: p.color as Side });
    for (const [sq, f] of this.figs) {
      const w = want.get(sq);
      if (!w || w.role !== f.role || w.side !== f.side) {
        f.root.removeFromParent();
        this.figs.delete(sq);
      }
    }
    for (const [sq, w] of want) {
      let f = this.figs.get(sq);
      if (!f) {
        f = this.tribes[w.side].figure(w.role, w.side);
        dressFigure(f, this.looks[w.side], w.side);
        f.root.traverse((o) => o.layers.enable(FIGURE_LAYER));
        this.figs.set(sq, f);
        this.live.add(f);
        this.scene.add(f.root);
      }
      f.root.position.copy(squareAt(sq));
      f.root.rotation.set(0, w.side === "w" ? Math.PI : 0, 0);
      f.rest();
    }
    this.shown = fen;
  }

  /** A pencil sketch of a figure, front on: the figure alone is drawn small, then turned to lines and hatching on clear. */
  private portrait(f: Fig): HTMLCanvasElement {
    const W = 192;
    const H = 256;
    const rt = new WebGLRenderTarget(W, H);
    const box = new Box3().setFromObject(f.root);
    const c = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const cam = new PerspectiveCamera(24, W / H, 0.1, 50);
    const dist = (Math.max(size.y, (size.x * H) / W) * 0.62) / Math.tan((12 * Math.PI) / 180);
    cam.position.copy(c).addScaledVector(new Vector3(0, 0, 1).applyQuaternion(f.root.quaternion), dist);
    cam.lookAt(c);
    // Only the figure (and the lights) are drawn.
    const mine = new Set<Object3D>();
    f.root.traverse((o) => mine.add(o));
    const hidden: Object3D[] = [];
    this.scene.traverse((o) => {
      const d = o as Mesh;
      if ((d.isMesh || (o as Sprite).isSprite || (o as Points).isPoints || (o as Line).isLine) && o.visible && !mine.has(o)) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    const clear = new Color();
    this.renderer.getClearColor(clear);
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    const px = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(clear, alpha);
    this.scene.background = bg;
    this.scene.fog = fog;
    for (const o of hidden) o.visible = true;
    rt.dispose();

    // Brightness (clear is bright, the picture is upside down), then edges and hatching.
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = ((H - 1 - y) * W + x) * 4;
        const a = px[i + 3] / 255;
        const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
        lum[y * W + x] = Math.pow(Math.min(1, l / Math.max(a, 0.001)), 1 / 2.2) * a + (1 - a) * 1.5;
      }
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const g = out.getContext("2d")!;
    const img = g.createImageData(W, H);
    const at = (x: number, y: number) => lum[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const edge = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 0.1) / 0.3));
        const l = lum[y * W + x];
        const hatch = l < 1.2 ? ((x + y) % 6 < 3 && l < 0.45 ? 0.35 : 0) + ((x - y + 600) % 6 < 3 && l < 0.22 ? 0.35 : 0) : 0;
        const ink = Math.min(1, edge + hatch);
        const i = (y * W + x) * 4;
        img.data[i] = 30;
        img.data[i + 1] = 30;
        img.data[i + 2] = 38;
        img.data[i + 3] = Math.round(ink * 235);
      }
    g.putImageData(img, 0, 0);
    return out;
  }

  /** Acts out the move that led to next; false if it could not (a jump), and the board will snap. */
  private async act(next: { fen: string; lastMove?: string }) {
    if (!this.shown || !next.lastMove) return false;
    const c = new Chess(this.shown);
    const u = next.lastMove;
    let m: Move;
    try {
      m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      return false;
    }
    if (boardOf(c.fen()) !== boardOf(next.fen)) return false;
    await this.run(m);
    return true;
  }

  private async run(m: Move) {
    const side = m.color as Side;
    const mover = this.figs.get(m.from);
    if (!mover) return;
    const capSq = m.flags.includes("e") ? m.to[0] + m.from[1] : m.captured ? m.to : null;
    const victim = capSq ? this.figs.get(capSq) : undefined;
    const king = [...this.figs.values()].find((f) => f.role === "k" && f.side === side);
    this.figs.delete(m.from);
    if (capSq) this.figs.delete(capSq);
    let castle: { rook: Fig; to: string } | undefined;
    const wing = m.flags.includes("k") ? "h" : m.flags.includes("q") ? "a" : null;
    const rook = wing ? this.figs.get(wing + m.from[1]) : undefined;
    if (wing && rook) {
      this.figs.delete(wing + m.from[1]);
      castle = { rook, to: (wing === "h" ? "f" : "d") + m.from[1] };
    }
    await this.tribes[side].play(this.stage, { mover, to: m.to, victim, king: mover === king ? undefined : king, castle, promotion: !!m.promotion });
    if (castle) this.figs.set(castle.to, castle.rook);
    this.figs.set(m.to, mover);
  }

  /** Checkmate: the piece giving mate (the one that moved, if it does) kills the king. True if it did. */
  private async regicide(next: { fen: string; lastMove?: string }) {
    let c: Chess;
    try {
      c = new Chess(next.fen);
    } catch {
      return false;
    }
    if (!c.isCheckmate()) return false;
    const loser = c.turn();
    const winner = loser === "w" ? "b" : "w";
    const k = c
      .board()
      .flat()
      .find((p) => p?.type === "k" && p.color === loser);
    if (!k) return false;
    const attackers: string[] = c.attackers(k.square, winner);
    const moved = next.lastMove?.slice(2, 4);
    const from = moved && attackers.includes(moved) ? moved : attackers[0];
    const a = from && this.figs.get(from);
    const v = this.figs.get(k.square);
    if (!a || !v) return false;
    const boss = [...this.figs.values()].find((f) => f.role === "k" && f.side === winner);
    this.figs.delete(from);
    this.figs.delete(k.square);
    await this.tribes[winner].play(this.stage, { mover: a, to: k.square, victim: v, king: boss });
    this.figs.set(k.square, a);
    return true;
  }
}

let halo: CanvasTexture | null = null;
/** A soft round glow, bright in the middle and gone at the edge. */
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.6)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  halo = new CanvasTexture(c);
  return halo;
}
