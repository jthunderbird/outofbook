// The Epoch Drifters tribe: Chess Legions' 16-bit tribe. Its figures are pixel
// sprites (pixel/sprites.ts) on upright cards that always turn to face the
// camera, lit by the scene like any figure: a normal map gives them roundness,
// and they cast shadows. Like the sprites of an old RPG they breathe while
// they wait, walk to their square in a four-frame step (the dragon flies), and
// strike in three frames, each kind with its own blow: the hero's slash, the
// dragon's fire, the cleric's light, the guardian's quake, the princess's charm
// and the king's lightning. A victim of any tribe flashes and breaks apart:
// into its own pixels if it is a sprite.
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  RGBADepthPacking,
  CanvasTexture,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Intersection,
  type Texture,
} from "three";
import { squareAt } from "./board";
import { Fig, type Role, type Side } from "./figures";
import { ease, magicArc, ownMaterials, tween, wait } from "./fx";
import { normalMap, sprite, type Motion } from "./pixel/sprites";
import type { Stage, Tribe, TribeMove } from "./tribe";

/** A card's height: pawns a little smaller than the rest. */
const HEIGHT: Record<Role, number> = { p: 1.1, n: 1.4, b: 1.4, r: 1.4, q: 1.4, k: 1.4 };
const plane = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
const UP = new Vector3(0, 1, 0);

/** How far the cards lean back (a little in a 3D view; at the camera's own angle in a flat one, so they stand upright on the screen) and their size. Set by the scene. */
export const lean = { tilt: 0.3, size: 1 };

/** What a figure is doing, which picks its frame: breathing, walking, or a given frame of its strike. */
interface Act {
  motion: Motion;
  i: number;
  phase: number;
}

const frames = new Map<string, { map: Texture; normal: Texture }>();
function frame(role: Role, side: Side, motion: Motion, i: number) {
  const key = `${role}${side}${motion}${i}`;
  let f = frames.get(key);
  if (!f) {
    const src = sprite(role, side, motion, i);
    const map = new CanvasTexture(src);
    map.magFilter = map.minFilter = NearestFilter;
    map.colorSpace = SRGBColorSpace;
    map.generateMipmaps = false;
    f = { map, normal: normalMap(src) };
    frames.set(key, f);
  }
  return f;
}

const shadowBlob = (() => {
  let t: CanvasTexture | null = null;
  return () => {
    if (!t) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      r.addColorStop(0, "rgba(10,5,30,.7)");
      r.addColorStop(1, "rgba(10,5,30,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      t = new CanvasTexture(c);
    }
    return t;
  };
})();

const act = (f: Fig) => f.root.userData.act as Act;
const setAct = (f: Fig, motion: Motion, i = 0) => Object.assign(act(f), { motion, i });

function epochFigure(role: Role, side: Side): Fig {
  const h = HEIGHT[role];
  const f = new Fig(role, side, h);
  const first = frame(role, side, "idle", 0);
  // Matte, and only faintly self-lit, so bright light and glow never wash the pixels out.
  const mat = new MeshStandardMaterial({
    map: first.map,
    normalMap: first.normal,
    normalScale: new Vector2(1.1, 1.1),
    alphaTest: 0.5,
    roughness: 1,
    metalness: 0,
    color: new Color(0.86, 0.86, 0.86),
    envMapIntensity: 0.25,
    emissive: new Color(0xffffff),
    emissiveMap: first.map,
    emissiveIntensity: 0.06,
    side: DoubleSide,
  });
  const card = new Mesh(plane, mat);
  card.castShadow = true;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: first.map, alphaTest: 0.5 });
  card.customDepthMaterial = depth;
  f.root.userData.act = { motion: "idle", i: 0, phase: Math.random() * 2 } satisfies Act;
  // Only the drawn pixels can be tapped: a card's empty corners must not take a tap meant for the square or piece behind it.
  const alpha = sprite(role, side).getContext("2d")!.getImageData(0, 0, 32, 32).data;
  card.raycast = (caster, out) => {
    const hits: Intersection[] = [];
    Mesh.prototype.raycast.call(card, caster, hits);
    for (const hit of hits) {
      if (!hit.uv) continue;
      const x = Math.min(31, Math.floor(hit.uv.x * 32));
      const y = Math.min(31, Math.floor((1 - hit.uv.y) * 32));
      if (alpha[(y * 32 + x) * 4 + 3] > 127) out.push(hit);
    }
  };
  const blob = new Mesh(new PlaneGeometry(0.95, 0.55).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: shadowBlob(), transparent: true, depthWrite: false }));
  blob.position.y = 0.01;
  f.body.add(blob, card);
  f.mats = ownMaterials(f.body);
  // Each frame (on the card's own material, which ownMaterials made): the card turns to the camera about the vertical (unless the figure is knocked over), standing on its square's middle, and shows the frame of what it is doing.
  const q = new Quaternion();
  const pq = new Quaternion();
  const at = new Vector3();
  card.onBeforeRender = (_r, _s, camera) => {
    const a = act(f);
    const now = performance.now() / 1000;
    const i = a.motion === "idle" ? Math.floor(now / 0.6 + a.phase) % 2 : a.motion === "walk" ? Math.floor(now / 0.11) % 4 : a.i;
    const fr = frame(role, side, a.motion, i);
    const m = card.material as MeshStandardMaterial;
    if (m.map !== fr.map) {
      m.map = m.emissiveMap = depth.map = fr.map;
      m.normalMap = fr.normal;
    }
    card.scale.set(h * lean.size, h * lean.size, 1);
    card.parent!.getWorldQuaternion(pq);
    if (UP.clone().applyQuaternion(pq).y < 0.95) return;
    card.getWorldPosition(at);
    q.setFromAxisAngle(UP, Math.atan2(camera.position.x - at.x, camera.position.z - at.z));
    card.quaternion.copy(pq.invert()).multiply(q);
    card.rotateX(-lean.tilt);
    card.updateMatrixWorld(true);
  };
  f.root.userData.pixels = role + side;
  return f;
}

