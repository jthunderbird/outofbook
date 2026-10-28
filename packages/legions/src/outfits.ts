// Outfits worn over any tribe's figures: a trial of what code alone can do.
// Props built from simple shapes ride the rigged models' bones (a head, the
// hands): the 80s' teased hair, headband, shutter shades and wristbands; a
// baseball cap and a bat. Clothes on the body (a jersey, a jacket) are out of
// reach this way: they would need the models' own surfaces redone. Figures with
// no bones (the Staunton set, some rooks) wear the head props on their tops;
// pixel sprites wear nothing yet (their props would be drawn into their frames).
import { Box3, BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Object3D } from "three";
import type { Fig } from "./figures";

export const OUTFITS = [
  { id: "80s", name: "80s" },
  { id: "baseball", name: "Baseball" },
] as const;

const mat = (color: number, o: Partial<{ roughness: number; metalness: number; emissive: number }> = {}) =>
  new MeshStandardMaterial({ color, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, emissive: o.emissive ?? 0, emissiveIntensity: o.emissive ? 0.6 : 0 });

/**
 * Hangs a prop on a bone (or any part), placed as if in the figure's own frame
 * (y up, facing +z) at its rest pose; from then on it moves with the bone.
 */
function attach(f: Fig, to: Object3D, prop: Object3D, at: Vector3) {
  f.root.updateMatrixWorld(true);
  const want = f.root.matrixWorld.clone().multiply(new Matrix4().makeTranslation(at.x, at.y, at.z));
  const local = new Matrix4().copy(to.matrixWorld).invert().multiply(want);
  local.decompose(prop.position, prop.quaternion, prop.scale);
  to.add(prop);
}

/** Where a part is in the figure's own frame. */
function inFig(f: Fig, o: Object3D) {
  f.root.updateMatrixWorld(true);
  return f.root.worldToLocal(o.getWorldPosition(new Vector3()));
}

function eightiesHead(s: number) {
  const g = new Group();
  // Teased hair: a cloud of curls, fullest at the back and sides.
  const hair = mat(0xffcf3a, { roughness: 0.9 });
  for (const [x, y, z, r] of [
    [0, 0.25, -0.1, 0.5],
    [-0.35, 0.1, -0.15, 0.4],
    [0.35, 0.1, -0.15, 0.4],
    [-0.4, -0.25, -0.2, 0.35],
    [0.4, -0.25, -0.2, 0.35],
    [0, 0.05, -0.4, 0.45],
    [-0.2, 0.4, 0.1, 0.32],
    [0.2, 0.4, 0.1, 0.32],
    [0, -0.3, -0.45, 0.4],
  ]) {
    const m = new Mesh(new SphereGeometry(r * s, 10, 8), hair);
    m.position.set(x * s, y * s, z * s);
    g.add(m);
  }
  const band = new Mesh(new TorusGeometry(0.5 * s, 0.08 * s, 6, 24), mat(0xff2fa8, { emissive: 0xff2fa8 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = -0.05 * s;
  g.add(band);
  // Shutter shades.
  const shades = new Mesh(new BoxGeometry(0.95 * s, 0.22 * s, 0.05 * s), mat(0x4ff0ff, { emissive: 0x4ff0ff }));
  shades.position.set(0, -0.38 * s, 0.5 * s);
  g.add(shades);
  for (let i = 0; i < 4; i++) {
    const slat = new Mesh(new BoxGeometry(0.95 * s, 0.025 * s, 0.06 * s), mat(0x101018));
    slat.position.set(0, (-0.3 - i * 0.055) * s, 0.51 * s);
    g.add(slat);
  }
  return g;
}

function capHead(s: number) {
  const g = new Group();
  const navy = mat(0x1a2a6a, { roughness: 0.8 });
  const crown = new Mesh(new SphereGeometry(0.55 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), navy);
  g.add(crown);
  const brim = new Mesh(new CylinderGeometry(0.42 * s, 0.42 * s, 0.04 * s, 20, 1, false, -Math.PI / 2, Math.PI), navy);
  brim.position.set(0, 0, 0.42 * s);
  g.add(brim);
  const button = new Mesh(new SphereGeometry(0.07 * s, 8, 6), mat(0xd02030));
  button.position.y = 0.55 * s;
  g.add(button);
  return g;
}

function bat(len: number) {
  const g = new Group();
  const b = new Mesh(new CylinderGeometry(0.035 * len * 1.6, 0.012 * len * 1.6, len, 10), mat(0xc89058, { roughness: 0.5 }));
  b.position.y = len * 0.4;
  g.add(b);
  // Held up over the shoulder, leaning back.
  g.rotation.x = -0.5;
  return g;
}

/** Puts an outfit on a figure (no-op for an unknown one or a pixel sprite). */
export function wearOutfit(f: Fig, id: string) {
  if (f.root.userData.pixels || !OUTFITS.some((o) => o.id === id)) return;
  f.root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(f.body);
  const H = box.max.y - box.min.y;
  const head = f.body.getObjectByName("Head");
  // A head about an eighth of the figure; its top a little above the head bone. No bones: the top of the piece.
  const s = head ? H * 0.12 : Math.min(H * 0.16, (box.max.x - box.min.x) * 0.45);
  const top = head ? inFig(f, head).add(new Vector3(0, s * 0.55, 0)) : new Vector3(0, box.max.y - f.root.position.y - s * 0.3, 0);
  attach(f, head ?? f.body, id === "80s" ? eightiesHead(s) : capHead(s), top);
  const hands = ["LeftHand", "RightHand"].map((n) => f.body.getObjectByName(n)).filter((o): o is Object3D => !!o);
  if (id === "80s")
    for (const h of hands) {
      const w = new Mesh(new TorusGeometry(0.28 * s, 0.1 * s, 6, 16), mat(0x4ff0ff, { emissive: 0x4ff0ff }));
      attach(f, h, w, inFig(f, h));
    }
  if (id === "baseball" && hands[1]) attach(f, hands[1], bat(H * 0.45), inFig(f, hands[1]));
}
