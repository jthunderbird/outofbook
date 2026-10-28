// Looks lab: the game's own board with any tribe on each side, to try the
// Collection's finishes, colors and skins (modes) before
// they are sold. Everything here is the real code the game uses; pick from the
// panel, drag to turn the board, pinch or scroll to zoom.
import { LegionsScene } from "@outofbook/legions/scene";
import { TRIBES, tribe } from "@outofbook/legions/tribes";
import { COURTS } from "@outofbook/legions/courts";
import { COLORS, FINISHES, type Look } from "@outofbook/legions/looks";
import { MODES, type Mode } from "@outofbook/legions/modes";
import type { Side } from "@outofbook/legions/figures";

const s = new LegionsScene(document.getElementById("stage")!);
const state = {
  light: "stormcourt",
  dark: "thornwood",
  side: "light",
  finish: "",
  color: "",
  skin: "",
  court: "staunton",
  glow: "on",
};

const panel = document.getElementById("panel")!;
const title = document.createElement("h1");
title.textContent = "Looks lab";
panel.appendChild(title);
const pick = (key: keyof typeof state, label: string, options: [string, string][]) => {
  const l = document.createElement("label");
  l.textContent = label;
  const sel = document.createElement("select");
  for (const [v, t] of options) sel.add(new Option(t, v, false, v === state[key]));
  sel.onchange = () => {
    state[key] = sel.value;
    apply();
  };
  panel.append(l, sel);
};
const tribes = Object.values(TRIBES).map((t): [string, string] => [t.id, t.name]);
pick("light", "Light side", tribes);
pick("dark", "Dark side", tribes);
pick("side", "Look on", [
  ["light", "Light side"],
  ["dark", "Dark side"],
  ["both", "Both sides"],
]);
pick("finish", "Finish", [["", "Original"], ...FINISHES.map((f): [string, string] => [f.id, f.name])]);
pick("color", "Color", [["", "Original"], ...COLORS.map((c): [string, string] => [c.id, c.name])]);
pick("skin", "Skin", [["", "None"], ["retro", "Retro"], ...MODES.map((m): [string, string] => [m, m[0].toUpperCase() + m.slice(1)])]);
pick(
  "court",
  "Court",
  COURTS.map((c): [string, string] => [c.id, c.name]),
);
pick("glow", "Glow", [
  ["on", "On"],
  ["off", "Off"],
]);
const hide = document.createElement("button");
hide.className = "hide";
hide.textContent = "Hide panel";
hide.onclick = () => {
  panel.classList.toggle("closed");
  hide.textContent = panel.classList.contains("closed") ? "Show panel" : "Hide panel";
};
panel.appendChild(hide);

function apply() {
  const look: Look = { finish: state.finish || undefined, color: state.color || undefined };
  const looks: Partial<Record<Side, Look>> = {};
  if (state.side !== "dark") looks.w = look;
  if (state.side !== "light") looks.b = look;
  s.setTribes({ w: tribe(state.light), b: tribe(state.dark) });
  s.setLooks(looks);
  s.setCourt(state.court);
  s.setGlow(state.glow === "on");
  s.setPixel(state.skin === "retro");
  s.setMode(state.skin && state.skin !== "retro" ? (state.skin as Mode) : null);
}
apply();
s.setPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
(window as unknown as { lab: { s: LegionsScene; state: typeof state; apply: () => void } }).lab = { s, state, apply };
