// Sounds and vibration like a Lichess board. The sounds are Lichess's own,
// streamed from its asset CDN at run time (not bundled: the standard set is not
// under a free licence, see COPYING.md in lichess-org/lila). Same choice of
// sound as lila's ui/site/src/sound.ts: capture or move, then check/checkmate.
export type SoundName = "move" | "capture" | "check" | "checkmate" | "genericNotify" | "lowTime";

const CDN = "https://lichess1.org/assets/sound";
const SETS = ["standard", "piano", "nes", "sfx", "futuristic", "robot"];
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

const dir = (set: string) => (SETS.includes(set) ? set : "standard");
const file = (name: SoundName) => name[0].toUpperCase() + name.slice(1);

function load(set: string, name: SoundName) {
  const url = `${CDN}/${dir(set)}/${file(name)}.mp3`;
  let b = buffers.get(url);
  if (!b) {
    ctx ??= new AudioContext();
    const c = ctx;
    b = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((a) => c.decodeAudioData(a))
      .catch(() => null);
    buffers.set(url, b);
  }
  return b;
}

/** Fetch a set ahead of the first move, so the first sound is not late. */
export function preloadSounds(set: string) {
  if (set === "silent") return;
  for (const n of ["move", "capture", "check", "checkmate", "genericNotify", "lowTime"] as SoundName[]) load(set, n);
}

export async function playSound(set: string, name: SoundName) {
  if (set === "silent") return;
  // Lichess's music and speech sets have no plain move sounds; it falls back to standard for the rest.
  if ((set === "music" || set === "speech") && ["move", "capture", "check", "checkmate"].includes(name)) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const buf = await load(set, name);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  } catch {
    /* no audio */
  }
}

/** The sound(s) Lichess plays for a move given its SAN. */
export function playMoveSound(set: string, san: string) {
  playSound(set, san.includes("x") ? "capture" : "move");
  if (san.includes("#")) playSound(set, "checkmate");
  else if (san.includes("+")) playSound(set, "check");
}

/** Short buzz on phones that support it (Android Chrome; iOS Safari has no Vibration API). */
export function buzz(pattern: number | number[] = 40) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
export const canVibrate = () => typeof navigator !== "undefined" && "vibrate" in navigator;
