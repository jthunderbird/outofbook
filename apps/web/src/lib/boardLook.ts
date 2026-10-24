// The look of every board: the piece set (a Lichess setting: imported or set
// here) and the board (OutOfBook's own setting, which wins: the board sets the
// app's atmosphere). Lichess's sets and boards load from its asset server, as
// the sounds do; cburnett pieces and the OutOfBook blue board are bundled.
const ASSETS = "https://lichess1.org/assets";

/** Lichess's piece sets that its asset server serves (checked 2026-10-22). */
export const PIECE_SETS = [
  "cburnett",
  "merida",
  "alpha",
  "pirouetti",
  "chessnut",
  "chess7",
  "reillycraig",
  "companion",
  "riohacha",
  "kosal",
  "leipzig",
  "fantasy",
  "spatial",
  "celtic",
  "california",
  "caliente",
  "pixel",
  "maestro",
  "fresca",
  "cardinal",
  "gioco",
  "tatiana",
  "staunty",
  "cooke",
  "governor",
  "dubrovny",
  "icpieces",
  "mpchess",
  "kiwen-suwi",
  "horsey",
  "anarcandy",
  "xkcd",
  "shapes",
  "letter",
  "disguised",
  "firi",
  "rhosgfx",
];

/**
 * Lichess's 2D boards: the image file on its asset server, and a light and a
 * dark color close to its squares (for the coordinates, which take the other
 * square's color).
 */
export const BOARDS: Record<string, { file: string; light: string; dark: string }> = {
  brown: { file: "brown.png", light: "#f0d9b5", dark: "#b58863" },
  blue: { file: "blue.png", light: "#dee3e6", dark: "#8ca2ad" },
  blue2: { file: "blue2.jpg", light: "#97b2c7", dark: "#546f82" },
  blue3: { file: "blue3.jpg", light: "#d9e0e6", dark: "#315991" },
  "blue-marble": { file: "blue-marble.jpg", light: "#eae6dd", dark: "#7c7f87" },
  green: { file: "green.png", light: "#ffffdd", dark: "#86a666" },
  "green-plastic": { file: "green-plastic.png", light: "#f2f9bb", dark: "#59935d" },
  purple: { file: "purple.png", light: "#9f90b0", dark: "#7d4a8d" },
  "purple-diag": { file: "purple-diag.png", light: "#e5daf0", dark: "#957ab0" },
  ic: { file: "ic.png", light: "#ececec", dark: "#c1c18e" },
  wood: { file: "wood.jpg", light: "#d8a45b", dark: "#9b4d0f" },
  wood2: { file: "wood2.jpg", light: "#a38b5d", dark: "#6c5017" },
  wood3: { file: "wood3.jpg", light: "#d0ceca", dark: "#755839" },
  wood4: { file: "wood4.jpg", light: "#caaf7d", dark: "#7b5330" },
  maple: { file: "maple.jpg", light: "#e8ceab", dark: "#bc7944" },
  maple2: { file: "maple2.jpg", light: "#e2c89f", dark: "#996633" },
  leather: { file: "leather.jpg", light: "#d1d1c1", dark: "#c28e16" },
  marble: { file: "marble.jpg", light: "#93ab91", dark: "#4f644e" },
  grey: { file: "grey.jpg", light: "#b8b8b8", dark: "#7d7d7d" },
  metal: { file: "metal.jpg", light: "#c9c9c9", dark: "#727272" },
  olive: { file: "olive.jpg", light: "#b8b19f", dark: "#6d6655" },
  horsey: { file: "horsey.jpg", light: "#f0d9b5", dark: "#946f51" },
};

/** "lichess": the user's Lichess board; "outofbook": our own blue one; "arena": 3D game boards (other boards ours); else a Lichess board by name. */
export type BoardChoice = "lichess" | "outofbook" | string;

/** The board to draw: Lichess's default (brown) counts as "not chosen" and gets ours. */
export function resolveBoard(choice: BoardChoice, lichessTheme: string | undefined): string {
  const name = choice === "lichess" ? lichessTheme : choice;
  return name && name !== "brown" && BOARDS[name] ? name : choice !== "lichess" && BOARDS[choice] ? choice : "outofbook";
}

const ROLES: Record<string, string> = { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "P" };

/** Applies the look to every board on the page (and the promotion picker). */
export function applyBoardLook(board: string, pieceSet: string) {
  const root = document.documentElement.style;
  const b = BOARDS[board];
  if (b) {
    root.setProperty("--board-image", `url("${ASSETS}/images/board/${b.file}")`);
    root.setProperty("--board-light-coord", b.light);
    root.setProperty("--board-dark-coord", b.dark);
  } else {
    root.removeProperty("--board-image");
    root.removeProperty("--board-light-coord");
    root.removeProperty("--board-dark-coord");
  }
  document.documentElement.dataset.board = b ? board : "outofbook";

  let style = document.getElementById("piece-set") as HTMLStyleElement | null;
  if (!PIECE_SETS.includes(pieceSet) || pieceSet === "cburnett") {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = "piece-set";
    document.head.appendChild(style);
  }
  style.textContent = Object.entries(ROLES)
    .flatMap(([role, r]) => (["white", "black"] as const).map((c) => `.cg-wrap piece.${role}.${c}{background-image:url("${ASSETS}/piece/${pieceSet}/${c[0]}${r}.svg")}`))
    .join("\n");
}
