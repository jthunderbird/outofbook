// Captured-piece icons: game-styled chess silhouettes (not font glyphs), carved
// ivory for light and polished obsidian for dark, with a gold rim and a shadow.
import type { Side } from "@outofbook/legions/figures";

type Kind = "p" | "n" | "b" | "r" | "q";

/** Silhouettes on a 32 by 40 box, standing on a common base. */
const PATHS: Record<Kind, string> = {
  p: "M16 6a5.5 5.5 0 0 1 3.4 9.8c2 1.3 3.3 3.6 3.6 6.7l.3 5.5H8.7l.3-5.5c.3-3.1 1.6-5.4 3.6-6.7A5.5 5.5 0 0 1 16 6Z",
  r: "M7 6h4v3h3V6h4v3h3V6h4v7l-3 2v10l2 3H8l2-3V15l-3-2Z",
  b: "M16 3.5c1.2 0 2 .9 2 2 0 .5-.2 1-.5 1.4 3.4 2 5.6 5.3 5.6 9 0 3.4-2 5.9-4.6 7.1l.8 5H12.7l.8-5c-2.6-1.2-4.6-3.7-4.6-7.1 0-3.7 2.2-7 5.6-9-.3-.4-.5-.9-.5-1.4 0-1.1.8-2 2-2Zm1.6 8.2-3.4 4.4 1.2.9 3.4-4.4Z",
  n: "M12 28c.2-4 1.6-6.6 3.6-8.6-2.1.3-4 1.2-5.6 2.6l-2.2-2.1c.5-3 2.4-6.4 4.7-8.6l-.7-3.4 3 1.5c1-.5 2.2-.8 3.4-.8 4.8 0 7.6 4.5 7.6 10.6V28Zm4.2-15.4a1.2 1.2 0 1 0 0 .1Z",
  q: "M5 9.5a2 2 0 1 1 2.6 1.9L10 19l2.4-9.3a2 2 0 1 1 2.1-.3L16 18l1.5-8.6a2 2 0 1 1 2.1.3L22 19l2.4-7.6A2 2 0 1 1 27 9.5l-2.6 13.3L25.7 28H6.3l1.3-5.2Z",
};

export function PieceIcon({ kind, side, size = 22 }: { kind: Kind; side: Side; size?: number }) {
  const id = `pi-${side}`;
  return (
    <svg width={size * 0.8} height={size} viewBox="0 0 32 40" aria-hidden className="piece-icon">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {side === "w" ? (
            <>
              <stop offset="0" stopColor="#fffaf0" />
              <stop offset="1" stopColor="#c9b48c" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#5a4a78" />
              <stop offset="1" stopColor="#120c1e" />
            </>
          )}
        </linearGradient>
      </defs>
      <path d={PATHS[kind]} fill={`url(#${id})`} stroke="#e8b84a" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="6" y="28" width="20" height="4.5" rx="1.6" fill={`url(#${id})`} stroke="#e8b84a" strokeWidth="1.3" />
    </svg>
  );
}
