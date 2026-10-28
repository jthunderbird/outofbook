// Pixel tokens for the game's modes (Retro mode's gamepad, ...): drawn in code
// at a few pixels and shown large without smoothing. Used by the Collection,
// where modes float by the window, and by the puzzle trek, whose prize waits at
// the end of the track.
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

/** Pixels from rows of characters: each character a color from the key ("." clear). */
function sprite(rows: string[], key: Record<string, string>) {
  const c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d")!;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (!key[ch]) return;
      g.fillStyle = key[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}

/** Noir's token: a detective's fedora, black and white. */
function fedoraCanvas() {
  return sprite(
    [
      "..........................",
      "..........................",
      "..........kkkkkk..........",
      "........kkwwkkwwkk........",
      ".......kwwwwkkwwwwk.......",
      ".......kwwwwwwwwwwk.......",
      ".......kwwwwwwwwwwk.......",
      ".......kggggggggggk.......",
      ".......kggggggggggk.......",
      "...kkkkkwwwwwwwwwwkkkkk...",
      "..kwwwwwwwwwwwwwwwwwwwwk..",
      "..kwwwwwwwwwwwwwwwwwwwwk..",
      "...kkwwwwwwwwwwwwwwwwkk...",
      ".....kkkkkkkkkkkkkkkk.....",
      "..........................",
      "..........................",
    ],
    { k: "#0a0a0c", w: "#d8d6d0", g: "#4a4a50" },
  );
}

/** Sketch's token: a pencil drawing a line. */
function pencilCanvas() {
  return sprite(
    [
      "..........................",
      "...................kk.....",
      "..................kppk....",
      ".................kyyypk...",
      "................kyyyyk....",
      "...............kyyyyk.....",
      "..............kyyyyk......",
      ".............kyyyyk.......",
      "............kyyyyk........",
      "...........kyyyyk.........",
      "..........ksssyk..........",
      "..........kssk............",
      "..........kgk.............",
      ".........kk...............",
      "..lllllll.................",
      "..........................",
    ],
    { k: "#1b1530", y: "#ffd23a", p: "#ff7aa8", s: "#f2d6a2", g: "#3a3a44", l: "#6a6a7a" },
  );
}

/** A mode's token by its item id ("mode:retro"). */
export function tokenCanvas(id: string) {
  switch (id) {
    case "mode:noir":
      return fedoraCanvas();
    case "mode:sketch":
      return pencilCanvas();
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
