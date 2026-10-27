// The scene behind the board: a vertical gradient, unlockable in Chess Legions.
import { CanvasTexture, SRGBColorSpace, type Texture } from "three";

export interface Background {
  id: string;
  name: string;
  /** Top and bottom colors (CSS), also used by the app's menus to preview it. */
  top: string;
  bottom: string;
}

export const BACKGROUNDS: Background[] = [
  { id: "night", name: "Night", top: "#1a2440", bottom: "#0d111a" },
  { id: "dusk", name: "Dusk", top: "#5b2a4a", bottom: "#140c1c" },
  { id: "storm", name: "Squall", top: "#33475b", bottom: "#06080d" },
  { id: "ember", name: "Ember", top: "#5a2410", bottom: "#100604" },
  { id: "forest", name: "Forest", top: "#1f4630", bottom: "#07110b" },
];

const made = new Map<string, Texture>();
export function backgroundTexture(id: string): Texture {
  const bg = BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
  let t = made.get(bg.id);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, bg.top);
    grad.addColorStop(1, bg.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    made.set(bg.id, t);
  }
  return t;
}
