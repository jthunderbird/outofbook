// Every gravestone for The Wake side by side, to choose from: our carved ones (back row)
// and models from free sources (front row), none of them placed yet. Moonlight comes from
// behind. "Weathering" lays the moss, dirt and grime shader over the imported ones too.
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { dirtMaps, HAZE } from "@outofbook/legions/wakeCourt";
import { STONES, weather } from "@outofbook/legions/wakeStones";

interface Imported {
  file: string;
  name: string;
  by: string;
  license: string;
  height: number;
}
const KAY = { by: "Kay Lousberg", license: "CC0" };
const IMPORTED: Imported[] = [
  { file: "kay-gravestone-a", name: "Gravestone", ...KAY, height: 1.5 },
  { file: "kay-gravestone-b", name: "Gravestone 2", ...KAY, height: 1.5 },
  { file: "kay-grave-marker", name: "Grave marker", ...KAY, height: 1.5 },
  { file: "kay-gravemarker", name: "Gravemarker", ...KAY, height: 1.5 },
  { file: "kay-damaged-grave", name: "Damaged grave", ...KAY, height: 1.2 },
  { file: "kay-grave-a", name: "Grave", ...KAY, height: 1.5 },
  { file: "kay-grave-b", name: "Grave 2", ...KAY, height: 1.5 },
  { file: "kay-crypt", name: "Crypt", ...KAY, height: 2.6 },
  { file: "sirkitree-cross", name: "Gravestone cross", by: "sirkitree", license: "CC-BY 3.0", height: 1.7 },
  { file: "macgillivray-2", name: "Gravestone 2", by: "Ian MacGillivray", license: "CC-BY 3.0", height: 1.5 },
  { file: "macgillivray-3", name: "Gravestone 3", by: "Ian MacGillivray", license: "CC-BY 3.0", height: 1.5 },
  { file: "brodin-rip", name: "Gravestone RIP", by: "Alexander Brodin", license: "CC-BY 3.0", height: 1.5 },
  { file: "perez-grave-stone", name: "Grave stone", by: "Jarlan Perez", license: "CC-BY 3.0", height: 1.5 },
];
const FILES = import.meta.glob<string>("../../../packages/legions/courts/wake/stones/*.glb", { eager: true, query: "?url", import: "default" });
const url = (f: string) => Object.entries(FILES).find(([k]) => k.endsWith(`/${f}.glb`))?.[1] as string;

const stage = document.getElementById("stage")!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
stage.append(renderer.domElement);
const scene = new Scene();
scene.background = new Color(HAZE);
scene.fog = new Fog(HAZE, 30, 90);
const camera = new PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 7, 24);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.02;

// Dirt ground.
const dirt = dirtMaps(900);
for (const t of [dirt.map, dirt.normal]) {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(24, 24);
}
const ground = new Mesh(new PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normal, color: 0xb0aaa2, roughness: 1 }));
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

// Moon behind the stones, low, so their faces are in shade and their edges lit; a dim cold fill from the front.
const moon = new DirectionalLight(0xb8ccdf, 2.6);
moon.position.set(-6, 7, -9);
moon.castShadow = true;
moon.shadow.mapSize.set(4096, 4096);
Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 50 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.02;
const fill = new DirectionalLight(0x7f9bb5, 1.5);
fill.position.set(4, 3, 10);
scene.add(moon, moon.target, fill, new HemisphereLight(0x7a8e9c, 0x1c1812, 0.9));

const procedural = new Group();
const free = new Group();
const credit = new Group();
scene.add(procedural, free, credit);
const ROW_Z = new Map<Object3D, number>([
  [procedural, -6],
  [free, 0],
  [credit, 6],
]);
const tags = document.getElementById("tags")!;
const items: { obj: Object3D; tag: HTMLElement; top: number }[] = [];
const tag = (obj: Object3D, name: string, sub: string, top: number) => {
  const el = document.createElement("div");
  el.className = "tag";
  el.innerHTML = `${name}<small>${sub}</small>`;
  el.onclick = () => fly(obj);
  tags.append(el);
  items.push({ obj, tag: el, top });
};

