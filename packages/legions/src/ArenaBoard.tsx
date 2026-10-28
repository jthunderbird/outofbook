// The arena board (board style "Arena"): the same props as a 2D board, drawn
// with three.js in arena/scene. Loaded only when Arena is chosen.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Side } from "@outofbook/core/types";
import { Arena } from "./scene";
import { tribe } from "./tribes";

export interface ArenaBoardProps {
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
  /** Where to frame the board when the scene is larger than it (fills the screen); the whole scene when not given. */
  frame?: RefObject<HTMLElement | null>;
  /** A suggested move to show, as uci. */
  hint?: string | null;
}

export default function ArenaBoard({ fen, orientation, lastMove, movable, onMove, onBusy, sound = false, tribes, court = "night", glow = false, hint = null, frame }: ArenaBoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const arena = useRef<Arena | null>(null);
  const busy = useRef(onBusy);
  busy.current = onBusy;

  useLayoutEffect(() => {
    const a = new Arena(el.current!, (b) => busy.current?.(b));
    arena.current = a;
    // For trying moves by hand from the console: arena.setPosition(fen, uci).
    if (import.meta.env.DEV) (window as unknown as { arena?: Arena }).arena = a;
    return () => {
      a.dispose();
      arena.current = null;
    };
  }, []);
  useEffect(() => arena.current?.setOrientation(orientation), [orientation]);
  // After layout effects: the frame is a later sibling, its ref set after ours run.
  useEffect(() => arena.current?.setFrame(frame?.current ?? null), [frame]);
  const tw = tribes?.w ?? "stormcourt";
  const tb = tribes?.b ?? "stormcourt";
  // Before the position, so the first figures are already the right tribe.
  useLayoutEffect(() => arena.current?.setTribes({ w: tribe(tw), b: tribe(tb) }), [tw, tb]);
  useEffect(() => arena.current?.setCourt(court), [court]);
  useEffect(() => arena.current?.setGlow(glow), [glow]);
  useEffect(() => {
    const a = arena.current;
    if (!a) return;
    a.sound.on = sound;
    if (sound) a.sound.preload();
    else a.sound.stopAll();
  }, [sound]);
  // Before paint, so a game over shown with the final move waits for its acting out.
  useLayoutEffect(() => arena.current?.setPosition(fen, lastMove), [fen, lastMove]);
  useEffect(() => arena.current?.setInput({ movable, onMove }), [movable, onMove]);
  useEffect(() => arena.current?.setHint(hint), [hint]);

  return <div ref={el} style={{ width: "100%", height: "100%" }} data-testid="arena" />;
}
