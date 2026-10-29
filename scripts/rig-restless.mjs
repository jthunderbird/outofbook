// Rigs two static Meshy models of The Restless that Meshy's own rigger cannot (it only
// takes upright humanoids): the werewolf (a quadruped: spine, head, tail, four legs, with
// clips Idle, Run, Crouch, Leap, Land, Bite) and the zombie hand (a wrist, palm and five
// fingers, no clips; the game curls the finger bones itself). Bones are placed from the
// shape of the mesh and every vertex is weighted to the nearest bones.
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp@0.34
//   node scripts/rig-restless.mjs wolf in.glb out.glb
//   node scripts/rig-restless.mjs hand in.glb out.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [what, inFile, outFile] = process.argv.slice(2);
const doc = await io.read(inFile);
const root = doc.getRoot();
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute("POSITION").getArray();
const NV = pos.length / 3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
const quantile = (arr, q) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(q * arr.length))];

/** Bones: { name, at, parent (index or -1), end (where its segment stops, for weighting), sigma }. */
function skinWith(bones) {
  const W = new Float32Array(NV * 4);
  const J = new Uint16Array(NV * 4);
  for (let v = 0; v < NV; v++) {
    const p = P(v);
    const ws = bones.map((b) => {
      const ab = sub(b.end, b.at);
      const t = Math.max(0, Math.min(1, dot(sub(p, b.at), ab) / Math.max(1e-9, dot(ab, ab))));
      const d = len(sub(p, add(b.at, mul(ab, t))));
      const s = b.sigma ?? 0.1;
      return { i: bones.indexOf(b), w: Math.exp(-((d / s) ** 2)) + 1e-6 / (d + 1e-3), d };
    });
    ws.sort((a, b) => b.w - a.w);
    const top = ws.slice(0, 4);
    const sum = top.reduce((a, x) => a + x.w, 0);
    top.forEach((x, k) => {
      J[v * 4 + k] = x.i;
      W[v * 4 + k] = x.w / sum;
    });
  }
  const buf = root.listBuffers()[0];
  prim.setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(J).setBuffer(buf));
  prim.setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(W).setBuffer(buf));
  const nodes = bones.map((b) => doc.createNode(b.name));
  bones.forEach((b, i) => {
    nodes[i].setTranslation(b.parent < 0 ? b.at : sub(b.at, bones[b.parent].at));
    if (b.parent >= 0) nodes[b.parent].addChild(nodes[i]);
  });
  const ibm = new Float32Array(bones.length * 16);
  bones.forEach((b, i) => {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.at[0], -b.at[1], -b.at[2], 1], i * 16);
  });
  const skin = doc.createSkin("rig").setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buf)).setSkeleton(nodes[0]);
  nodes.forEach((n) => skin.addJoint(n));
  meshNode.setSkin(skin);
  root.listScenes()[0].addChild(nodes[0]);
  return nodes;
}

const quat = (x, y, z) => {
  // XYZ euler to quaternion
  const c = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)];
  const s = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return [s[0] * c[1] * c[2] + c[0] * s[1] * s[2], c[0] * s[1] * c[2] - s[0] * c[1] * s[2], c[0] * c[1] * s[2] + s[0] * s[1] * c[2], c[0] * c[1] * c[2] - s[0] * s[1] * s[2]];
};

/** clip(name, duration, { jointName: [[t, [rx, ry, rz]], ...] }, { jointName: [[t, [dx, dy, dz]], ...] }) */
function clip(nodes, bones, name, tracks, moves = {}) {
  const buf = root.listBuffers()[0];
  const anim = doc.createAnimation(name);
  const add1 = (node, path, keys, f) => {
    const input = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Float32Array(keys.map((k) => k[0])))
      .setBuffer(buf);
    const out = keys.map((k) => f(k[1])).flat();
    const output = doc
      .createAccessor()
      .setType(path === "rotation" ? "VEC4" : "VEC3")
      .setArray(new Float32Array(out))
      .setBuffer(buf);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  };
  for (const [j, keys] of Object.entries(tracks)) add1(nodes[bones.findIndex((b) => b.name === j)], "rotation", keys, (r) => quat(...r));
  for (const [j, keys] of Object.entries(moves)) {
    const i = bones.findIndex((b) => b.name === j);
    const base = nodes[i].getTranslation();
    add1(nodes[i], "translation", keys, (d) => add(base, d));
  }
}

