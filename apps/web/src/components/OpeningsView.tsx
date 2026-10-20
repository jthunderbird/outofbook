import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BookExit, OpeningStat, PosEval, Side } from "@outofbook/core/types";
import { ExploreButton, moveLabel, SideIcon, WdlBar } from "./bits";
import { uciArrow } from "./Board";
import type { Explore, Select } from "./RepertoireView";
import { Badge, Card, CardHeader } from "./ui";

// Who left the named lines first, per opening. Games where the named line simply
// ended (nobody "left") are not counted here.
export function OpeningsView({
  openings,
  colors,
  minGames,
  evalOf,
  onSelect,
  onExplore,
}: {
  openings: OpeningStat[];
  colors: Side[];
  minGames: number;
  evalOf: (k: string) => PosEval | undefined;
  onSelect: Select;
  onExplore: Explore;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const left = (o: OpeningStat) => o.userLeft + o.opponentLeft;
  const rows = openings.filter((o) => colors.includes(o.color) && left(o) >= minGames).sort((a, b) => left(b) - left(a));
  const show = (o: OpeningStat, x: BookExit) => {
    const best = evalOf(x.fromKey)?.lines[0]?.pv[0];
    onSelect(x.fen, o.color, [uciArrow(x.uci, x.by === "user" ? "red" : "orange"), ...(best && best !== x.uci ? [uciArrow(best, "green")] : [])], o.name);
  };
  return (
    <Card>
      <CardHeader
        title="Who left the book"
        sub="Who left the named lines first, by the deepest line reached. Click an opening to see where; click or hover a move to show it on the board (red: you, orange: opponent, green: engine best). The book icon opens the explorer."
      />
      <div className="-mx-1 overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th />
              <th>Opening</th>
              <th className="text-right">Left book</th>
              <th>You vs opponent</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const id = o.color + o.name;
              const n = left(o);
              const you = Math.round((o.userLeft / n) * 100);
              return (
                <Fragment key={id}>
                  <tr className="cursor-pointer" onClick={() => setOpen(open === id ? null : id)}>
                    <td className="w-12">
                      <span className="flex items-center gap-1.5 text-muted">
                        {open === id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <SideIcon c={o.color} />
                      </span>
                    </td>
                    <td>
                      <span className="text-muted">{o.eco}</span> {o.name}
                    </td>
                    <td className="num text-right font-semibold">{n}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="num w-14 text-right text-xs" style={{ color: "var(--bad)" }}>
                          you {o.userLeft}
                        </span>
                        <div className="flex h-2 w-28 overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--warn) 70%, transparent)" }}>
                          <div style={{ width: `${you}%`, background: "var(--bad)" }} />
                        </div>
                        <span className="num text-xs" style={{ color: "var(--warn)" }}>
                          {o.opponentLeft} opp
                        </span>
                      </div>
                    </td>
                    <td>
                      <WdlBar w={o.w} d={o.d} b={o.b} width={120} />
                    </td>
                  </tr>
                  {open === id &&
                    o.exits.map((x) => (
                      <tr key={x.fromKey + x.uci} className="cursor-pointer" style={{ background: "var(--hover)" }} onClick={() => show(o, x)} onMouseEnter={() => show(o, x)}>
                        <td />
                        <td className="pl-6">
                          <ExploreButton onClick={() => onExplore({ fen: x.fen, orientation: o.color, played: x.uci })} />
                          <b>{moveLabel(x.fen, x.san)}</b>
                          <Badge tone={x.by === "user" ? "bad" : "warn"} className="ml-2">
                            {x.by === "user" ? "you" : "opponent"}
                          </Badge>
                        </td>
                        <td className="num text-right">{x.count}</td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
