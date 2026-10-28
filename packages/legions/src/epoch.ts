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
import { clipAbove, ease, magicArc, ownMaterials, tween, wait } from "./fx";
import { beam, flames, normalMap, sprite, type Motion } from "./pixel/sprites";
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
  /** Facing left on the screen (drawn mirrored): the dragon turns to where it goes and keeps facing that way. */
  flip: boolean;
  /** Turned in the card's plane about its foot (the dragon rearing up), in radians. */
  roll?: number;
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
  f.root.userData.act = { motion: "idle", i: 0, phase: Math.random() * 2, flip: false } satisfies Act;
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
  // The whole card takes the depth of its foot (brought a hair toward the camera): a card stands up the screen and so
  // reaches back over the square behind it, where a taller figure there would otherwise cut off its head. Drawn this way
  // a card is in front of everything behind its foot and behind everything in front of it, as a 2D game draws its sprites.
  (card.material as MeshStandardMaterial).onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 footView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      footView.z += 0.08;
      vec4 footClip = projectionMatrix * footView;
      gl_Position.z = footClip.z / footClip.w * gl_Position.w;`,
    );
  };
  // Each frame (on the card's own material, which ownMaterials made): the card turns to the camera about the vertical (unless the figure is knocked over), standing on its square's middle, and shows the frame of what it is doing.
  const q = new Quaternion();
  const pq = new Quaternion();
  const at = new Vector3();
  card.onBeforeRender = (_r, _s, camera) => {
    const a = act(f);
    const now = performance.now() / 1000;
    const i = a.motion === "idle" ? Math.floor(now / 0.6 + a.phase) % 2 : a.motion === "walk" ? Math.floor(now / 0.11) % 4 : a.motion === "fly" ? Math.floor(now / 0.09) % 4 : a.i;
    const fr = frame(role, side, a.motion, i);
    const m = card.material as MeshStandardMaterial;
    if (m.map !== fr.map) {
      m.map = m.emissiveMap = depth.map = fr.map;
      m.normalMap = fr.normal;
    }
    card.scale.set(h * lean.size * (a.flip ? -1 : 1), h * lean.size, 1);
    // Standing upright to a flat view, a card would throw a long smear of shadow: there only the soft spot beneath it shows.
    card.castShadow = lean.tilt < 0.6;
    card.parent!.getWorldQuaternion(pq);
    if (UP.clone().applyQuaternion(pq).y < 0.95) return;
    card.getWorldPosition(at);
    q.setFromAxisAngle(UP, Math.atan2(camera.position.x - at.x, camera.position.z - at.z));
    card.quaternion.copy(pq.invert()).multiply(q);
    card.rotateX(-lean.tilt);
    if (a.roll) card.rotateZ(a.roll);
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
  hero: (stage, f) => hero(stage, f),
};

/**
 * The campaign's showcase: the dragon, turned to the middle of the screen,
 * looks happily out at the player, hops now and then, and every so often rears
 * its head up and breathes a spout of fire into the air.
 */
function hero(stage: Stage, f: Fig) {
  let on = true;
  const a = act(f);
  face(stage, f, stage.camera.position.clone().setY(0));
  void (async () => {
    while (on) {
      await wait(stage.clock, 1800 + Math.random() * 1200);
      if (!on) break;
      // A happy hop or two.
      for (let i = 0; i < 2 && on; i++) await tween(stage.clock, 320, (t) => (f.root.position.y = Math.sin(t * Math.PI) * 0.22));
      await wait(stage.clock, 900 + Math.random() * 900);
      if (!on) break;
      await breathe();
    }
  })();
  async function breathe() {
    const k = a.flip ? -1 : 1;
    setAct(f, "attack", 0);
    await tween(stage.clock, 380, (t) => (a.roll = k * 0.5 * t), ease.out);
    setAct(f, "attack", 1);
    // The mouth, the card turned up about its foot: fire rises from it in tongues that climb, swell and go.
    const h = f.height * lean.size;
    const [x, y] = [k * 0.4 * h, 0.62 * h];
    const [c, s] = [Math.cos(k * 0.5), Math.sin(k * 0.5)];
    const mouth = f.root.position
      .clone()
      .addScaledVector(screenRight(stage), x * c - y * s)
      .add(new Vector3(0, (x * s + y * c) * Math.cos(lean.tilt), 0));
    const lean2 = screenRight(stage).multiplyScalar(k * 0.25);
    void flashLight(stage, mouth, 0xff8a2a, 5, 1300);
    stage.sound.play("knock", { gain: 0.3 });
    for (let i = 0; i < 9 && on; i++) {
      const card = effectCard(stage, flames(), 14, 0.35, 0.5, mouth.clone());
      void tween(stage.clock, 650, (t) => {
        card.mesh.position
          .copy(mouth)
          .addScaledVector(lean2, t)
          .add(new Vector3(0, t * 2.2, 0));
        card.mesh.scale.set(0.35 + t * 0.5, 0.5 + t * 0.7, 1);
        if (t >= 1) card.remove();
      });
      stage.fx.burst(mouth.clone().add(new Vector3(0, 0.3, 0)), 0xffb040, 3, { glow: true, speed: 0.8, up: 2.4, size: 0.04, life: 700, gravity: 1 });
      await wait(stage.clock, 110);
    }
    await wait(stage.clock, 250);
    setAct(f, "idle");
    await tween(stage.clock, 420, (t) => (a.roll = k * 0.5 * (1 - t)), ease.inOut);
  }
  return () => {
    on = false;
    a.roll = 0;
  };
}

/** The screen's rightward direction in the world. */
const screenRight = (stage: Stage) => new Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0).setY(0).normalize();

/** The dragon (drawn facing right) turns to face b on the screen, if b lies clearly to one side; otherwise it keeps its way. */
function face(stage: Stage, f: Fig, b: Vector3) {
  if (f.role !== "n") return;
  const d = b.clone().sub(f.root.position).dot(screenRight(stage));
  if (Math.abs(d) > 0.2) act(f).flip = d < 0;
}

/** Walks from where f stands to b; the dragon takes off, flies and lands. */
async function travel(stage: Stage, f: Fig, b: Vector3, ms?: number) {
  const a = f.root.position.clone();
  if (f.role === "n") return flyTo(stage, f, b, 0, ms);
  setAct(f, "walk");
  await tween(stage.clock, ms ?? Math.max(360, a.distanceTo(b) * 260), (t) => f.root.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t), ease.inOut);
  setAct(f, "idle");
}

/** The dragon flies, wings beating, from where it is (on the ground or in the air) to b at height y, rising over the way. */
async function flyTo(stage: Stage, f: Fig, b: Vector3, y: number, ms?: number) {
  const a = f.root.position.clone();
  const top = Math.max(a.y, y) + 0.7;
  face(stage, f, b);
  setAct(f, "fly");
  await tween(
    stage.clock,
    ms ?? Math.max(520, a.distanceTo(b) * 300),
    (t) => {
      // Up quickly, along, and down to the end height: a smooth hump through top.
      const h = t < 0.5 ? a.y + (top - a.y) * Math.sin(t * Math.PI) : y + (top - y) * Math.sin(t * Math.PI);
      f.root.position.set(a.x + (b.x - a.x) * t, h, a.z + (b.z - a.z) * t);
    },
    ease.inOut,
  );
  setAct(f, y > 0.05 ? "fly" : "idle");
}

const flashLight = (stage: Stage, at: Vector3, color: number, power = 6, ms = 420) => {
  stage.flash.position.copy(at).setY(1.4);
  stage.flash.color.set(color);
  return tween(stage.clock, ms, (t) => (stage.flash.intensity = power * (1 - t)));
};

const fxTextures = new Map<HTMLCanvasElement, Texture>();
/**
 * A pixel-art effect (fire, a pillar of light) on a card that faces the camera
 * like the figures, its frames played at fps; w and h in squares, standing on at,
 * drawn over the figures.
 */
function effectCard(stage: Stage, pics: HTMLCanvasElement[], fps: number, w: number, h: number, at: Vector3) {
  const tex = pics.map((c) => {
    let t = fxTextures.get(c);
    if (!t) {
      t = new CanvasTexture(c);
      t.magFilter = t.minFilter = NearestFilter;
      t.colorSpace = SRGBColorSpace;
      t.generateMipmaps = false;
      fxTextures.set(c, t);
    }
    return t;
  });
  // Drawn over everything, so the fire engulfing a figure is never hidden behind it.
  const mat = new MeshBasicMaterial({ map: tex[0], alphaTest: 0.5, toneMapped: false, side: DoubleSide, depthTest: false });
  const m = new Mesh(plane, mat);
  m.renderOrder = 5;
  m.position.copy(at);
  m.scale.set(w, h, 1);
  const start = performance.now();
  m.onBeforeRender = (_r, _s, camera) => {
    mat.map = tex[Math.floor(((performance.now() - start) / 1000) * fps) % tex.length];
    m.rotation.set(0, Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z), 0);
    m.rotateX(-lean.tilt);
    m.updateMatrixWorld(true);
  };
  stage.scene.add(m);
  return {
    mesh: m,
    remove: () => {
      m.removeFromParent();
      mat.dispose();
    },
  };
}

/** Fades a figure's materials (for one thrown off into the distance). */
function fade(v: Fig, k: number) {
  for (const m of v.mats) {
    m.transparent = true;
    m.opacity = k;
    if ("alphaTest" in m && m.alphaTest) m.alphaTest = 0.01;
  }
}

const HOME = ["epoch-drifters", "epoch-flat"];

/**
 * The princess's grand blow: she lifts the victim off its square with her magic,
 * then throws it away. On her tribe's home boards it sails up out of the top of
 * the view and falls back into sight far off in the background, smaller and
 * smaller, fading away; elsewhere it is simply gone out of the top of the view.
 */
async function throwAway(stage: Stage, q: Fig, v: Fig) {
  const at = v.root.position.clone();
  setAct(q, "attack", 0);
  void flashLight(stage, at, 0xff9ec2, 4, 900);
  await tween(stage.clock, 800, (t) => {
    v.root.position.y = 1.3 * ease.inOut(t);
    v.root.rotation.z = Math.sin(t * 9) * 0.08;
    if (Math.random() < 0.5)
      stage.fx.spawn(at.clone().add(new Vector3((Math.random() - 0.5) * 0.9, v.root.position.y + Math.random() * v.height, (Math.random() - 0.5) * 0.4)), {
        color: Math.random() < 0.5 ? 0xff9ec2 : 0xffffff,
        size: 0.05,
        vel: new Vector3(0, 0.6, 0),
        life: 500,
        gravity: 0,
        glow: true,
      });
  });
  setAct(q, "attack", 1);
  stage.sound.play("knock", { gain: 0.5 });
  // Away from the camera and up: out over the top of the view.
  const cam = stage.camera.position;
  const away = at.clone().sub(cam).setY(0).normalize();
  const from = v.root.position.clone();
  await tween(stage.clock, 520, (t) => {
    v.root.position
      .copy(from)
      .addScaledVector(away, 3 * t)
      .add(new Vector3(0, 16 * t * t, 0));
    v.root.rotation.z += 0.25;
  });
  setAct(q, "attack", 2);
  if (!HOME.includes(stage.court)) {
    v.root.removeFromParent();
    return;
  }
  // Back into sight in the far background, falling away: placed along rays through the screen, from just over its top edge down toward the middle, ever further off.
  const near = cam.distanceTo(new Vector3(0, 0, 0));
  // Off to one side of the board, so it is seen falling away past it.
  const nx = (Math.random() < 0.5 ? -1 : 1) * (0.72 + Math.random() * 0.12);
  const p = new Vector3();
  const scale = v.root.scale.x;
  void (async () => {
    await tween(stage.clock, 1700, (t) => {
      p.set(nx * (1 + 0.06 * t), 1.15 - 0.75 * t, 0.5)
        .unproject(stage.camera)
        .sub(cam)
        .normalize();
      v.root.position.copy(cam).addScaledVector(p, near + 10 + 60 * t);
      v.root.scale.setScalar(scale * (0.9 - 0.75 * t));
      v.root.rotation.z += 0.12;
      fade(v, t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
    });
    v.root.removeFromParent();
  })();
}

/**
 * The dragon's blow: it hovers before the victim and pours fire over it until
 * pixel flames engulf it whole; the victim chars and burns down to ash.
 */
async function burn(stage: Stage, d: Fig, v: Fig) {
  const at = v.root.position.clone();
  const fx = stage.fx;
  setAct(d, "attack", 0);
  await wait(stage.clock, 220);
  setAct(d, "attack", 1);
  // The breath: flames along the way from the mouth to the victim, then the victim engulfed.
  const side = act(d).flip ? -1 : 1;
  const mouth = d.root.position
    .clone()
    .add(new Vector3(0, d.height * lean.size * 0.62, 0))
    .addScaledVector(screenRight(stage), side * 0.4 * d.height * lean.size);
  const cards = [] as ReturnType<typeof effectCard>[];
  for (let i = 1; i <= 3; i++) {
    const p = mouth
      .clone()
      .lerp(at, i / 4)
      .setY(Math.max(0, mouth.y + (0.4 - mouth.y) * (i / 4) - 0.3));
    cards.push(effectCard(stage, flames(), 12, 0.45 + i * 0.12, 0.6 + i * 0.15, p));
    await wait(stage.clock, 70);
  }
  const big = v.height * 1.25 * (v.root.userData.pixels ? lean.size : 1);
  for (const [dx, dz, k] of [
    [0, 0.06, 1],
    [-0.34, -0.02, 0.8],
    [0.34, -0.02, 0.85],
  ] as const)
    cards.push(effectCard(stage, flames(), 12, 1.25 * k, big * k, at.clone().add(new Vector3(dx, 0, dz))));
  stage.sound.play("knock", { gain: 0.5 });
  void tween(stage.clock, 1100, (t) => {
    stage.flash.position.copy(at).setY(1.2);
    stage.flash.color.set(0xff8a2a);
    stage.flash.intensity = (5 + Math.sin(t * 40) * 2) * (1 - t * 0.6);
  });
  // The victim chars black and burns down from the top.
  const lit = v.mats.filter((m): m is MeshStandardMaterial => "emissive" in m);
  for (const m of lit) m.emissive = new Color(0xff5a1a);
  await tween(stage.clock, 1000, (t) => {
    for (const m of lit) {
      m.color.lerp(new Color(0x140a06), 0.08);
      m.emissiveIntensity = 0.6 * (1 - t) + Math.random() * 0.3;
    }
    clipAbove(v.mats, v.height * (v.root.userData.pixels ? lean.size : 1) * (1.05 - t) + 0.02);
    if (Math.random() < 0.6)
      fx.spawn(at.clone().add(new Vector3((Math.random() - 0.5) * 0.5, Math.random() * big * (1 - t), 0)), {
        color: Math.random() < 0.5 ? 0x3a3330 : 0x6a605a,
        size: 0.05,
        vel: new Vector3((Math.random() - 0.5) * 0.4, 1 + Math.random(), 0),
        life: 900,
        gravity: -0.3,
      });
  });
  v.root.removeFromParent();
  setAct(d, "attack", 2);
  await tween(stage.clock, 260, (t) => cards.forEach((c) => c.mesh.scale.setY(c.mesh.scale.y * (1 - t * 0.3))));
  for (const c of cards) c.remove();
  stage.flash.intensity = 0;
}

/** The cleric's blow: a pillar of holy light falls on the victim, which turns to light and rises away in sparks. */
async function smite(stage: Stage, c: Fig, v: Fig) {
  const at = v.root.position.clone();
  setAct(c, "attack", 0);
  await wait(stage.clock, 220);
  setAct(c, "attack", 1);
  const pillar = effectCard(stage, beam(), 10, 0.9, 0.1, at);
  void flashLight(stage, at, 0xfff0b0, 9, 900);
  stage.sound.play("knock", { gain: 0.5 });
  // The pillar drops from the sky to the ground.
  await tween(stage.clock, 220, (t) => pillar.mesh.scale.setY(0.1 + 5.9 * t));
  const lit = v.mats.filter((m): m is MeshStandardMaterial => "emissive" in m);
  for (const m of lit) m.emissive = new Color(0xfff6d0);
  await tween(stage.clock, 650, (t) => {
    for (const m of lit) m.emissiveIntensity = 2.5 * t;
    v.root.position.y = 0.5 * t * t;
    fade(v, 1 - t);
    if (Math.random() < 0.7)
      stage.fx.spawn(at.clone().add(new Vector3((Math.random() - 0.5) * 0.5, Math.random() * v.height, 0)), {
        color: Math.random() < 0.5 ? 0xffffff : 0xfff0a0,
        size: 0.05,
        vel: new Vector3(0, 1.5 + Math.random(), 0),
        life: 700,
        gravity: 0,
        glow: true,
      });
  });
  v.root.removeFromParent();
  setAct(c, "attack", 2);
  await tween(stage.clock, 260, (t) => pillar.mesh.scale.setX(0.9 * (1 - t)));
  pillar.remove();
}

/** The hero's, guardian's and king's blows on the figure struck, timed to the strike frame. */
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
  } else if (a.role === "r") {
    // The guardian's fists hit the ground: the board shakes, rock and dust fly.
    stage.shake = 340;
    fx.dust(at, 22, 0x9097ad);
    fx.burst(at.clone().setY(0.2), 0x8d93a8, 14, { speed: 1.6, up: 2.2, size: 0.09 });
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

/** A strike: the dragon burns, the cleric smites and the princess throws; the others strike in three frames, the blow landing on the second, and the victim breaks apart. */
async function strike(stage: Stage, a: Fig, v: Fig) {
  if (a.role === "n") await burn(stage, a, v);
  else if (a.role === "b") await smite(stage, a, v);
  else if (a.role === "q") await throwAway(stage, a, v);
  else {
    setAct(a, "attack", 0);
    await wait(stage.clock, 200);
    setAct(a, "attack", 1);
    stage.sound.play("knock", { gain: 0.6 });
    await blow(stage, a, v);
    void shatter(stage, v);
    await wait(stage.clock, 260);
    setAct(a, "attack", 2);
    await wait(stage.clock, 180);
  }
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
    const at = victim.root.position.clone();
    const dir = at.clone().sub(mover.root.position).setY(0);
    const short = (d: number) => at.clone().sub(dir.clone().normalize().multiplyScalar(Math.min(d, dir.length())));
    if (mover.role === "n") {
      // The dragon flies up before its victim, facing it, and hovers there to breathe fire, then lands where it stood.
      await flyTo(stage, mover, short(1.1), 0.9);
      face(stage, mover, at);
      await strike(stage, mover, victim);
      await flyTo(stage, mover, b, 0, 520);
      setAct(mover, "idle");
      return;
    }
    // The princess casts from where she stands; the cleric and the king from a little way off; the hero and the guardian close in.
    const reach = mover.role === "q" ? Infinity : mover.role === "k" || mover.role === "b" ? 1.4 : 0.8;
    if (reach !== Infinity) {
      const near = short(reach);
      if (mover.root.position.distanceTo(near) > 0.05) await travel(stage, mover, near);
    }
    await strike(stage, mover, victim);
  }
  await travel(stage, mover, b, victim && mover.role !== "q" ? 360 : undefined);
}
