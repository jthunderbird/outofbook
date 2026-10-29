// The Wake's moves and kills, tried on the real board with the Thornwood's models
// standing in (Thornling: zombie or skeleton, Thornpriest: witch, the stag: werewolf,
// Dryad Queen: vampire bride, Elder Oak: vampire lord). Each button sets a position
// up and then plays one move. ?scene=<id> plays it once on load (for stills and checks).
import { LegionsScene } from "@outofbook/legions/scene";
import { wake, animalKinds, hex, type AnimalKind } from "@outofbook/legions/wake";

interface Demo {
  name: string;
  from: string;
  to: string;
  move: string;
}

const DEMOS: Record<string, Demo> = {
  "rook-move": { name: "Gravestone moves", from: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", to: "4k3/8/8/R7/8/8/8/4K3 b - - 0 1", move: "a1a5" },
  "rook-kill": { name: "Gravestone takes", from: "4k3/8/8/p7/8/8/8/R3K3 w - - 0 1", to: "4k3/8/8/R7/8/8/8/4K3 b - - 0 1", move: "a1a5" },
  "zombie-kill": { name: "Zombies take", from: "4k3/6p1/1ppp1p2/3p4/4N3/8/8/4K3 b - - 0 1", to: "4k3/6p1/1ppp1p2/8/4p3/8/8/4K3 w - - 0 2", move: "d5e4" },
  "witch-kill": { name: "Witch hexes", from: "4k3/8/8/6n1/8/8/8/2B1K3 w - - 0 1", to: "4k3/8/8/6B1/8/8/8/4K3 b - - 0 1", move: "c1g5" },
  "witch-move": { name: "Witch flies", from: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", to: "4k3/8/8/6B1/8/8/8/4K3 b - - 0 1", move: "c1g5" },
  "wolf-kill": { name: "Werewolf bounds", from: "4k3/8/8/8/8/2p5/8/1N2K3 w - - 0 1", to: "4k3/8/8/8/8/2N5/8/4K3 b - - 0 1", move: "b1c3" },
  "king-kill": { name: "Lord drains", from: "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1", to: "4k3/8/8/8/8/8/4K3/8 b - - 0 1", move: "e1e2" },
  "queen-kill": { name: "Bride's bats", from: "4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1", to: "4k3/8/8/3Q4/8/8/8/4K3 b - - 0 1", move: "d1d5" },
};

const s = new LegionsScene(document.getElementById("stage")!);
s.setGlow(true);
s.setCourt("night");
s.setTribes({ w: wake, b: wake });
await wake.ready?.();
const log = document.createElement("div");
log.id = "log";
const panel = document.getElementById("panel")!;
panel.innerHTML = "<h1>The Wake: moves and kills (placeholders)</h1>";
const sel = document.createElement("select");
sel.add(new Option("Witch's animal: random", ""));
for (const a of animalKinds) sel.add(new Option(a, a));
sel.onchange = () => (hex.animal = (sel.value || undefined) as AnimalKind | undefined);
panel.append(sel);

let busy = false;
const run = async (id: string) => {
  const d = DEMOS[id];
  if (busy || !d) return;
  busy = true;
  log.textContent = `${d.name}...`;
  s.setPosition(d.from);
  await new Promise((r) => setTimeout(r, 900));
  const t0 = performance.now();
  s.setPosition(d.to, d.move);
  // The scene is busy while the move is acted out.
  await new Promise<void>((resolve) => {
    const check = () => (s.idle ? resolve() : setTimeout(check, 50));
    setTimeout(check, 80);
  });
  log.textContent = `${d.name}: ${Math.round(performance.now() - t0)} ms`;
  busy = false;
};
for (const [id, d] of Object.entries(DEMOS)) {
  const b = document.createElement("button");
  b.textContent = d.name;
  b.onclick = () => void run(id);
  panel.append(b);
}
panel.append(log);
const first = new URLSearchParams(location.search).get("scene");
if (first) void run(first);
else s.setPosition(DEMOS["rook-kill"].from);
(window as unknown as { run: typeof run }).run = run;
