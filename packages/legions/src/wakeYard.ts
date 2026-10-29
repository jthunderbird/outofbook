// The Wake's yard: tufts of dead grass over the dirt, and the iron fence round the whole
// cemetery, with weathered stone piers at its corners and an iron arch at the back
// carrying three iron gargoyles. All made in code.
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { stream } from "./wakeKit";
import { faces, slab, solid, stoneColor, weather } from "./wakeStones";

/** Half the fenced yard's size, on the ground. */
export const YARD = 24;

const flat = (g: BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
  if (!n.getAttribute("uv")) n.setAttribute("uv", new Float32BufferAttribute(new Float32Array((n.getAttribute("position").count || 0) * 2), 2));
  return n;
};
const join = (parts: BufferGeometry[]) => {
  const m = mergeGeometries(parts.map(flat))!;
  parts.forEach((p) => p.dispose());
  return m;
};

// ----- Grass -----

/** A tuft of seven thin curved blades, dark at the root, paler at the tip. Height 1. */
function tuftGeometry(seed: number) {
  const r = stream(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const segs = 3;
  for (let b = 0; b < 7; b++) {
    const a = r() * Math.PI * 2;
    const rx = (r() - 0.5) * 0.14;
    const rz = (r() - 0.5) * 0.14;
    const h = 0.55 + r() * 0.45;
    const lean = (0.15 + r() * 0.4) * (r() < 0.5 ? 1 : -1);
    const w = 0.022 + r() * 0.014;
    const tint = 0.75 + r() * 0.5;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = t * h;
      const bend = lean * t * t;
      const width = w * (1 - t * 0.92);
      const cx = rx + Math.cos(a) * bend;
      const cz = rz + Math.sin(a) * bend;
      const dx = -Math.sin(a) * width;
      const dz = Math.cos(a) * width;
      pos.push(cx - dx, y, cz - dz, cx + dx, y, cz + dz);
      const k = (0.22 + 0.78 * t) * tint;
      col.push(0.5 * k, 0.55 * k, 0.28 * k, 0.5 * k, 0.55 * k, 0.28 * k);
      if (i < segs) {
        const v = base + i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  // Lit from above whichever way a blade faces.
  g.setAttribute(
    "normal",
    new Float32BufferAttribute(
      new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  return g;
}

/** Dead, weathered grass: short, thin tufts in clumps (round the graves, in patches about the yard), a few lone ones. */
export function grass(heightAt: (x: number, z: number) => number, clumps: { x: number; z: number; r: number; n: number }[], clearHalf: number) {
  const r = stream(4040);
  const geo = tuftGeometry(7);
  const time = { value: 0 };
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat sw = sin(uTime * 1.4 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9) + 0.5 * sin(uTime * 2.7 + instanceMatrix[3].z * 1.7);\ntransformed.x += sw * 0.05 * position.y * position.y;\ntransformed.z += sw * 0.03 * position.y * position.y;",
      );
  };
  const total = clumps.reduce((a, c) => a + c.n, 0);
  const mesh = new InstancedMesh(geo, mat, total);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let n = 0;
  for (const c of clumps)
    for (let i = 0; i < c.n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * c.r;
      const x = c.x + Math.sin(a) * d;
      const z = c.z + Math.cos(a) * d;
      if (Math.abs(x) < clearHalf && Math.abs(z) < clearHalf) continue;
      q.setFromAxisAngle(up, r() * 6.3);
      // Tallest at the middle of the clump, short and stunted at its edge.
      const s = (0.1 + r() * 0.16) * (1 - 0.5 * (d / c.r));
      m.compose(new Vector3(x, heightAt(x, z) - 0.01, z), q, new Vector3(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.8), s * (0.8 + r() * 0.5)));
      mesh.setMatrixAt(n, m);
      // Dull, dead: straw, grey, brown, the odd greyed green.
      mesh.setColorAt(n++, new Color().setHSL(0.07 + r() * 0.1, 0.1 + r() * 0.22, 0.22 + r() * 0.24));
    }
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, update: (ms: number) => (time.value += ms / 1000), dispose: () => (geo.dispose(), mat.dispose(), mesh.dispose()) };
}

// ----- Iron and stone -----

const iron = () => weather(new MeshStandardMaterial({ color: 0x2b2018, roughness: 0.62, metalness: 0.55 }), 0.05, 0.015);

/** A crouching iron gargoyle facing +z: haunches, folded forelegs, a horned head, bat wings and a curled tail. */
export function gargoyle(): Mesh {
  const p: BufferGeometry[] = [];
  const sph = (rad: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new SphereGeometry(rad, 20, 14);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  const limb = (a: Vector3, b: Vector3, rad: number) =>
    new TubeGeometry(
      new CatmullRomCurve3([
        a,
        a
          .clone()
          .lerp(b, 0.5)
          .add(new Vector3(0, 0.03, 0.04)),
        b,
      ]),
      10,
      rad,
      8,
    );
  const torso = sph(0.28, 1, 1.25, 0.9, 0, 0.62, -0.02);
  torso.rotateX(0.35);
  p.push(torso);
  for (const s of [-1, 1]) {
    p.push(sph(0.19, 0.9, 1, 1.1, s * 0.2, 0.26, -0.08));
    p.push(new BoxGeometry(0.15, 0.07, 0.32).translate(s * 0.2, 0.04, 0.12));
    p.push(limb(new Vector3(s * 0.2, 0.78, 0.1), new Vector3(s * 0.17, 0.3, 0.34), 0.055));
    for (let c = -1; c <= 1; c++) p.push(new ConeGeometry(0.014, 0.06, 5).rotateX(Math.PI / 2).translate(s * 0.17 + c * 0.03, 0.04, 0.4));
    // Horns, ears and wings.
    p.push(new ConeGeometry(0.035, 0.24, 8).rotateZ(-s * 0.5).translate(s * 0.14, 1.2, 0.24));
    p.push(new ConeGeometry(0.03, 0.14, 6).rotateZ(-s * 1.1).translate(s * 0.2, 1.0, 0.18));
    const wing = new Shape();
    wing.moveTo(0, 0);
    wing.lineTo(0.35, 0.55);
    wing.lineTo(0.62, 0.5);
    wing.lineTo(0.5, 0.35);
    wing.lineTo(0.78, 0.22);
    wing.lineTo(0.6, 0.12);
    wing.lineTo(0.7, -0.08);
    wing.lineTo(0.38, -0.02);
    wing.lineTo(0.28, -0.22);
    wing.lineTo(0.12, -0.05);
    wing.closePath();
    const wg = new ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 });
    if (s < 0) wg.scale(-1, 1, 1);
    wg.rotateY(s * 0.5);
    wg.rotateZ(s * 0.35);
    wg.translate(s * 0.14, 0.72, -0.18);
    p.push(wg);
    p.push(sph(0.022, 1, 1, 1, s * 0.085, 1.0, 0.43));
  }
  p.push(sph(0.2, 1.1, 1, 1.2, 0, 0.98, 0.26));
  p.push(new BoxGeometry(0.16, 0.08, 0.16).translate(0, 0.91, 0.46));
  for (let i = -2; i <= 2; i++) p.push(new ConeGeometry(0.012, 0.045, 4).rotateX(Math.PI).translate(i * 0.028, 0.87, 0.52));
  const tail = new TubeGeometry(
    new CatmullRomCurve3([new Vector3(0, 0.2, -0.25), new Vector3(0.08, 0.1, -0.5), new Vector3(0.3, 0.08, -0.62), new Vector3(0.42, 0.2, -0.5), new Vector3(0.38, 0.36, -0.42)]),
    24,
    0.035,
    8,
  );
  p.push(tail, new ConeGeometry(0.06, 0.12, 4).translate(0.37, 0.43, -0.42));
  const g = join(p);
  g.computeVertexNormals();
  const m = new Mesh(g, iron());
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** One iron bar with a spear tip, 1 high. */
function barGeometry() {
  const bar = new CylinderGeometry(0.014, 0.017, 1, 6, 1);
  bar.translate(0, 0.5, 0);
  const collar = new CylinderGeometry(0.03, 0.03, 0.03, 8).translate(0, 0.94, 0);
  const tip = new ConeGeometry(0.036, 0.13, 6).translate(0, 1.065, 0);
  return join([bar, collar, tip]);
}

/** A swinging gate leaf: bars, rails, a ring or two, and spear tips, w wide and h high. */
function gateLeaf(w: number, h: number) {
  const p: BufferGeometry[] = [];
  const n = Math.round(w / 0.15);
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const top = h * (0.97 + 0.03 * Math.sin((i / n) * Math.PI));
    const b = new CylinderGeometry(0.015, 0.018, top, 6).translate(x, top / 2, 0);
    p.push(b, new ConeGeometry(0.038, 0.14, 6).translate(x, top + 0.07, 0));
  }
  for (const y of [0.18, h * 0.48, h * 0.9]) p.push(new BoxGeometry(w + 0.06, 0.05, 0.04).translate(w / 2, y, 0));
  for (let i = 0; i < 3; i++) p.push(new TorusGeometry(0.2, 0.012, 6, 28).translate(((i + 0.5) * w) / 3, h * 0.7, 0));
  return join(p);
}

