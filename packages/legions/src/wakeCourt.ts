// The Wake: the Restless's home court, a graveyard at night. Built from the ground up,
// one piece at a time. So far: the ground, and the board set into it. The pale squares
// are old marble slabs, filthy and cracked, ivy growing over them; the dark squares are
// plain mud, level with the soil round them; the rest of the ground is bumpy dirt.
// Everything is made in code (canvas textures with normal maps worked out from them).
import {
  CanvasTexture,
  Color,
  Euler,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Fog,
  Group,
  HemisphereLight,
  type Light,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Board } from "./board";
import { slab, weather } from "./wakeStones";
import { GRAVES } from "./wakeGraves";
import { fence, grass, YARD } from "./wakeYard";
import { barkMaterial, forestGeometry, makeTree, OAK_LOOK, type TreeKind } from "./wakeTrees";
import { body, canvas, clamp01, fbm, mix, normalFrom, smooth, stream, wrapped } from "./wakeKit";
import type { CourtSet } from "./courts";

/** Where the dirt lies under the board; the slabs and the mud sit in it. */
export const GROUND = -0.05;
/** The haze the far ground and the sky's foot meet in. */
export const HAZE = 0x424c54;

// ----- The dirt -----

/** Bumpy dirt that tiles: clods, pebbles, grit and dead twigs on a mottled brown. */
export function dirtMaps(seed: number) {
  const size = 1024;
  const r = stream(seed);
  const { c, g } = body(size, 512, (u, v) => {
    const big = fbm(u * 4, v * 4, seed, 4, 5);
    const fine = fbm(u * 16, v * 16, seed + 5, 16, 3);
    const t = clamp01(big * 0.8 + fine * 0.4 - 0.1);
    const damp = smooth(0.55, 0.8, fbm(u * 3, v * 3, seed + 9, 3, 3));
    const k = mix(0.55, 1.15, t) * mix(1, 0.62, damp);
    return [66 * k, 56 * k, 46 * k];
  });
  // Clods, each lit from the upper left, with a shadow under it.
  for (let i = 0; i < 700; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 6 + r() * r() * 30;
    const tint = 0.7 + r() * 0.6;
    wrapped(size, x, y, rad * 1.4, (px, py) => {
      g.fillStyle = "rgba(10,8,6,0.2)";
      g.beginPath();
      g.ellipse(px + rad * 0.3, py + rad * 0.35, rad, rad * 0.8, 0, 0, 7);
      g.fill();
      const grad = g.createRadialGradient(px - rad * 0.3, py - rad * 0.3, rad * 0.1, px, py, rad);
      grad.addColorStop(0, `rgba(${84 * tint},${72 * tint},${60 * tint},0.55)`);
      grad.addColorStop(1, `rgba(${40 * tint},${33 * tint},${27 * tint},0.55)`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, 7);
      g.fill();
    });
  }
  // Pebbles.
  for (let i = 0; i < 110; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 1.5 + r() * r() * 6;
    const base = 62 + r() * 44;
    wrapped(size, x, y, rad * 2, (px, py) => {
      g.fillStyle = "rgba(6,6,6,0.5)";
      g.beginPath();
      g.ellipse(px + rad * 0.3, py + rad * 0.4, rad, rad * 0.75, 0.4, 0, 7);
      g.fill();
      const grad = g.createRadialGradient(px - rad * 0.35, py - rad * 0.35, 0.5, px, py, rad);
      grad.addColorStop(0, `rgb(${base + 40},${base + 38},${base + 30})`);
      grad.addColorStop(1, `rgb(${base - 30},${base - 32},${base - 36})`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, rad, rad * 0.78, 0.4, 0, 7);
      g.fill();
    });
  }
  // Dead twigs and rootlets.
  g.lineCap = "round";
  for (let i = 0; i < 60; i++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * 6.3;
    g.strokeStyle = `rgba(${28 + r() * 22},${22 + r() * 16},${16 + r() * 10},0.9)`;
    g.lineWidth = 1 + r() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * (8 + r() * 12);
      y += Math.sin(a) * (8 + r() * 12);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Grit.
  for (let i = 0; i < 60000; i++) {
    const d = r() < 0.5 ? 1 : -1;
    const v = d > 0 ? 120 + r() * 60 : 10 + r() * 30;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},${0.25 + r() * 0.4})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.anisotropy = 8;
  const normal = normalFrom(c, 5, true);
  normal.wrapS = normal.wrapT = RepeatWrapping;
  normal.anisotropy = 8;
  return { map, normal };
}

