import { BookOpen } from "lucide-react";
import type { BookStatus, Verdict } from "@outofbook/core/types";
import { Badge, Tip, type Tone } from "./ui";

export function WdlBar({ w, d, b, width = 140 }: { w: number; d: number; b: number; width?: number | string }) {
  const n = w + d + b || 1;
  const pct = (x: number) => Math.round((x / n) * 100);
  const seg = (x: number, bg: string, fg: string) =>
    x > 0 ? (
      <div className="num overflow-hidden text-center text-[10px] leading-4 font-semibold whitespace-nowrap" style={{ width: `${(x / n) * 100}%`, background: bg, color: fg }}>
        {pct(x) >= 14 ? `${pct(x)}` : ""}
      </div>
    ) : null;
  return (
    <Tip content={`White ${pct(w)}% · Draw ${pct(d)}% · Black ${pct(b)}%`}>
      <div className="flex h-4 overflow-hidden rounded-[4px]" style={{ width, outline: "1px solid color-mix(in oklab, var(--fg) 18%, transparent)" }}>
        {seg(w, "#f4f4f4", "#222")}
        {seg(d, "#9a9a9a", "#111")}
        {seg(b, "#2a2a2a", "#eee")}
      </div>
    </Tip>
  );
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  splendid: "#1baaa6",
  perfect: "#5b8baf",
  best: "#98bc49",
  excellent: "#96af8b",
  forced: "#999999",
  okay: "#97af8b",
  inaccuracy: "#f4bf44",
  mistake: "#e28c28",
  blunder: "#c93230",
};

const VERDICT_GLYPH: Partial<Record<Verdict, string>> = { splendid: "!!", perfect: "!", best: "★", inaccuracy: "?!", mistake: "?", blunder: "??" };

export function VerdictChip({ v }: { v?: Verdict }) {
  if (!v) return <Badge>…</Badge>;
  const c = VERDICT_COLOR[v];
  return (
    <Badge style={{ color: c, background: `color-mix(in oklab, ${c} 18%, transparent)` }}>
      {VERDICT_GLYPH[v] && <b>{VERDICT_GLYPH[v]}</b>}
      {v}
    </Badge>
  );
}

const BOOK_LABEL: Record<BookStatus, [string, Tone]> = {
  in: ["book", "good"],
  left: ["left book", "warn"],
  exhausted: ["book ended", "accent"],
  after: ["after book", "neutral"],
};
export function BookChip({ s }: { s: BookStatus }) {
  const [l, t] = BOOK_LABEL[s];
  return <Badge tone={t}>{l}</Badge>;
}

export const moveLabel = (fen: string, san: string) => {
  const [, side, , , , full] = fen.split(" ");
  return side === "w" ? `${full}. ${san}` : `${full}… ${san}`;
};

export const SideIcon = ({ c }: { c: "w" | "b" }) => (
  <span
    className="inline-block h-3 w-3 shrink-0 rounded-full align-[-1px]"
    title={c === "w" ? "as White" : "as Black"}
    style={{ background: c === "w" ? "#f4f4f4" : "#222", outline: "1px solid color-mix(in oklab, var(--fg) 35%, transparent)" }}
  />
);

/** Opens the book explorer. Placed left of line names in every table; the row
 * itself selects (shows the move on the board). */
export function ExploreButton({ onClick }: { onClick: () => void }) {
  return (
    <Tip content="Book explorer: the moves to here, and the book and engine moves at each step">
      {/* Prominent on purpose (the user forgot it was there): the primary button's gradient and glow. */}
      <button
        className="mr-2 inline-grid h-8 w-8 shrink-0 place-items-center rounded-ui align-middle text-white transition-transform hover:scale-110"
        style={{ background: "var(--btn-bg)", boxShadow: "var(--btn-glow)" }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label="Open the book explorer"
        data-testid="explore-btn"
      >
        <BookOpen size={18} />
      </button>
    </Tip>
  );
}

const VERDICT_ICON: Record<Verdict, string> = { splendid: "!!", perfect: "!", best: "★", excellent: "✓", okay: "✓", forced: "→", inaccuracy: "?!", mistake: "?", blunder: "??" };
export const VERDICT_LABEL: Record<Verdict, string> = {
  splendid: "splendid",
  perfect: "the only good move",
  best: "the best move",
  excellent: "excellent",
  okay: "okay",
  forced: "forced",
  inaccuracy: "an inaccuracy",
  mistake: "a mistake",
  blunder: "a blunder",
};
export const BOOK_COLOR = "#dbac86";

/** Round move-quality icon (Chesskit style); "book" for moves still in the named lines. */
export function VerdictIcon({ v, size = 16 }: { v?: Verdict | "book"; size?: number }) {
  if (!v) return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
  const bg = v === "book" ? BOOK_COLOR : VERDICT_COLOR[v];
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * (v !== "book" && VERDICT_ICON[v].length > 1 ? 0.5 : 0.62), boxShadow: "0 1px 2px rgb(0 0 0 / 0.35)" }}
      title={v === "book" ? "book move" : v}
    >
      {v === "book" ? <BookOpen size={size * 0.62} strokeWidth={2.5} /> : VERDICT_ICON[v]}
    </span>
  );
}