export const epoch: Tribe = {
  id: "epoch-drifters",
  name: "Epoch Drifters",
  figure: epochFigure,
  play: (stage, move) => play(stage, move),
};

/** Walks (the dragon flies, in an arc) from where f stands to b. */
async function travel(stage: Stage, f: Fig, b: Vector3, ms?: number) {
  const a = f.root.position.clone();
  const fly = f.role === "n" ? 0.8 : 0;
  setAct(f, "walk");
  await tween(stage.clock, ms ?? Math.max(360, a.distanceTo(b) * 260), (t) => f.root.position.set(a.x + (b.x - a.x) * t, Math.sin(Math.PI * t) * fly, a.z + (b.z - a.z) * t), ease.inOut);
  setAct(f, "idle");
}

const flashLight = (stage: Stage, at: Vector3, color: number, power = 6, ms = 420) => {
  stage.flash.position.copy(at).setY(1.4);
  stage.flash.color.set(color);
  return tween(stage.clock, ms, (t) => (stage.flash.intensity = power * (1 - t)));
};

/** Each kind's blow on the figure it strikes, timed to the strike frame. */
async function blow(stage: Stage, a: Fig, v: Fig) {
  const at = v.root.position.clone();
  const mid = at.clone().setY(v.height * 0.5);
  const fx = stage.fx;
  if (a.role === "p") {
    // A white slash across the victim, high left to low right.
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      fx.spawn(new Vector3(at.x - 0.45 + t * 0.9, v.height * (0.85 - t * 0.6), at.z + 0.05), {
        color: i % 3 ? 0xffffff : 0xbfeaff,
        size: 0.07,
        vel: new Vector3(0.3, 0, 0),
        life: 260,
        gravity: 0,
        glow: true,
      });
    }
    void flashLight(stage, at, 0xffffff, 3, 220);
  } else if (a.role === "n") {
    // Fire poured from the dragon's mouth onto the victim.
    const mouth = a.root.position.clone().setY(a.height * lean.size * 0.62);
    void flashLight(stage, at, 0xff8a2a, 7, 600);
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < 7; i++) {
        const dir = mid.clone().sub(mouth);
        fx.spawn(mouth, {
          color: [0xffe85c, 0xffb13b, 0xff6a2a][i % 3],
          size: 0.09,
          vel: dir.multiplyScalar(2.2).add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.6)),
          life: 420,
          gravity: -1,
          glow: true,
        });
      }
      await wait(stage.clock, 60);
    }
  } else if (a.role === "b") {
    // A pillar of light down onto the victim.
    void flashLight(stage, at, 0xfff0b0, 7, 520);
    for (let i = 0; i < 30; i++)
      fx.spawn(new Vector3(at.x + (Math.random() - 0.5) * 0.35, Math.random() * 2.4, at.z + (Math.random() - 0.5) * 0.35), {
        color: i % 2 ? 0xffffff : 0xfff0a0,
        size: 0.06,
        vel: new Vector3(0, -1.5, 0),
        life: 500,
        gravity: 0,
        glow: true,
      });
  } else if (a.role === "r") {
    // The guardian's fists hit the ground: the board shakes, rock and dust fly.
    stage.shake = 340;
    fx.dust(at, 22, 0x9097ad);
    fx.burst(at.clone().setY(0.2), 0x8d93a8, 14, { speed: 1.6, up: 2.2, size: 0.09 });
  } else if (a.role === "q") {
    // A ring of charm sparkles closing in on the victim.
    void flashLight(stage, at, 0xff9ec2, 5, 520);
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const from = new Vector3(at.x + Math.cos(ang) * 0.8, 0.3 + (i % 4) * 0.25, at.z + Math.sin(ang) * 0.8);
      fx.spawn(from, { color: i % 2 ? 0xff9ec2 : 0xffffff, size: 0.06, vel: mid.clone().sub(from).multiplyScalar(2.2), life: 450, gravity: 0, glow: true });
    }
  } else {
    // The king's lightning from his scepter.
    void flashLight(stage, at, 0xffe85c, 7, 480);
    await magicArc(stage.clock, stage.scene, a.root.position.clone().add(new Vector3(0.3, a.height * lean.size * 0.75, 0)), mid, 0xffe85c, 380);
  }
}