/** Wet, dark mud for a square: smooth swirls, a few puddle sheens, dried cracks, a pebble or two. */
function mudMaps(seed: number) {
  const size = 512;
  const r = stream(seed);
  const { c, g } = body(size, 256, (u, v) => {
    const warp = fbm(u * 3 + 5, v * 3, seed, 1 << 16, 3);
    const t = fbm(u * 5 + warp * 2, v * 5 - warp, seed + 3, 1 << 16, 5);
    const pool = smooth(0.55, 0.68, fbm(u * 2.5, v * 2.5, seed + 7, 1 << 16, 3));
    const k = mix(0.5, 1.1, t);
    // Standing water gives back a little of the cold sky.
    return [mix(46 * k, 58, pool * 0.45), mix(36 * k, 56, pool * 0.45), mix(27 * k, 54, pool * 0.45)];
  });
  g.lineCap = "round";
  // Drying cracks.
  g.strokeStyle = "rgba(12,9,7,0.7)";
  for (let k = 0; k < 7; k++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * 6.3;
    g.lineWidth = 1 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 8; i++) {
      a += (r() - 0.5) * 1.3;
      x += Math.cos(a) * (10 + r() * 14);
      y += Math.sin(a) * (10 + r() * 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // A few stones pressed into it.
  for (let i = 0; i < 12; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 2 + r() * 5;
    const base = 70 + r() * 50;
    g.fillStyle = "rgba(4,4,4,0.5)";
    g.beginPath();
    g.ellipse(x + rad * 0.3, y + rad * 0.4, rad, rad * 0.75, 0.4, 0, 7);
    g.fill();
    g.fillStyle = `rgb(${base},${base - 2},${base - 8})`;
    g.beginPath();
    g.ellipse(x, y, rad, rad * 0.78, 0.4, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const v = r() < 0.5 ? 80 + r() * 40 : 8 + r() * 20;
    g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},${0.2 + r() * 0.3})`;
    g.fillRect(r() * size, r() * size, 1 + r(), 1 + r());
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return { map, normal: normalFrom(c, 2.4, false) };
}

// ----- The marble -----

/** An old paving slab: stained pale marble, veined, cracked, grimed along its edges and in its dips. Moss is added in 3D. */
function marbleMaps(seed: number) {
  const size = 1024;
  const r = stream(seed);
  const { c, g } = body(size, 512, (u, v) => {
    const w1 = fbm(u * 3 + 9, v * 3, seed, 1 << 16, 3);
    const w2 = fbm(u * 3, v * 3 + 7, seed + 1, 1 << 16, 3);
    const cloud = fbm(u * 4 + w1, v * 4 + w2, seed + 2, 1 << 16, 5);
    let [cr, cg, cb] = [mix(96, 150, cloud), mix(93, 146, cloud), mix(84, 134, cloud)];
    // Warm yellow-grey age stains.
    const stain = smooth(0.52, 0.72, fbm(u * 2.5 + 3, v * 2.5, seed + 4, 1 << 16, 4));
    cr = mix(cr, 128, stain * 0.5);
    cg = mix(cg, 122, stain * 0.5);
    cb = mix(cb, 104, stain * 0.5);
    // Veins.
    const vein = 1 - Math.abs(2 * fbm(u * 2.2 + w2 * 1.5, v * 2.2 + w1 * 1.5, seed + 6, 1 << 16, 4) - 1);
    const vv = smooth(0.9, 0.97, vein) * 0.6;
    cr = mix(cr, 96, vv);
    cg = mix(cg, 94, vv);
    cb = mix(cb, 92, vv);
    // Grime: in the dips and thick along the edges.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const grime = Math.max(smooth(0.26, 0.0, edge) * (0.7 + 0.3 * fbm(u * 8, v * 8, seed + 8, 1 << 16, 3)), smooth(0.5, 0.7, fbm(u * 3.5, v * 3.5, seed + 10, 1 << 16, 4)) * 0.85);
    return [mix(cr, 52, grime), mix(cg, 46, grime), mix(cb, 36, grime)];
  });
  // Fine grain.
  for (let i = 0; i < 16000; i++) {
    const v = r() < 0.5 ? 205 : 30;
    g.fillStyle = `rgba(${v},${v},${v * 0.95},${0.08 + r() * 0.16})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // Cracks: a dark seam, a lit lip beside it and dirt packed in.
  const seams: [number, number][][] = [];
  const crack = (x: number, y: number, ang: number, n: number, w: number) => {
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < n; i++) {
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang) * (14 + r() * 20);
      y += Math.sin(ang) * (14 + r() * 20);
      pts.push([x, y]);
      if (r() < 0.16 && n > 4) crack(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r()), Math.floor(n / 2), w * 0.7);
    }
    seams.push(pts);
    const trace = (dx: number, dy: number) => {
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
      g.stroke();
    };
    g.strokeStyle = "rgba(220,218,208,0.35)";
    g.lineWidth = w;
    trace(1.5, 1.5);
    g.strokeStyle = "rgba(36,28,20,0.85)";
    g.lineWidth = w * 1.5;
    trace(0, 0);
    g.strokeStyle = "rgba(8,6,4,0.9)";
    g.lineWidth = w * 0.6;
    trace(0, 0);
  };
  for (let k = 0; k < 3 + Math.floor(r() * 3); k++) crack(r() * size, r() < 0.5 ? 0 : size, r() * 6.3, 12 + Math.floor(r() * 8), 2.2);
  // Moss in the cracks: a green fur along some seams, thick in places, rotten brown at its edge.
  for (const pts of seams)
    if (r() < 0.7)
      for (let i = 0; i < pts.length - 1; i++)
        for (let k = 0; k < 5; k++) {
          const t = k / 5;
          const x = mix(pts[i][0], pts[i + 1][0], t) + (r() - 0.5) * 8;
          const y = mix(pts[i][1], pts[i + 1][1], t) + (r() - 0.5) * 8;
          const rad = 4 + r() * 11 * (0.4 + fbm(x / 90, y / 90, seed, 1 << 16, 2));
          const grad = g.createRadialGradient(x, y, 0, x, y, rad);
          grad.addColorStop(0, `rgba(${46 + r() * 22},${82 + r() * 34},${34},0.75)`);
          grad.addColorStop(0.7, "rgba(54,86,36,0.35)");
          grad.addColorStop(1, "rgba(34,26,16,0.25)");
          g.fillStyle = grad;
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
  // Chipped corners and edges, the dark soil showing through.
  g.fillStyle = "rgba(34,28,22,0.95)";
  for (let k = 0; k < 14; k++) {
    const side = Math.floor(r() * 4);
    const t = r() * size;
    const d = 8 + r() * 26;
    const w = 14 + r() * 40;
    g.beginPath();
    if (side < 2) {
      const e = side === 0 ? 0 : size;
      const s = side === 0 ? 1 : -1;
      g.moveTo(e, t);
      g.lineTo(e + s * d, t + w * 0.3);
      g.lineTo(e + s * d * 0.5, t + w);
      g.lineTo(e, t + w);
    } else {
      const e = side === 2 ? 0 : size;
      const s = side === 2 ? 1 : -1;
      g.moveTo(t, e);
      g.lineTo(t + w * 0.3, e + s * d);
      g.lineTo(t + w, e + s * d * 0.5);
      g.lineTo(t + w, e);
    }
    g.closePath();
    g.fill();
  }
  // Dirt and moss caught along the edges.
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4);
    const t = r() * size;
    const x = side === 0 ? r() * 30 : side === 1 ? size - r() * 30 : t;
    const y = side === 2 ? r() * 30 : side === 3 ? size - r() * 30 : t;
    const rad = 10 + r() * 34;
    const moss = r() < 0.35;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, moss ? `rgba(${50 + r() * 20},${84 + r() * 30},${36},0.6)` : "rgba(40,32,24,0.65)");
    grad.addColorStop(1, "rgba(30,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // The worn dark rim.
  g.strokeStyle = "rgba(16,12,8,0.75)";
  g.lineWidth = 12;
  g.strokeRect(0, 0, size, size);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return { map, normal: normalFrom(c, 2.8, false) };
}