if (what === "wolf") {
  // First turn the whole animal so its body lies along +z (Meshy poses it about 40 degrees off),
  // so every clip's pitch and roll are about the body's own axes.
  {
    const keep = Array.from({ length: NV }, (_, i) => i).filter((i) => pos[i * 3 + 1] > -0.25);
    let mx = 0,
      mz = 0;
    for (const i of keep) {
      mx += pos[i * 3] / keep.length;
      mz += pos[i * 3 + 2] / keep.length;
    }
    let sxx = 0,
      szz = 0,
      sxz = 0;
    for (const i of keep) {
      const dx = pos[i * 3] - mx,
        dz = pos[i * 3 + 2] - mz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const t0 = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    let ax = Math.sin(t0),
      az = Math.cos(t0);
    if (az < 0) {
      ax = -ax;
      az = -az;
    }
    const phi = -Math.atan2(ax, az);
    const cp = Math.cos(phi),
      sp = Math.sin(phi);
    const rot = (arr) => {
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i],
          z = arr[i + 2];
        arr[i] = x * cp + z * sp;
        arr[i + 2] = -x * sp + z * cp;
      }
    };
    rot(pos);
    const nrm = prim.getAttribute("NORMAL");
    if (nrm) rot(nrm.getArray());
    console.log("turned the body by", phi.toFixed(3), "rad");
  }
  const ys = Array.from({ length: NV }, (_, i) => pos[i * 3 + 1]);
  const ymin = Math.min(...ys);
  // The body's axis: the long direction of the vertices above the paws, head toward +z.
  const body = Array.from({ length: NV }, (_, i) => i).filter((i) => ys[i] > ymin + 0.25);
  const c = body.reduce((a, i) => [a[0] + pos[i * 3] / body.length, a[1], a[2] + pos[i * 3 + 2] / body.length], [0, 0, 0]);
  // The body now lies along +z (see above), the head forward.
  const a = [0, 0, 1];
  const lat = [1, 0, 0];
  const along = Array.from({ length: NV }, (_, i) => dot(sub(P(i), c), a));
  const tmin = Math.min(...along),
    tmax = Math.max(...along);
  const U = (i) => (along[i] - tmin) / (tmax - tmin);
  const slab = (u, w = 0.04) => Array.from({ length: NV }, (_, i) => i).filter((i) => Math.abs(U(i) - u) < w);
  const onAxis = (u) => {
    const s = slab(u);
    const m = s.reduce((acc, i) => add(acc, mul(P(i), 1 / s.length)), [0, 0, 0]);
    return [
      m[0],
      quantile(
        s.map((i) => pos[i * 3 + 1]),
        0.6,
      ),
      m[2],
    ];
  };
  const hips = onAxis(0.3),
    s1 = onAxis(0.45),
    s2 = onAxis(0.6),
    neck = onAxis(0.74),
    head = onAxis(0.86);
  const nose = P(Array.from({ length: NV }, (_, i) => i).reduce((b, i) => (along[i] > along[b] ? i : b)));
  // The tail: the far end, behind the hips.
  const tail = Array.from({ length: NV }, (_, i) => i).filter((i) => U(i) < 0.16 && pos[i * 3 + 1] > ymin + 0.2);
  const tailTip = P(tail.reduce((b, i) => (along[i] < along[b] ? i : b), tail[0]));
  const t1 = lerp(hips, tailTip, 0.35),
    t2 = lerp(hips, tailTip, 0.7);
  // Paws: four clusters of the lowest vertices, by (front/back, left/right).
  const low = Array.from({ length: NV }, (_, i) => i).filter((i) => ys[i] < ymin + 0.14);
  const side = (i) => dot(sub(P(i), c), lat);
  const clusters = { FL: [], FR: [], BL: [], BR: [] };
  const uMid = quantile(low.map(U), 0.5);
  for (const i of low) clusters[(U(i) > uMid ? "F" : "B") + (side(i) > 0 ? "L" : "R")].push(i);
  const legs = {};
  for (const [k, ids] of Object.entries(clusters)) {
    const m = ids.reduce((acc, i) => add(acc, mul(P(i), 1 / ids.length)), [0, 0, 0]);
    const top = k[0] === "F" ? s2 : hips;
    const hip = [top[0] + (m[0] - top[0]) * 0.35, top[1], top[2] + (m[2] - top[2]) * 0.35];
    const paw = [m[0], ymin + 0.04, m[2]];
    legs[k] = { hip, knee: lerp(hip, paw, 0.55), paw };
  }
  console.log("axis", a, "hips", hips, "head", head, "nose", nose, "tailTip", tailTip, "legs", JSON.stringify(legs));
  const B = [];
  const bone = (name, at, parent, end, sigma) => (B.push({ name, at, parent, end, sigma }), B.length - 1);
  const bHips = bone("hips", hips, -1, s1, 0.16);
  const bS1 = bone("spine1", s1, bHips, s2, 0.14);
  const bS2 = bone("spine2", s2, bS1, neck, 0.15);
  const bNeck = bone("neck", neck, bS2, head, 0.11);
  bone("head", head, bNeck, nose, 0.14);
  const bT1 = bone("tail1", t1, bHips, t2, 0.08);
  const bT2 = bone("tail2", t2, bT1, tailTip, 0.07);
  bone("tail3", tailTip, bT2, add(tailTip, mul(sub(tailTip, t2), 0.5)), 0.06);
  for (const [k, l] of Object.entries(legs)) {
    const h = bone(k + "hip", l.hip, k[0] === "F" ? bS2 : bHips, l.knee, 0.1);
    const kn = bone(k + "knee", l.knee, h, l.paw, 0.09);
    bone(k + "paw", l.paw, kn, add(l.paw, [0, -0.04, 0.08]), 0.08);
  }
  const nodes = skinWith(B);
  const R = (k) => ({ hips: 0 })[k];
  void R;
  // Clips. Positive x rotation pitches the nose down; on a leg it swings the foot backward.
  const T = (n, keys) => Object.fromEntries(keys);
  void T;
  const loopT = (d) => [0, d / 4, d / 2, (3 * d) / 4, d];
  const sway = (amp, d, ph = 0, axis = 0) => loopT(d).map((t, i) => [t, [0, 0, 0].map((_, k) => (k === axis ? amp * Math.sin(((i + ph) / 4) * Math.PI * 2) : 0))]);
  clip(nodes, B, "Idle", {
    spine1: sway(0.025, 3, 0, 0),
    spine2: sway(0.03, 3, 0.5, 0),
    head: sway(0.06, 3, 1, 1),
    neck: sway(0.04, 3, 1.2, 0),
    tail1: sway(0.3, 3, 0, 1),
    tail2: sway(0.4, 3, 0.6, 1),
    tail3: sway(0.5, 3, 1.2, 1),
  });
  // A gallop: front legs reach and pull together, back legs the opposite, spine flexing.
  const gal = (amp, ph) => [0, 0.15, 0.3, 0.45, 0.6].map((t, i) => [t, [amp * Math.sin(((i + ph) / 4) * Math.PI * 2), 0, 0]]);
  clip(nodes, B, "Run", {
    FLhip: gal(0.9, 0),
    FRhip: gal(0.9, 0.3),
    BLhip: gal(-0.9, 2),
    BRhip: gal(-0.9, 2.3),
    FLknee: gal(0.5, 1),
    FRknee: gal(0.5, 1.3),
    BLknee: gal(-0.5, 3),
    BRknee: gal(-0.5, 3.3),
    spine1: gal(0.12, 2),
    spine2: gal(0.12, 0),
    head: gal(0.1, 1),
    tail1: sway(0.15, 0.6, 0, 0),
    tail2: sway(0.2, 0.6, 0.5, 0),
  });
  // Crouch to spring: haunches down, chest low, head up, legs folded under.
  const hold = (d, pose) =>
    Object.fromEntries(
      Object.entries(pose).map(([j, r]) => [
        j,
        [
          [0, [0, 0, 0]],
          [d, r],
        ],
      ]),
    );
  clip(
    nodes,
    B,
    "Crouch",
    hold(0.4, {
      hips: [-0.15, 0, 0],
      spine1: [0.12, 0, 0],
      spine2: [0.18, 0, 0],
      neck: [-0.15, 0, 0],
      head: [-0.12, 0, 0],
      tail1: [-0.3, 0, 0],
      tail2: [-0.2, 0, 0],
      FLhip: [-0.5, 0, 0],
      FRhip: [-0.5, 0, 0],
      FLknee: [0.8, 0, 0],
      FRknee: [0.8, 0, 0],
      BLhip: [0.6, 0, 0],
      BRhip: [0.6, 0, 0],
      BLknee: [-0.9, 0, 0],
      BRknee: [-0.9, 0, 0],
    }),
  );
  // The leap: stretched out, front legs reaching, back legs trailing, spine arched.
  clip(
    nodes,
    B,
    "Leap",
    hold(0.35, {
      hips: [0.1, 0, 0],
      spine1: [-0.1, 0, 0],
      spine2: [-0.14, 0, 0],
      neck: [-0.2, 0, 0],
      head: [-0.15, 0, 0],
      tail1: [0.3, 0, 0],
      tail2: [0.3, 0, 0],
      FLhip: [-1.1, 0, 0.1],
      FRhip: [-1.1, 0, -0.1],
      FLknee: [0.2, 0, 0],
      FRknee: [0.2, 0, 0],
      BLhip: [1.0, 0, 0.1],
      BRhip: [1.0, 0, -0.1],
      BLknee: [-0.2, 0, 0],
      BRknee: [-0.2, 0, 0],
    }),
  );
  // The landing: front legs take the weight, the body drops and recovers.
  const keyed = (pose0, pose1, d) => {
    const out = {};
    for (const j of new Set([...Object.keys(pose0), ...Object.keys(pose1)]))
      out[j] = [
        [0, pose0[j] ?? [0, 0, 0]],
        [d * 0.4, pose1[j] ?? [0, 0, 0]],
        [d, [0, 0, 0]],
      ];
    return out;
  };
  clip(
    nodes,
    B,
    "Land",
    keyed(
      { FLhip: [-1.1, 0, 0], FRhip: [-1.1, 0, 0], BLhip: [1, 0, 0], BRhip: [1, 0, 0] },
      {
        FLhip: [-0.3, 0, 0],
        FRhip: [-0.3, 0, 0],
        FLknee: [0.9, 0, 0],
        FRknee: [0.9, 0, 0],
        BLknee: [-0.7, 0, 0],
        BRknee: [-0.7, 0, 0],
        spine1: [0.2, 0, 0],
        spine2: [0.22, 0, 0],
        head: [0.15, 0, 0],
        tail1: [-0.3, 0, 0],
      },
      0.5,
    ),
  );
  // A bite: head and neck snap down and back up, the head shaking.
  clip(nodes, B, "Bite", {
    spine2: [
      [0, [0, 0, 0]],
      [0.12, [0.25, 0, 0]],
      [0.35, [0.1, 0, 0]],
      [0.5, [0, 0, 0]],
    ],
    neck: [
      [0, [0, 0, 0]],
      [0.12, [0.5, 0, 0]],
      [0.35, [0.2, 0.1, 0]],
      [0.5, [0, 0, 0]],
    ],
    head: [
      [0, [0, 0, 0]],
      [0.12, [0.55, 0, 0]],
      [0.2, [0.3, 0.35, 0]],
      [0.28, [0.5, -0.35, 0]],
      [0.38, [0.3, 0.25, 0]],
      [0.5, [0, 0, 0]],
    ],
    FLhip: [
      [0, [0, 0, 0]],
      [0.12, [-0.3, 0, 0]],
      [0.5, [0, 0, 0]],
    ],
    FRhip: [
      [0, [0, 0, 0]],
      [0.12, [-0.3, 0, 0]],
      [0.5, [0, 0, 0]],
    ],
    tail1: [
      [0, [0, 0, 0]],
      [0.25, [0.2, 0.3, 0]],
      [0.5, [0, 0, 0]],
    ],
  });
} else if (what === "hand") {
  // Cut the soil mound the hand grows from (everything low and wide).
  const idx = prim.getIndices().getArray();
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const lowY = [0, 1, 2].every((k) => pos[idx[t + k] * 3 + 1] < -0.5);
    if (!lowY) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  prim.getIndices().setArray(new idx.constructor(keep));
  // Fingers: the five clusters of the vertices above the palm, by x.
  const top = Array.from({ length: NV }, (_, i) => i).filter((i) => pos[i * 3 + 1] > 0.38);
  const xs = top.map((i) => pos[i * 3]).sort((a, b) => a - b);
  let centers = [0, 1, 2, 3, 4].map((k) => xs[Math.floor(((k + 0.5) / 5) * xs.length)]);
  for (let it = 0; it < 12; it++) {
    const sums = centers.map(() => [0, 0]);
    for (const i of top) {
      const x = pos[i * 3];
      let b = 0;
      for (let k = 1; k < 5; k++) if (Math.abs(x - centers[k]) < Math.abs(x - centers[b])) b = k;
      sums[b][0] += x;
      sums[b][1]++;
    }
    centers = sums.map((s, k) => (s[1] ? s[0] / s[1] : centers[k]));
  }
  const fingers = centers.map((cx, k) => {
    const mine = top.filter((i) => {
      let b = 0;
      for (let j = 1; j < 5; j++) if (Math.abs(pos[i * 3] - centers[j]) < Math.abs(pos[i * 3] - centers[b])) b = j;
      return b === k;
    });
    const tip = P(mine.reduce((b, i) => (pos[i * 3 + 1] > pos[b * 3 + 1] ? i : b), mine[0]));
    const mz = mine.reduce((s, i) => s + pos[i * 3 + 2], 0) / mine.length;
    return { base: [cx * 0.8, 0.4, mz], tip };
  });
  console.log("fingers", JSON.stringify(fingers));
  const B = [];
  const bone = (name, at, parent, end, sigma) => (B.push({ name, at, parent, end, sigma }), B.length - 1);
  const wrist = bone("wrist", [0, -0.3, 0], -1, [0, 0.1, 0], 0.22);
  const palm = bone("palm", [0, 0.1, 0], wrist, [0, 0.4, 0], 0.2);
  fingers.forEach((f, k) => {
    const names = ["index", "middle", "ring", "pinky", "thumb"];
    // Fingers: the leftmost cluster is the thumb in this model's view (palm toward +z).
    const nm = ["thumb", "index", "middle", "ring", "pinky"][k];
    const p1 = lerp(f.base, f.tip, 0.4),
      p2 = lerp(f.base, f.tip, 0.72);
    const a = bone(nm + "1", f.base, palm, p1, 0.06);
    const b = bone(nm + "2", p1, a, p2, 0.05);
    bone(nm + "3", p2, b, f.tip, 0.05);
    void names;
  });
  skinWith(B);
} else throw new Error("wolf or hand");
await doc.transform(prune());
await io.write(outFile, doc);
console.log(
  "wrote",
  outFile,
  root
    .listAnimations()
    .map((x) => x.getName())
    .join(","),
);
