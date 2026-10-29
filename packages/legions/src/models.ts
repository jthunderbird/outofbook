// Modelled figures (glTF made with Meshy AI, packed by scripts/pack-model.mjs):
// loaded once per tribe, when a tribe first takes the board, and cloned per
// piece. Rigged ones get their own animation mixer and idle in place. One model
// serves both sides, recolored in the shader per side (recolor). Each stands
// centered on its square. Until a model has loaded, its tribe draws a
// code-built figure instead; loadModels tells the scene when to rebuild.
import { AnimationMixer, Box3, Quaternion, Vector3, type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ownMaterials } from "./fx";
import { Fig, type Role, type Side } from "./figures";

const URLS = import.meta.glob<string>("../models/*.glb", { eager: true, query: "?url", import: "default" });
const loaded = new Map<string, { gltf: GLTF; clips: Map<string, AnimationClip>; height: number }>();

/** Clips move the figure in place: the hips keep their height (a fall, a bob) but not their travel. */
function inPlace(clip: AnimationClip) {
  for (const t of clip.tracks)
    if (/Hips\.position$/.test(t.name)) {
      const v = t.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = v[0];
        v[i + 2] = v[2];
      }
    }
  return clip;
}

/**
 * Idles calmed: every bone moves only a quarter as far from the clip's first pose,
 * and more slowly, so a figure breathes and shifts without looking around.
 */
function calm(clip: AnimationClip, k = 0.25, slower = 1.6) {
  const q0 = new Quaternion();
  const q = new Quaternion();
  for (const t of clip.tracks) {
    const v = t.values;
    const n = t.getValueSize();
    if (n === 4)
      for (let i = 0; i < v.length; i += 4) {
        q0.fromArray(v, 0);
        q.fromArray(v, i);
        q0.slerp(q, k).toArray(v, i);
      }
    else for (let i = n; i < v.length; i++) v[i] = v[i % n] + (v[i] - v[i % n]) * k;
    for (let i = 0; i < t.times.length; i++) t.times[i] *= slower;
  }
  clip.resetDuration();
  return clip;
}

async function load(name: string) {
  const url = URLS[`../models/${name}.glb`];
  if (!url) return;
  const gltf = await new GLTFLoader().loadAsync(url);
  const box = new Box3().setFromObject(gltf.scene);
  loaded.set(name, { gltf, clips: new Map(gltf.animations.map((c) => [c.name, /idle/i.test(c.name) ? calm(inPlace(c)) : inPlace(c)])), height: box.getSize(new Vector3()).y });
}

const loading = new Map<string, Promise<void>>();
/** Every model whose name starts with prefix (a tribe's), loaded; resolves even if one fails (its piece stays code-built). */
export function loadModels(prefix: string): Promise<void> {
  let p = loading.get(prefix);
  if (!p) {
    const names = Object.keys(URLS)
      .map((u) => u.replace(/^.*\/(.*)\.glb$/, "$1"))
      .filter((n) => n.startsWith(prefix));
    p = Promise.all(names.map((n) => load(n).catch((e) => console.error("model", n, e)))).then(() => {});
    loading.set(prefix, p);
  }
  return p;
}

/**
 * Recolors a side's figures in the shader, keeping their shading:
 * - ivory (the Stormcourt's light side): dark cloth and metal to ivory and silver;
 * - spring (the Thornwood's light side): everything to a light leaf green;
 * - bark (the Thornwood's dark side): toward a deep brown.
 * Bright, saturated warm colors (gold trim, fire, blossoms) are kept.
 */
