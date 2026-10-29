// The home screen's key art: each scene is a fight between two tribes, painted
// as four layers (background, the left tribe's fighters, the right's, and
// foreground sparks on black), so the screen can move them at different depths.
// The home screen shows one of these at random each time it loads; more are
// added here as tribes arrive (images in assets/home, named `<id>-bg|left|right|fg.webp`).

export interface HomeScene {
  id: string;
  /** Tribes on the left and on the right. */
  left: string;
  right: string;
  /** Lightning's color, and the side it flashes on. */
  flash: string;
  flashSide: "left" | "right";
  /** The embers' color (r, g, b). */
  ember: [number, number, number];
}

export const HOME_SCENES: HomeScene[] = [{ id: "storm-thorn", left: "stormcourt", right: "thornwood", flash: "#b9a6ff", flashSide: "left", ember: [255, 170, 70] }];

const IMAGES = import.meta.glob<string>("./assets/home/*.webp", { eager: true, query: "?url", import: "default" });

export type Layer = "bg" | "left" | "right" | "fg";

export const layerUrl = (scene: HomeScene, layer: Layer) => IMAGES[`./assets/home/${scene.id}-${layer}.webp`];

/** A scene at random. */
export const randomScene = () => HOME_SCENES[Math.floor(Math.random() * HOME_SCENES.length)];