const GAP = 2.7;
STONES.forEach((k, i) => {
  const g = k.build();
  g.position.set((i - (STONES.length - 1) / 2) * GAP, 0, -6);
  procedural.add(g);
  tag(g, k.name, "carved in code", 1.9);
});

// Imported: shown as they came, or with the weathering over them.
const originals = new Map<Mesh, Material | Material[]>();
const weathered = new Map<Mesh, Material | Material[]>();
const loader = new GLTFLoader();
await Promise.all(
  IMPORTED.map(async (m) => {
    const gltf = await loader.loadAsync(url(m.file));
    const root = new Group();
    root.add(gltf.scene);
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const s = Math.min(m.height / size.y, 2.3 / Math.max(size.x, size.z));
    gltf.scene.scale.setScalar(s);
    const b2 = new Box3().setFromObject(gltf.scene);
    gltf.scene.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      originals.set(mesh, mesh.material);
      const wrap = (x: Material) => {
        const c = x.clone() as MeshStandardMaterial;
        c.roughness = Math.max(c.roughness ?? 0.9, 0.9);
        c.metalness = 0;
        return weather(c, 0.6, 0.02);
      };
      weathered.set(mesh, Array.isArray(mesh.material) ? mesh.material.map(wrap) : wrap(mesh.material));
    });
    const row = m.license === "CC0" ? free : credit;
    const n = IMPORTED.filter((x) => (x.license === "CC0") === (m.license === "CC0"));
    root.position.set((n.indexOf(m) - (n.length - 1) / 2) * GAP, 0, ROW_Z.get(row)!);
    row.add(root);
    tag(root, m.name, `${m.by} · ${m.license}`, Math.min(m.height, 2.3) + 0.3);
  }),
);

// ?cam=x,y,z,tx,ty,tz puts the camera there at once (for stills).
const cam = new URLSearchParams(location.search).get("cam")?.split(",").map(Number);
if (cam?.length === 6) {
  camera.position.set(cam[0], cam[1], cam[2]);
  controls.target.set(cam[3], cam[4], cam[5]);
}

// Controls.
const panel = document.getElementById("panel")!;
const button = (label: string, on: boolean, click: (b: HTMLButtonElement) => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.classList.toggle("on", on);
  b.onclick = () => click(b);
  panel.append(b);
  return b;
};
let weatherOn = true;
const apply = () => {
  for (const [mesh, mat] of (weatherOn ? weathered : originals).entries()) mesh.material = mat;
};
apply();
button("Weather imports", true, (b) => {
  weatherOn = !weatherOn;
  b.classList.toggle("on", weatherOn);
  apply();
});
button("Moon: behind", true, (b) => {
  const behind = b.textContent === "Moon: behind";
  b.textContent = behind ? "Moon: side" : "Moon: behind";
  moon.position.set(behind ? -12 : -6, behind ? 5 : 7, behind ? 2 : -9);
});
button("Overview", false, () => fly(null));
button("Carved", false, () => fly(procedural));
button("Free CC0", false, () => fly(free));
button("Free CC-BY", false, () => fly(credit));

// Flying the camera.
let goal: { pos: Vector3; target: Vector3 } | null = null;
function fly(obj: Object3D | null) {
  if (!obj) goal = { pos: new Vector3(0, 7, 24), target: new Vector3(0, 0.6, 0) };
  else if (ROW_Z.has(obj)) {
    const z = ROW_Z.get(obj)!;
    goal = { pos: new Vector3(0, 2.6, z + 10), target: new Vector3(0, 0.9, z) };
  } else {
    const p = obj.getWorldPosition(new Vector3());
    goal = { pos: new Vector3(p.x + 1.2, 1.6, p.z + 4), target: new Vector3(p.x, 0.8, p.z) };
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
const v = new Vector3();
renderer.setAnimationLoop(() => {
  if (goal) {
    camera.position.lerp(goal.pos, 0.08);
    controls.target.lerp(goal.target, 0.08);
    if (camera.position.distanceTo(goal.pos) < 0.02) goal = null;
  }
  controls.update();
  for (const it of items) {
    it.obj.getWorldPosition(v);
    v.y += it.top;
    v.project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1;
    it.tag.style.display = vis ? "" : "none";
    it.tag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    it.tag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  }
  renderer.render(scene, camera);
});
(window as unknown as { ready: boolean }).ready = true;
