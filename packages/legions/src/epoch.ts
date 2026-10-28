// The Epoch Drifters tribe: Chess Legions' 16-bit tribe. Its figures are pixel
// sprites (pixel/sprites.ts) on upright cards that always turn to face the
// camera, lit by the scene like any figure: a normal map gives them roundness,
// and they cast shadows. They hop and slide to their square; a capture is the
// attacker's own flourish, and a victim of any tribe breaks into pixels.
import {
  Color,
  DoubleSide,
  type Intersection,
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
} from "three";
import { squareAt } from "./board";
import { Fig, type Role, type Side } from "./figures";
import { ease, ownMaterials, tween, wait } from "./fx";
import { normalMap, sprite } from "./pixel/sprites";
import type { Stage, Tribe, TribeMove } from "./tribe";

/** A card's height: pawns a little smaller than the rest. */
const HEIGHT: Record<Role, number> = { p: 1.1, n: 1.4, b: 1.4, r: 1.4, q: 1.4, k: 1.4 };
const plane = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
const UP = new Vector3(0, 1, 0);

/** How far the cards lean back: a little in a 3D view; at the camera's own angle in the flat one, so they stand upright on the screen. Set by the scene. */
export const lean = { tilt: 0.3, size: 1, foot: 0 };

const pixelTexture = (c: HTMLCanvasElement) => {
  const t = new CanvasTexture(c);
  t.magFilter = t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.generateMipmaps = false;
  return t;
};
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

function epochFigure(role: Role, side: Side): Fig {
  const h = HEIGHT[role];
  const f = new Fig(role, side, h);
  const src = sprite(role, side);
  const map = pixelTexture(src);
  const card = new Mesh(
    plane,
    new MeshStandardMaterial({
      map,
      normalMap: normalMap(src),
      normalScale: new Vector2(1.1, 1.1),
      alphaTest: 0.5,
      roughness: 0.85,
      emissive: new Color(0xffffff),
      emissiveMap: map,
      emissiveIntensity: 0.12,
      side: DoubleSide,
    }),
  );
  card.scale.set(h, h, 1);
  // Only the drawn pixels can be tapped: a card's empty corners must not take a tap meant for the square or piece behind it.
  const alpha = src.getContext("2d")!.getImageData(0, 0, 32, 32).data;
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
  card.castShadow = true;
  card.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest: 0.5 });
  // Turn to the camera about the vertical, whatever way the figure is turned, unless it is knocked over.
  const q = new Quaternion();
  const pq = new Quaternion();
  const at = new Vector3();
  card.onBeforeRender = (_r, _s, camera) => {
    card.scale.set(h * lean.size, h * lean.size, 1);
    card.position.z = lean.foot;
    card.parent!.getWorldQuaternion(pq);
    if (UP.clone().applyQuaternion(pq).y < 0.95) return;
    card.getWorldPosition(at);
    q.setFromAxisAngle(UP, Math.atan2(camera.position.x - at.x, camera.position.z - at.z));
    card.quaternion.copy(pq.invert()).multiply(q);
    card.rotateX(-lean.tilt);
    card.updateMatrixWorld(true);
  };
  const blob = new Mesh(new PlaneGeometry(0.95, 0.55).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: shadowBlob(), transparent: true, depthWrite: false }));
  blob.position.y = 0.01;
  f.body.add(blob, card);
  f.mats = ownMaterials(f.body);
  f.root.userData.pixels = src;
  return f;
}

export const epoch: Tribe = {
  id: "epoch-drifters",
  name: "Epoch Drifters",
  figure: epochFigure,
  play: (stage, move) => play(stage, move),
};

function travel(stage: Stage, f: Fig, b: Vector3, hop: number, ms: number) {
  const a = f.root.position.clone();
  return tween(stage.clock, ms, (t) => f.root.position.set(a.x + (b.x - a.x) * t, Math.sin(Math.PI * t) * hop, a.z + (b.z - a.z) * t), ease.inOut);
}

/** Each kind's flourish on the square it strikes. */
function flourish(stage: Stage, role: Role, at: Vector3) {
  const p = at.clone().setY(0.6);
  if (role === "p") stage.fx.burst(p, 0xffffff, 18, { speed: 2.4, up: 1, glow: true, gravity: 0, life: 320 });
  else if (role === "n") stage.fx.burst(p, 0xff8a2a, 40, { speed: 2.2, up: 1.6, glow: true, gravity: -1, life: 600 });
  else if (role === "b") stage.fx.burst(p, 0xfff0a0, 34, { speed: 1.2, up: 1.2, glow: true, gravity: 0, life: 700 });
  else if (role === "r") {
    stage.shake = 320;
    stage.fx.dust(at, 22, 0x9097ad);
  } else if (role === "q") stage.fx.burst(p, 0xff9ec2, 36, { speed: 1.4, up: 1.4, glow: true, gravity: -0.5, life: 700 });
  else stage.fx.burst(p, 0xf2c230, 30, { speed: 1.8, up: 1.4, glow: true, gravity: 1, life: 600 });
}

/** The victim breaks into its own pixels if it is a sprite, else into sparks of its side's magic, and is gone. */
async function shatter(stage: Stage, v: Fig) {
  const at = v.root.position.clone();
  const src = v.root.userData.pixels as HTMLCanvasElement | undefined;
  if (src) {
    const d = src.getContext("2d")!.getImageData(0, 0, 32, 32).data;
    const hh = v.height;
    for (let y = 0; y < 32; y += 1)
      for (let x = 0; x < 32; x += 1) {
        const i = (y * 32 + x) * 4;
        if (d[i + 3] < 128 || (x + y) % 2) continue;
        const ox = ((x - 15.5) / 32) * hh;
        stage.fx.spawn(new Vector3(at.x + ox, ((31 - y) / 32) * hh, at.z), {
          color: new Color(`rgb(${d[i]},${d[i + 1]},${d[i + 2]})`),
          size: 0.05,
          vel: new Vector3(ox * 1.6 + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6),
          life: 700 + Math.random() * 500,
          gravity: 5,
        });
      }
  } else stage.fx.burst(at.clone().setY(v.height * 0.5), 0xffffff, 40, { speed: 2, up: 2, glow: true, life: 700 });
  v.root.removeFromParent();
}

async function play(stage: Stage, { mover, to, victim, castle }: TribeMove) {
  const hop = mover.role === "n" ? 0.8 : 0.1;
  const b = squareAt(to);
  if (castle) {
    await travel(stage, mover, b, hop, 420);
    await travel(stage, castle.rook, squareAt(castle.to), 0.1, 420);
    return;
  }
  if (victim) {
    const at = victim.root.position.clone();
    const dir = at.clone().sub(mover.root.position).setY(0);
    const near = at.clone().sub(dir.clone().normalize().multiplyScalar(0.7));
    if (mover.root.position.distanceTo(near) > 0.05) await travel(stage, mover, near, hop, Math.max(320, dir.length() * 200));
    flourish(stage, mover.role, at);
    stage.sound.play("knock", { gain: 0.6 });
    await wait(stage.clock, 180);
    void shatter(stage, victim);
    await wait(stage.clock, 200);
  }
  await travel(stage, mover, b, victim ? 0.05 : hop, victim ? 240 : Math.max(340, mover.root.position.distanceTo(b) * 200));
}
