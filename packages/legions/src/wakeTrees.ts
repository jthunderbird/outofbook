// The Wake's dead trees, grown in code: a trunk, a root flare, limbs and twigs that bend
// and snap at sharp angles, broken stubs and splintered tips. Each variety also wears a
// different bark (set in the shader from the bark's own coordinates): fissured, charred,
// papery, rotten or bleached, with moss, lichen, grime and exposed wood, so the same
// kind of tree can be shown in very different light and age.
import { BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fbm, stream } from "./wakeKit";
import { smoothSeams, type StoneKind } from "./wakeStones";
import { geometryOrMake, groupOrMake } from "./wakeBake";

// ----- Bark shader -----

export interface Look {
  c1: [number, number, number];
  c2: [number, number, number];
  wood: [number, number, number];
  /** Depth and width of the fissures, 0..1.5. */
  crack: number;
  /** Charred (1) to plain bark (0). */
  char: number;
  /** Papery, dark-flecked bark (1). */
  pale: number;
  moss: number;
  lichen: number;
  /** Streaks of grime down the bark. */
  wash: number;
  /** How much bark has been stripped to bare wood, in patches. */
  stripped: number;
  /** Wet sheen: 0 dry to 1 slick. */
  wet: number;
  /** A lightning scar running down the trunk: where around it (0..1) and how far up. */
  scar?: [number, number];
}

