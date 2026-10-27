// The arena board (board style "Arena"): the same props as a 2D board, drawn
// with three.js in arena/scene. Loaded only when Arena is chosen.
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Side } from "@outofbook/core/types";
import { Arena } from "./scene";

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
}

export default function ArenaBoard({ fen, orientation, lastMove, movable, onMove, onBusy, sound = false }: ArenaBoardProps) {
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

  return <div ref={el} className="h-full w-full" data-testid="arena" />;
}
