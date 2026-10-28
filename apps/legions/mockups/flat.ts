// The flat pixel map from the first mockup, exactly (backdrop, island, 32 x 24
// tiles, 512 x 288), with the pieces standing on it drawn by the real engine:
// the Epoch Drifters' sprite cards or any 3D tribe, in a transparent scene laid
// over the map with its camera fixed so a square covers its tile. You play
// white by tapping; the other side plays random moves. "Pixel look" draws the
// 3D tribes at the map's resolution and palette.
import { Chess } from "chess.js";
import { LegionsScene } from "@outofbook/legions/scene";
import { tribe, TRIBES } from "@outofbook/legions/tribes";
import logo from "../src/assets/logos/epoch-drifters.webp";
import { Backdrop, cliff, tile } from "@outofbook/legions/pixel/world";

const TW = 32;
const TH = 24;
const X0 = 128;
const Y0 = 52;

const map = document.getElementById("map") as HTMLCanvasElement;
const g = map.getContext("2d")!;
g.imageSmoothingEnabled = false;
const back = new Backdrop();
const rock = cliff(TW * 8 + 16, 40);
const grass = [tile("grass", TW, TH), tile("grass2", TW, TH)];
const water = [0, 1, 2, 3].map((i) => tile("water", TW, TH, i));

function drawMap(t: number) {
  back.draw(t);
  g.drawImage(back.cv, 0, 0);
  // The island: rock tapering below the board.
  const cw = TW * 8 + 16;
  for (let i = 0; i < 40; i++) {
    const inset = Math.floor(i * i * 0.07 + i * 0.5);
    g.drawImage(rock, 0, i, cw, 1, X0 - 8 + inset, Y0 + TH * 8 + i - 4, cw - inset * 2, 1);
  }
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const dark = (r + c) % 2 === 1;
      g.drawImage(dark ? water[Math.floor(t * 4) % 4] : grass[(r * 3 + c) % 3 === 0 ? 1 : 0], X0 + c * TW, Y0 + r * TH);
    }
  g.strokeStyle = "rgba(20,10,40,.55)";
  g.strokeRect(X0 - 0.5, Y0 - 0.5, TW * 8 + 1, TH * 8 + 1);
}

const host = document.getElementById("gl")!;
const scene = new LegionsScene(host, () => {});
scene.setCourt("epoch-overlay");
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
  add("Pixel look", pixel, () => {
    pixel = !pixel;
    apply();
  });
  add("Reset", false, reset);
}

apply();
reset();
const loop = (now: number) => {
  drawMap(now / 1000);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
