// A player's look for their tribe: a finish (gold, crystal, stone, neon,
// chocolate) and a color, collected and equipped in the Collection. Both are
// drawn by the figures' own materials, changed in their shaders: the picture's
// light and shade (its luminance) is kept and recolored, so the same look works
// on every tribe, modelled or pixel, and on tribes still to come. No new
// models, no new textures.
import { Color, Material, Mesh, MeshStandardMaterial } from "three";
import type { Fig, Side } from "./figures";

export interface Finish {
  id: string;
  name: string;
  /** The color it gives when no color is equipped (light side, dark side). */
  tint: [number, number];
  /** How the picture is redrawn: 0 colored, 1 metal, 2 crystal, 3 stone, 4 neon. */
  kind: number;
  /** For lit materials. */
  metalness?: number;
  roughness?: number;
}

export interface PieceColor {
  id: string;
  name: string;
  /** The light side's shade and the dark side's. */
  tint: [number, number];
}

export const FINISHES: Finish[] = [
  { id: "gold", name: "Gold", tint: [0xffd36a, 0xb07a2a], kind: 1, metalness: 1, roughness: 0.28 },
  { id: "crystal", name: "Crystal", tint: [0xd8f4ff, 0x6a8cff], kind: 2, metalness: 0, roughness: 0.05 },
  { id: "stone", name: "Stone statue", tint: [0xd8d2c6, 0x6e6a64], kind: 3, metalness: 0, roughness: 0.95 },
  { id: "neon", name: "Neon", tint: [0x4ff0ff, 0xff4fd8], kind: 4, metalness: 0, roughness: 0.6 },
  { id: "chocolate", name: "Chocolate", tint: [0x9a5a34, 0x3a1a0c], kind: 0, metalness: 0, roughness: 0.32 },
];

export const COLORS: PieceColor[] = [
  { id: "ruby", name: "Ruby", tint: [0xff6a7a, 0x8a0a1e] },
  { id: "sapphire", name: "Sapphire", tint: [0x7aa8ff, 0x0e2a8a] },
  { id: "jade", name: "Jade", tint: [0x8affb8, 0x0a6a3a] },
  { id: "amethyst", name: "Amethyst", tint: [0xd2a0ff, 0x4a1478] },
  { id: "amber", name: "Amber", tint: [0xffc070, 0x8a4a08] },
  { id: "onyx", name: "Onyx", tint: [0x9a9aa8, 0x101016] },
];

export interface Look {
  finish?: string;
  color?: string;
}

/** The look's shader: recolors the picture after its texture is read (and, for neon, lights its rim). */
function lookMaterial(m: Material, look: Look, side: Side, unlit: boolean): Material {
  const finish = FINISHES.find((f) => f.id === look.finish);
  const color = COLORS.find((c) => c.id === look.color);
  const i = side === "w" ? 0 : 1;
  const tint = new Color(color ? color.tint[i] : finish ? finish.tint[i] : 0xffffff);
  // Neon's rim needs light: unlit pictures (pixel sprites) take its color only.
  const kind = finish && !(unlit && finish.kind === 4) ? finish.kind : 0;
  const out = m.clone();
  const lit = out as MeshStandardMaterial;
  if (finish && lit.isMeshStandardMaterial) {
    if (finish.metalness !== undefined) lit.metalness = finish.metalness;
    if (finish.roughness !== undefined) lit.roughness = finish.roughness;
    // Neon's body stays dark: little of the room reflected in it.
    if (kind === 4) lit.envMapIntensity = 0.15;
    if (kind === 2) {
      lit.transparent = true;
      lit.opacity = 0.62;
      lit.envMapIntensity = 2.2;
    }
  }
  out.onBeforeCompile = (sh) => {
    sh.uniforms.lookTint = { value: tint };
    sh.fragmentShader = sh.fragmentShader.replace("void main() {", "uniform vec3 lookTint;\nvoid main() {").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          ${
            [
              // Colored: the tint through the picture's light and shade, a little of its own color kept.
              "diffuseColor.rgb = mix(diffuseColor.rgb, lookTint * (0.35 + 1.1 * l), 0.82);",
              // Metal: one bright color, shaded by the picture.
              "diffuseColor.rgb = lookTint * (0.55 + 0.7 * l);",
              // Crystal: pale and clear, the picture's shading kept faint.
              "diffuseColor.rgb = mix(lookTint, vec3(1.0), 0.25) * (0.75 + 0.4 * l);",
              // Stone: gray (or tinted) with the shading strong, like carving.
              "diffuseColor.rgb = lookTint * (0.3 + 0.95 * l);",
              // Neon: a dark body; the rim glows (below).
              "diffuseColor.rgb = lookTint * 0.06 + vec3(0.02) * l;",
            ][kind]
          }
        }`,
    );
    if (kind === 4)
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float rim = 1.0 - abs(dot(normalize(vViewPosition), normal));
          totalEmissiveRadiance += lookTint * pow(rim, 4.0) * 1.6;
        }`,
      );
  };
  out.customProgramCacheKey = () => `look${kind}`;
  return out;
}

/**
 * Dresses a figure in a look (none: as it was made). Called once, when the figure is made. The figure owns its
 * materials (kills fade and cut them), so each gets its own dressed copy.
 */
export function dressFigure(f: Fig, look: Look | undefined, side: Side) {
  if (!look || (!look.finish && !look.color)) return;
  const swap = new Map<Material, Material>();
  // Soft see-through extras (a shadow blob, a glow) keep their own colors.
  const one = (m: Material) => {
    if (!("map" in m) || (m.transparent && !m.depthWrite)) return m;
    let d = swap.get(m);
    if (!d) swap.set(m, (d = lookMaterial(m, look, side, !(m as MeshStandardMaterial).isMeshStandardMaterial)));
    return d;
  };
  f.root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || o.userData.noLook) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(one) : one(mesh.material);
  });
  f.mats = f.mats.map((m) => swap.get(m) ?? m);
}
