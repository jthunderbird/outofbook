// Battle scenes, staged in the game's own scene and rendered to stills for the
// puzzle trek's rips in space (?scene=<name>; window.battleReady turns true when
// everything has loaded and settled). Armies charge across a court, knights
// clash, the dragon raids; heroes play their showcase (lightning, vines, fire).
import { DirectionalLight, SpotLight } from "three";
import { LegionsScene } from "@outofbook/legions/scene";
import { tribe } from "@outofbook/legions/tribes";
import type { Fig, Role } from "@outofbook/legions/figures";

interface Unit {
  tribe: string;
  role: Role;
  x: number;
  z: number;
  /** Facing: toward +x (charging right) or -x. */
  dir: 1 | -1;
  clip?: string;
  /** A sprite's motion (Epoch Drifters). */
  motion?: "walk" | "attack" | "fly";
  /** Plays its tribe's showcase (Tribe.hero). */
  hero?: boolean;
  /** Faces the camera (a hero shot) rather than the battle. */
  face?: boolean;
  y?: number;
}

const PAWN: Record<string, { clip?: string; strike?: string; motion?: Unit["motion"] }> = {
  stormcourt: { clip: "Walking", strike: "Attack" },
  thornwood: { clip: "Walking", strike: "Thrust_Slash" },
  "epoch-drifters": { motion: "walk" },
};
const CAST: Partial<Record<Role, string>> = { b: "Charged_Spell_Cast", r: "Charged_Ground_Slam", q: "Charged_Spell_Cast", k: "Charged_Ground_Slam" };
const jitter = () => (Math.random() - 0.5) * 0.35;

/**
 * An army charging from one side (dir 1 from the left, -1 from the right): a
 * front rank of pawns striking, a second rank running in, the named pieces
 * behind casting or charging, and a hero (playing its tribe's showcase).
 */
function army(tribeId: string, dir: 1 | -1, back: Role[], hero?: Role, front = 6): Unit[] {
  const p = PAWN[tribeId];
  const out: Unit[] = [];
  for (let i = 0; i < front; i++)
    out.push({ tribe: tribeId, role: "p", dir, x: -dir * (0.9 + jitter()), z: -2.3 + (4.6 * i) / (front - 1) + jitter(), clip: p.strike ?? p.clip, motion: p.motion && "attack" });
  for (let i = 0; i < front - 1; i++) out.push({ tribe: tribeId, role: "p", dir, x: -dir * (1.8 + jitter()), z: -1.9 + (3.8 * i) / (front - 2) + jitter(), clip: p.clip, motion: p.motion });
  back.forEach((role, i) =>
    out.push({ tribe: tribeId, role, dir, x: -dir * (2.8 + jitter()), z: -2 + (4 * i) / Math.max(1, back.length - 1) + jitter(), clip: CAST[role] ?? p.clip, motion: p.motion }),
  );
  if (hero) out.push({ tribe: tribeId, role: hero, dir, x: -dir * 3.7, z: 1.2, hero: true });
  return out;
}

const VIEW = (x = 0): { pos: [number, number, number]; target: [number, number, number]; fov: number } => ({ pos: [x, 1.5, 5.8], target: [x * 0.4, 0.85, 0], fov: 52 });

/** A campaign page's hero shot: the army drawn up, its hero in front facing the camera. */
const ARMY = "rnbqkbnr/pppppppp/8/8/8/8/8/8 b - - 0 1";
const HERO = { pos: [0, 0.9, 8.6] as [number, number, number], target: [0, 1.3, 2.5] as [number, number, number], fov: 40 };
const hero = (tribeId: string, role: Role): Unit[] => [{ tribe: tribeId, role, dir: 1, x: 0, z: 4.4, hero: true, face: true }];

