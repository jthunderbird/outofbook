// The arena: a 3D board whose pieces act out each move. Each side's tribe
// (tribe.ts; the first is the Stormcourt) builds its figures and acts out its
// own moves and kills; the arena keeps the board, the camera, taps, the queue of
// positions and the check mark. Positions come in as FENs with the move that
// led there; a move that can't be acted out (a jump in history) snaps.
import { Chess, type Move, type Square } from "chess.js";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Clock, FIRE_TIME, Particles, SPEED } from "./fx";
import { backgroundTexture } from "./backgrounds";
import { buildBoard } from "./board";
import { squareAt } from "./board";
import { type Fig, type Role, type Side } from "./figures";
import { stormcourt } from "./stormcourt";
import type { Stage, Tribe } from "./tribe";
import { ArenaSound } from "./sound";

const FILES = "abcdefgh";
const boardOf = (fen: string) => fen.split(" ")[0];

export interface ArenaInput {
  movable?: Side | "both";
  onMove?: (uci: string) => void;
}

export class Arena {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 100);
  private controls: OrbitControls;
  private clock = new Clock();
  private fx: Particles;
  private figs = new Map<string, Fig>();
  private squares: Map<string, Mesh>;
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
  private input: ArenaInput = {};
  private selected: string | null = null;
  private hint: string | null = null;
  private shake = 0;
  /** Lightning's flash, dark until a bolt strikes. */
  private flash = new PointLight(0xffffff, 0, 8, 1.5);
  /** The red glow under a king in check (always in the scene, dark when not, so no shader recompiles). */
  private checkLight = new PointLight(0xff2020, 0, 2.6, 1.5);
  private checkGlow: Mesh[] = [];
  private pulse = 0;
  private raf = 0;
  private ro: ResizeObserver;
  private down: [number, number] | null = null;
  /** The fight's sounds; on when the game's sound is. */
  readonly sound = new ArenaSound(() => this.hurry);
  /** Each side's tribe: its figures, and how they move and kill. */
  private tribes: Record<Side, Tribe> = { w: stormcourt, b: stormcourt };
  /** What a tribe acts its moves out on. */
  private stage: Stage;

  constructor(
    private host: HTMLElement,
    /** Told when the arena starts and stops acting out moves. */
    private onBusy?: (busy: boolean) => void,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const arena = this;
    this.stage = {
      clock: this.clock,
      scene: this.scene,
      sound: this.sound,
      flash: this.flash,
      get squares() {
        return arena.squares;
      },
      get fx() {
        return arena.fx;
      },
      get shake() {
        return arena.shake;
      },
      set shake(ms: number) {
        arena.shake = ms;
      },
    };
    const r = (this.renderer = new WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    r.localClippingEnabled = true;
    r.toneMapping = ACESFilmicToneMapping;
    r.outputColorSpace = SRGBColorSpace;
    r.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;border-radius:var(--board-radius,4px)";
    host.appendChild(r.domElement);
    this.fx = new Particles(this.scene);
    this.scene.background = backgroundTexture("night");
    // A soft studio environment for metal and marble to reflect.
    const pmrem = new PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xcfd8ff, 0x1a2038, 0.8));
    const sun = new DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(4, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.flash.position.set(0, 2, 0);
    this.scene.add(this.flash, this.checkLight);

    this.squares = buildBoard(this.scene);
    this.labels = new Mesh(new PlaneGeometry(9.4, 9.4).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.labels.position.y = 0.001;
    this.scene.add(this.labels, this.marks);

    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, minDistance: 9, maxDistance: 20, minPolarAngle: 0.15, maxPolarAngle: 1.25 });
    this.setOrientation("w");

    r.domElement.addEventListener("pointerdown", this.onDown);
    r.domElement.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    let last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const ms = Math.min(50, now - last);
      last = now;
      if (!this.manual) this.step(ms);
    };
    this.raf = requestAnimationFrame(frame);
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
    this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setOrientation(o: Side) {
    this.orientation = o;
    const s = o === "w" ? 1 : -1;
    this.camera.position.set(0, 12.6, 9.4 * s);
    this.controls.target.set(0, 0, 0.5 * s);
    this.controls.update();
    this.drawLabels();
  }

  /** Each side's tribe; the figures on the board are rebuilt in the new tribes. */
  setTribes(t: Record<Side, Tribe>) {
    if (t.w === this.tribes.w && t.b === this.tribes.b) return;
    this.tribes = t;
    for (const f of this.figs.values()) f.root.removeFromParent();
    this.figs.clear();
    if (this.shown) {
      const fen = this.shown;
      this.shown = "";
      this.sync(fen);
    }
  }

  /** The scene behind the board (backgrounds.ts). */
  setBackground(id: string) {
    this.scene.background = backgroundTexture(id);
  }

  /** A suggested move (uci) to show on the board, or null. */
  setHint(uci: string | null) {
    this.hint = uci;
    this.highlight();
  }

  setInput(i: ArenaInput) {
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

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
      m.position.copy(squareAt(sq)).setY(0.006);
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
      for (const m of this.movesFrom(this.selected))
        mark(m.to, 0x6fd36f, 0.75, m.captured ? new RingGeometry(0.38, 0.47, 32).rotateX(-Math.PI / 2) : new CircleGeometry(0.14, 20).rotateX(-Math.PI / 2));
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
          console.error("arena", e);
        }
      }
      this.sync(next.fen);
      if (!this.queue.length) {
        const mate = await this.regicide(next).catch((e) => console.error("arena", e));
        call = mate ? "knell" : acted && this.game()?.inCheck() ? "horn" : null;
      }
    }
    this.busy = false;
    this.hurry = false;
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
      return;
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
