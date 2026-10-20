import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fmtEval, lineWinPct, pvToSan, uciToSan } from "@outofbook/core/chess";
import { AskClaude } from "./AskClaude";
import { BAD_VERDICTS, type MoveStat, type PosEval, type Side, type Verdict } from "@outofbook/core/types";
import { whoCaresEligible } from "@outofbook/core/whoCares";
import { BookChip, ExploreButton, moveLabel, SideIcon, VerdictChip } from "./bits";
import { uciArrow } from "./Board";
import type { Explore, Select as SelectFn } from "./RepertoireView";
import { Card, CardHeader, Empty, Field, Select, Switch } from "./ui";

export type ListMode = "mistakes" | "outofbook" | "whocares";

const SEVERITY: Partial<Record<Verdict, number>> = { blunder: 3, mistake: 2, inaccuracy: 1 };

const TITLES: Record<ListMode, [string, string]> = {
  mistakes: ["Mistakes", "Your inaccuracies, mistakes and blunders in the opening phase (book + N moves). Same move in the same position is grouped."],
  outofbook: ["Out of book", "Where you left the named lines."],
  whocares: ["Book? Who cares", "The move with which you left the named lines, when it was great or better: continuations nobody has named yet. Early moves and plain recaptures are left out."],
};

export function MoveLists({
  mode,
  moves,
  colors,
  minGames,
  whoCaresVerdicts,
  whoCaresMinMove,
  verdict,
  evalOf,
  onSelect,
  onOpenGame,
  onExplore,
}: {
  mode: ListMode;
  moves: MoveStat[];
  colors: Side[];
  minGames: number;
  whoCaresVerdicts: Verdict[];
  whoCaresMinMove: number;
  verdict: (m: MoveStat) => Verdict | undefined;
  evalOf: (key: string) => PosEval | undefined;
  onSelect: SelectFn;
  onOpenGame: (id: string) => void;
  onExplore: Explore;
}) {
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [includeBook, setIncludeBook] = useState(true);
  const [sortBy, setSortBy] = useState<"times" | "weighted" | "loss">("times");
  const [group, setGroup] = useState<"move" | "position">("move");
  const minMove = whoCaresMinMove; // set in Settings ("Earliest move")

  const rows = useMemo(() => {
    let r = moves.filter((m) => colors.includes(m.color) && m.count >= minGames);
    if (mode === "mistakes") r = r.filter((m) => BAD_VERDICTS.includes(verdict(m)!) && (includeBook || m.book !== "in"));
    if (mode === "outofbook") {
      r = r.filter((m) => m.book === "left");
      if (onlyMistakes) r = r.filter((m) => BAD_VERDICTS.includes(verdict(m)!));
    }
    if (mode === "whocares")
      // Only the move with which you yourself left the named lines.
      r = r.filter((m) => (m.book === "left" || m.book === "exhausted") && whoCaresVerdicts.includes(verdict(m)!) && whoCaresEligible(m, minMove));
    const loss = (m: MoveStat) => {
      const b = evalOf(m.fromKey);
      const a = evalOf(m.toKey);
      return b && a ? (lineWinPct(b.lines[0]) - lineWinPct(a.lines[0])) * (m.color === "w" ? 1 : -1) : 0;
    };
    const score = sortBy === "times" ? (m: MoveStat) => m.count * 100 + (SEVERITY[verdict(m)!] ?? 0) : sortBy === "weighted" ? (m: MoveStat) => m.count * (SEVERITY[verdict(m)!] ?? 1) : loss;
    return r.sort((a, b) => score(b) - score(a));
  }, [moves, colors, minGames, mode, onlyMistakes, includeBook, whoCaresVerdicts, minMove, verdict, sortBy, evalOf]);

  const byPosition = useMemo(() => {
    const m = new Map<string, MoveStat[]>();
    for (const r of rows) m.set(`${r.color}|${r.fromKey}`, [...(m.get(`${r.color}|${r.fromKey}`) ?? []), r]);
    return [...m.values()].sort((a, b) => b.reduce((s, x) => s + x.count, 0) - a.reduce((s, x) => s + x.count, 0));
  }, [rows]);

  const show = (m: MoveStat) => {
    const best = evalOf(m.fromKey)?.lines[0]?.pv[0];
    onSelect(m.fen, m.color, [uciArrow(m.uci, "red"), ...(best && best !== m.uci ? [uciArrow(best, "green")] : [])], m.opening);
  };

  const row = (m: MoveStat) => {
    const before = evalOf(m.fromKey);
    const after = evalOf(m.toKey);
    const best = before?.lines[0]?.pv[0];
    const sign = m.color === "w" ? 1 : -1;
    const loss = before && after ? Math.max(0, (lineWinPct(before.lines[0]) - lineWinPct(after.lines[0])) * sign) : undefined;
    return (
      <tr key={m.id} className="cursor-pointer" onClick={() => show(m)} onMouseEnter={() => show(m)} data-testid="move-row">
        <td>
          <SideIcon c={m.color} />
        </td>
        <td className="max-w-64 truncate" title={m.opening}>
          <ExploreButton onClick={() => onExplore({ fen: m.fen, orientation: m.color, played: m.uci })} />
          {m.opening}
        </td>
        <td className="font-semibold whitespace-nowrap">{moveLabel(m.fen, m.san)}</td>
        <td>
          <VerdictChip v={verdict(m)} />
        </td>
        <td>
          <BookChip s={m.book} />
        </td>
        <td className="num text-right font-semibold">{m.count}</td>
        <td className="num whitespace-nowrap">{best ? `${uciToSan(m.fen, best)} (${fmtEval(before!.lines[0])})` : "…"}</td>
        <td className="num text-right">{loss !== undefined ? `${loss.toFixed(1)}%` : ""}</td>
        <td className="whitespace-nowrap">
          {m.gameIds.slice(0, 3).map((g) => (
            <button key={g} className="ui-link num mr-1.5 text-xs" onClick={(e) => (e.stopPropagation(), onOpenGame(g))}>
              {g.split(":")[1].slice(0, 5)}
            </button>
          ))}
          {m.gameIds.length > 3 ? <span className="text-xs text-muted">+{m.gameIds.length - 3}</span> : ""}
        </td>
        <td>
          <AskClaude
            disabled={!before || !after}
            input={() => ({
              fen: m.fen,
              moveSan: m.san,
              mover: m.color,
              verdict: verdict(m),
              evalBefore: before ? fmtEval(before.lines[0]) : undefined,
              evalAfter: after ? fmtEval(after.lines[0]) : undefined,
              bestSan: best ? uciToSan(m.fen, best) : undefined,
              bestLineSan: before ? pvToSan(m.fen, before.lines[0].pv) : undefined,
              afterLineSan: after ? pvToSan(m.toFen, after.lines[0].pv) : undefined,
              opening: m.opening,
              timesPlayed: m.count,
              book: m.book,
            })}
          />
        </td>
      </tr>
    );
  };

  return (
    <Card>
      <CardHeader
        title={TITLES[mode][0]}
        sub={TITLES[mode][1]}
        actions={
          <span className="num text-xs text-muted" data-testid={`rows-${mode}`}>
            {rows.length} rows
          </span>
        }
      />
      <div className="mb-3 flex flex-wrap items-end gap-4">
        {mode === "outofbook" && <Switch checked={onlyMistakes} onChange={setOnlyMistakes} label="Only mistakes" />}
        {mode === "mistakes" && <Switch checked={includeBook} onChange={setIncludeBook} label="Include book moves the engine dislikes" />}
        {mode === "mistakes" && (
          <Field label="Group by">
            <Select
              value={group}
              onChange={(e) => setGroup(e.target.value as "move" | "position")}
              options={[
                ["move", "Same move, same position"],
                ["position", "Same position, any bad move"],
              ]}
            />
          </Field>
        )}
        <Field label="Sort by">
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            options={[
              ["times", "Times played"],
              ["weighted", "Times × severity"],
              ["loss", "Win% lost"],
            ]}
          />
        </Field>
      </div>
      {rows.length === 0 ? (
        <Empty title="Nothing yet">Verdicts fill in as the background analysis runs; lower "min games" to see rarer moves.</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th />
                <th>Opening</th>
                <th>Your move</th>
                <th>Verdict</th>
                <th>Book</th>
                <th className="text-right">Times</th>
                <th>Best (eval)</th>
                <th className="text-right">Win% lost</th>
                <th>
                  Games <ExternalLink size={11} className="inline" />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mode === "mistakes" && group === "position"
                ? byPosition.slice(0, 300).flatMap((grp) => [
                    <tr key={grp[0].fromKey + "h"}>
                      <td colSpan={10} className="text-xs font-semibold" style={{ background: "var(--hover)" }}>
                        {grp[0].opening} · {grp.reduce((s, x) => s + x.count, 0)} bad moves in this position
                      </td>
                    </tr>,
                    ...grp.map(row),
                  ])
                : rows.slice(0, 300).map(row)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
