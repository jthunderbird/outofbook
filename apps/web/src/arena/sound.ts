// The Arena board's sounds: CC0 clips (public/arena-sounds, built by
// scripts/build-arena-sounds.py), started by the scene at each step of a fight
// so they land with what is seen. Each play varies its pitch a little so
// repeats do not sound canned. Off, or while the fight is hurried, nothing plays.
import { audioContext } from "../lib/gameFeel";

export const SOUNDS = [
  "order",
  "step1",
  "step2",
  "step3",
  "swing",
  "slash",
  "gallop",
  "land",
  "neigh",
  "grind",
  "stone1",
  "stone2",
  "stone3",
  "portal",
  "boom",
  "rubble",
  "charge",
  "thunder",
  "zap",
  "whoosh",
  "fire",
  "roar",
  "slam",
  "hum",
  "death1",
  "death2",
  "fall",
  "horn",
  "knell",
] as const;
export type SoundName = (typeof SOUNDS)[number];

const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
function load(name: SoundName) {
  let b = buffers.get(name);
  if (!b) {
    const ctx = audioContext();
    b = fetch(`/arena-sounds/${name}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((a) => ctx.decodeAudioData(a))
      .catch(() => null);
    buffers.set(name, b);
  }
  return b;
}

export interface Playing {
  stop(fadeMs?: number): void;
}

export class ArenaSound {
  on = false;
  private playing = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();

  constructor(private hurried: () => boolean) {}

  /** Fetches every clip, so the first fight is not late. */
  preload() {
    for (const n of SOUNDS) void load(n);
  }

  /** Lets audio start on phones: called from a tap. */
  unlock() {
    try {
      const ctx = audioContext();
      if (ctx.state === "suspended") void ctx.resume();
    } catch {
      /* no audio */
    }
  }

  /** Plays a clip once; rate is its speed and pitch (varied by about 6%), gain its volume. */
  play(name: SoundName, { gain = 1, rate = 1, loop = false, delay = 0 } = {}): Playing {
    const handle = { stopped: false, node: null as null | { src: AudioBufferSourceNode; gain: GainNode } };
    const stop = (fadeMs = 120) => {
      handle.stopped = true;
      const n = handle.node;
      if (!n) return;
      const t = n.gain.context.currentTime;
      n.gain.gain.setTargetAtTime(0, t, fadeMs / 3000);
      n.src.stop(t + fadeMs / 1000);
    };
    if (!this.on || this.hurried()) return { stop };
    void load(name).then((buf) => {
      if (!buf || handle.stopped || !this.on || this.hurried()) return;
      try {
        const ctx = audioContext();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
        if (loop) {
          // MP3 pads both ends with silence; loop inside it.
          src.loop = true;
          src.loopStart = 0.05;
          src.loopEnd = buf.duration - 0.05;
        }
        const g = ctx.createGain();
        g.gain.value = gain * 0.8;
        src.connect(g).connect(ctx.destination);
        const node = { src, gain: g };
        handle.node = node;
        this.playing.add(node);
        src.onended = () => this.playing.delete(node);
        src.start(ctx.currentTime + delay / 1000, loop ? 0.05 : 0);
      } catch {
        /* no audio */
      }
    });
    return { stop };
  }

  /** Cuts everything playing, quickly (a hurried fight, or the board going away). */
  stopAll() {
    for (const { src, gain } of this.playing) {
      try {
        gain.gain.setTargetAtTime(0, gain.context.currentTime, 0.02);
        src.stop(gain.context.currentTime + 0.08);
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
  }
}