function recolor(m: Material, mode: Tint) {
  const s = m as MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return;
  const body = {
    ivory: `float warm = smoothstep(0.3, 0.55, sat) * step(c.b, c.g) * step(c.g, c.r * 1.05);
        vec3 ivory = vec3(0.93, 0.89, 0.8) * (0.42 + 0.95 * sqrt(l));
        diffuseColor.rgb = mix(ivory, c, warm);`,
    // Linear in brightness (not its square root) so the detail keeps its contrast.
    spring: `float keep = smoothstep(0.6, 0.8, sat) * smoothstep(0.3, 0.45, l) * step(c.b, c.g) * step(c.g, c.r * 1.05);
        vec3 spring = vec3(0.62, 0.97, 0.36) * (0.3 + 1.5 * l);
        diffuseColor.rgb = mix(spring, c, keep);`,
    // Bluish bone-white for the Restless's light side; saturated reds (blood, lips) are kept.
    pallid: `float red = smoothstep(0.5, 0.8, sat) * step(c.g, c.r * 0.8) * step(c.b, c.r * 0.8);
        vec3 pal = vec3(0.74, 0.8, 0.88) * (0.22 + 1.5 * l);
        diffuseColor.rgb = mix(pal, c, red);`,
    none: ``,
    bark: `float keep = smoothstep(0.6, 0.8, sat) * smoothstep(0.3, 0.45, l) * step(c.b, c.g) * step(c.g, c.r * 1.05);
        vec3 bark = vec3(0.5, 0.33, 0.2) * (0.05 + 0.75 * l);
        diffuseColor.rgb = mix(mix(c, bark, 0.7), c, keep);`,
  }[mode];
  s.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        float mx = max(c.r, max(c.g, c.b));
        float sat = mx > 0.0 ? (mx - min(c.r, min(c.g, c.b))) / mx : 0.0;
        ${body}
      }`,
    );
  };
  s.customProgramCacheKey = () => `legions-tint-${mode}`;
}

/** How a side's figures are recolored. */
export type Tint = "ivory" | "spring" | "bark" | "pallid" | "none";

export interface ModelOptions {
  /** Turns a model that does not face +z. */
  turn?: number;
  /** The idle clip, if not "Idle". */
  idle?: string;
  /** Each side's recolor: the light side ivory unless given, the dark side as modelled unless given. */
  tint?: { w?: Tint; b?: Tint };
}

/** A clone of a loaded model's scene (skinned meshes included), for a part that is not a whole figure; null until loaded. */
export function modelScene(name: string): Object3D | null {
  const m = loaded.get(name);
  return m ? (clone(m.gltf.scene) as Object3D) : null;
}

/** A figure from a loaded model, height tall, centered and idling; null until the model has loaded. */
export function modelFig(name: string, role: Role, side: Side, height: number, o: ModelOptions = {}): Fig | null {
  const m = loaded.get(name);
  if (!m) return null;
  const f = new Fig(role, side, height);
  const model = clone(m.gltf.scene) as Object3D;
  model.scale.setScalar(height / m.height);
  model.rotation.y = o.turn ?? 0;
  model.updateMatrixWorld(true);
  // Centered on the square: on the hips for a rigged figure (a held staff or sword
  // does not pull it aside), on its footprint otherwise.
  const box = new Box3().setFromObject(model);
  const hips = model.getObjectByName("Hips");
  const c = hips ? hips.getWorldPosition(new Vector3()) : box.getCenter(new Vector3());
  // Feet on the board, whatever the model's origin.
  model.position.set(-c.x, -box.min.y, -c.z);
  model.traverse((x) => {
    const mesh = x as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Animated skins move outside their rest-pose bounds.
    if ((x as SkinnedMesh).isSkinnedMesh) x.frustumCulled = false;
  });
  f.body.add(model);
  f.mats = ownMaterials(f.body);
  const tint = side === "w" ? (o.tint?.w ?? "ivory") : o.tint?.b;
  if (tint && tint !== "none") f.mats.forEach((m) => recolor(m, tint));
  if (m.clips.size) {
    const idle = o.idle && m.clips.has(o.idle) ? o.idle : m.clips.has("Idle") ? "Idle" : [...m.clips.keys()][0];
    f.anim = { mixer: new AnimationMixer(model), clips: m.clips, idle, hand: model.getObjectByName("RightHand") ?? undefined };
    f.play(idle, { loop: true, fade: 0 });
    // Not all in step.
    f.anim.mixer.update(Math.random() * 2);
  }
  return f;
}