// ----- The court -----

export function theWake(scene: Scene, board: Board): CourtSet {
  const group = new Group();
  scene.add(group);
  const dispose: { dispose(): void }[] = [];
  const rng = stream(2024);

  // ----- The ground: dirt, humped and bumpy, level with the board where the board lies -----
  const dirt = dirtMaps(900);
  dirt.map.repeat.set(40, 40);
  dirt.normal.repeat.set(40, 40);
  const size = 360;
  const segs = 440;
  const geo = new PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  /** The dirt's height at a spot: flat under the board, rising into humps and hollows beyond it. */
  const heightAt = (x: number, z: number) => {
    const out = smooth(4.4, 9, Math.max(Math.abs(x), Math.abs(z)));
    const hump = fbm(x * 0.18 + 40, z * 0.18, 5, 1 << 16, 5) - 0.42;
    const ridge = fbm(x * 0.6, z * 0.6 + 70, 6, 1 << 16, 3) - 0.5;
    return GROUND + out * (hump * 1.6 + ridge * 0.25) + 0.004 * (1 - out) * Math.sin(x * 7) * Math.cos(z * 5);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // Patches of the dirt darker, damper or paler, to break up its tiling.
    const k = mix(0.7, 1.12, fbm(x * 0.25, z * 0.25, 12, 1 << 16, 4));
    // Beyond the fence the forest floor goes darker with distance, and mossy in patches.
    const far = smooth(YARD + 2, YARD + 60, Math.max(Math.abs(x), Math.abs(z)));
    const dark = 1 - 0.68 * far;
    const mo = smooth(0.45, 0.62, fbm(x * 0.09 + 3, z * 0.09, 21, 1 << 16, 3)) * far * 0.9;
    colors.set([k * dark * (1 - 0.5 * mo), k * dark * 0.98 * (1 - 0.1 * mo), k * dark * 0.95 * (1 - 0.6 * mo)], i * 3);
  }
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const soil = new MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normal, vertexColors: true, roughness: 1, color: 0xe0d6c8 });
  soil.normalScale.set(2, 2);
  const ground = new Mesh(geo, soil);
  ground.receiveShadow = true;
  group.add(ground);
  dispose.push(soil, dirt.map, dirt.normal, geo);

  // ----- The board, set into the ground -----
  const squares = new Set(board.squares.values());
  for (const o of board.group.children) if (!squares.has(o as Mesh)) o.visible = false;
  const marble = [0, 1, 2, 3, 4].map((i) => marbleMaps(300 + i * 53));
  const mud = [0, 1, 2].map((i) => mudMaps(700 + i * 29));
  for (const m of [...marble, ...mud]) dispose.push(m.map, m.normal);
  const slabMats = marble.map((m) => weather(new MeshStandardMaterial({ map: m.map, normalMap: m.normal, color: 0xd6d6d0, roughness: 1, metalness: 0 }), 0.12, 0.03, -0.8));
  const mudMats = mud.map((m) => weather(new MeshStandardMaterial({ map: m.map, normalMap: m.normal, roughness: 0.5, metalness: 0 }), 0.0, 0.03, -0.8));
  dispose.push(...slabMats, ...mudMats);
  const light: Mesh[] = [];
  for (const sq of board.squares.values()) {
    const isLight = !!sq.userData.light;
    const was = sq.material as MeshStandardMaterial;
    const mats = isLight ? slabMats : mudMats;
    sq.material = mats[Math.floor(rng() * mats.length)];
    was.map?.dispose();
    was.dispose();
    // A worn block of its own: rounded, chipped and eroded like the stones, its picture turned a quarter-turn or so.
    const sd = 800 + Math.round((sq.position.x + 4) * 8 + (sq.position.z + 4) * 64);
    const g = isLight ? slab(1, 0.14, 1, { round: 0.045, chips: 3, erode: 1.7, res: 34, seed: sd }) : slab(1, 0.14, 1, { round: 0.07, erode: 2.8, res: 30, seed: sd });
    const par = (g as BoxGeometry).parameters;
    const uv = g.getAttribute("uv");
    const top0 = 2 * (par.depthSegments + 1) * (par.heightSegments + 1);
    const turn = Math.floor(rng() * 4);
    const flip = rng() < 0.5 ? -1 : 1;
    for (let i = top0; i < top0 + (par.widthSegments + 1) * (par.depthSegments + 1); i++) {
      let u = uv.getX(i) - 0.5;
      let v = uv.getY(i) - 0.5;
      for (let k = 0; k < turn; k++) [u, v] = [-v, u];
      uv.setXY(i, 0.5 + u * flip, 0.5 + v);
    }
    sq.geometry = g;
    dispose.push(g);
    if (isLight) {
      // The slabs stand a hair apart and a touch out of true, their tops just above the dirt.
      sq.scale.set(0.96, 1, 0.96);
      sq.rotation.set((rng() - 0.5) * 0.014, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.014);
      sq.position.y = -0.16;
      sq.castShadow = false;
      light.push(sq);
    } else {
      // Mud: flush with the dirt around it, its edge ragged.
      sq.scale.set(1.01, 1, 1.01);
      sq.position.y = -0.17;
    }
  }

  // ----- Moss: strands of it, long and short, thick and thin, run along the joints and wander across the slabs; green in the middle, rotten dark at the fringes -----
  const blob = new IcosahedronGeometry(0.5, 0);
  const tuft = mergeVertices(blob.deleteAttribute("uv").deleteAttribute("normal"), 0.001);
  tuft.computeVertexNormals();
  blob.dispose();
  // The same grime, dirt splash and pitted bump the stones get, over the moss too.
  const mossMat = weather(new MeshStandardMaterial({ roughness: 1 }), 0, 0.05, -0.8);
  const places: { m: Matrix4; c: Color }[] = [];
  const stains: BufferGeometry[] = [];
  const q = new Quaternion();
  const eu = new Euler();
  /** One strand: a path, a width that swells and thins along it. Green at the core, rotten at the edges and ends. */
  const strand = (pts: [number, number][], width: number, seed: number) => {
    const r = stream(seed);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    // A dark, soft stain on the stone under it, so the moss sits in the surface rather than on it.
    const ribbon = new PlaneGeometry(1, 1, Math.max(1, Math.floor(len / 0.1)), 1);
    const rp = ribbon.getAttribute("position");
    const ru = ribbon.getAttribute("uv");
    for (let i = 0; i < rp.count; i++) {
      const t = ru.getX(i);
      const f = t * (pts.length - 1);
      const i0 = Math.min(pts.length - 2, Math.floor(f));
      const u = f - i0;
      const tx = pts[i0 + 1][0] - pts[i0][0];
      const tz = pts[i0 + 1][1] - pts[i0][1];
      const tl = Math.hypot(tx, tz) || 1;
      const half = width * Math.pow(Math.sin(t * Math.PI), 0.6) * 1.7 * (0.5 + fbm(t * 5 + 3, 1, seed, 1 << 16, 3));
      const side = ru.getY(i) * 2 - 1;
      rp.setXYZ(i, mix(pts[i0][0], pts[i0 + 1][0], u) - (tz / tl) * half * side, -0.0265, mix(pts[i0][1], pts[i0 + 1][1], u) + (tx / tl) * half * side);
    }
    stains.push(ribbon);
    const step = 0.028;
    const n = Math.max(2, Math.floor(len / step));
    const ph = r() * 20;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const f = t * (pts.length - 1);
      const i0 = Math.min(pts.length - 2, Math.floor(f));
      const u = f - i0;
      const x = mix(pts[i0][0], pts[i0 + 1][0], u);
      const z = mix(pts[i0][1], pts[i0 + 1][1], u);
      const tx = pts[i0 + 1][0] - pts[i0][0];
      const tz = pts[i0 + 1][1] - pts[i0][1];
      const tl = Math.hypot(tx, tz) || 1;
      // Swells and pinches along its length, thin at both ends.
      const w = width * Math.pow(Math.sin(t * Math.PI), 0.6) * (0.35 + 1.3 * fbm(t * 6 + ph, ph, seed, 1 << 16, 3));
      const count = 1 + Math.floor(w * 20);
      for (let c = 0; c < count; c++) {
        const side = (r() + r() + r() - 1.5) * 2;
        const off = side * w;
        const edge = Math.abs(side);
        const rot = r() < 0.04 + edge * 0.5 + (t < 0.08 || t > 0.92 ? 0.3 : 0);
        const sc = (rot ? 0.04 : 0.055) + r() * 0.07 * (1 - edge * 0.4);
        eu.set(r() * 6, r() * 6, r() * 6);
        q.setFromEuler(eu);
        const sy = sc * (0.45 + r() * 0.3);
        places.push({
          m: new Matrix4().compose(new Vector3(x - (tz / tl) * off, -0.027 + sy * 0.2, z + (tx / tl) * off), q, new Vector3(sc, sy, sc)),
          c: rot ? new Color().setHSL(0.07 + r() * 0.05, 0.3 + r() * 0.2, 0.035 + r() * 0.05) : new Color().setHSL(0.22 + r() * 0.1, 0.35 + r() * 0.2, 0.022 + r() * 0.045),
        });
      }
    }
  };
  let sd = 500;
  // Along the joints between the slabs, in runs of every length.
  for (let line = -4; line <= 4; line++) {
    for (const horiz of [true, false]) {
      let at = -4 + rng() * 1.5;
      while (at < 4) {
        const len = Math.min(0.4 + rng() * rng() * 3.2, 4 - at);
        if (rng() < 0.3) {
          const wob = (rng() - 0.5) * 0.08;
          const pts: [number, number][] = [];
          for (let k = 0; k <= 6; k++) {
            const a = at + (len * k) / 6;
            const o = line + wob + (fbm(a * 3, line, sd, 1 << 16, 2) - 0.5) * 0.16;
            pts.push(horiz ? [a, o] : [o, a]);
          }
          strand(pts, 0.03 + rng() * 0.09, sd++);
        }
        at += len + 0.3 + rng() * 1.6;
      }
    }
  }
  // Wandering across the slabs, bending and branching away from a joint.
  for (let i = 0; i < 16; i++) {
    let x = Math.round((rng() - 0.5) * 8);
    let z = (rng() - 0.5) * 8;
    let a = rng() * 6.3;
    const pts: [number, number][] = [[x, z]];
    const n = 5 + Math.floor(rng() * 8);
    for (let k = 0; k < n; k++) {
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a) * 0.3;
      z += Math.sin(a) * 0.3;
      if (Math.abs(x) > 4 || Math.abs(z) > 4) break;
      pts.push([x, z]);
    }
    if (pts.length > 2) strand(pts, 0.03 + rng() * 0.06, sd++);
  }
  const stainTex = (() => {
    const { c, g } = canvas(64);
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.7)");
    grad.addColorStop(0.65, "rgba(255,255,255,0.7)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  })();
  const stainMat = new MeshBasicMaterial({ color: 0x0b0e06, alphaMap: stainTex, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stain = new Mesh(mergeGeometries(stains)!, stainMat);
  stains.forEach((g) => g.dispose());
  stain.renderOrder = 1;
  group.add(stain);
  dispose.push(stain.geometry, stainMat, stainTex);
  const moss = new InstancedMesh(tuft, mossMat, places.length);
  places.forEach((p, i) => {
    moss.setMatrixAt(i, p.m);
    moss.setColorAt(i, p.c);
  });
  moss.receiveShadow = true;
  moss.frustumCulled = false;
  group.add(moss);
  dispose.push(tuft, mossMat, moss);

  // ----- The graves: in loose rows and columns, some leaning and sinking, mossy at the foot -----
  const taken: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: 6.0 }];
  const holders: Group[] = [];
  const FIXED: Record<string, [number, number]> = { chapel: [-15, -16], mausoleum: [14, -15], vault: [-17, 1] };
  for (const [id, [x, z]] of Object.entries(FIXED)) taken.push({ x, z, r: GRAVES.find((k) => k.id === id)?.radius ?? 2 });
  const pr = stream(77);
  // The slots: a grid a little out of true, each row drifting its own way.
  const slots: { x: number; z: number }[] = [];
  for (let ri = -7; ri <= 7; ri++) {
    const drift = Math.sin(ri * 1.7) * 0.45;
    for (let ci = -7; ci <= 7; ci++) {
      const x = ci * 3.1 + drift + (pr() - 0.5) * 0.7;
      const z = ri * 3.2 + (pr() - 0.5) * 0.6;
      if (Math.abs(x) > YARD - 3 || Math.abs(z) > YARD - 3) continue;
      if (Math.abs(x) < 6.4 && Math.abs(z) < 6.4) continue;
      if (z > 3 && Math.abs(x) < 8 && z < 16) continue;
      slots.push({ x, z });
    }
  }
  // Dead trees sprinkled through the yard: every one grown from its own seed, in sizes from sapling-thin to old and broad.
  const tr = stream(1717);
  const KINDS: TreeKind[] = [
    "oak",
    "oak",
    "twisted",
    "snag",
    "hollow-oak",
    "leaning",
    "struck",
    "struck",
    "burnt",
    "tall-burnt",
    "oak",
    "twisted",
    "struck",
    "burnt",
    "leaning",
    "snag",
    "oak",
    "struck",
    "tall-burnt",
    "twisted",
  ];
  const plant = (kind: TreeKind, seed: number, x: number, z: number, scale: number, rad: number) => {
    taken.push({ x, z, r: rad });
    const holder = new Group();
    holder.position.set(x, heightAt(x, z) - 0.05, z);
    holder.rotation.y = tr() * 6.3;
    holder.add(makeTree(kind, seed, scale));
    group.add(holder);
    holders.push(holder);
  };
  // Three close to the board, to the sides and back so none hides it.
  plant("oak", 90, -8.3, -1.2, 0.75, 1);
  plant("struck", 91, 8.5, -6.2, 0.7, 1);
  plant("twisted", 92, -6.4, -8.2, 0.62, 1);
  KINDS.forEach((kind, i) => {
    const scale = kind === "hollow-oak" ? 0.8 + tr() * 0.3 : 0.5 + tr() * 0.8;
    const rad = (kind === "hollow-oak" ? 1.8 : 1.1) * scale;
    // Left and right in turn, so neither side crowds; the way to the gate stays open.
    const side = i % 2 ? 1 : -1;
    for (let t = 0; t < 120; t++) {
      const x = side * (6.8 + tr() * (YARD - 9));
      const z = (tr() - 0.5) * 2 * (YARD - 2);
      if (Math.abs(x) < 6.6 && Math.abs(z) < 6.6) continue;
      if (z > 3 && Math.abs(x) < 8 && z < 16) continue;
      if (z < -8 && Math.abs(x) < 7.5) continue;
      if (!taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + rad + 0.8)) continue;
      plant(kind, 100 + i, x, z, scale, rad);
      break;
    }
  });
  // The one great tree, just outside the gate to the back right.
  {
    const x = 8;
    const z = -YARD - 7.5;
    const holder = new Group();
    holder.position.set(x, heightAt(x, z) - 0.1, z);
    holder.rotation.y = 2.1;
    holder.add(makeTree("giant", 999, 1));
    group.add(holder);
    holders.push(holder);
  }

  // The forest beyond the fence: the same two styles in coarse copies, thicker and taller the farther out, until it is a dark wall.
  const forest: { geo: BufferGeometry; near: boolean }[] = [];
  const kindsNear: TreeKind[] = ["oak", "snag", "struck", "twisted"];
  const kindsFar: TreeKind[] = ["oak", "struck", "snag", "burnt", "twisted"];
  kindsNear.forEach((k, i) => forest.push({ geo: forestGeometry(k, 300 + i, 0.5), near: true }));
  kindsFar.forEach((k, i) => forest.push({ geo: forestGeometry(k, 400 + i, 0.22), near: false }));
  const forestMat = barkMaterial({ ...OAK_LOOK, c1: [0.045, 0.04, 0.034], c2: [0.018, 0.016, 0.014], moss: 0.35, wash: 1, lichen: 0.2 });
  const fr = stream(2929);
  const spots: { x: number; z: number; e: number; yaw: number; s: number }[] = [];
  const dens = (e: number) => 1 + Math.pow(Math.max(0, e - YARD - 3) / 22, 1.6);
  for (let t = 0; spots.length < 900 && t < 60000; t++) {
    const e = YARD + 3 + fr() * 80;
    if (fr() > (e * dens(e)) / (110 * dens(110))) continue;
    // A point on the square ring at that distance.
    const u = fr() * 8 - 4;
    const side = Math.floor(fr() * 4);
    const x = side < 2 ? u * (e / 4) : side === 2 ? -e : e;
    const z = side < 2 ? (side === 0 ? -e : e) : u * (e / 4);
    if (z < -YARD && Math.abs(x) < 4.5) continue;
    spots.push({ x, z, e, yaw: fr() * 6.3, s: e < 50 ? 0.8 + fr() * 0.8 : 1.3 + fr() * 1.4 });
  }
  const m4 = new Matrix4();
  const qf = new Quaternion();
  const ef = new Euler();
  for (const near of [true, false]) {
    const protos = forest.filter((f) => f.near === near);
    const mine = spots.filter((p) => p.e < 50 === near);
    protos.forEach((pr2, pi) => {
      const list = mine.filter((_, i) => i % protos.length === pi);
      const mesh = new InstancedMesh(pr2.geo, forestMat, list.length);
      list.forEach((p, i) => {
        ef.set(0, p.yaw, 0);
        qf.setFromEuler(ef);
        m4.compose(new Vector3(p.x, heightAt(p.x, p.z) - 0.2, p.z), qf, new Vector3(p.s, p.s * (0.9 + fr() * 0.3), p.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.castShadow = near;
      mesh.frustumCulled = false;
      group.add(mesh);
      dispose.push(mesh, pr2.geo);
    });
  }
  dispose.push(forestMat);

  const items = GRAVES.flatMap((k) => Array.from({ length: Math.min(3, k.copies ?? 1) }, (_, c) => ({ k, c })));
  // Larger pieces first, so they find room; the rest in any order.
  items.sort((a, b) => (b.k.radius ?? 0.8) - (a.k.radius ?? 0.8) + (pr() - 0.5) * 0.8);
  const built = new Map<string, Group>();
  const mossAt: { m: Matrix4; c: Color }[] = [];
  const q2 = new Quaternion();
  const e2 = new Euler();
  const base = (holder: Group, box: Box3, tall: number) => {
    holder.updateMatrix();
    const hx = (box.max.x - box.min.x) / 2 + 0.04;
    const hz = (box.max.z - box.min.z) / 2 + 0.04;
    const cx = (box.max.x + box.min.x) / 2;
    const cz = (box.max.z + box.min.z) / 2;
    const per = 4 * (hx + hz);
    // Part of the way round the foot, thick; and on some, patches climbing the sides.
    const start = pr() * per;
    const cover = per * (0.3 + pr() * 0.7);
    const count = Math.floor(cover * 9);
    const put = (u: number, y: number, out: number, sc: number, rotP: number) => {
      u = ((u % per) + per) % per;
      let x: number;
      let z: number;
      if (u < 2 * hx) [x, z] = [-hx + u, -hz];
      else if (u < 2 * hx + 2 * hz) [x, z] = [hx, -hz + (u - 2 * hx)];
      else if (u < 4 * hx + 2 * hz) [x, z] = [hx - (u - 2 * hx - 2 * hz), hz];
      else [x, z] = [-hx, hz - (u - 4 * hx - 2 * hz)];
      const nx = Math.abs(x) >= hx - 1e-6 ? Math.sign(x) : 0;
      const nz = Math.abs(z) >= hz - 1e-6 ? Math.sign(z) : 0;
      const sy = sc * (0.4 + pr() * 0.35);
      const p = new Vector3(cx + x + nx * out, y + sy * 0.25, cz + z + nz * out).applyMatrix4(holder.matrix);
      e2.set(pr() * 6, pr() * 6, pr() * 6);
      q2.setFromEuler(e2);
      const rot = pr() < rotP;
      mossAt.push({
        m: new Matrix4().compose(p, q2, new Vector3(sc, sy, sc)),
        c: rot ? new Color().setHSL(0.07 + pr() * 0.05, 0.3 + pr() * 0.2, 0.035 + pr() * 0.05) : new Color().setHSL(0.22 + pr() * 0.1, 0.35 + pr() * 0.2, 0.022 + pr() * 0.05),
      });
    };
    for (let i = 0; i < count; i++) put(start + pr() * cover, pr() * 0.07, pr() * 0.1, 0.06 + pr() * 0.1, 0.28);
    if (pr() < 0.4) {
      const hs = pr() * per;
      for (let i = 0; i < 18 + Math.floor(pr() * 24); i++) put(hs + (pr() - 0.5) * 0.7, 0.08 + pr() * Math.min(0.9, tall * 0.5), -0.01, 0.035 + pr() * 0.05, 0.35);
    }
  };
  const same = new Map<string, { x: number; z: number }[]>();
  for (const { k, c } of items) {
    const radius = k.radius ?? 0.8;
    let x = 0;
    let z = 0;
    let ok = false;
    if (FIXED[k.id]) {
      [x, z] = FIXED[k.id];
      ok = true;
    } else
      for (let t = 0; t < 120 && !ok; t++) {
        const s = slots[Math.floor(Math.pow(pr(), 1.2) * slots.length)];
        x = s.x;
        z = s.z;
        ok = taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + radius + 0.3) && (t > 90 || (same.get(k.id) ?? []).every((o) => Math.hypot(o.x - x, o.z - z) > 15));
      }
    if (!ok) continue;
    taken.push({ x, z, r: radius });
    same.set(k.id, [...(same.get(k.id) ?? []), { x, z }]);
    let proto = built.get(k.id);
    if (!proto) built.set(k.id, (proto = k.build()));
    const piece = c === 0 ? proto : proto.clone();
    const box = new Box3().setFromObject(piece);
    const holder = new Group();
    const big = radius > 1.5;
    const lean = pr() < 0.2 ? 0.2 : 0.07;
    const sink = big ? pr() * 0.05 : pr() < 0.65 ? 0.02 + pr() * 0.2 : 0;
    holder.position.set(x, heightAt(x, z) - 0.03 - sink, z);
    holder.rotation.set((pr() - 0.5) * lean * (big ? 0.3 : 1), pr() < 0.12 ? (pr() - 0.5) * 2.4 : (pr() - 0.5) * 0.5, (pr() - 0.5) * lean * (big ? 0.3 : 1), "YXZ");
    if (c > 0 && !FIXED[k.id]) {
      piece.scale.multiplyScalar(0.92 + pr() * 0.16);
      if (pr() < 0.5) piece.scale.x *= -1;
    }
    holder.add(piece);
    group.add(holder);
    holders.push(holder);
    base(holder, box, box.max.y - box.min.y);
  }
  const footMoss = new InstancedMesh(tuft, mossMat, mossAt.length);
  mossAt.forEach((p, i) => {
    footMoss.setMatrixAt(i, p.m);
    footMoss.setColorAt(i, p.c);
  });
  footMoss.receiveShadow = true;
  footMoss.frustumCulled = false;
  group.add(footMoss);
  dispose.push(footMoss);

  // ----- Grass over the dirt, and the fence round the yard -----
  // Short, dead grass: some round the foot of a third of the graves, and a score of clumps about the yard.
  const clumps: { x: number; z: number; r: number; n: number }[] = [];
  for (const o of taken.slice(1)) if (pr() < 0.35 && o.r < 2) clumps.push({ x: o.x, z: o.z, r: o.r + 0.5, n: 14 + Math.floor(pr() * 22) });
  for (let i = 0; i < 24; i++) {
    const a = pr() * Math.PI * 2;
    const d = 7 + pr() * 21;
    clumps.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, r: 1.2 + pr() * 2.4, n: 30 + Math.floor(pr() * 50) });
  }
  // Beyond the fence the grass thickens with distance.
  for (let i = 0, t = 0; i < 170 && t < 4000; t++) {
    const e = YARD + 3 + pr() * 70;
    if (pr() > dens(e) / dens(95)) continue;
    const side = Math.floor(pr() * 4);
    const u = (pr() - 0.5) * 2 * e;
    clumps.push({ x: side < 2 ? u : side === 2 ? -e : e, z: side < 2 ? (side === 0 ? -e : e) : u, r: 1.5 + pr() * 2, n: 30 + Math.floor(pr() * 30) });
    i++;
  }
  const blades = grass(heightAt, clumps, 4.15);
  group.add(blades.mesh);
  const iron = fence(heightAt);
  group.add(iron.group);
  dispose.push({ dispose: blades.dispose }, { dispose: iron.dispose });

  // ----- Light and haze: the moon low behind the graves, so their edges are lit and their shadows fall toward you -----
  const moonLight = new DirectionalLight(0xb8ccdf, 2.4);
  moonLight.position.set(-12, 14, -18);
  moonLight.castShadow = true;
  Object.assign(moonLight.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 90 });
  moonLight.shadow.mapSize.set(4096, 4096);
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.02;
  const fill = new DirectionalLight(0x8aa4bd, 1.1);
  fill.position.set(6, 5, 16);
  const hemi = new HemisphereLight(0x8aa0b0, 0x2a2018, 2.0);
  group.add(moonLight, moonLight.target, fill, hemi);
  // The scene's own studio lights and reflections would wash the night out; put them down for this court.
  const dimmed: [Light, number][] = [];
  for (const o of scene.children) {
    const l = o as Light;
    if (l.isLight && o !== group && l.intensity > 0) {
      dimmed.push([l, l.intensity]);
      l.intensity = 0;
    }
  }
  const prevEnv = scene.environmentIntensity;
  scene.environmentIntensity = 0.2;
  const prevBg = scene.background;
  const prevFog = scene.fog;
  scene.background = new Color(HAZE);
  scene.fog = new Fog(HAZE, 20, 150);

  return {
    markY: 0.02,
    view: { fixed: false, pitch: 0.5, dist: 11, fov: 50, ty: 0.6 },
    update(ms) {
      blades.update(ms);
    },
    dispose() {
      group.removeFromParent();
      scene.background = prevBg;
      scene.environmentIntensity = prevEnv;
      for (const [l, i] of dimmed) l.intensity = i;
      scene.fog = prevFog;
      dispose.forEach((d) => d.dispose());
      for (const h of holders)
        h.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            const t = mat as MeshStandardMaterial;
            t.map?.dispose();
            t.normalMap?.dispose();
            mat.dispose();
          }
        });
    },
  };
}
