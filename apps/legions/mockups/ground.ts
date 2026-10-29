// The Wake: a normal game of chess between The Restless's white and black, both sides
// moved from the one screen. Tap a piece, tap a square; captures play their kills.
import { Chess } from "chess.js";
import { LegionsScene } from "@outofbook/legions/scene";
import { wake } from "@outofbook/legions/wake";

const s = new LegionsScene(document.getElementById("stage")!);
s.setGlow(true);
s.setCourt("wake");
s.setTribes({ w: wake, b: wake });
await wake.ready?.();

let game = new Chess();
const panel = document.getElementById("panel")!;
// ?clean hides the buttons (for a still).
if (new URLSearchParams(location.search).has("clean")) panel.style.display = "none";
const status = document.createElement("div");
status.id = "log";
const button = (label: string, click: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = click;
  panel.append(b);
};

function show() {
  const side = game.turn() === "w" ? "White (skeletons)" : "Black (zombies)";
  status.textContent = game.isCheckmate() ? `Checkmate: ${game.turn() === "w" ? "Black" : "White"} wins` : game.isDraw() ? "Draw" : `${side} to move${game.inCheck() ? " (check)" : ""}`;
}

const play = (uci: string) => {
  const m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
  if (!m) return;
  s.setPosition(game.fen(), uci);
  show();
};
s.setInput({ movable: "both", onMove: play });
button("New game", () => {
  game = new Chess();
  s.setPosition(game.fen());
  show();
});
button("Take back", () => {
  if (!game.undo()) return;
  s.setPosition(game.fen());
  show();
});
panel.append(status);
s.setPosition(game.fen());
show();
(window as unknown as { ready: boolean; play: typeof play; scene: LegionsScene }).play = play;
(window as unknown as { scene: LegionsScene }).scene = s;
(window as unknown as { ready: boolean }).ready = true;
