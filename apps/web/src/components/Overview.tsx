import { ArrowRight } from "lucide-react";
import { whoCaresEligible } from "@outofbook/core/whoCares";
import { BAD_VERDICTS, type MoveStat, type RepertoireModel, type Side, type Verdict } from "@outofbook/core/types";
import type { AnalysisProgress } from "../lib/analysis";
import { moveLabel, SideIcon, VerdictChip, WdlBar } from "./bits";
import { uciArrow } from "./Board";
import type { Select } from "./RepertoireView";
import { Button, Card, CardHeader, Progress, Stat } from "./ui";

/** Home view: the repertoire at a glance, each card linking to its detail view. */
export function Overview({
  model,
  colors,
  minGames,
  progress,
  verdict,
  whoCares,
  whoCaresMinMove,
  onNav,
  onSelect,
}: {
  model: RepertoireModel;
  colors: Side[];
  minGames: number; // as the Mistakes view: only moves played at least this often
  progress: AnalysisProgress | null;
  verdict: (m: MoveStat) => Verdict | undefined;
  whoCares: Verdict[];
  whoCaresMinMove: number;
  onNav: (view: string) => void;
  onSelect: Select;
}) {
  const ops = model.openings.filter((o) => colors.includes(o.color));
  const you = ops.reduce((s, o) => s + o.userLeft, 0);
  const opp = ops.reduce((s, o) => s + o.opponentLeft, 0);
  const ended = ops.reduce((s, o) => s + o.exhausted, 0);
  const total = Math.max(1, you + opp + ended);
  const moves = model.moves.filter((m) => colors.includes(m.color));
  const bad = moves.filter((m) => m.count >= minGames && BAD_VERDICTS.includes(verdict(m)!)).sort((a, b) => b.count - a.count);
  const gems = moves.filter((m) => (m.book === "left" || m.book === "exhausted") && whoCares.includes(verdict(m)!) && whoCaresEligible(m, whoCaresMinMove)).length;
  const top = [...ops].sort((a, b) => b.games - a.games).slice(0, 6);
  const games = Object.values(model.games).filter((g) => colors.includes(g.color)).length;
  const pct = progress ? (progress.done / Math.max(1, progress.total)) * 100 : 0;

  const more = (view: string) => (
    <Button size="sm" variant="ghost" onClick={() => onNav(view)}>
      Open <ArrowRight size={14} />
    </Button>
  );

  return (
    <div className="grid gap-[var(--gap)] md:grid-cols-2 2xl:grid-cols-4">
      <Card className="md:col-span-2 2xl:col-span-4">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Games" value={games} sub={`${model.metrics.uniquePositions} positions in scope`} />
          <Stat label="Repeated mistakes" value={bad.length} sub={`played ${minGames}+ times`} tone={bad.length ? "bad" : undefined} />
          <Stat label="Book exits by you" value={`${Math.round((you / total) * 100)}%`} sub={`${you} of ${you + opp + ended} games`} tone="warn" />
          <Stat label="Unnamed gems" value={gems} sub="great moves off the book" tone="good" />
        </div>
        {progress && (
          <div className="mt-4 flex items-center gap-3">
            <Progress value={pct} className="flex-1" />
            <span className="num text-xs text-muted">{progress.running ? `analysing ${progress.done}/${progress.total}` : "analysis done"}</span>
          </div>
        )}
      </Card>
      <Card className="md:col-span-1 2xl:col-span-2">
        <CardHeader title="Most repeated mistakes" sub="Hover to see on the board" actions={more("mistakes")} />
        {bad.length === 0 && <div className="text-sm text-muted">None yet (analysis still running, or none found).</div>}
        <div className="flex flex-col">
          {bad.slice(0, 6).map((m) => (
            <button
              key={m.id}
              className="ui-nav justify-between"
              onMouseEnter={() => onSelect(m.fen, m.color, [uciArrow(m.uci, "red")], m.opening)}
              onClick={() => onSelect(m.fen, m.color, [uciArrow(m.uci, "red")], m.opening)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <SideIcon c={m.color} />
                <b className="text-fg">{moveLabel(m.fen, m.san)}</b>
                <span className="truncate text-xs">{m.opening}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <VerdictChip v={verdict(m)} />
                <span className="num w-8 text-right text-fg">×{m.count}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="md:col-span-1 2xl:col-span-2">
        <CardHeader title="Who leaves the book" sub="First departure from the named lines" actions={more("openings")} />
        <div className="flex h-9 overflow-hidden rounded-ui text-xs font-semibold">
          {[
            [you, "var(--bad)", "you"],
            [opp, "var(--warn)", "opponent"],
            [ended, "var(--accent)", "line ended"],
          ].map(([n, c, l]) => (
            <div
              key={l as string}
              className="flex items-center justify-center overflow-hidden whitespace-nowrap"
              style={{ width: `${((n as number) / total) * 100}%`, background: c as string, color: "#111" }}
            >
              {(n as number) / total > 0.12 ? `${l} ${Math.round(((n as number) / total) * 100)}%` : ""}
            </div>
          ))}
        </div>
        <div className="num mt-2 flex gap-4 text-xs text-muted">
          <span>you {you}</span>
          <span>opponent {opp}</span>
          <span>line ended {ended}</span>
        </div>
      </Card>
      <Card className="md:col-span-2 2xl:col-span-4">
        <CardHeader title="Your main openings" actions={more("repertoire")} />
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2 2xl:grid-cols-3">
          {top.map((o) => (
            <div key={o.color + o.name} className="flex items-center gap-3 py-1">
              <SideIcon c={o.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{o.name}</div>
                <div className="num text-xs text-muted">
                  {o.eco} · {o.games} games
                </div>
              </div>
              <WdlBar w={o.w} d={o.d} b={o.b} width={110} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
