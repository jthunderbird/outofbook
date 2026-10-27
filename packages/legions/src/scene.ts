// The arena: a 3D board whose pieces act out each move. The king orders every
// move; rooks are torn down and rebuilt by his magic (or, to take, dropped
// through a portal onto the piece); he floats to his square and withers what he
// takes. A piece dies the way its taker kills. Positions come in as FENs with the
// move that led there; a move that can't be acted out (a jump in history) snaps.
import { Chess, type Move, type Square } from "chess.js";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CylinderGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  QuadraticBezierCurve3,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Clock, FIRE_TIME, Particles, Portal, SPEED, flame, clip, clipAbove, ease, followClip, magicArc, ownMaterials, tween, wait } from "./fx";
import { Pit, buildBoard } from "./board";
import { MAGIC, makeFig, type Fig, type Role, type Side } from "./figures";
import { ArenaSound } from "./sound";

const FILES = "abcdefgh";
export const squareAt = (sq: string) => new Vector3(FILES.indexOf(sq[0]) - 3.5, 0, 3.5 - (+sq[1] - 1));
const boardOf = (fen: string) => fen.split(" ")[0];
const lerpAngle = (a: number, b: number, t: number) => a + (((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * t;
const BODY: Record<Side, number> = { w: 0xefe6d6, b: 0x2b2730 };
const ASH = new Color(0x38332f);

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

  constructor(
    private host: HTMLElement,
    /** Told when the arena starts and stops acting out moves. */
    private onBusy?: (busy: boolean) => void,
  ) {
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
    this.scene.background = new Color(0x0d111a);
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

  setInput(i: ArenaInput) {
    this.input = i;
    this.highlight();
  }

  setPosition(fen: string, lastMove?: string) {
    if (fen === this.target) return;
    this.target = fen;
    this.lastMove = lastMove;
    this.selected = null;
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
        f = makeFig(w.role, w.side);
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

    if (mover.role === "k") {
      const castle = m.flags.includes("k") ? "h" : m.flags.includes("q") ? "a" : null;
      if (castle) {
        const rf = castle + m.from[1];
        const rt = (castle === "h" ? "f" : "d") + m.from[1];
        const rook = this.figs.get(rf);
        if (rook) {
          this.figs.delete(rf);
          await this.order(mover, rook);
          await this.rookMove(rook, rt);
          this.figs.set(rt, rook);
        }
      }
      await this.kingFloat(mover, m.to, victim);
    } else {
      if (king) await this.order(king, mover);
      await this.strike(mover, m.to, victim);
      if (m.promotion) this.sound.play("order", { rate: 1.5 });
      if (m.promotion) this.fx.burst(squareAt(m.to).setY(0.6), MAGIC[side], 30, { glow: true, speed: 1.5, up: 2.5, gravity: 1 });
    }
    this.figs.set(m.to, mover);
  }

  /** Moves a piece other than the king to a square, taking victim there its own way. */
  private strike(f: Fig, to: string, victim?: Fig) {
    if (f.role === "r") return victim ? this.portalKill(f, to, victim) : this.rookMove(f, to);
    if (f.role === "n") return this.gallop(f, to, victim);
    if (f.role === "b") return this.fly(f, to, victim);
    if (f.role === "q") return this.glide(f, to, victim);
    return this.march(f, to, victim);
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
    if (boss) await this.order(boss, a);
    await this.strike(a, k.square, v);
    this.figs.set(k.square, a);
    return true;
  }

  // ---------- The king ----------

  /** The king sends a piece: a gesture and an arc of magic from his staff to it. */
  private async order(king: Fig, target: Fig) {
    void king.cast(this.clock, "order");
    this.sound.play("order", { gain: 0.3 });
    await wait(this.clock, 200);
    await magicArc(this.clock, this.scene, king.staffTip(), target.middle(), MAGIC[king.side], 480);
  }

  /** Rises a little and floats to the square; to take, stops short and withers the piece first. */
  private async kingFloat(k: Fig, to: string, victim?: Fig) {
    const a = k.root.position.clone();
    const b = squareAt(to);
    const face = k.root.rotation.y;
    const dir = Math.atan2(b.x - a.x, b.z - a.z);
    const H = 0.35;
    k.floating = true;
    const hum = this.sound.play("hum", { gain: 0.35, rate: 0.7, loop: true });
    let trail = 0;
    this.clock.add((ms) => {
      if ((trail += ms) > 45) {
        trail = 0;
        const p = k.root.position;
        this.fx.spawn(new Vector3(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.02, p.z + (Math.random() - 0.5) * 0.3), {
          color: MAGIC[k.side],
          size: 0.035,
          vel: new Vector3(0, -0.3, 0),
          life: 500,
          gravity: 0,
          glow: true,
        });
      }
      return !k.floating;
    });
    await tween(this.clock, 280, (t) => {
      k.root.position.y = H * t;
      k.root.rotation.y = lerpAngle(face, dir, t);
    });
    const dist = a.distanceTo(b);
    const glide = (from: number, until: number) =>
      tween(this.clock, Math.max(250, (until - from) * dist * 280), (t) => {
        const s = from + (until - from) * t;
        k.root.position.set(a.x + (b.x - a.x) * s, H, a.z + (b.z - a.z) * s);
      });
    if (victim) {
      const stop = Math.max(0, 1 - 0.8 / dist);
      await glide(0, stop);
      void k.cast(this.clock, "kill");
      this.sound.play("order", { rate: 0.8 });
      await wait(this.clock, 150);
      void magicArc(this.clock, this.scene, k.staffTip(), victim.middle(), MAGIC[k.side], 400);
      await this.wither(victim);
      await glide(stop, 1);
    } else await glide(0, 1);
    await tween(
      this.clock,
      280,
      (t) => {
        k.root.position.y = H * (1 - t);
        k.root.rotation.y = lerpAngle(dir, face, t);
      },
      ease.in,
    );
    k.floating = false;
    hum.stop(250);
    this.fx.dust(b, 10, 0xd8cdb8);
  }

  /** The king's kill: the piece turns to ash and crumbles to the ground from the top down. */
  private async wither(v: Fig) {
    this.die(v);
    this.sound.play("rubble", { gain: 0.5, rate: 1.4, delay: 280 });
    const mats = v.mats.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial);
    const from = mats.map((m) => m.color.clone());
    await tween(this.clock, 280, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(ASH, t);
        m.emissive.setHex(0xff5a1a);
        m.emissiveIntensity = 0.9 * t;
      }),
    );
    const p = v.root.position;
    const top = v.height * 1.08;
    await tween(
      this.clock,
      750,
      (t) => {
        const y = top * (1 - t);
        clipAbove(v.mats, y);
        for (const m of mats) m.emissiveIntensity = 0.9 * (1 - t);
        for (let i = 0; i < 2; i++)
          this.fx.spawn(new Vector3(p.x + (Math.random() - 0.5) * 0.4 * (0.4 + t), y, p.z + (Math.random() - 0.5) * 0.4), {
            color: Math.random() < 0.2 ? 0xff7a2a : 0x4a443e,
            size: 0.03 + Math.random() * 0.04,
            vel: new Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6),
            life: 900,
            gravity: 3,
          });
      },
      ease.in,
    );
    v.root.removeFromParent();
    // A little pile of ash, gone after a moment.
    const pile = new Mesh(new ConeGeometry(0.22, 0.08, 10), new MeshStandardMaterial({ color: 0x3e3833, roughness: 1, transparent: true }));
    pile.position.copy(p).setY(0.04);
    this.scene.add(pile);
    void wait(this.clock, 900)
      .then(() => tween(this.clock, 600, (t) => ((pile.material as MeshStandardMaterial).opacity = 1 - t)))
      .then(() => pile.removeFromParent());
  }

  // ---------- Rooks ----------

  private async rookMove(r: Fig, to: string) {
    await this.tearDown(r);
    r.root.position.copy(squareAt(to));
    await this.rebuild(r);
  }

  /**
   * Keeps the rook's filled middle no higher than its wall: the top of the
   * highest stone still standing (in place, for "down"; landed, for "up").
   * Returns the function that stops it.
   */
  private coreTracksWall(r: Fig, standing: (s: Mesh) => boolean) {
    const core = r.core!;
    return this.loop(() => {
      let top = 0;
      for (const s of r.stones) if (standing(s)) top = Math.max(top, s.userData.home.pos.y + 0.095);
      const h = Math.min(0.8, top);
      // Eased toward the wall so a row leaving doesn't make it jump.
      core.scale.y = Math.max(0.001, core.scale.y + (h / 0.8 - core.scale.y) * 0.35);
    });
  }

  private async tearDown(r: Fig) {
    const p = r.root.position.clone();
    const stones = [...r.stones].sort((a, b) => b.userData.home.pos.y - a.userData.home.pos.y);
    const gone = new Set<Mesh>();
    const stop = this.coreTracksWall(r, (s) => !gone.has(s));
    this.sound.play("grind", { gain: 0.5, rate: 1.2 });
    await Promise.all(
      stones.map(async (s, i) => {
        await wait(this.clock, i * 18);
        gone.add(s);
        const start = s.position.clone();
        const out = new Vector3(start.x, 0, start.z).normalize();
        const spin = (Math.random() - 0.5) * 5;
        if (i % 6 === 0) this.fx.dust(p, 5, 0x6a6470);
        if (i % 10 === 0) this.stone(380, 0.35);
        await tween(
          this.clock,
          420,
          (t) => {
            s.position.set(start.x + out.x * 0.28 * t, start.y + 0.18 * Math.sin(t * Math.PI) - (start.y + 0.35) * t * t, start.z + out.z * 0.28 * t);
            s.rotation.x = spin * t;
          },
          ease.linear,
        );
      }),
    );
    stop();
    r.core!.scale.y = 0.001;
  }

  private async rebuild(r: Fig) {
    const p = r.root.position.clone();
    const magic = MAGIC[r.side];
    this.fx.dust(p, 10, 0xd8cdb8);
    const stones = [...r.stones].sort((a, b) => a.userData.home.pos.y - b.userData.home.pos.y);
    for (const s of stones) {
      s.position.copy(s.userData.home.pos).setY(-0.45);
      s.rotation.set(0, s.userData.home.rot, 0);
    }
    for (const rune of r.runes) {
      rune.visible = true;
      (rune.material as MeshStandardMaterial).emissiveIntensity = 3;
    }
    r.core!.scale.y = 0.001;
    const landed = new Set<Mesh>();
    const stop = this.coreTracksWall(r, (s) => landed.has(s));
    this.sound.play("grind", { gain: 0.45 });
    await Promise.all(
      stones.map(async (s, i) => {
        await wait(this.clock, i * 16);
        const home = s.userData.home.pos.y;
        if (i % 4 === 0) this.fx.burst(p.clone().setY(home), magic, 3, { glow: true, speed: 0.8, up: 0.8, gravity: 0, life: 500 });
        await tween(this.clock, 380, (t) => (s.position.y = -0.45 + (home + 0.45) * t), ease.back);
        if (i % 10 === 0) this.stone(0, 0.3);
        landed.add(s);
      }),
    );
    stop();
    r.core!.scale.y = 1;
    await tween(this.clock, 400, (t) => r.runes.forEach((rune) => ((rune.material as MeshStandardMaterial).emissiveIntensity = 3 * (1 - t))));
    for (const rune of r.runes) rune.visible = false;
  }

  /** The rook's kill: it drops through a portal the king opens under it and falls out of another onto the piece. */
  private async portalKill(r: Fig, to: string, v: Fig) {
    const a = r.root.position.clone();
    const b = squareAt(to);
    const magic = MAGIC[r.side];
    const below = new Portal(this.clock, this.scene, a.clone().setY(0.015), magic);
    this.sound.play("portal", { gain: 0.7 });
    await below.open();
    await tween(this.clock, 520, (t) => (r.root.position.y = -(r.height + 0.3) * t), ease.in);
    const PY = 2.7;
    const above = new Portal(this.clock, this.scene, b.clone().setY(PY), magic);
    void below.close();
    this.sound.play("portal", { gain: 0.7, rate: 0.8 });
    await above.open(280);
    await wait(this.clock, 120);
    r.root.position.set(b.x, PY, b.z);
    clipAbove(r.mats, PY);
    let hit = false;
    await tween(
      this.clock,
      430,
      (t) => {
        r.root.position.y = PY * (1 - t);
        if (!hit && r.root.position.y <= v.height * 0.9) {
          hit = true;
          void this.crush(v);
        }
      },
      ease.in,
    );
    if (!hit) void this.crush(v);
    this.sound.play("boom", { gain: 0.9 });
    this.sound.play("rubble", { gain: 0.6 });
    this.shake = 260;
    this.fx.dust(b, 24);
    await tween(this.clock, 240, (t) => (r.body.scale.y = 1 - 0.16 * Math.sin(t * Math.PI)));
    clipAbove(r.mats, null);
    await above.close();
  }

  /** Killed by a rook: flattened, bits flying, then gone into the board. */
  private async crush(v: Fig) {
    this.die(v);
    const p = v.root.position.clone();
    this.fx.burst(p.clone().setY(0.25), BODY[v.side], 20, { speed: 2.6, size: 0.07, up: 2.4 });
    await tween(this.clock, 130, (t) => v.body.scale.set(1 + 0.45 * t, 1 - 0.88 * t, 1 + 0.45 * t), ease.out);
    await wait(this.clock, 400);
    await tween(this.clock, 350, (t) => (v.root.position.y = -0.3 * t));
    v.root.removeFromParent();
  }

  // ---------- Moving ----------

  private restFacing(f: Fig) {
    return f.side === "w" ? Math.PI : 0;
  }

  private turn(f: Fig, to: number, ms = 180) {
    const from = f.root.rotation.y;
    return tween(this.clock, ms, (t) => (f.root.rotation.y = lerpAngle(from, to, t)));
  }

  /** Runs fn every frame until the returned function is called. */
  private loop(fn: (ms: number) => void) {
    let on = true;
    this.clock.add((ms) => {
      if (!on) return true;
      fn(ms);
    });
    return () => {
      on = false;
    };
  }

  /** Straight from where f stands to b over ms, lifted by lift(t). */
  private line(f: Fig, b: Vector3, ms: number, lift: (t: number) => number = () => 0, e = ease.linear) {
    const a = f.root.position.clone();
    return tween(this.clock, ms, (t) => f.root.position.set(a.x + (b.x - a.x) * t, lift(t), a.z + (b.z - a.z) * t), e);
  }

  /** The point fraction s of the way from a to b. */
  private along = (a: Vector3, b: Vector3, s: number) => a.clone().lerp(b, s);

  /** Pawns: walk, legs and arms swinging; to take, stop short and chop the piece down. */
  private async march(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dist = a.distanceTo(b);
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z));
    let phase = 0;
    let walking = true;
    let foot = 0;
    const stop = this.loop((ms) => {
      if (walking) phase += ms * 0.012;
      // A footstep each time a leg passes under the body.
      if (walking && Math.floor(phase / Math.PI) !== foot) {
        foot = Math.floor(phase / Math.PI);
        this.sound.play(`step${1 + (foot % 3)}` as "step1", { gain: 0.45 });
      }
      const s = walking ? Math.sin(phase) : 0;
      f.legs[0].rotation.x = s * 0.6;
      f.legs[1].rotation.x = -s * 0.6;
      f.body.position.y = Math.abs(s) * 0.025;
    });
    const pace = 380;
    if (victim) {
      const s = Math.max(0, 1 - 0.7 / dist);
      await this.line(f, this.along(a, b, s), s * dist * pace);
      walking = false;
      this.sound.play("swing", { gain: 0.6, delay: 120 });
      await f.swing(this.clock, "chop");
      this.sound.play("slash", { gain: 0.7 });
      void this.strikeDown(victim, b.clone().sub(a));
      await wait(this.clock, 300);
      walking = true;
      await this.line(f, b, (1 - s) * dist * pace);
    } else await this.line(f, b, dist * pace);
    stop();
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /**
   * Knights: one flowing curve through the L, a bounding leap over whatever is
   * in the way and down to a gallop. To take, the rider swings while still
   * riding, cuts the piece in half as he reaches it, and the horse rears up and
   * stops on its square.
   */
  private async gallop(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const d = b.clone().sub(a);
    const corner = Math.abs(d.x) > Math.abs(d.z) ? new Vector3(b.x, 0, a.z) : new Vector3(a.x, 0, b.z);
    // The corner pulled toward the middle: a curve that still reads as an L.
    const path = new QuadraticBezierCurve3(a, corner.lerp(a.clone().lerp(b, 0.5), 0.45), b);
    const L = path.getLength();
    let phase = 0;
    let running = true;
    const hooves = this.sound.play("gallop", { gain: 0.7, loop: true });
    const stop = this.loop((ms) => {
      if (!running) return;
      phase += ms * 0.02;
      const s = Math.sin(phase);
      const c = Math.sin(phase + 0.6);
      const [fl, fr, bl, br] = f.hooves;
      fl.rotation.x = s * 0.7;
      fr.rotation.x = c * 0.7;
      bl.rotation.x = -s * 0.6;
      br.rotation.x = -c * 0.6;
      // Knees fold as a leg comes forward: front knees back, hind knees forward.
      fl.userData.knee.rotation.x = Math.max(0, -Math.cos(phase)) * 1.1;
      fr.userData.knee.rotation.x = Math.max(0, -Math.cos(phase + 0.6)) * 1.1;
      bl.userData.knee.rotation.x = -Math.max(0, Math.cos(phase)) * 0.9;
      br.userData.knee.rotation.x = -Math.max(0, Math.cos(phase + 0.6)) * 0.9;
      f.body.rotation.x = s * 0.07;
      f.body.position.y = Math.max(0, s) * 0.05;
    });
    const face = f.root.rotation.y;
    const ms = L * 330;
    // Moving: speed up and slow down. Taking: speed up and keep riding through.
    const speed = victim ? (t: number) => (t < 0.2 ? (t * t) / 0.4 : t - 0.1) / 0.9 : ease.inOut;
    // The hit lands half a square short of the piece; the swing takes 380 ms to get there.
    const hitAt = victim ? (1 - 0.55 / L) * 0.9 + 0.1 : 2;
    let swung = false;
    const tangent = new Vector3();
    await tween(
      this.clock,
      ms,
      (t) => {
        const u = Math.min(1, speed(t));
        const p = path.getPointAt(u);
        // A leap over the first stretch, then back on the ground for the run in.
        const leap = u < 0.7 ? Math.sin((Math.PI * u) / 0.7) * 0.3 : 0;
        f.root.position.set(p.x, leap, p.z);
        path.getTangentAt(u, tangent);
        f.root.rotation.y = lerpAngle(face, Math.atan2(tangent.x, tangent.z), Math.min(1, u / 0.12));
        if (victim && !swung && t * ms >= hitAt * ms - 380) {
          swung = true;
          const across = new Vector3(tangent.z, 0, -tangent.x);
          this.sound.play("swing", { gain: 0.6, delay: 150 });
          void f.swing(this.clock, "slash").then(() => this.slice(victim, across, true));
        }
      },
      ease.linear,
    );
    running = false;
    hooves.stop(victim ? 300 : 150);
    if (!victim) this.sound.play("land", { gain: 0.5 });
    f.rest();
    f.root.rotation.y = Math.atan2(tangent.x, tangent.z);
    if (victim) await this.rear(f);
    stop();
    f.rest();
    this.fx.dust(b, victim ? 14 : 8, 0xd8cdb8);
    await this.turn(f, this.restFacing(f));
  }

  /** The horse rears up on its hind legs, front hooves pawing, and comes down. */
  private async rear(f: Fig) {
    const [fl, fr, bl, br] = f.hooves;
    this.sound.play("neigh", { gain: 0.6 });
    // Pitched about the hind hooves (z -0.2 on the ground), not the middle.
    const pitch = (k: number, paw = 0) => {
      const th = -0.7 * k;
      f.body.rotation.x = th;
      f.body.position.set(0, -0.2 * Math.sin(th), -0.2 + 0.2 * Math.cos(th));
      for (const [leg, off] of [
        [fl, 0],
        [fr, 1.4],
      ] as const) {
        leg.rotation.x = -1.1 * k + Math.sin(paw + off) * 0.35 * k;
        leg.userData.knee.rotation.x = 1.4 * k;
      }
      // Hind legs stay upright under the pitched body.
      bl.rotation.x = br.rotation.x = 0.7 * k;
    };
    await tween(this.clock, 300, (t) => pitch(t), ease.out);
    await tween(this.clock, 420, (t) => pitch(1, t * 12), ease.linear);
    await tween(this.clock, 260, (t) => pitch(1 - t), ease.in);
    this.sound.play("land", { gain: 0.7 });
    this.shake = 120;
  }

  /**
   * Bishops, gods of thunder: they go by lightning. The bishop flashes away, a
   * bolt runs from his square to the new one, and he forms there out of the
   * electricity. To take, the bolt wraps the piece, drives it to the ground,
   * and he forms standing over it.
   */
  private async fly(f: Fig, to: string, victim?: Fig) {
    const b = squareAt(to);
    const color = BOLT[f.side];
    const charge = this.electrify(f, color);
    this.sound.play("charge", { gain: 0.6 });
    void f.cast(this.clock, victim ? "kill" : "order");
    const sparks = this.sparkle(f, color);
    await tween(this.clock, 380, (t) => charge(t), ease.in);
    sparks();
    const from = f.middle();
    f.root.visible = false;
    this.fx.burst(from, color, 26, { glow: true, speed: 2.6, size: 0.035, life: 350, gravity: 0 });
    this.flashAt(from, color, 35);
    this.sound.play("thunder", { gain: victim ? 0.6 : 0.8 });
    this.shake = 90;
    const end = victim ? victim.middle() : b.clone().setY(0.5);
    await this.trail(from, end, color);
    if (victim) await this.envelop(victim, color, end.clone().sub(from).setY(0));
    f.root.position.copy(b);
    await this.form(f, color, charge);
    if (victim) void this.sink(victim);
    this.fx.dust(b, 8, 0xd8cdb8);
  }

  /** Makes f glow toward color by k (0..1); 0 puts its own glow back. */
  private electrify(f: Fig, color: number) {
    const mats = this.standard(f.mats);
    const base = mats.map((m) => ({ e: m.emissive.clone(), i: m.emissiveIntensity }));
    const c = new Color(color);
    return (k: number) =>
      mats.forEach((m, i) => {
        m.emissive.copy(base[i].e).lerp(c, k);
        m.emissiveIntensity = base[i].i + (2.2 - base[i].i) * k;
      });
  }

  /** Sparks crackling off a figure until the returned function is called. */
  private sparkle(f: Fig, color: number) {
    return this.loop(() => {
      for (let i = 0; i < 2; i++)
        this.fx.spawn(f.middle().add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * f.height, (Math.random() - 0.5) * 0.6)), {
          color,
          size: 0.025,
          vel: new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
          life: 220,
          gravity: 0,
          glow: true,
        });
    });
  }

  /** A flash of light at a point that dies away. */
  private flashAt(at: Vector3, color: number, power: number) {
    this.flash.color.setHex(color);
    this.flash.position.copy(at).setY(at.y + 0.6);
    this.flash.intensity = power;
    void tween(this.clock, 350, (t) => (this.flash.intensity = power * (1 - t)), ease.out);
  }

  /** The bolt the bishop travels as: it flickers from a to b, and its last stroke fades as he forms. */
  private async trail(a: Vector3, b: Vector3, color: number) {
    const n = Math.max(6, Math.round(a.distanceTo(b) * 3.5));
    for (let i = 0; i < 3; i++) {
      const bolt = this.bolt(a, b, color, n, 0.4);
      this.flash.intensity = Math.max(this.flash.intensity, 18);
      this.flash.position.copy(a).lerp(b, 0.5).setY(1.2);
      await wait(this.clock, 60);
      if (i < 2) bolt.remove();
      else void bolt.fade(450);
      await wait(this.clock, 30);
    }
  }

  /** Lightning wraps the piece, scorching it, then one stroke drives it to the ground. */
  private async envelop(v: Fig, color: number, dir: Vector3) {
    const p = v.root.position;
    const on = () => {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.12;
      return new Vector3(p.x + Math.cos(a) * r, 0.05 + Math.random() * v.height, p.z + Math.sin(a) * r);
    };
    void this.char(v, 0.7, 600);
    const wrap = this.electrify(v, color);
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) this.sound.play("zap", { gain: 0.5, rate: 0.9 + Math.random() * 0.3 });
      wrap(0.4 + Math.random() * 0.5);
      const arcs = [this.bolt(on(), on(), color, 4, 0.12), this.bolt(on(), on(), color, 4, 0.12)];
      this.flash.intensity = 8 + Math.random() * 10;
      await wait(this.clock, 55);
      for (const x of arcs) x.remove();
    }
    wrap(0);
    // The stroke from above, and down it goes.
    const top = v.middle().setY(v.height);
    const stroke = this.bolt(top.clone().setY(3.2), top, color, 7, 0.25);
    this.flashAt(top, color, 40);
    this.sound.play("thunder", { gain: 0.9, rate: 1.15 });
    this.die(v);
    this.shake = 200;
    this.fx.burst(top, color, 20, { glow: true, speed: 2.5, size: 0.04, life: 450 });
    void stroke.fade(300);
    await this.topple(v, dir, 220);
    this.fx.dust(p, 12);
  }

  /** The bishop forms on his square out of the electricity: sparks rush in, he appears from the feet up, and his glow settles. */
  private async form(f: Fig, color: number, charge: (k: number) => void) {
    const p = f.root.position;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const off = new Vector3(Math.cos(a), (Math.random() - 0.3) * 1.2, Math.sin(a)).multiplyScalar(0.5 + Math.random() * 0.4);
      this.fx.spawn(
        p
          .clone()
          .setY(f.height * 0.5)
          .add(off),
        { color, size: 0.03, vel: off.clone().multiplyScalar(-1 / 0.3), life: 300, gravity: 0, glow: true },
      );
    }
    await wait(this.clock, 200);
    this.sound.play("zap", { gain: 0.4, rate: 0.7 });
    charge(1);
    clipAbove(f.mats, 0);
    f.root.visible = true;
    const sparks = this.sparkle(f, color);
    await tween(this.clock, 420, (t) => clipAbove(f.mats, f.height * 1.15 * t), ease.out);
    clipAbove(f.mats, null);
    sparks();
    await tween(this.clock, 450, (t) => charge(1 - t));
  }

  /** Queens: a swift, smooth float, no turning; to take, a fiery hole opens under the piece as she comes. */
  private async glide(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dist = a.distanceTo(b);
    const ms = Math.max(500, dist * 170);
    f.floating = true;
    this.sound.play("whoosh", { gain: 0.5, rate: 0.8 });
    const lift = (s: number) => Math.sin(Math.PI * s) * 0.18;
    const path = (from: number, until: number, ms: number) =>
      tween(
        this.clock,
        ms,
        (t) => {
          const s = from + (until - from) * t;
          f.root.position.copy(this.along(a, b, s)).setY(lift(s));
        },
        ease.inOut,
      );
    if (victim) {
      const s = Math.max(0, 1 - 0.85 / dist);
      await path(0, s, ms * s + 1);
      await this.burn(victim);
      await path(s, 1, Math.max(300, ms * (1 - s)));
    } else await path(0, 1, ms);
    f.floating = false;
  }

  // ---------- Dying ----------

  /** The dying piece's cry: a horse's scream for a knight, a man's for the rest (lower for black). */
  private die(v: Fig, delay = 0) {
    const rate = v.side === "b" ? 0.85 : 1;
    if (v.role === "n") this.sound.play("neigh", { gain: 0.6, rate: rate * 0.8, delay });
    else this.sound.play(Math.random() < 0.5 ? "death1" : "death2", { gain: 0.55, rate: v.role === "k" ? rate * 0.85 : rate, delay });
  }

  /** A stone of a rook's wall knocking. */
  private stone(delay: number, gain: number) {
    this.sound.play(`stone${1 + Math.floor(Math.random() * 3)}` as "stone1", { gain, delay });
  }

  private standard = (mats: Material[]) => mats.filter((m): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial);

  /** Darkens a figure toward char by amount, glowing like embers. */
  private char(v: Fig, amount: number, ms: number) {
    const mats = this.standard(v.mats);
    const from = mats.map((m) => m.color.clone());
    return tween(this.clock, ms, (t) =>
      mats.forEach((m, i) => {
        m.color.copy(from[i]).lerp(ASH, amount * t);
        m.emissive.setHex(0xff5a1a);
        m.emissiveIntensity = 0.8 * t;
      }),
    );
  }

  /** Killed by a pawn: knocked over away from the blow, then sunk into the board. */
  private async strikeDown(v: Fig, dir: Vector3) {
    this.fx.burst(v.middle(), 0xfff2c0, 8, { glow: true, speed: 1.5, size: 0.04, life: 300 });
    this.die(v);
    await this.topple(v, dir);
    this.sound.play("fall", { gain: 0.5 });
    this.fx.dust(v.root.position, 10);
    await wait(this.clock, 300);
    await this.sink(v);
  }

  /** Falls over away from dir. */
  private topple(v: Fig, dir: Vector3, ms = 320) {
    const axis = new Vector3(dir.z, 0, -dir.x).normalize();
    const start = v.root.quaternion.clone();
    return tween(
      this.clock,
      ms,
      (t) => {
        v.root.quaternion.copy(start);
        v.root.rotateOnWorldAxis(axis, (Math.PI / 2) * t);
      },
      ease.in,
    );
  }

  /** Sinks into the board and is gone. */
  private async sink(v: Fig) {
    const y = v.root.position.y;
    await tween(this.clock, 400, (t) => (v.root.position.y = y - 0.4 * t));
    v.root.removeFromParent();
  }

  /**
   * Killed by a knight: cut through the middle on a slant; the top slides off
   * toward dir and falls, then both go. Trampled: the horse comes onto the
   * square, so the bottom half sinks away at once.
   */
  private async slice(v: Fig, dir: Vector3, trampled = false) {
    this.sound.play("slash", { gain: 0.7 });
    this.die(v);
    const p = v.root.position.clone();
    const side = new Vector3(dir.z, 0, -dir.x).normalize();
    const n = new Vector3(0, 1, 0).addScaledVector(side, 0.35).normalize();
    const cut = p.clone().setY(v.height * 0.5);
    const top = v.root.clone(true);
    const topMats = ownMaterials(top);
    this.scene.add(top);
    const below = new Plane(n.clone().negate(), n.dot(cut));
    const above = new Plane(n.clone(), -n.dot(cut));
    clip(v.mats, [below]);
    clip(topMats, [above]);
    followClip(this.clock, v.root, below);
    followClip(this.clock, top, above);
    for (let i = 0; i < 16; i++)
      this.fx.spawn(cut.clone().addScaledVector(side, (Math.random() - 0.5) * 0.7), {
        color: 0xffffff,
        size: 0.03,
        vel: side.clone().multiplyScalar((Math.random() - 0.5) * 3),
        life: 300,
        gravity: 0,
        glow: true,
      });
    const start = top.position.clone();
    const q = top.quaternion.clone();
    if (trampled) void tween(this.clock, 300, (t) => (v.root.position.y = -v.height * 0.6 * t), ease.in);
    await tween(
      this.clock,
      550,
      (t) => {
        top.position.set(start.x + dir.x * 0.35 * t, start.y - v.height * 0.4 * t, start.z + dir.z * 0.35 * t);
        top.quaternion.copy(q);
        top.rotateOnWorldAxis(side, 1.45 * t);
      },
      ease.in,
    );
    this.fx.dust(p.clone().addScaledVector(dir, 0.4), 12);
    await wait(this.clock, 400);
    const y = v.root.position.y;
    await tween(this.clock, 400, (t) => {
      v.root.position.y = Math.min(y, -0.5 * t);
      top.position.y = start.y - v.height * 0.4 - 0.6 * t;
    });
    v.root.removeFromParent();
    top.removeFromParent();
  }

  /** A jagged bolt from a to b in n strokes (a core and a colored glow, a side branch); the caller removes it or fades it out. */
  private bolt(a: Vector3, b: Vector3, color: number, n = 9, spread = 0.3) {
    const g = new Group();
    const core = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const halo = new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false });
    const jag = (from: Vector3, to: Vector3, n: number, spread: number) => {
      const pts = [from];
      for (let i = 1; i < n; i++)
        pts.push(
          from
            .clone()
            .lerp(to, i / n)
            .add(new Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.3, (Math.random() - 0.5) * spread)),
        );
      pts.push(to);
      for (let i = 0; i < pts.length - 1; i++)
        for (const [mat, r] of [
          [core, 0.014],
          [halo, 0.045],
        ] as const) {
          const len = pts[i].distanceTo(pts[i + 1]);
          const m = new Mesh(new CylinderGeometry(r, r, len, 5), mat);
          m.position.copy(pts[i]).lerp(pts[i + 1], 0.5);
          m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), pts[i + 1].clone().sub(pts[i]).normalize());
          g.add(m);
        }
      return pts;
    };
    const pts = jag(a, b, n, spread);
    const fork = pts[Math.floor(n / 3 + Math.random() * (n / 3))];
    jag(fork, fork.clone().add(new Vector3((Math.random() - 0.5) * 0.8, -0.5, (Math.random() - 0.5) * 0.8)), 4, 0.15);
    this.scene.add(g);
    const remove = () => {
      g.removeFromParent();
      g.traverse((o) => (o as Mesh).geometry?.dispose());
      core.dispose();
      halo.dispose();
    };
    const fade = async (ms: number) => {
      await tween(this.clock, ms, (t) => {
        core.opacity = 1 - t;
        halo.opacity = 0.6 * (1 - t);
      });
      remove();
    };
    return { remove, fade };
  }

  /** The name of the square under a point. */
  private squareOf(p: Vector3) {
    return FILES[Math.round(p.x + 3.5)] + (Math.round(3.5 - p.z) + 1);
  }

  /** Killed by the queen: a pit to hell opens under the piece; it falls in, burns up at the bottom, and the pit closes. */
  private async burn(v: Fig) {
    const p = v.root.position.clone();
    const square = this.squares.get(this.squareOf(p));
    if (!square) return this.strikeDown(v, new Vector3(0, 0, 1));
    const pit = new Pit(this.clock, this.scene, square);
    this.flash.color.setHex(0xff5a10);
    this.flash.position.set(p.x, 0.4, p.z);
    // Flames licking up out of the pit, all round its rim and from deep inside.
    const fire = new Group();
    const tongues: { m: Mesh; h: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const deep = i % 3 === 0;
      const h = deep ? 0.9 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3;
      const m = flame(deep ? 0.32 : 0.22, h, 1.2);
      const r = deep ? 0.12 : 0.3;
      m.position.set(p.x + Math.cos(a) * r, deep ? -0.7 : -0.12, p.z + Math.sin(a) * r);
      fire.add(m);
      tongues.push({ m, h });
    }
    this.scene.add(fire);
    const grow = (k: number) => tongues.forEach(({ m, h }) => (m.scale.y = Math.max(0.001, h * k)));
    grow(0);
    void tween(this.clock, 450, (t) => (this.flash.intensity = 10 * t));
    void tween(this.clock, 600, grow, ease.out);
    this.sound.play("fire", { gain: 0.7 });
    this.die(v, 500);
    await pit.open(450);
    await tween(
      this.clock,
      650,
      (t) => {
        v.root.position.y = -1.15 * t;
        v.body.rotation.x = t * 0.6;
      },
      ease.in,
    );
    // At the bottom: a pillar of fire roars up out of the pit, and the piece burns away to nothing.
    const pillar = flame(0.75, 0.001, 1.8);
    pillar.position.set(p.x, -1.15, p.z);
    fire.add(pillar);
    this.flash.intensity = 25;
    this.sound.play("roar", { gain: 0.8 });
    this.shake = 140;
    void tween(this.clock, 260, (t) => (pillar.scale.y = Math.max(0.001, 2.3 * t)), ease.out).then(() => tween(this.clock, 640, (t) => (pillar.scale.y = Math.max(0.001, 2.3 * (1 - t))), ease.in));
    void this.char(v, 1, 200);
    await tween(this.clock, 550, (t) => v.body.scale.setScalar(Math.max(0.01, 1 - t)));
    v.root.removeFromParent();
    void tween(this.clock, 400, (t) => (this.flash.intensity = 25 * (1 - t)));
    void tween(this.clock, 380, (t) => grow(1 - t), ease.in);
    this.sound.play("slam", { gain: 0.6, delay: 300 });
    await pit.close(400);
    fire.removeFromParent();
    fire.children.forEach((m) => ((m as Mesh).material as Material).dispose());
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

/** Lightning's color: white gold for white, violet for black. */
const BOLT: Record<Side, number> = { w: 0xfff0a0, b: 0xc07bff };