/** The iron fence round the yard, its piers and corner stones, and the arched gate at the back. */
export function fence(heightAt: (x: number, z: number) => number) {
  const group = new Group();
  const r = stream(9090);
  const F = YARD;
  const dispose: { dispose(): void }[] = [];
  const mat = iron();
  dispose.push(mat);
  // Bars, in instances, a few bent, missing or leaning.
  const barGeo = barGeometry();
  const spots: { x: number; z: number; yaw: number }[] = [];
  const gap = 2.45;
  for (let side = 0; side < 4; side++) {
    for (let s = -F; s <= F; s += 0.19) {
      const x = side === 0 ? s : side === 1 ? s : side === 2 ? -F : F;
      const z = side === 0 ? -F : side === 1 ? F : s;
      if (side === 0 && Math.abs(x) < gap) continue;
      spots.push({ x, z, yaw: side < 2 ? 0 : Math.PI / 2 });
    }
  }
  const bars = new InstancedMesh(barGeo, mat, spots.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Vector3();
  let n = 0;
  for (const sp of spots) {
    if (r() < 0.03) continue;
    const h = 1.45 + (r() - 0.5) * 0.12 - (r() < 0.04 ? 0.5 : 0);
    const bent = r() < 0.05 ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.04;
    q.setFromAxisAngle(new Vector3(Math.cos(sp.yaw), 0, Math.sin(sp.yaw)).cross(new Vector3(0, 1, 0)).normalize(), bent);
    e.set(1, h, 1);
    m.compose(new Vector3(sp.x + (r() - 0.5) * 0.02, heightAt(sp.x, sp.z) - 0.02, sp.z + (r() - 0.5) * 0.02), q, e);
    bars.setMatrixAt(n, m);
    bars.setColorAt(n++, new Color().setScalar(0.7 + r() * 0.7));
  }
  bars.count = n;
  bars.castShadow = bars.receiveShadow = true;
  bars.frustumCulled = false;
  group.add(bars);
  dispose.push(barGeo, bars);

  // Rails, following the ground in short lengths.
  const rails: BufferGeometry[] = [];
  const rail = (x0: number, z0: number, x1: number, z1: number, up: number) => {
    const y0 = heightAt(x0, z0) + up;
    const y1 = heightAt(x1, z1) + up;
    const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
    const g = new BoxGeometry(len + 0.02, 0.05, 0.045);
    g.rotateZ(Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)));
    g.rotateY(Math.atan2(-(z1 - z0), x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    rails.push(g);
  };
  const step = 1.5;
  for (let side = 0; side < 4; side++)
    for (let s = -F; s < F - 0.01; s += step) {
      const a = side < 2 ? [s, side === 0 ? -F : F] : [side === 2 ? -F : F, s];
      const b = side < 2 ? [s + step, a[1]] : [a[0], s + step];
      if (side === 0 && Math.abs((a[0] + b[0]) / 2) < gap + 0.3) continue;
      for (const up of [0.22 + (r() - 0.5) * 0.03, 1.2 + (r() - 0.5) * 0.04]) if (r() > 0.03) rail(a[0], a[1], b[0], b[1], up);
    }
  const railMesh = new Mesh(join(rails), mat);
  railMesh.castShadow = railMesh.receiveShadow = true;
  group.add(railMesh);
  dispose.push(railMesh.geometry);

  // Stone piers: tall at the four corners and the gate, shorter along the runs.
  const stoneMats = (s: number) => faces("none", s, 0.7, stoneColor(s));
  let ps = 9100;
  const pier = (x: number, z: number, w: number, hgt: number, cap: boolean) => {
    const base = heightAt(x, z) - 0.1;
    const mats = stoneMats(ps++);
    const yaw = (r() - 0.5) * 0.2;
    const g = new Group();
    g.add(solid(slab(w + 0.14, 0.3, w + 0.14, { round: 0.02, chips: 3, erode: 1.3, res: 44, seed: ps++ }), mats));
    g.add(solid(slab(w, hgt, w, { round: 0.03, chips: 5, erode: 1.4, res: 44, seed: ps++ }), mats, new Vector3(0, 0.3, 0)));
    g.add(solid(slab(w + 0.16, 0.14, w + 0.16, { round: 0.03, chips: 3, erode: 1.3, res: 44, seed: ps++ }), mats, new Vector3(0, 0.3 + hgt, 0)));
    if (cap) g.add(solid(slab(w * 0.7, w * 0.8, w * 0.7, { taper: 0.9, round: 0.02, chips: 2, erode: 1.2, res: 44, seed: ps++ }), mats, new Vector3(0, 0.44 + hgt, 0)));
    g.position.set(x, base, z);
    g.rotation.set((r() - 0.5) * 0.03, yaw, (r() - 0.5) * 0.04);
    group.add(g);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pier(sx * F, sz * F, 0.8, 2.5, true);
  for (let s = -F + 8; s < F - 4; s += 8) {
    for (const [x, z] of [
      [s, F],
      [-F, s],
      [F, s],
    ])
      pier(x, z, 0.5, 1.7, false);
    if (Math.abs(s) > 4) pier(s, -F, 0.5, 1.7, false);
  }

  // The gate at the back: two tall piers, an iron arch between them, a gargoyle on each pier and one on the crown.
  const gx = 2.2;
  for (const s of [-1, 1]) pier(s * gx, -F, 0.75, 2.9, false);
  const gy = heightAt(0, -F);
  const archR = gx - 0.38;
  const archY = gy + 3.25;
  const arch: BufferGeometry[] = [];
  for (const rr of [archR, archR - 0.28]) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI;
      pts.push(new Vector3(Math.cos(a) * rr, Math.sin(a) * rr * 1.1, 0));
    }
    arch.push(new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.045, 8));
  }
  // Spokes and scrolls between the two bands.
  for (let i = 1; i < 20; i++) {
    const a = (i / 20) * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a) * 1.1;
    arch.push(new CylinderGeometry(0.014, 0.014, 0.28, 6).rotateZ(a - Math.PI / 2 + Math.PI / 2).translate(c * (archR - 0.14), s * (archR - 0.14), 0));
    if (i % 2 === 0) arch.push(new TorusGeometry(0.1, 0.011, 6, 20).translate(c * (archR - 0.14), s * (archR - 0.14), 0));
  }
  arch.push(new BoxGeometry(0.42, 0.34, 0.1).translate(0, archR * 1.1 + 0.02, 0));
  arch.push(new ConeGeometry(0.06, 0.4, 6).translate(0, archR * 1.1 + 0.4, 0));
  const archMesh = new Mesh(join(arch), mat);
  archMesh.position.set(0, archY, -F);
  archMesh.castShadow = archMesh.receiveShadow = true;
  group.add(archMesh);
  dispose.push(archMesh.geometry);
  // Gargoyles: one atop each pier looking out, one on the crown.
  const gg = gargoyle();
  for (const [x, y, sc, rot] of [
    [-gx, gy + 3.3 + 0.44, 1.0, -0.3],
    [gx, gy + 3.3 + 0.44, 1.0, 0.3],
    [0, archY + archR * 1.1 + 0.18, 0.95, 0],
  ] as const) {
    const g = gg.clone();
    g.position.set(x, y, -F);
    g.rotation.y = Math.PI + rot;
    g.scale.setScalar(sc);
    group.add(g);
  }
  dispose.push(gg.geometry);
  // The gates themselves, swung open and sagging.
  for (const [s, open, sag] of [
    [-1, 1.15, 0.02],
    [1, 0.55, -0.045],
  ] as const) {
    const leaf = new Mesh(gateLeaf(gx - 0.45, 2.9), mat);
    leaf.castShadow = leaf.receiveShadow = true;
    const hinge = new Group();
    hinge.position.set(s * (gx - 0.38), gy, -F + 0.05);
    leaf.scale.x = -s;
    hinge.rotation.set(0, s * open, sag);
    hinge.add(leaf);
    group.add(hinge);
    dispose.push(leaf.geometry);
  }
  return { group, dispose: () => dispose.forEach((d) => d.dispose()) };
}
