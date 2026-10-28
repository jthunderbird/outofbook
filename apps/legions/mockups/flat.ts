// The 2D board (court Epoch Plains (2D)): the flat pixel map from the first
// mockup with the pieces of any tribe standing on it, drawn by the real engine.
// You play white by tapping; the other side plays random moves. "Retro mode"
// draws everything at 16-bit resolution and palette.
import { Chess } from "chess.js";
import { LegionsScene } from "@outofbook/legions/scene";
import { tribe, TRIBES } from "@outofbook/legions/tribes";
import logo from "../src/assets/logos/epoch-drifters.webp";

const host = document.getElementById("gl")!;
const scene = new LegionsScene(host, () => {});
scene.setCourt("epoch-flat");
(window as unknown as { legions: LegionsScene }).legions = scene;
scene.setGlow(false);
const say = (s: string) => (document.getElementById("say")!.textContent = s);
(document.getElementById("logo") as HTMLImageElement).src = logo;

const NAMES: Record<string, string> = { "epoch-drifters": "Epoch Drifters", stormcourt: "Stormcourt", thornwood: "Thornwood", staunton: "Staunton" };
let game = new Chess();
let mine = "epoch-drifters";
let theirs = "stormcourt";
let pixel = false;

const reply = () => {
  if (game.isGameOver()) return say(game.isCheckmate() ? "Checkmate" : "Game over");
  const moves = game.moves({ verbose: true });
  const m = moves[Math.floor(Math.random() * moves.length)];
  game.move(m);
  scene.setPosition(game.fen(), m.from + m.to);
  setTimeout(() => say("Your move"), 0);
};
const play = (uci: string) => {
  game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: "q" });
  scene.setPosition(game.fen(), uci);
  say("…");
  // The reply waits for the move to be acted out.
  const wait = () => (scene.idle ? setTimeout(reply, 350) : setTimeout(wait, 150));
  setTimeout(wait, 300);
};
scene.setInput({ movable: "w", onMove: play });

function apply() {
  scene.setTribes({ w: tribe(mine), b: tribe(theirs) });
  scene.setPixel(pixel);
  buttons();
}
function reset() {
  game = new Chess();
  scene.setPosition(game.fen());
  say("You play the light side: tap a piece, then a square.");
}

function buttons() {
  const bar = document.getElementById("bar")!;
  bar.innerHTML = "";
  const add = (label: string, on: boolean, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (on) b.className = "on";
    b.onclick = fn;
    bar.appendChild(b);
  };
  for (const id of Object.keys(TRIBES))
    add(`You: ${NAMES[id] ?? id}`, mine === id, () => {
      mine = id;
      apply();
    });
  for (const id of Object.keys(TRIBES))
    add(`Foe: ${NAMES[id] ?? id}`, theirs === id, () => {
      theirs = id;
      apply();
    });
  add("Retro mode", pixel, () => {
    pixel = !pixel;
    apply();
  });
  add("Reset", false, reset);
}

apply();
reset();