/** The victim flashes white, then breaks apart: into its own pixels if it is a sprite, else into chips of its colors. */
async function shatter(stage: Stage, v: Fig) {
  const lit = v.mats.filter((m): m is MeshStandardMaterial => "emissive" in m);
  for (const m of lit) m.emissive = new Color(0xffffff);
  await tween(stage.clock, 220, (t) => lit.forEach((m) => (m.emissiveIntensity = Math.sin(t * Math.PI * 3) * 0.6 + t)));
  const at = v.root.position.clone();
  const pixels = v.root.userData.pixels as string | undefined;
  if (pixels) {
    const a = act(v);
    const d = sprite(pixels[0] as Role, pixels[1] as Side, a.motion, a.i)
      .getContext("2d")!
      .getImageData(0, 0, 32, 32).data;
    const hh = v.height * lean.size;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        if (d[i + 3] < 128 || (x + y) % 2) continue;
        const ox = ((x - 15.5) / 32) * hh;
        stage.fx.spawn(new Vector3(at.x + ox, ((31 - y) / 32) * hh, at.z), {
          color: new Color(`rgb(${d[i]},${d[i + 1]},${d[i + 2]})`),
          size: 0.045 * lean.size + 0.01,
          vel: new Vector3(ox * 1.6 + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6),
          life: 700 + Math.random() * 500,
          gravity: 5,
        });
      }
  } else {
    const colors = v.mats.map((m) => (m as MeshStandardMaterial).color).filter(Boolean);
    for (let i = 0; i < 70; i++) {
      const c = colors[i % Math.max(1, colors.length)] ?? new Color(0xcccccc);
      stage.fx.spawn(new Vector3(at.x + (Math.random() - 0.5) * 0.5, Math.random() * v.height, at.z + (Math.random() - 0.5) * 0.5), {
        color: c,
        size: 0.05 + Math.random() * 0.04,
        vel: new Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2),
        life: 700 + Math.random() * 500,
        gravity: 5,
      });
    }
  }
  v.root.removeFromParent();
}

/** The three frames of a strike, with the blow landing on the second. */
async function strike(stage: Stage, a: Fig, v: Fig) {
  setAct(a, "attack", 0);
  await wait(stage.clock, 200);
  setAct(a, "attack", 1);
  stage.sound.play("knock", { gain: 0.6 });
  await blow(stage, a, v);
  void shatter(stage, v);
  await wait(stage.clock, 260);
  setAct(a, "attack", 2);
  await wait(stage.clock, 180);
  setAct(a, "idle");
}

async function play(stage: Stage, { mover, to, victim, castle }: TribeMove) {
  const b = squareAt(to);
  if (castle) {
    await travel(stage, mover, b);
    await travel(stage, castle.rook, squareAt(castle.to));
    return;
  }
  if (victim) {
    // Up to the victim (the dragon and the king strike from a distance), the strike, then onto the square.
    const at = victim.root.position.clone();
    const dir = at.clone().sub(mover.root.position).setY(0);
    const reach = mover.role === "n" || mover.role === "k" ? 1.4 : 0.8;
    const near = at.clone().sub(dir.clone().normalize().multiplyScalar(Math.min(reach, dir.length())));
    if (mover.root.position.distanceTo(near) > 0.05) await travel(stage, mover, near);
    await strike(stage, mover, victim);
  }
  await travel(stage, mover, b, victim ? 320 : undefined);
}
