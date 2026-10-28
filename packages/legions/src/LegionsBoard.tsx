// The Chess Legions board (the "Chess Legions (3D)" board choice): the same props as a 2D board, drawn
// with three.js in scene.ts. Loaded only when Chess Legions is chosen.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Side } from "@outofbook/core/types";
import { LegionsScene } from "./scene";
import { tribe } from "./tribes";

export interface LegionsBoardProps {
  fen: string;
  orientation: Side;
  lastMove?: string;
  movable?: Side | "both";
  onMove?: (uci: string) => void;
  /** Told when the board starts and stops acting out moves (a game over waits for it). */
  onBusy?: (busy: boolean) => void;
  /** Play the fight sounds. */
  sound?: boolean;
  /** Each side's tribe id (tribes.ts); the Stormcourt when not given. */
  tribes?: { w: string; b: string };
  /** The court: the board and the scenery round it (courts.ts). */
  court?: string;
  /** Glow on bright light, lightning and fire (bloom). */
  glow?: boolean;
  /** The pixel look: a fixed oblique camera, low resolution, a 16-bit palette. */
  pixel?: boolean;
  /** Where to frame the board when the scene is larger than it (fills the screen); the whole scene when not given. */
  frame?: RefObject<HTMLElement | null>;
  /** A suggested move to show, as uci. */
  hint?: string | null;
}

export default function LegionsBoard({
  fen,
  orientation,
  lastMove,
  movable,
  onMove,
  onBusy,
  sound = false,
  tribes,
  court = "night",
  glow = false,
  pixel = false,
  hint = null,
  frame,
}: LegionsBoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const scene = useRef<LegionsScene | null>(null);
  const busy = useRef(onBusy);
  busy.current = onBusy;

  useLayoutEffect(() => {
    const a = new LegionsScene(el.current!, (b) => busy.current?.(b));
    scene.current = a;
    // For trying moves by hand from the console: legions.setPosition(fen, uci).
    if (import.meta.env.DEV) (window as unknown as { legions?: LegionsScene }).legions = a;
    return () => {
      a.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => scene.current?.setOrientation(orientation), [orientation]);
  // After layout effects: the frame is a later sibling, its ref set after ours run.
  useEffect(() => scene.current?.setFrame(frame?.current ?? null), [frame]);
  const tw = tribes?.w ?? "stormcourt";
  const tb = tribes?.b ?? "stormcourt";
  // Before the position, so the first figures are already the right tribe.
  useLayoutEffect(() => scene.current?.setTribes({ w: tribe(tw), b: tribe(tb) }), [tw, tb]);
  useEffect(() => scene.current?.setCourt(court), [court]);
  useEffect(() => scene.current?.setGlow(glow), [glow]);
  useEffect(() => scene.current?.setPixel(pixel), [pixel]);
  useEffect(() => {
    const a = scene.current;
    if (!a) return;
    a.sound.on = sound;
    if (sound) a.sound.preload();
    else a.sound.stopAll();
  }, [sound]);
  // Before paint, so a game over shown with the final move waits for its acting out.
  useLayoutEffect(() => scene.current?.setPosition(fen, lastMove), [fen, lastMove]);
  useEffect(() => scene.current?.setInput({ movable, onMove }), [movable, onMove]);
  useEffect(() => scene.current?.setHint(hint), [hint]);

  return <div ref={el} style={{ width: "100%", height: "100%" }} data-testid="legions" />;
}