const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
`;

const BARK = /* glsl */ `
{
  float ang = vBark.x * 6.2831853;
  float rr = max(vBark.z, 0.025);
  float R = clamp(rr * 4.5, 0.4, 3.2);
  vec3 pc = vec3(cos(ang) * R, sin(ang) * R, vBark.y * 1.1);
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNor);
  // Fissures, long up the trunk.
  float v1 = fbm3(pc * vec3(1.0, 1.0, 0.28) * 2.2);
  float fissW = 0.03 + 0.06 * uCrack;
  float fiss = (1.0 - smoothstep(0.0, fissW, abs(v1 - 0.5))) * clamp(uCrack, 0.0, 1.0);
  float v2 = fbm3(pc * vec3(1.0, 1.0, 0.5) * 7.0);
  vec3 bark = mix(uC1, uC2, clamp(v2 * 0.9, 0.0, 1.0)) * (0.55 + 0.45 * v2);
  bark = mix(bark, bark * 0.12, fiss);
  // Dark papery flecks across pale bark.
  float lens = smoothstep(0.66, 0.72, fbm3(vec3(cos(ang) * R * 0.7, sin(ang) * R * 0.7, vBark.y * 9.0)));
  bark = mix(bark, uC2 * 0.2, lens * uPale);
  // Charring: blocks split like alligator hide.
  float blocks = fbm3(pc * 4.0);
  float ch = 1.0 - smoothstep(0.0, 0.035, abs(blocks - 0.5));
  vec3 charC = mix(vec3(0.015, 0.014, 0.013), uC2, v2 * v2);
  charC = mix(charC, vec3(0.0), ch);
  bark = mix(bark, charC, uChar);
  // Bare wood: weathered grain, in broken ends, scars and stripped patches.
  float grain = fbm3(vec3(cos(ang) * R * 3.0, sin(ang) * R * 3.0, vBark.y * 0.8));
  vec3 wood = uWood * (0.65 + 0.5 * grain);
  wood = mix(wood, wood * 0.25, smoothstep(0.55, 0.78, fbm3(vec3(cos(ang) * R * 6.0, sin(ang) * R * 6.0, vBark.y * 0.35))) * 0.8);
  float wmask = clamp(vMask.y + uStripped * smoothstep(0.45, 0.58, fbm3(wp * 0.65 + 4.0)), 0.0, 1.0);
  float scarN = (fbm3(vec3(vBark.y * 2.0, 1.0, 3.0)) - 0.5) * 0.07;
  float scar = (1.0 - smoothstep(0.012, 0.035, abs(vBark.x - uScar.x + scarN))) * (1.0 - smoothstep(uScar.y - 1.2, uScar.y, vBark.y)) * step(0.001, uScar.y);
  wmask = max(wmask, scar);
  bark = mix(bark, wood, wmask);
  // Lichen coins.
  float sp = smoothstep(0.7, 0.76, fbm3(pc * 6.0 + 9.0)) * uLichen;
  bark = mix(bark, vec3(0.2, 0.23, 0.15), sp * 0.8);
  // Moss: low on the trunk, on up-facing and north-facing bark, in patches; dark rot at the fringe.
  float low = 1.0 - smoothstep(0.0, 2.6, wp.y - uBase);
  float mm = uMoss * (0.4 * low + 0.35 * wn.y + 0.22 * (0.5 - 0.5 * wn.z) + (fbm3(wp * 1.7) - 0.5) * 1.1 + (fbm3(wp * 7.0) - 0.5) * 0.3) * (1.0 - wmask * 0.7);
  float moss = smoothstep(0.34, 0.5, mm);
  float rot = smoothstep(0.2, 0.34, mm) * (1.0 - moss);
  bark = mix(bark, bark * 0.3 + vec3(0.02, 0.016, 0.008), rot * 0.8);
  bark = mix(bark, mix(vec3(0.03, 0.06, 0.02), vec3(0.09, 0.15, 0.04), fbm3(wp * 11.0)), moss);
  // Grime streaking down, and the ambient occlusion where limbs meet.
  bark *= 1.0 - 0.5 * smoothstep(0.45, 0.8, fbm3(vec3(wp.x * 3.0, wp.y * 0.5, wp.z * 3.0))) * uWash;
  bark *= vMask.x;
  diffuseColor.rgb = bark;
  roughnessFactor = mix(0.95, 0.42, clamp(uWet * (1.0 - moss) + uChar * 0.5, 0.0, 1.0));
  // Pitted, ridged bump.
  float h = (1.0 - fiss * 1.3) * 0.8 + v2 * 0.3 + fbm3(pc * 30.0) * 0.12 + moss * fbm3(wp * 80.0) * 0.5 - wmask * 0.3;
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * 0.55);
}
`;

export function barkMaterial(look: Look) {
  const mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    const u = sh.uniforms;
    u.uC1 = { value: look.c1 };
    u.uC2 = { value: look.c2 };
    u.uWood = { value: look.wood };
    u.uCrack = { value: look.crack };
    u.uChar = { value: look.char };
    u.uPale = { value: look.pale };
    u.uMoss = { value: look.moss };
    u.uLichen = { value: look.lichen };
    u.uWash = { value: look.wash };
    u.uStripped = { value: look.stripped };
    u.uWet = { value: look.wet };
    u.uScar = { value: look.scar ?? [0, 0] };
    u.uBase = { value: -0.05 };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aBark;\nattribute vec3 aMask;\nvarying vec3 vBark;\nvarying vec3 vMask;\nvarying vec3 vWPos;\nvarying vec3 vWNor;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBark = aBark;\nvMask = aMask;\nvec4 wq = vec4(transformed, 1.0);\nvec3 wnq = objectNormal;\n#ifdef USE_INSTANCING\nwq = instanceMatrix * wq;\nwnq = mat3(instanceMatrix) * wnq;\n#endif\nvWPos = (modelMatrix * wq).xyz;\nvWNor = normalize(mat3(modelMatrix) * wnq);",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vBark;\nvarying vec3 vMask;\nvarying vec3 vWPos;\nvarying vec3 vWNor;\nuniform vec3 uC1;\nuniform vec3 uC2;\nuniform vec3 uWood;\nuniform float uCrack;\nuniform float uChar;\nuniform float uPale;\nuniform float uMoss;\nuniform float uLichen;\nuniform float uWash;\nuniform float uStripped;\nuniform float uWet;\nuniform vec2 uScar;\nuniform float uBase;\n${NOISE}`,
      )
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${BARK}`);
  };
  mat.customProgramCacheKey = () => "wake-bark";
  mat.userData.bark = look;
  return mat;
}

// ----- Growing -----

interface Level {
  /** Limbs that grow from each limb of the level above, and from how far along it (0..1). */
  count: number;
  start: number;
  angle: [number, number];
  len: [number, number];
  rad: [number, number];
  jag: number;
  kink: number;
  /** Upward pull (negative droops). */
  up: number;
  seg: number;
  /** Chance a limb ends snapped off rather than tapering. */
  broken: number;
  /** Short broken stubs along it. */
  stubs: number;
}

interface Spec {
  seed: number;
  height: number;
  r0: number;
  lean: number;
  relief: number;
  flare: number;
  roots: number;
  levels: Level[];
  /** The trunk is cut off (splintered) at this fraction of its height. */
  topBroken?: boolean;
  /** A cavity in the trunk: angle, width, from and to (length along trunk), depth. */
  hollow?: { a: number; w: number; s0: number; s1: number; depth: number };
  /** The trunk splits in two at this fraction of its height, splinters standing between. */
  split?: number;
  brackets?: number;
  /** 1 for a full tree; less for a cheaper one for the far forest (coarser rings, fewer sides). */
  detail?: number;
}

const up = new Vector3(0, 1, 0);

class Grower {
  geos: BufferGeometry[] = [];
  rnd: () => number;
  trunk: { c: Vector3; n: Vector3; b: Vector3; r: number }[] = [];
  constructor(private spec: Spec) {
    this.rnd = stream(spec.seed);
  }

  private perp(d: Vector3) {
    const a = Math.abs(d.y) < 0.9 ? up : new Vector3(1, 0, 0);
    return new Vector3()
      .crossVectors(d, a)
      .normalize()
      .applyAxisAngle(d, this.rnd() * 6.283);
  }

  limb(start: Vector3, dir: Vector3, len: number, r0: number, depth: number, opts: { trunk?: boolean; topBroken?: boolean } = {}) {
    const r = this.rnd;
    const lv = this.spec.levels[Math.min(depth, this.spec.levels.length - 1)];
    const n = Math.max(3, Math.round(len / lv.seg));
    const step = len / n;
    const pts = [start.clone()];
    const rad = [r0];
    const cur = dir.clone().normalize();
    const p = start.clone();
    for (let i = 1; i <= n; i++) {
      let ang = (r() - 0.5) * 2 * lv.jag;
      if (r() < lv.kink) ang += (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.8);
      cur.applyAxisAngle(this.perp(cur), ang);
      cur.y += lv.up * 0.1;
      cur.normalize();
      p.addScaledVector(cur, step);
      pts.push(p.clone());
      rad.push(r0 * (1 - (i / n) * (opts.trunk ? 0.72 : 0.85)) * (1 + (r() - 0.5) * 0.06));
    }
    const broken = opts.topBroken ?? (!opts.trunk && r() < lv.broken);
    this.tube(pts, rad, depth, !!opts.trunk, broken);
    // Children.
    const next = this.spec.levels[depth + 1];
    if (next) {
      const count = Math.max(1, Math.round(next.count * (0.6 + 0.4 * Math.min(1, len / 4))));
      for (let c = 0; c < count; c++) {
        const t = next.start + (1 - next.start) * Math.pow(r(), 0.8) * (count > 1 ? 1 : 0.6);
        const i = Math.min(n - 1, Math.max(1, Math.round(t * n)));
        const tan = pts[i + 1]
          .clone()
          .sub(pts[i - 1])
          .normalize();
        const k = new Vector3().copy(tan).applyAxisAngle(this.perp(tan), next.angle[0] + r() * (next.angle[1] - next.angle[0]));
        const kl = len * (next.len[0] + r() * (next.len[1] - next.len[0])) * (1 - t * 0.35);
        this.limb(pts[i], k, kl, rad[i] * (next.rad[0] + r() * (next.rad[1] - next.rad[0])), depth + 1);
      }
    }
    // Broken stubs.
    for (let s = 0; s < lv.stubs; s++) {
      const i = 1 + Math.floor(r() * (n - 2));
      const tan = pts[i + 1]
        .clone()
        .sub(pts[i - 1])
        .normalize();
      const k = tan.clone().applyAxisAngle(this.perp(tan), 0.9 + r() * 0.7);
      const sl = 0.15 + r() * 0.5;
      const sr = rad[i] * (0.3 + r() * 0.25);
      this.tube([pts[i].clone(), pts[i].clone().addScaledVector(k, sl * 0.5), pts[i].clone().addScaledVector(k, sl)], [sr, sr * 0.85, sr * 0.7], depth + 1, false, true);
    }
    return { pts, rad };
  }

  /** The tube mesh round a path: rings at close spacing, bark relief, a splintered end if broken. */
  private tube(pts: Vector3[], rad: number[], depth: number, isTrunk: boolean, broken: boolean) {
    const r = this.rnd;
    const spec = this.spec;
    const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.2);
    const total = curve.getLength();
    const r0 = rad[0];
    const det = spec.detail ?? 1;
    const spacing = Math.max(0.045, Math.min(0.35, r0 * 0.3)) / det;
    const M = Math.min(420, Math.max(4, Math.ceil(total / spacing)));
    const K = Math.max(det < 1 ? 5 : 7, Math.min(46, Math.round((6 + r0 * 80) * det)));
    const pos: number[] = [];
    const bark: number[] = [];
    const mask: number[] = [];
    const idx: number[] = [];
    let N = new Vector3();
    let prev: Vector3 | null = null;
    let s = 0;
    const seed = spec.seed + depth * 13 + Math.floor(r() * 1000);
    for (let j = 0; j <= M; j++) {
      const u = j / M;
      const c = curve.getPointAt(u);
      const T = curve.getTangentAt(u);
      if (prev) s += c.distanceTo(prev);
      prev = c;
      if (j === 0) N = this.perp(T);
      else N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
      const B = new Vector3().crossVectors(T, N).normalize();
      const fi = u * (rad.length - 1);
      const i0 = Math.min(rad.length - 2, Math.floor(fi));
      let rj = rad[i0] + (rad[i0 + 1] - rad[i0]) * (fi - i0);
      if (isTrunk) {
        rj *= 1 + spec.flare * Math.exp(-s * 1.1);
        this.trunk.push({ c: c.clone(), n: N.clone(), b: B.clone(), r: rj });
      }
      // A child limb is dark where it leaves its parent.
      const ao = depth > 0 ? Math.min(1, 0.45 + u * 4) : 1;
      const tipWood = broken ? Math.max(0, (u - 0.86) / 0.14) : 0;
      for (let k = 0; k <= K; k++) {
        const th = (k / K) * Math.PI * 2;
        const ct = Math.cos(th);
        const st = Math.sin(th);
        const R = Math.min(4, Math.max(1, rj * 5));
        const rel = spec.relief * (isTrunk ? 1 : 0.6);
        const d =
          (fbm(ct * R + s * 0.12, st * R + s * 0.9, seed, 1 << 16, 3) - 0.5) * rel * 2 + (1 - Math.abs(2 * fbm(ct * R * 1.7 + 4, st * R * 1.7 + s * 0.8, seed + 5, 1 << 16, 2) - 1)) * rel * 0.5;
        // Root buttresses.
        let buttress = 0;
        if (isTrunk) buttress = spec.flare * Math.exp(-s * 1.1) * 0.9 * Math.pow(Math.abs(Math.cos(2.2 * th + fbm(s, 1, seed, 1 << 16, 2) * 6)), 1.4);
        let cav = 0;
        let wood = tipWood;
        let occ = ao * (0.9 + r() * 0.1);
        const h = spec.hollow;
        if (isTrunk && h) {
          let da = Math.abs(((th - h.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          da = Math.abs(da);
          const mA = 1 - Math.min(1, da / h.w);
          const mS = Math.min(1, Math.max(0, Math.min((s - h.s0) / 0.6, (h.s1 - s) / 0.6)));
          cav = Math.pow(Math.max(0, mA), 0.6) * mS;
          if (cav > 0) {
            occ *= 1 - 0.88 * Math.min(1, cav * 1.4);
            wood = Math.max(wood, 4 * cav * (1 - Math.min(1, cav)) * 1.5);
          }
        }
        const rr = rj * (1 + d + buttress) * (1 - (h ? h.depth : 0) * cav) * (broken ? 1 - Math.pow(Math.max(0, u - 0.9) / 0.1, 3) * 0.2 : 1);
        const q = c
          .clone()
          .addScaledVector(N, ct * rr)
          .addScaledVector(B, st * rr);
        pos.push(q.x, q.y, q.z);
        bark.push(k / K, s, rj);
        mask.push(occ, Math.min(1, wood), 0);
      }
    }
    for (let j = 0; j < M; j++)
      for (let k = 0; k < K; k++) {
        const a = j * (K + 1) + k;
        const b = a + K + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    // A flat, splintered end.
    if (broken) {
      const end = pts[pts.length - 1];
      const T = curve.getTangentAt(1);
      const rEnd = rad[rad.length - 1];
      for (let i = 0; i < 5 + Math.floor(rEnd * 20); i++) {
        const d = T.clone().applyAxisAngle(this.perp(T), (r() - 0.5) * 0.5);
        const cone = new ConeGeometry(rEnd * (0.12 + r() * 0.2), rEnd * (1.5 + r() * 3.5), 4, 1);
        cone.translate(0, cone.parameters.height / 2, 0);
        cone.applyQuaternion(new Quaternion().setFromUnitVectors(up, d));
        const off = this.perp(T).multiplyScalar(rEnd * 0.7 * Math.sqrt(r()));
        cone.translate(end.x + off.x, end.y + off.y, end.z + off.z);
        this.geos.push(this.attrs(cone, rEnd, 1));
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("aBark", new Float32BufferAttribute(bark, 3));
    g.setAttribute("aMask", new Float32BufferAttribute(mask, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.geos.push(g);
  }

  /** Gives a plain shape the bark attributes (it is bare wood). */
  attrs(g: BufferGeometry, rad: number, wood: number) {
    const n = g.getAttribute("position").count;
    g.deleteAttribute("uv");
    g.setAttribute(
      "aBark",
      new Float32BufferAttribute(
        Array.from({ length: n }, (_, i) => (i % 3 === 0 ? i / 3 / n : i % 3 === 1 ? i * 0.01 : rad)),
        3,
      ),
    );
    g.setAttribute(
      "aMask",
      new Float32BufferAttribute(
        Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? 0.9 : i % 3 === 1 ? wood : 0)),
        3,
      ),
    );
    return g;
  }

  grow() {
    const s = this.spec;
    const r = this.rnd;
    const lean = new Vector3(Math.sin(s.lean * 6.2) * s.lean, 1, Math.cos(s.lean * 6.2) * s.lean).normalize();
    const start = new Vector3(0, -0.35, 0);
    if (s.split) {
      // Grow to the fork, then two halves going their own ways.
      const h1 = s.height * s.split;
      const t = this.limb(start, lean, h1, s.r0, 0, { trunk: true, topBroken: false });
      const top = t.pts[t.pts.length - 1];
      const rTop = t.rad[t.rad.length - 1];
      for (const side of [-1, 1]) {
        const d = lean.clone().applyAxisAngle(new Vector3(1, 0, 0.3).normalize(), side * (0.18 + r() * 0.15));
        this.limb(top.clone(), d, s.height * (1 - s.split) * (0.8 + r() * 0.3), rTop * 0.82, 1, { topBroken: true });
      }
      // Splinters standing in the fork.
      for (let i = 0; i < 9; i++) {
        const d = lean.clone().applyAxisAngle(this.perp(lean), (r() - 0.5) * 0.3);
        const len = 0.8 + r() * 1.8;
        const cone = new ConeGeometry(0.05 + r() * 0.05, len, 4, 1);
        cone.translate(0, len / 2, 0);
        cone.applyQuaternion(new Quaternion().setFromUnitVectors(up, d));
        const off = this.perp(lean).multiplyScalar(rTop * 0.8 * Math.sqrt(r()));
        cone.translate(top.x + off.x, top.y - 0.2 + off.y, top.z + off.z);
        this.geos.push(this.attrs(cone, 0.08, 1));
      }
    } else this.limb(start, lean, s.height, s.r0, 0, { trunk: true, topBroken: !!s.topBroken });
    // Surface roots.
    for (let i = 0; i < s.roots; i++) {
      const a = (i / s.roots) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const d = new Vector3(Math.sin(a), -0.28 - r() * 0.2, Math.cos(a)).normalize();
      this.limb(new Vector3(Math.sin(a) * s.r0 * 0.5, 0.35 + r() * 0.3, Math.cos(a) * s.r0 * 0.5), d, 2 + r() * 2.8, s.r0 * (0.28 + r() * 0.2), 2);
    }
    const merged = mergeGeometries(this.geos)!;
    this.geos.forEach((g) => g.dispose());
    smoothSeams(merged);
    return merged;
  }
}

/** Half-discs of shelf fungus stuck to the trunk. */
function brackets(g: Grower, count: number, seed: number) {
  const r = stream(seed);
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const t = g.trunk[Math.floor(8 + r() * (g.trunk.length * 0.6))];
    if (!t) continue;
    const th = r() * Math.PI * 2;
    const out = t.n.clone().multiplyScalar(Math.cos(th)).addScaledVector(t.b, Math.sin(th));
    const rad = 0.08 + r() * 0.2;
    const c = new CylinderGeometry(rad, rad * 0.8, 0.04 + rad * 0.25, 18, 1, false, 0, Math.PI);
    c.rotateY(Math.atan2(-out.z, out.x) - Math.PI / 2 + Math.PI / 2);
    c.rotateZ(0.12);
    const p = t.c.clone().addScaledVector(out, t.r * 0.96);
    c.translate(p.x, p.y, p.z);
    parts.push(c);
  }
  if (!parts.length) return null;
  const m = mergeGeometries(parts.map((p) => (p.deleteAttribute("uv"), p)))!;
  parts.forEach((p) => p.dispose());
  return new Mesh(m, new MeshStandardMaterial({ color: 0x7a6a4c, roughness: 0.9 }));
}

function build(spec: Spec, look: Look): Group {
  const g = new Grower(spec);
  const geo = g.grow();
  const mesh = new Mesh(geo, barkMaterial(look));
  mesh.castShadow = mesh.receiveShadow = true;
  const out = new Group();
  out.add(mesh);
  if (spec.brackets) {
    const b = brackets(g, spec.brackets, spec.seed + 4);
    if (b) {
      b.castShadow = b.receiveShadow = true;
      out.add(b);
    }
  }
  return out;
}

// ----- The five trees -----

const lv = (o: Partial<Level>): Level => ({ count: 4, start: 0.4, angle: [0.7, 1.2], len: [0.3, 0.6], rad: [0.4, 0.62], jag: 0.3, kink: 0.15, up: 0.2, seg: 0.5, broken: 0.3, stubs: 0, ...o });

export const TREES: StoneKind[] = [
  {
    id: "tree-oak",
    name: "Gnarled oak",
    note: "Crisp, dark and deeply fissured: thick twisting limbs, moss low and on the north side, lichen.",
    copies: 2,
    radius: 3,
    build: () =>
      build(
        {
          seed: 11,
          height: 8.5,
          r0: 0.62,
          lean: 0.05,
          relief: 0.07,
          flare: 0.9,
          roots: 7,
          brackets: 6,
          levels: [
            lv({ seg: 0.55, jag: 0.2, kink: 0.1, up: 0.35, stubs: 4 }),
            lv({ count: 7, start: 0.38, angle: [0.7, 1.3], len: [0.38, 0.62], rad: [0.42, 0.6], jag: 0.3, kink: 0.15, up: 0.12, seg: 0.45, broken: 0.25, stubs: 2 }),
            lv({ count: 4, start: 0.3, angle: [0.5, 1.2], len: [0.35, 0.6], rad: [0.4, 0.6], jag: 0.45, kink: 0.28, up: -0.05, seg: 0.3, broken: 0.35, stubs: 1 }),
            lv({ count: 3, start: 0.25, angle: [0.5, 1.3], len: [0.3, 0.55], rad: [0.4, 0.6], jag: 0.6, kink: 0.35, up: -0.12, seg: 0.2, broken: 0.5 }),
          ],
        },
        { c1: [0.11, 0.095, 0.08], c2: [0.04, 0.035, 0.03], wood: [0.22, 0.19, 0.15], crack: 1, char: 0, pale: 0, moss: 0.55, lichen: 0.6, wash: 0.8, stripped: 0, wet: 0.1 },
      ),
  },
  {
    id: "tree-struck",
    name: "Lightning-struck",
    note: "Charred black bark split like hide, a pale lightning scar, the trunk cleft in two with splinters between.",
    copies: 2,
    radius: 2.6,
    build: () =>
      build(
        {
          seed: 23,
          height: 9.5,
          r0: 0.55,
          lean: 0.03,
          relief: 0.06,
          flare: 0.6,
          roots: 5,
          split: 0.55,
          levels: [
            lv({ seg: 0.5, jag: 0.14, kink: 0.06, up: 0.4, stubs: 3 }),
            lv({ count: 4, start: 0.25, angle: [0.6, 1.1], len: [0.3, 0.5], rad: [0.35, 0.5], jag: 0.3, kink: 0.18, up: 0.2, seg: 0.4, broken: 0.6, stubs: 2 }),
            lv({ count: 2, start: 0.3, angle: [0.5, 1.0], len: [0.3, 0.5], rad: [0.4, 0.6], jag: 0.45, kink: 0.3, up: 0, seg: 0.3, broken: 0.7 }),
          ],
        },
        { c1: [0.03, 0.028, 0.026], c2: [0.11, 0.105, 0.1], wood: [0.34, 0.29, 0.21], crack: 1, char: 1, pale: 0, moss: 0, lichen: 0, wash: 0.3, stripped: 0, wet: 0.6, scar: [0.12, 6.5] },
      ),
  },
  {
    id: "tree-birch",
    name: "Skeletal birch",
    note: "Pale papery bark, dark flecks, hundreds of fine bare twigs: ghostly and clear against the dark.",
    copies: 3,
    radius: 2.2,
    build: () =>
      build(
        {
          seed: 37,
          height: 10,
          r0: 0.2,
          lean: 0.12,
          relief: 0.03,
          flare: 0.35,
          roots: 3,
          levels: [
            lv({ seg: 0.35, jag: 0.12, kink: 0.05, up: 0.2, stubs: 2 }),
            lv({ count: 9, start: 0.3, angle: [0.45, 0.9], len: [0.3, 0.5], rad: [0.35, 0.55], jag: 0.22, kink: 0.12, up: 0.25, seg: 0.28, broken: 0.2, stubs: 1 }),
            lv({ count: 5, start: 0.25, angle: [0.4, 0.9], len: [0.3, 0.55], rad: [0.45, 0.65], jag: 0.3, kink: 0.2, up: 0.15, seg: 0.22, broken: 0.3 }),
            lv({ count: 4, start: 0.2, angle: [0.4, 1.0], len: [0.3, 0.6], rad: [0.5, 0.7], jag: 0.4, kink: 0.28, up: 0.05, seg: 0.16, broken: 0.4 }),
            lv({ count: 3, start: 0.2, angle: [0.4, 1.1], len: [0.3, 0.6], rad: [0.5, 0.7], jag: 0.5, kink: 0.35, up: -0.05, seg: 0.12, broken: 0.5 }),
          ],
        },
        { c1: [0.42, 0.4, 0.36], c2: [0.15, 0.14, 0.12], wood: [0.3, 0.26, 0.2], crack: 0.25, char: 0, pale: 1, moss: 0.12, lichen: 0.7, wash: 0.5, stripped: 0.05, wet: 0.1 },
      ),
  },
  {
    id: "tree-hollow",
    name: "Hollow elder",
    note: "Huge, rotten and wet: a gaping cavity, shelf fungus, snapped top, heavy moss and lichen.",
    copies: 1,
    radius: 3.4,
    build: () =>
      build(
        {
          seed: 51,
          height: 7,
          r0: 1.05,
          lean: 0.04,
          relief: 0.1,
          flare: 1.0,
          roots: 8,
          brackets: 14,
          topBroken: true,
          hollow: { a: 0.9, w: 0.8, s0: 0.9, s1: 3.6, depth: 0.78 },
          levels: [
            lv({ seg: 0.6, jag: 0.12, kink: 0.04, up: 0.3, stubs: 6 }),
            lv({ count: 3, start: 0.55, angle: [0.8, 1.3], len: [0.3, 0.5], rad: [0.3, 0.45], jag: 0.3, kink: 0.2, up: 0.1, seg: 0.45, broken: 0.8, stubs: 2 }),
            lv({ count: 2, start: 0.4, angle: [0.5, 1.2], len: [0.3, 0.6], rad: [0.4, 0.6], jag: 0.45, kink: 0.3, up: -0.1, seg: 0.3, broken: 0.7 }),
          ],
        },
        { c1: [0.075, 0.065, 0.05], c2: [0.022, 0.02, 0.016], wood: [0.2, 0.12, 0.07], crack: 1, char: 0, pale: 0, moss: 1, lichen: 0.9, wash: 1, stripped: 0, wet: 0.85 },
      ),
  },
  {
    id: "tree-bleached",
    name: "Bleached snag",
    note: "Windswept and stripped to silver-grey wood: eroded grain, patches of bark left, long bare limbs.",
    copies: 2,
    radius: 2.8,
    build: () =>
      build(
        {
          seed: 67,
          height: 8,
          r0: 0.5,
          lean: 0.2,
          relief: 0.09,
          flare: 0.5,
          roots: 5,
          levels: [
            lv({ seg: 0.5, jag: 0.22, kink: 0.1, up: 0.25, stubs: 3 }),
            lv({ count: 6, start: 0.3, angle: [0.55, 1.1], len: [0.4, 0.7], rad: [0.38, 0.56], jag: 0.28, kink: 0.18, up: 0.1, seg: 0.4, broken: 0.4, stubs: 2 }),
            lv({ count: 4, start: 0.25, angle: [0.5, 1.1], len: [0.35, 0.6], rad: [0.4, 0.6], jag: 0.4, kink: 0.28, up: -0.05, seg: 0.28, broken: 0.5, stubs: 1 }),
            lv({ count: 3, start: 0.2, angle: [0.5, 1.2], len: [0.3, 0.6], rad: [0.4, 0.6], jag: 0.55, kink: 0.35, up: -0.1, seg: 0.18, broken: 0.6 }),
          ],
        },
        { c1: [0.33, 0.31, 0.27], c2: [0.11, 0.1, 0.09], wood: [0.42, 0.4, 0.34], crack: 1.4, char: 0, pale: 0, moss: 0.06, lichen: 0.3, wash: 1, stripped: 0.9, wet: 0 },
      ),
  },
];

// ----- Unique trees in the two styles that were liked -----

export type TreeKind = "oak" | "twisted" | "snag" | "hollow-oak" | "leaning" | "struck" | "burnt" | "tall-burnt" | "giant";

export const OAK_LOOK: Look = { c1: [0.11, 0.095, 0.08], c2: [0.04, 0.035, 0.03], wood: [0.22, 0.19, 0.15], crack: 1, char: 0, pale: 0, moss: 0.55, lichen: 0.6, wash: 0.8, stripped: 0, wet: 0.1 };
export const STRUCK_LOOK: Look = {
  c1: [0.03, 0.028, 0.026],
  c2: [0.11, 0.105, 0.1],
  wood: [0.34, 0.29, 0.21],
  crack: 1,
  char: 1,
  pale: 0,
  moss: 0,
  lichen: 0,
  wash: 0.3,
  stripped: 0,
  wet: 0.6,
  scar: [0.12, 6.5],
};

/** One tree of a kind, never the same twice: the seed moves its size, lean, limb count and every kink. */
export function makeTree(kind: TreeKind, seed: number, scale = 1, detail = 1): Group {
  const r = stream(seed * 31 + 7);
  const R = (a: number, b: number) => a + (b - a) * r();
  const I = (a: number, b: number) => Math.round(R(a, b));
  const oak = (count: number, jag: number, kink: number, droop: number, seg = 0.5): Level[] => [
    lv({ seg: seg * 1.1, jag: 0.2, kink: 0.1, up: 0.35, stubs: I(2, 5) }),
    lv({ count, start: R(0.3, 0.45), angle: [0.7, 1.3], len: [0.36, 0.62], rad: [0.42, 0.6], jag, kink, up: 0.12 - droop, seg: seg * 0.9, broken: R(0.15, 0.4), stubs: I(1, 3) }),
    lv({ count: I(3, 5), start: 0.3, angle: [0.5, 1.2], len: [0.35, 0.6], rad: [0.4, 0.6], jag: jag * 1.5, kink: kink * 1.8, up: -0.05 - droop, seg: seg * 0.6, broken: R(0.3, 0.5), stubs: 1 }),
    lv({ count: I(2, 4), start: 0.25, angle: [0.5, 1.3], len: [0.3, 0.55], rad: [0.4, 0.6], jag: jag * 2, kink: kink * 2.2, up: -0.12 - droop, seg: seg * 0.4, broken: 0.5 }),
  ];
  const struckLevels = (broken: number): Level[] => [
    lv({ seg: 0.55, jag: 0.14, kink: 0.06, up: 0.4, stubs: I(2, 4) }),
    lv({ count: I(3, 5), start: 0.25, angle: [0.6, 1.1], len: [0.3, 0.5], rad: [0.35, 0.5], jag: 0.3, kink: 0.18, up: 0.2, seg: 0.45, broken, stubs: 2 }),
    lv({ count: 2, start: 0.3, angle: [0.5, 1.0], len: [0.3, 0.5], rad: [0.4, 0.6], jag: 0.45, kink: 0.3, up: 0, seg: 0.32, broken: 0.7 }),
  ];
  let spec: Spec;
  let look = OAK_LOOK;
  switch (kind) {
    case "oak":
      spec = { seed, height: R(7, 10.5), r0: R(0.5, 0.75), lean: R(0, 0.1), relief: 0.07, flare: R(0.6, 1), roots: I(5, 8), brackets: I(0, 6), levels: oak(I(5, 8), 0.3, 0.15, 0) };
      break;
    case "twisted":
      spec = { seed, height: R(6, 8.5), r0: R(0.55, 0.8), lean: R(0.1, 0.22), relief: 0.09, flare: R(0.8, 1.1), roots: I(6, 8), brackets: I(2, 6), levels: oak(I(4, 6), 0.45, 0.28, 0.08, 0.4) };
      break;
    case "snag":
      spec = {
        seed,
        height: R(8, 12),
        r0: R(0.4, 0.6),
        lean: R(0, 0.08),
        relief: 0.07,
        flare: 0.6,
        roots: I(3, 6),
        topBroken: true,
        levels: [
          lv({ seg: 0.55, jag: 0.12, kink: 0.05, up: 0.4, stubs: I(5, 9) }),
          lv({ count: I(2, 3), start: 0.5, angle: [0.8, 1.3], len: [0.2, 0.4], rad: [0.3, 0.45], jag: 0.3, kink: 0.2, up: 0.1, seg: 0.4, broken: 0.8, stubs: 2 }),
        ],
      };
      break;
    case "hollow-oak":
      spec = {
        seed,
        height: R(5.5, 7.5),
        r0: R(0.9, 1.15),
        lean: R(0, 0.06),
        relief: 0.1,
        flare: 1,
        roots: 8,
        brackets: I(6, 12),
        topBroken: true,
        hollow: { a: R(0, 6), w: R(0.6, 0.9), s0: 0.9, s1: R(3, 3.8), depth: 0.78 },
        levels: [
          lv({ seg: 0.6, jag: 0.12, kink: 0.04, up: 0.3, stubs: I(4, 7) }),
          lv({ count: 3, start: 0.55, angle: [0.8, 1.3], len: [0.3, 0.5], rad: [0.3, 0.45], jag: 0.3, kink: 0.2, up: 0.1, seg: 0.45, broken: 0.8, stubs: 2 }),
          lv({ count: 2, start: 0.4, angle: [0.5, 1.2], len: [0.3, 0.6], rad: [0.4, 0.6], jag: 0.45, kink: 0.3, up: -0.1, seg: 0.3, broken: 0.7 }),
        ],
      };
      break;
    case "leaning":
      spec = { seed, height: R(7, 9.5), r0: R(0.45, 0.65), lean: R(0.22, 0.34), relief: 0.08, flare: 0.7, roots: I(5, 7), brackets: I(0, 4), levels: oak(I(5, 7), 0.35, 0.2, 0.05) };
      break;
    case "struck":
      spec = { seed, height: R(8, 11), r0: R(0.45, 0.65), lean: R(0, 0.06), relief: 0.06, flare: 0.6, roots: 5, split: R(0.45, 0.62), levels: struckLevels(0.6) };
      look = { ...STRUCK_LOOK, scar: [R(0, 1), R(4.5, 7)] };
      break;
    case "burnt":
      spec = { seed, height: R(6, 9), r0: R(0.5, 0.75), lean: R(0, 0.1), relief: 0.07, flare: 0.7, roots: 5, topBroken: true, levels: struckLevels(0.8) };
      look = { ...STRUCK_LOOK, scar: [R(0, 1), R(3, 6)] };
      break;
    case "tall-burnt":
      spec = {
        seed,
        height: R(11, 15),
        r0: R(0.32, 0.45),
        lean: R(0.02, 0.12),
        relief: 0.05,
        flare: 0.5,
        roots: 4,
        levels: struckLevels(0.5).map((l) => ({ ...l, len: [l.len[0] * 0.8, l.len[1] * 0.8] as [number, number] })),
      };
      look = { ...STRUCK_LOOK, scar: [R(0, 1), R(5, 9)] };
      break;
    case "giant":
      spec = {
        seed,
        height: 22,
        r0: 1.9,
        lean: 0.05,
        relief: 0.08,
        flare: 1.1,
        roots: 9,
        brackets: 10,
        levels: [
          lv({ seg: 1.0, jag: 0.14, kink: 0.06, up: 0.35, stubs: 9 }),
          lv({ count: 11, start: 0.4, angle: [0.7, 1.3], len: [0.36, 0.6], rad: [0.4, 0.58], jag: 0.28, kink: 0.14, up: 0.1, seg: 0.8, broken: 0.25, stubs: 3 }),
          lv({ count: 5, start: 0.3, angle: [0.5, 1.2], len: [0.35, 0.6], rad: [0.4, 0.6], jag: 0.4, kink: 0.25, up: -0.05, seg: 0.55, broken: 0.35, stubs: 2 }),
          lv({ count: 4, start: 0.25, angle: [0.5, 1.3], len: [0.3, 0.55], rad: [0.4, 0.6], jag: 0.55, kink: 0.35, up: -0.12, seg: 0.35, broken: 0.5 }),
        ],
      };
      break;
  }
  spec.detail = detail;
  // Below half detail the finest twigs, the extra roots and the fungus go too.
  if (detail < 0.5) {
    spec.levels = spec.levels.slice(0, detail < 0.3 ? 2 : 3);
    spec.roots = detail < 0.3 ? 0 : Math.min(spec.roots, 3);
    spec.brackets = 0;
  }
  const g = groupOrMake(`tree:${kind}:${seed}:${detail}`, () => build(spec, look));
  g.scale.setScalar(scale);
  return g;
}

/** The far forest's trees: coarse versions of the two styles, drawn many times over (see the court). */
export function forestGeometry(kind: TreeKind, seed: number, detail: number): BufferGeometry {
  return geometryOrMake(`forest:${kind}:${seed}:${detail}`, () => (makeTree(kind, seed, 1, detail).children[0] as Mesh).geometry);
}
