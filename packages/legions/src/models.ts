// Modelled, rigged figures (glTF made with Meshy AI, packed by
// scripts/pack-model.mjs): loaded once, cloned per piece, each with its own
// animation mixer. Until a model has loaded, its tribe draws the code-built
// figure instead; modelsReady tells the arena when to rebuild with the models.
import { AnimationMixer, Box3, Vector3, type AnimationClip, type Mesh, type Object3D, type SkinnedMesh } from "three";
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

async function load(name: string) {
  const url = URLS[`../models/${name}.glb`];
  if (!url) return;
  const gltf = await new GLTFLoader().loadAsync(url);
  const box = new Box3().setFromObject(gltf.scene);
  loaded.set(name, { gltf, clips: new Map(gltf.animations.map((c) => [c.name, inPlace(c)])), height: box.getSize(new Vector3()).y });
}

/** Every model, loaded; resolves even if one fails (its piece stays code-built). */
export const modelsReady: Promise<void> = Promise.all(Object.keys(URLS).map((u) => load(u.replace(/^.*\/(.*)\.glb$/, "$1")).catch((e) => console.error("model", u, e)))).then(() => {});

/** A figure from a loaded model, height tall, idling; null until the model has loaded. */
export function modelFig(name: string, role: Role, side: Side, height: number): Fig | null {
  const m = loaded.get(name);
  if (!m) return null;
  const f = new Fig(role, side, height);
  const body = clone(m.gltf.scene) as Object3D;
  body.scale.setScalar(height / m.height);
  body.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Animated skins move outside their rest-pose bounds.
    if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
  });
  f.body.add(body);
  f.mats = ownMaterials(f.body);
  const idle = m.clips.has("Combat_Stance") ? "Combat_Stance" : [...m.clips.keys()][0];
  f.anim = { mixer: new AnimationMixer(body), clips: m.clips, idle, hand: body.getObjectByName("RightHand") ?? undefined };
  f.play(idle, { loop: true, fade: 0, speed: 0.7 });
  // Not all in step.
  f.anim.mixer.update(Math.random() * 2);
  return f;
}