const SCENES: Record<string, { court: string; cam: ReturnType<typeof VIEW>; units: () => Unit[]; fen?: string; tribe?: string }> = {
  "hero-storm": { court: "stormcourt", cam: HERO, fen: ARMY, tribe: "stormcourt", units: () => hero("stormcourt", "k") },
  "hero-thorn": { court: "thornwood", cam: HERO, fen: ARMY, tribe: "thornwood", units: () => hero("thornwood", "q") },
  "hero-epoch": { court: "epoch-drifters", cam: HERO, fen: ARMY, tribe: "epoch-drifters", units: () => hero("epoch-drifters", "n") },
  // The Stormcourt and the Thornwood charge at each other across Storm Keep.
  "storm-thorn": { court: "stormcourt", cam: VIEW(-0.6), units: () => [...army("stormcourt", 1, ["b", "n", "b", "n"], "k"), ...army("thornwood", -1, ["r", "n", "b", "n"], undefined)] },
  // Knights of the Stormcourt meet the Great Stags in the Heartwood, the armies behind them.
  knights: {
    court: "thornwood",
    cam: VIEW(0.5),
    units: () => [
      ...[-1.4, 0, 1.4].flatMap((z): Unit[] => [
        { tribe: "stormcourt", role: "n", dir: 1, x: -0.55, z: z + jitter() },
        { tribe: "thornwood", role: "n", dir: -1, x: 0.55, z: z + jitter() },
      ]),
      ...army("stormcourt", 1, ["b", "q", "b"], undefined, 5).map((u) => ({ ...u, x: u.x - 0.8 })),
      ...army("thornwood", -1, ["r", "k", "r"], undefined, 5).map((u) => ({ ...u, x: u.x + 0.8 })),
    ],
  },
  // The Epoch dragon raids the Stormcourt's line on the Epoch Plains.
  dragon: { court: "epoch-drifters", cam: VIEW(-0.4), units: () => [...army("epoch-drifters", 1, ["r", "b", "q"], "n"), ...army("stormcourt", -1, ["b", "n", "b"])] },
  // The Dryad Queen raises the forest against the Epoch Drifters.
  grove: { court: "thornwood", cam: VIEW(0.6), units: () => [...army("epoch-drifters", 1, ["r", "b", "q", "r"]), ...army("thornwood", -1, ["r", "b", "k"], "q")] },
  // The Storm King's lightning against the Epoch Drifters' charge in Storm Keep.
  "storm-epoch": { court: "stormcourt", cam: VIEW(-0.5), units: () => [...army("stormcourt", 1, ["b", "q", "b"], "k"), ...army("epoch-drifters", -1, ["r", "n", "b", "r"])] },
};

const name = new URLSearchParams(location.search).get("scene") ?? "storm-thorn";
const def = SCENES[name];
const s = new LegionsScene(document.getElementById("stage")!);
s.setGlow(true);
s.setCourt(def.court);
if (def.tribe) s.setTribes({ w: tribe(def.tribe), b: tribe(def.tribe) });
s.setPosition(def.fen ?? "8/8/8/8/8/8/8/8 w - - 0 1");
s.setShowcase(new URLSearchParams(location.search).has("top") ? { pos: [0, 14, 0.1], target: [0, 0, 0], fov: 50 } : def.cam);
// Hero shots get the campaign's warm key on the hero (gentler on a sprite, which it would wash out); battles only the court's light and a rim.
const key = new SpotLight(0xffe6c0, !def.fen ? 0 : def.tribe === "epoch-drifters" ? 5 : 26, 30, 0.22, 0.6, 1.2);
key.position.set(-2.5, 6, 11);
if (def.fen) key.target.position.set(0, 1.3, 4.4);
const rim = new DirectionalLight(0x9fc4ff, 1.4);
rim.position.set(2, 4, -6);
for (const o of [key, key.target, rim, rim.target]) s.addObject(o);

const units = def.units();
const tribes = [...new Set(units.map((u) => u.tribe))];
await Promise.all(tribes.map((t) => tribe(t).ready?.()));
for (const u of units) {
  const t = tribe(u.tribe);
  // Each tribe in the colors that read best in a crowd: the Stormcourt dark (its white glows), the others light.
  const f: Fig = t.figure(u.role, u.face || u.tribe === "stormcourt" ? "b" : "w");
  f.root.position.set(u.x, u.y ?? 0, u.z);
  if (!f.root.userData.pixels) f.root.rotation.y = (u.dir * Math.PI) / 2 + (Math.random() - 0.5) * 0.4;
  const act = f.root.userData.act as { motion: string; flip: boolean; i: number } | undefined;
  if (act) {
    act.flip = u.dir === -1;
    if (u.motion) Object.assign(act, { motion: u.motion, i: 1 });
  }
  if (u.hero) {
    // A tribe's showcase turns its hero to the camera: keep it facing the battle instead.
    s.showHero(f);
    if (!f.root.userData.pixels) f.root.rotation.y = u.face ? 0 : (u.dir * Math.PI) / 4;
  } else s.addFigure(f);
  if (u.clip && f.anim?.clips.has(u.clip)) {
    void f.play(u.clip, { loop: true, fade: 0 });
    f.anim.current!.time = Math.random() * f.anim.current!.getClip().duration;
  }
}
if (new URLSearchParams(location.search).has("debug")) console.log(units.map((u) => `${u.tribe} ${u.role}`).join(" | "));
(window as unknown as { battleReady: boolean }).battleReady = true;
// For capture under slow software rendering: time moves only by advance(ms), in big steps.
(window as unknown as { advance: (ms: number) => void }).advance = (ms: number) => {
  s.manual = true;
  for (let t = 0; t < ms; t += 150) s.step(150);
};
