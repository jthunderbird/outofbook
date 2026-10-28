// Tokens for the game's modes (skins), each drawn in code in its own style:
// Retro mode's pixel gamepad (shown large without smoothing), Noir's dragon in
// a hard spotlight, Sketch's dragon half drawn in pencil. Used by the
// Collection, where the skins float before their poster, and by the puzzle
// trek, whose prize waits at the end of the track.
import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";

/** Retro mode's token: a pixel gamepad, 26 by 16. */
export function gamepadCanvas() {
  const c = document.createElement("canvas");
  c.width = 26;
  c.height = 16;
  const g = c.getContext("2d")!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  px(3, 2, 20, 12, "#1b1530");
  px(2, 3, 22, 10, "#1b1530");
  px(4, 3, 18, 10, "#7a5cff");
  px(3, 4, 20, 8, "#7a5cff");
  px(4, 3, 18, 2, "#a891ff");
  px(6, 6, 2, 6, "#1b1530");
  px(4, 8, 6, 2, "#1b1530");
  px(17, 6, 2, 2, "#ff4f7a");
  px(20, 8, 2, 2, "#ffd84a");
  px(17, 10, 2, 2, "#4fe3ff");
  px(14, 8, 2, 2, "#5cff8a");
  px(11, 9, 2, 1, "#3b2d72");
  return c;
}

/** A dragon in profile, facing right, on a 256 by 160 card: its body (with neck and head), wing, tail and legs. */
const DRAGON = {
  body: "M70 112 C80 92 120 88 150 94 C162 80 168 60 182 46 C188 38 198 34 206 36 L212 26 L214 37 C224 40 234 44 240 50 C233 56 221 57 210 57 C200 63 191 78 185 96 C182 110 170 122 150 124 C120 128 90 126 70 112 Z",
  wing: "M116 94 C110 62 98 36 82 16 C100 26 120 24 136 16 C132 32 144 42 162 38 C154 56 150 72 148 92 Z",
  ribs: "M82 16 L124 92 M136 16 L134 90 M162 38 L144 90",
  tail: "M76 110 C56 118 40 128 24 122 C16 118 14 110 20 104 L8 98 L22 94 L24 104 C32 110 46 110 72 102 Z",
  legs: "M158 120 L164 146 L178 148 L170 142 L168 120 Z M98 122 L92 146 L106 148 L100 142 L106 124 Z",
};

/** Noir's token: the dragon as a black silhouette in a hard spotlight, blinds' shadows across, film grain, a black frame. */
function noirCanvas() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#050505";
  g.fillRect(0, 0, 256, 160);
  const spot = g.createRadialGradient(150, 80, 6, 150, 80, 120);
  spot.addColorStop(0, "#f2f0ea");
  spot.addColorStop(0.55, "#8a8884");
  spot.addColorStop(1, "#0a0a0a");
  g.fillStyle = spot;
  g.fillRect(6, 6, 244, 148);
  // The blinds' shadows, slanting.
  g.save();
  g.beginPath();
  g.rect(6, 6, 244, 148);
  g.clip();
  g.fillStyle = "rgba(0,0,0,0.45)";
  for (let y = -60; y < 200; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y - 50);
    g.lineTo(256, y - 43);
    g.lineTo(0, y + 7);
    g.fill();
  }
  g.fillStyle = "#060606";
  for (const k of ["body", "wing", "tail", "legs"] as const) g.fill(new Path2D(DRAGON[k]));
  // A thin rim of light along its back.
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 0.8;
  g.stroke(new Path2D(DRAGON.wing));
  g.restore();
  // Grain.
  const d = g.getImageData(0, 0, 512, 320);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Sketch's token: the dragon half drawn in pencil on a page: body and head done and hatched, the wing roughed in, the tail a faint guide, the pencil still at work. */
function sketchCanvas() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#f4efe2";
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = "rgba(120,150,200,0.25)";
  g.lineWidth = 0.5;
  for (let y = 14; y < 160; y += 12) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.lineCap = "round";
  g.lineJoin = "round";
  const pencil = (path: string, alpha: number, width: number, passes = 2) => {
    for (let i = 0; i < passes; i++) {
      g.save();
      g.translate((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4);
      g.strokeStyle = `rgba(40,40,48,${alpha})`;
      g.lineWidth = width;
      g.stroke(new Path2D(path));
      g.restore();
    }
  };
  pencil(DRAGON.body, 0.8, 1.2);
  pencil(DRAGON.legs, 0.75, 1.1);
  // Hatching over the body's underside.
  g.save();
  g.clip(new Path2D(DRAGON.body));
  g.strokeStyle = "rgba(40,40,48,0.45)";
  g.lineWidth = 0.6;
  for (let x = 60; x < 240; x += 4) {
    g.beginPath();
    g.moveTo(x, 130);
    g.lineTo(x + 18, 104);
    g.stroke();
  }
  g.restore();
  g.fillStyle = "#28282e";
  g.beginPath();
  g.arc(216, 43, 1.6, 0, Math.PI * 2);
  g.fill();
  // The wing roughed in, its ribs only begun.
  g.setLineDash([5, 3]);
  pencil(DRAGON.wing, 0.5, 0.9, 1);
  g.setLineDash([]);
  pencil("M82 16 L104 56 M136 16 L135 50", 0.5, 0.8, 1);
  // The tail a light guide line.
  pencil("M76 110 C56 118 40 128 24 122", 0.25, 0.7, 1);
  // The pencil, drawing the tail.
  g.save();
  g.translate(24, 122);
  g.rotate(-0.9);
  g.fillStyle = "#f2d6a2";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(6, -16);
  g.lineTo(-6, -16);
  g.closePath();
  g.fill();
  g.fillStyle = "#28282e";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(2.2, -6);
  g.lineTo(-2.2, -6);
  g.fill();
  g.fillStyle = "#ffd23a";
  g.fillRect(-6, -76, 12, 60);
  g.fillStyle = "#e0b020";
  g.fillRect(-2, -76, 4, 60);
  g.fillStyle = "#b8b8c0";
  g.fillRect(-6, -84, 12, 8);
  g.fillStyle = "#ff7aa8";
  g.fillRect(-6, -94, 12, 10);
  g.restore();
  return c;
}

/** A mode's token by its item id ("mode:retro"). */
export function tokenCanvas(id: string) {
  switch (id) {
    case "mode:noir":
      return noirCanvas();
    case "mode:sketch":
      return sketchCanvas();
    default:
      return gamepadCanvas();
  }
}

/** A pixel canvas as a texture, its pixels kept sharp. */
export function pixelTexture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = t.minFilter = NearestFilter;
  return t;
}
