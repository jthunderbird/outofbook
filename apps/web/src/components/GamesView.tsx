import { ExternalLink } from "lucide-react";
import { plyLabel } from "@outofbook/core/chess";
import type { RawGame, RepertoireModel, Side } from "@outofbook/core/types";
import { SideIcon } from "./bits";
import { Badge, Card, CardHeader } from "./ui";
import { LichessIcon } from "./LichessIcon";

export function GamesView({ games, model, colors, onOpen }: { games: RawGame[]; model: RepertoireModel; colors: Side[]; onOpen: (id: string) => void }) {
  const rows = games.filter((g) => colors.includes(g.userColor)).slice(0, 500);
  return (
    <Card>
      <CardHeader title="Games" sub={`${rows.length} shown · click a game to review it against your repertoire`} />
      <div className="-mx-1 overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Result</th>
              <th>Date</th>
              <th>Opponent</th>
              <th>Speed</th>
              <th>Opening</th>
              <th>Book left</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const s = model.games[g.id];
              const opp = g.userColor === "w" ? g.black : g.white;
              return (
                <tr key={g.id} className="cursor-pointer" onClick={() => onOpen(g.id)}>
                  <td>{outcome(g)}</td>
                  <td className="num text-muted">{new Date(g.date).toISOString().slice(0, 10)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <SideIcon c={g.userColor} /> {opp}
                    </span>
                  </td>
                  <td className="text-muted capitalize">{g.speed}</td>
                  <td className="max-w-64 truncate">{s?.opening}</td>
                  <td className="text-xs">
                    {!s || s.deviation.by === "none" ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        <Badge tone={s.deviation.by === "user" ? "bad" : s.deviation.by === "opponent" ? "warn" : "accent"}>
                          {s.deviation.by === "user" ? "you" : s.deviation.by === "opponent" ? "opponent" : "line ended"}
                        </Badge>{" "}
                        <span className="num">{plyLabel(s.deviation.ply, s.deviation.san ?? "")}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <a href={g.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted hover:text-fg" title={`Open on ${g.site}`}>
                      {g.site === "lichess" ? <LichessIcon size={15} /> : <ExternalLink size={14} />}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function outcome(g: RawGame) {
  const won = (g.result === "1-0" && g.userColor === "w") || (g.result === "0-1" && g.userColor === "b");
  const lost = (g.result === "0-1" && g.userColor === "w") || (g.result === "1-0" && g.userColor === "b");
  return won ? <Badge tone="good">Win</Badge> : lost ? <Badge tone="bad">Loss</Badge> : g.result === "*" ? <Badge>?</Badge> : <Badge>Draw</Badge>;
}
