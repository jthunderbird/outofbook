// The arena: a 3D board whose pieces act out each move. The king orders every
// move; rooks are torn down and rebuilt by his magic (or, to take, dropped
// through a portal onto the piece); he floats to his square and withers what he
// takes. A piece dies the way its taker kills. Positions come in as FENs with the
// move that led there; a move that can't be acted out (a jump in history) snaps.
import { Chess, type Move, type Square } from "chess.js";
import {
  ACESFilmicToneMapping,
  BoxGeometry,
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
import { Clock, Particles, Portal, SPEED, clipAbove, ease, magicArc, tween, wait } from "./fx";
import { MAGIC, loadModels, makeFig, type Fig, type Models, type Role, type Side } from "./figures";

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
  /** Every figure in the scene, on a square or on its way to one. */
  private live = new Set<Fig>();
  private models: Models = { mage: null, tower: null };
  private marks = new Group();
  private labels: Mesh;
  private ready = false;
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
  private raf = 0;
  private ro: ResizeObserver;
  private down: [number, number] | null = null;

  constructor(private host: HTMLElement) {
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
    this.scene.background = new Color(0x141824);

    this.scene.add(new HemisphereLight(0xcfd8ff, 0x2a2018, 1.4));
    const sun = new DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(4, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    // The board: a thick plinth (pieces sink into it and rise out of it) with 64 squares on top.
    const plinth = new Mesh(new BoxGeometry(9.4, 1.4, 9.4), new MeshStandardMaterial({ color: 0x2a1f17, roughness: 0.8 }));
    plinth.position.y = -0.71;
    plinth.receiveShadow = true;
    this.scene.add(plinth);
    const light = new MeshStandardMaterial({ color: 0xd9c7a3, roughness: 0.6 });
    const dark = new MeshStandardMaterial({ color: 0x7b5a3e, roughness: 0.6 });
    const sq = new BoxGeometry(1, 0.1, 1);
    for (let f = 0; f < 8; f++)
      for (let k = 0; k < 8; k++) {
        const m = new Mesh(sq, (f + k) % 2 ? light : dark);
        m.position.set(f - 3.5, -0.05, 3.5 - k);
        m.receiveShadow = true;
        this.scene.add(m);
      }
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
      this.clock.update(ms);
      this.fx.update(ms * SPEED);
      for (const f of this.live)
        if (f.root.parent) f.update(ms * SPEED);
        else this.live.delete(f);
      this.controls.update();
      const cam = this.camera.position.clone();
      if (this.shake > 0) {
        this.shake -= ms;
        this.camera.position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.12));
      }
      this.renderer.render(this.scene, this.camera);
      this.camera.position.copy(cam);
    };
    this.raf = requestAnimationFrame(frame);

    void loadModels().then((m) => {
      if (this.disposed) return;
      this.models = m;
      this.ready = true;
      if (this.target) this.sync(this.target);
      this.highlight();
    });
  }

  /** Nothing acting out and nothing waiting. */
  get idle() {
    return this.ready && !this.busy && !this.queue.length;
  }

  dispose() {
    this.disposed = true;
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
    if (!this.ready) return;
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
    g.fillStyle = "#c9b48e";
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
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 8) return;
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
      if (k) mark(k.square, 0xff3030, 0.65, new CircleGeometry(0.46, 32).rotateX(-Math.PI / 2));
    }
    if (this.selected) {
      mark(this.selected, 0x6fd36f, 0.5, tile);
      for (const m of this.movesFrom(this.selected))
        mark(m.to, 0x6fd36f, 0.75, m.captured ? new RingGeometry(0.38, 0.47, 32).rotateX(-Math.PI / 2) : new CircleGeometry(0.14, 20).rotateX(-Math.PI / 2));
    }
  }

  // ---------- Positions ----------

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length && !this.disposed) {
      const next = this.queue.shift()!;
      // Far behind (a game loaded, moves flying in): catch up without acting.
      if (this.queue.length < 2) {
        try {
          await this.act(next);
        } catch (e) {
          console.error("arena", e);
        }
      }
      this.sync(next.fen);
    }
    this.busy = false;
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
        f = makeFig(w.role, w.side, this.models);
        this.figs.set(sq, f);
        this.live.add(f);
        this.scene.add(f.root);
      }
      f.root.position.copy(squareAt(sq));
      f.root.rotation.set(0, w.side === "w" ? Math.PI : 0, 0);
      f.body.position.set(0, 0, 0);
      f.body.rotation.set(0, 0, 0);
      f.body.scale.set(1, 1, 1);
      f.floating = false;
      clipAbove(f.mats, null);
      for (const s of f.stones) {
        s.position.copy(s.userData.home.pos);
        s.rotation.set(0, s.userData.home.rot, 0);
      }
      f.core?.scale.set(1, 1, 1);
      f.core?.position.setY(0.4);
      for (const r of f.runes) r.visible = false;
    }
    this.shown = fen;
  }

  private async act(next: { fen: string; lastMove?: string }) {
    if (!this.shown || !next.lastMove) return;
    const c = new Chess(this.shown);
    const u = next.lastMove;
    let m: Move;
    try {
      m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      return;
    }
    if (boardOf(c.fen()) !== boardOf(next.fen)) return;
    await this.run(m);
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
      if (mover.role === "r") await (victim ? this.portalKill(mover, m.to, victim) : this.rookMove(mover, m.to));
      else await this.slide(mover, m.to, victim);
      if (m.promotion) this.fx.burst(squareAt(m.to).setY(0.6), MAGIC[side], 30, { glow: true, speed: 1.5, up: 2.5, gravity: 1 });
    }
    this.figs.set(m.to, mover);
  }

  // ---------- The king ----------

  /** The king sends a piece: a gesture and an arc of magic from his staff to it. */
  private async order(king: Fig, target: Fig) {
    void king.cast(this.clock, "order");
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
    this.fx.dust(b, 10, 0xd8cdb8);
  }

  /** The king's kill: the piece turns to ash and crumbles to the ground from the top down. */
  private async wither(v: Fig) {
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

  private async tearDown(r: Fig) {
    const p = r.root.position.clone();
    if (r.kind === "code") {
      const stones = [...r.stones].sort((a, b) => b.userData.home.pos.y - a.userData.home.pos.y);
      const total = stones.length * 18 + 420;
      void tween(this.clock, total, (t) => {
        r.core!.scale.y = Math.max(0.01, 1 - t);
        r.core!.position.y = 0.4 * (1 - t);
      });
      await Promise.all(
        stones.map(async (s, i) => {
          await wait(this.clock, i * 18);
          const start = s.position.clone();
          const out = new Vector3(start.x, 0, start.z).normalize();
          const spin = (Math.random() - 0.5) * 5;
          if (i % 6 === 0) this.fx.dust(p, 5, 0x6a6470);
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
      return;
    }
    const top = r.height * 1.05;
    await tween(
      this.clock,
      900,
      (t) => {
        const y = top * (1 - t);
        clipAbove(r.mats, y);
        r.body.position.set((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03);
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          this.fx.spawn(new Vector3(p.x + Math.cos(a) * 0.35, y, p.z + Math.sin(a) * 0.35), {
            color: Math.random() < 0.5 ? 0x9aa6b8 : 0x6d84b8,
            size: 0.05 + Math.random() * 0.05,
            vel: new Vector3(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2),
            life: 900,
          });
        }
      },
      ease.in,
    );
    clipAbove(r.mats, 0);
    r.body.position.set(0, 0, 0);
    this.fx.dust(p, 18);
  }

  private async rebuild(r: Fig) {
    const p = r.root.position.clone();
    const magic = MAGIC[r.side];
    this.fx.dust(p, 10, 0xd8cdb8);
    if (r.kind === "code") {
      const stones = [...r.stones].sort((a, b) => a.userData.home.pos.y - b.userData.home.pos.y);
      for (const s of stones) {
        s.position.copy(s.userData.home.pos).setY(-0.45);
        s.rotation.set(0, s.userData.home.rot, 0);
      }
      for (const rune of r.runes) {
        rune.visible = true;
        (rune.material as MeshStandardMaterial).emissiveIntensity = 3;
      }
      const total = stones.length * 16 + 380;
      void tween(this.clock, total, (t) => {
        r.core!.scale.y = Math.max(0.01, t);
        r.core!.position.y = 0.4 * t;
      });
      await Promise.all(
        stones.map(async (s, i) => {
          await wait(this.clock, i * 16);
          const home = s.userData.home.pos.y;
          if (i % 4 === 0) this.fx.burst(p.clone().setY(home), magic, 3, { glow: true, speed: 0.8, up: 0.8, gravity: 0, life: 500 });
          await tween(this.clock, 380, (t) => (s.position.y = -0.45 + (home + 0.45) * t), ease.back);
        }),
      );
      await tween(this.clock, 400, (t) => r.runes.forEach((rune) => ((rune.material as MeshStandardMaterial).emissiveIntensity = 3 * (1 - t))));
      for (const rune of r.runes) rune.visible = false;
      return;
    }
    const top = r.height * 1.05;
    await tween(
      this.clock,
      1000,
      (t) => {
        const y = top * t;
        clipAbove(r.mats, y);
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          this.fx.spawn(new Vector3(p.x + Math.cos(a) * 0.38, y, p.z + Math.sin(a) * 0.38), {
            color: magic,
            size: 0.035,
            vel: new Vector3(0, 0.6, 0),
            life: 500,
            gravity: 0,
            glow: true,
          });
        }
      },
      ease.out,
    );
    clipAbove(r.mats, null);
  }

  /** The rook's kill: it drops through a portal the king opens under it and falls out of another onto the piece. */
  private async portalKill(r: Fig, to: string, v: Fig) {
    const a = r.root.position.clone();
    const b = squareAt(to);
    const magic = MAGIC[r.side];
    const below = new Portal(this.clock, this.scene, a.clone().setY(0.015), magic);
    await below.open();
    await tween(this.clock, 520, (t) => (r.root.position.y = -(r.height + 0.3) * t), ease.in);
    const PY = 2.7;
    const above = new Portal(this.clock, this.scene, b.clone().setY(PY), magic);
    void below.close();
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
    this.shake = 260;
    this.fx.dust(b, 24);
    await tween(this.clock, 240, (t) => (r.body.scale.y = 1 - 0.16 * Math.sin(t * Math.PI)));
    clipAbove(r.mats, null);
    await above.close();
  }

  /** Killed by a rook: flattened, bits flying, then gone into the board. */
  private async crush(v: Fig) {
    const p = v.root.position.clone();
    this.fx.burst(p.clone().setY(0.25), BODY[v.side], 20, { speed: 2.6, size: 0.07, up: 2.4 });
    await tween(this.clock, 130, (t) => v.body.scale.set(1 + 0.45 * t, 1 - 0.88 * t, 1 + 0.45 * t), ease.out);
    await wait(this.clock, 400);
    await tween(this.clock, 350, (t) => (v.root.position.y = -0.3 * t));
    v.root.removeFromParent();
  }

  // ---------- The other pieces (stand-ins) ----------

  private async slide(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const hop = f.role === "n";
    let hit = false;
    await tween(this.clock, Math.min(800, Math.max(350, a.distanceTo(b) * 200)), (t) => {
      f.root.position.set(a.x + (b.x - a.x) * t, hop ? Math.sin(t * Math.PI) * 0.6 : 0, a.z + (b.z - a.z) * t);
      if (victim && !hit && t > 0.6) {
        hit = true;
        void this.topple(victim, b.clone().sub(a));
      }
    });
  }

  /** A stand-in's kill, until they have their own: knocked over and sunk. */
  private async topple(v: Fig, dir: Vector3) {
    const axis = new Vector3(dir.z, 0, -dir.x).normalize();
    const start = v.root.quaternion.clone();
    await tween(
      this.clock,
      350,
      (t) => {
        v.root.quaternion.copy(start);
        v.root.rotateOnWorldAxis(axis, (Math.PI / 2) * t);
      },
      ease.in,
    );
    this.fx.dust(v.root.position, 8);
    await tween(this.clock, 400, (t) => (v.root.position.y = -0.4 * t));
    v.root.removeFromParent();
  }
}
