// What watches The Wake from the dark: now and then a zombie, a skeleton or a werewolf
// leans out from behind a tree to watch the board, then draws back; and out in the forest
// pairs of eyes shine among the trunks and blink. Made when the court is dressed (they are
// models and sprites, not part of the bake).
import { AdditiveBlending, AnimationMixer, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Group, Mesh, Points, PointsMaterial, Vector3, type AnimationAction, type Object3D } from "three";
import { modelWithClips } from "./models";
import { canvas, stream } from "./wakeKit";

interface Spot {
  x: number;
  z: number;
  r: number;
}

interface Lurker {
  root: Object3D;
  mixer: AnimationMixer;
  idle?: AnimationAction;
  walk?: AnimationAction;
  hide: Vector3;
  out: Vector3;
  period: number;
  phase: number;
  moving: boolean;
}

const KINDS: { model: string; height: number }[] = [
  { model: "restless-pawn-b", height: 1.7 },
  { model: "restless-pawn-w", height: 1.6 },
  { model: "restless-pawn-b", height: 1.55 },
  { model: "restless-knight", height: 0.95 },
  { model: "restless-pawn-w", height: 1.75 },
  { model: "restless-pawn-b", height: 1.8 },
];

const ease = (x: number) => x * x * (3 - 2 * x);

export function lurkers(opts: { group: Group; heightAt: (x: number, z: number) => number; trees: Spot[]; forest: number }) {
  const r = stream(6161);
  const watchers: Lurker[] = [];
  // From where the camera usually stands: a creature hides on the far side of a trunk from there.
  const eye = new Vector3(0, 0, 11);
  const candidates = opts.trees.filter((t) => t.z < 9 && Math.hypot(t.x, t.z) > 7.5);
  candidates.sort(() => r() - 0.5);
  KINDS.forEach((k, i) => {
    const t = candidates[i];
    const m = modelWithClips(k.model);
    if (!t || !m) return;
    const away = new Vector3(t.x - eye.x, 0, t.z - eye.z).normalize();
    const side = new Vector3(-away.z, 0, away.x).multiplyScalar(t.x > 0 ? -1 : 1);
    const hide = new Vector3(t.x, 0, t.z).addScaledVector(away, t.r + 0.35);
    const out = hide
      .clone()
      .addScaledVector(side, t.r * 0.9 + 0.55)
      .addScaledVector(away, -0.15);
    hide.y = opts.heightAt(hide.x, hide.z);
    out.y = opts.heightAt(out.x, out.z);
    const root = new Group();
    const model = m.scene;
    model.scale.setScalar(k.height / m.height);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    model.position.y = -box.min.y;
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    root.add(model);
    root.position.copy(hide);
    opts.group.add(root);
    const mixer = new AnimationMixer(model);
    const idle = m.clips.get("Idle");
    const walk = m.clips.get("Walking") ?? m.clips.get("Run");
    const lurker: Lurker = { root, mixer, hide, out, period: 22 + r() * 22, phase: r(), moving: false };
    if (idle) (lurker.idle = mixer.clipAction(idle)).play();
    if (walk) {
      lurker.walk = mixer.clipAction(walk);
      lurker.walk.timeScale = 0.5;
      lurker.walk.play();
      lurker.walk.weight = 0;
    }
    mixer.update(r() * 3);
    watchers.push(lurker);
  });

  // Eyes in the forest: pairs of dull yellow and red points among the far trunks, blinking.
  const n = 70;
  const pos = new Float32Array(n * 2 * 3);
  const col = new Float32Array(n * 2 * 3);
  const base: number[][] = [];
  for (let t = 0; t < n; t++) {
    const a = r() * Math.PI * 2;
    const d = opts.forest + 6 + r() * 45;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    if (z < -opts.forest && Math.abs(x) < 5) continue;
    const y = opts.heightAt(x, z) + 0.6 + r() * 1.8;
    const gap = 0.09 + r() * 0.05;
    const i = base.length;
    pos.set([x - gap, y, z, x + gap, y, z], i * 6);
    const red = r() < 0.35;
    base.push(red ? [1, 0.15, 0.08] : [1, 0.8, 0.3]);
    col.set([...base[i], ...base[i]], i * 6);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setDrawRange(0, base.length * 2);
  const glow = canvas(64);
  const g = glow.g.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  glow.g.fillStyle = g;
  glow.g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(glow.c);
  const mat = new PointsMaterial({ size: 0.28, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const eyes = new Points(geo, mat);
  eyes.frustumCulled = false;
  opts.group.add(eyes);
  const nextBlink = base.map(() => r() * 6);
  let time = 0;

  return {
    update(ms: number) {
      time += ms / 1000;
      for (const w of watchers) {
        w.mixer.update(ms / 1000);
        // Hidden, then out beside the trunk, watching, then back.
        const u = (time / w.period + w.phase) % 1;
        const k = u < 0.52 ? 0 : u < 0.6 ? ease((u - 0.52) / 0.08) : u < 0.8 ? 1 : u < 0.88 ? 1 - ease((u - 0.8) / 0.08) : 0;
        w.root.position.lerpVectors(w.hide, w.out, k);
        w.root.rotation.y = Math.atan2(-w.root.position.x, -w.root.position.z) + (1 - k) * 0.6;
        const moving = k > 0.02 && k < 0.98;
        if (w.walk && w.idle && moving !== w.moving) {
          w.moving = moving;
          w.walk.weight = moving ? 1 : 0;
          w.idle.weight = moving ? 0 : 1;
        }
      }
      // A blink: a pair of eyes goes dark for a moment now and then.
      const c = geo.getAttribute("color") as BufferAttribute;
      let dirty = false;
      for (let i = 0; i < base.length; i++) {
        if (time < nextBlink[i]) continue;
        const dark = time < nextBlink[i] + 0.18;
        for (let v = 0; v < 2; v++) c.setXYZ(i * 2 + v, dark ? 0 : base[i][0], dark ? 0 : base[i][1], dark ? 0 : base[i][2]);
        dirty = true;
        if (!dark) nextBlink[i] = time + 2 + Math.random() * 9;
      }
      if (dirty) c.needsUpdate = true;
    },
    dispose() {
      for (const w of watchers) w.root.removeFromParent();
      eyes.removeFromParent();
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
