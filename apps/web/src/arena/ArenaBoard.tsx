// The arena board (board style "Arena"): the same props as a 2D board, drawn
// with three.js in arena/scene. Loaded only when Arena is chosen.
import { useEffect, useRef } from "react";
import type { Side } from "@outofbook/core/types";
import { Arena } from "./scene";

export interface ArenaBoardProps {
  fen: string;
  orientation: Side;
  lastMove?: string;
  movable?: Side | "both";
  onMove?: (uci: string) => void;
}

export default function ArenaBoard({ fen, orientation, lastMove, movable, onMove }: ArenaBoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const arena = useRef<Arena | null>(null);

  useEffect(() => {
    const a = new Arena(el.current!);
    arena.current = a;
    // For trying moves by hand from the console: arena.setPosition(fen, uci).
    if (import.meta.env.DEV) (window as unknown as { arena?: Arena }).arena = a;
    return () => {
      a.dispose();
      arena.current = null;
    };
  }, []);
  useEffect(() => arena.current?.setOrientation(orientation), [orientation]);
  useEffect(() => arena.current?.setPosition(fen, lastMove), [fen, lastMove]);
  useEffect(() => arena.current?.setInput({ movable, onMove }), [movable, onMove]);

  return <div ref={el} className="h-full w-full" data-testid="arena" />;
}
