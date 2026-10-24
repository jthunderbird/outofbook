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
  PointLight,
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
import { Clock, Particles, Portal, SPEED, clip, clipAbove, ease, followClip, magicArc, ownMaterials, tween, wait } from "./fx";
import { MAGIC, makeFig, type Fig, type Role, type Side } from "./figures";

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
    this.flash.position.set(0, 2, 0);
    this.scene.add(this.flash);

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
  }

  /** Nothing acting out and nothing waiting. */
  get idle() {
    return !this.busy && !this.queue.length;
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
      const to = m.to;
      if (mover.role === "r") await (victim ? this.portalKill(mover, to, victim) : this.rookMove(mover, to));
      else if (mover.role === "n") await this.gallop(mover, to, victim);
      else if (mover.role === "b") await this.fly(mover, to, victim);
      else if (mover.role === "q") await this.glide(mover, to, victim);
      else await this.march(mover, to, victim);
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
    const stop = this.loop((ms) => {
      if (walking) phase += ms * 0.012;
      const s = walking ? Math.sin(phase) : 0;
      f.legs[0].rotation.x = s * 0.6;
      f.legs[1].rotation.x = -s * 0.6;
      f.body.position.y = Math.abs(s) * 0.025;
    });
    const pace = 750;
    if (victim) {
      const s = Math.max(0, 1 - 0.7 / dist);
      await this.line(f, this.along(a, b, s), s * dist * pace);
      walking = false;
      await f.swing(this.clock, "chop");
      void this.strikeDown(victim, b.clone().sub(a));
      await wait(this.clock, 300);
      walking = true;
      await this.line(f, b, (1 - s) * dist * pace);
    } else await this.line(f, b, dist * pace);
    stop();
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /** Knights: gallop the L, leaping on the long leg; to take, a sword slash that cuts the piece in half. */
  private async gallop(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const d = b.clone().sub(a);
    const corner = Math.abs(d.x) > Math.abs(d.z) ? new Vector3(b.x, 0, a.z) : new Vector3(a.x, 0, b.z);
    let phase = 0;
    let running = true;
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
      f.body.rotation.x = s * 0.07;
      f.body.position.y = Math.max(0, s) * 0.05;
    });
    const pace = 380;
    const face = (p: Vector3, q: Vector3) => this.turn(f, Math.atan2(q.x - p.x, q.z - p.z), 150);
    await face(a, corner);
    await this.line(f, corner, a.distanceTo(corner) * pace, (t) => Math.sin(Math.PI * t) * 0.35);
    await face(corner, b);
    const len = corner.distanceTo(b);
    if (victim) {
      const s = Math.max(0, 1 - 0.75 / len);
      await this.line(f, this.along(corner, b, s), Math.max(1, s * len * pace));
      running = false;
      f.rest();
      f.root.rotation.y = Math.atan2(b.x - corner.x, b.z - corner.z);
      await f.swing(this.clock, "slash");
      void this.slice(victim, b.clone().sub(corner).normalize());
      await wait(this.clock, 450);
      running = true;
      await this.line(f, b, (1 - s) * len * pace);
    } else await this.line(f, b, len * pace);
    stop();
    f.rest();
    await this.turn(f, this.restFacing(f));
  }

  /** Bishops: fly; to take, arrive above the piece crackling and strike it down with lightning. */
  private async fly(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const bolt = BOLT[f.side];
    await this.turn(f, Math.atan2(b.x - a.x, b.z - a.z));
    const H = victim ? victim.height + 0.35 : 0.8;
    f.floating = true;
    let charged = !!victim;
    const sparks = this.loop(() => {
      if (!charged) return;
      for (let i = 0; i < 2; i++)
        this.fx.spawn(f.middle().add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6)), {
          color: bolt,
          size: 0.025,
          vel: new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
          life: 220,
          gravity: 0,
          glow: true,
        });
    });
    await tween(this.clock, 350, (t) => {
      f.root.position.y = H * t;
      f.body.rotation.x = 0.2 * t;
    });
    await this.line(f, b, Math.max(450, a.distanceTo(b) * 220), () => H, ease.inOut);
    if (victim) {
      void f.cast(this.clock, "kill");
      await wait(this.clock, 220);
      await this.smite(f.staffTip(), victim, bolt, b.clone().sub(a));
      charged = false;
    }
    await tween(
      this.clock,
      350,
      (t) => {
        f.root.position.y = H * (1 - t);
        f.body.rotation.x = 0.2 * (1 - t);
      },
      ease.in,
    );
    sparks();
    f.floating = false;
    this.fx.dust(b, 8, 0xd8cdb8);
    await this.turn(f, this.restFacing(f));
  }

  /** Queens: a swift, smooth float, no turning; to take, a fiery hole opens under the piece as she comes. */
  private async glide(f: Fig, to: string, victim?: Fig) {
    const a = f.root.position.clone();
    const b = squareAt(to);
    const dist = a.distanceTo(b);
    const ms = Math.max(500, dist * 170);
    f.floating = true;
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

  /** Killed by a pawn or lightning: knocked over away from the blow, then sunk into the board. */
  private async strikeDown(v: Fig, dir: Vector3) {
    const axis = new Vector3(dir.z, 0, -dir.x).normalize();
    const start = v.root.quaternion.clone();
    this.fx.burst(v.middle(), 0xfff2c0, 8, { glow: true, speed: 1.5, size: 0.04, life: 300 });
    await tween(
      this.clock,
      320,
      (t) => {
        v.root.quaternion.copy(start);
        v.root.rotateOnWorldAxis(axis, (Math.PI / 2) * t);
      },
      ease.in,
    );
    this.fx.dust(v.root.position, 10);
    await wait(this.clock, 300);
    await tween(this.clock, 400, (t) => (v.root.position.y = -0.4 * t));
    v.root.removeFromParent();
  }

  /** Killed by a knight: cut through the middle on a slant; the top slides off and falls, then both go. */
  private async slice(v: Fig, dir: Vector3) {
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
    await tween(this.clock, 400, (t) => {
      v.root.position.y = -0.5 * t;
      top.position.y = start.y - v.height * 0.4 - 0.6 * t;
    });
    v.root.removeFromParent();
    top.removeFromParent();
  }

  /** A jagged bolt from a to b (a core and a colored glow, a side branch); removed by the caller. */
  private bolt(a: Vector3, b: Vector3, color: number) {
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
    const pts = jag(a, b, 9, 0.3);
    const fork = pts[3 + Math.floor(Math.random() * 3)];
    jag(fork, fork.clone().add(new Vector3((Math.random() - 0.5) * 0.8, -0.5, (Math.random() - 0.5) * 0.8)), 4, 0.15);
    this.scene.add(g);
    return () => {
      g.removeFromParent();
      g.traverse((o) => (o as Mesh).geometry?.dispose());
    };
  }

  /** Lightning: three flickering bolts and a flash, the piece scorched and knocked to the ground. */
  private async smite(from: Vector3, v: Fig, color: number, dir: Vector3) {
    const at = v.middle();
    this.flash.color.setHex(color);
    this.flash.position.copy(at).setY(at.y + 0.6);
    for (let i = 0; i < 3; i++) {
      const done = this.bolt(from, at, color);
      this.flash.intensity = 40;
      if (i === 0) {
        this.shake = 150;
        this.fx.burst(at, color, 20, { glow: true, speed: 2.5, size: 0.04, life: 450 });
        void this.char(v, 0.7, 250);
      }
      await wait(this.clock, 70);
      done();
      this.flash.intensity = 6;
      await wait(this.clock, 45);
    }
    void tween(this.clock, 300, (t) => (this.flash.intensity = 6 * (1 - t)));
    for (let i = 0; i < 6; i++)
      this.fx.spawn(at.clone(), { color: 0x555555, size: 0.08, vel: new Vector3((Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3), life: 900, gravity: 0, round: true });
    await this.strikeDown(v, dir);
  }

  /** Killed by the queen: a fiery hole opens under the piece; it burns to a crisp and falls through. */
  private async burn(v: Fig) {
    const p = v.root.position.clone();
    const hole = new Portal(this.clock, this.scene, p.clone().setY(0.015), new Color(0xff5a1a));
    const flames = this.loop(() => {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const onFig = i === 0;
        const at = onFig
          ? v.root.position.clone().add(new Vector3((Math.random() - 0.5) * 0.4, Math.random() * v.height, (Math.random() - 0.5) * 0.4))
          : new Vector3(p.x + Math.cos(a) * 0.45, 0.03, p.z + Math.sin(a) * 0.45);
        this.fx.spawn(at, {
          color: Math.random() < 0.5 ? 0xff7a1a : 0xffd04a,
          size: 0.04 + Math.random() * 0.04,
          vel: new Vector3(0, 1 + Math.random(), 0),
          life: 450,
          gravity: 0,
          glow: true,
        });
      }
    });
    await hole.open(280);
    await this.char(v, 1, 400);
    await tween(
      this.clock,
      850,
      (t) => {
        v.root.position.y = -(v.height + 0.3) * t;
        v.body.rotation.y = t * 1.5;
      },
      ease.in,
    );
    flames();
    v.root.removeFromParent();
    await hole.close(300);
  }
}

/** Lightning's color: white gold for white, violet for black. */
const BOLT: Record<Side, number> = { w: 0xfff0a0, b: 0xc07bff };
