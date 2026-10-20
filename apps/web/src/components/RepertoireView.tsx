import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Search, Swords } from "lucide-react";
import { findPath } from "@outofbook/core/repertoire";
import type { Edge, RepertoireModel, RepNode, Side, Verdict } from "@outofbook/core/types";
import { BookChip, ExploreButton, moveLabel, SideIcon, VerdictChip, WdlBar } from "./bits";
import { uciArrow, type Arrow } from "./Board";
import type { ExploreTarget } from "./BookExplorer";
import { Card, CardHeader, Input, Tip } from "./ui";

export type VerdictOf = (color: Side, fromKey: string, uci: string) => Verdict | undefined;
export type Select = (fen: string, orientation: Side, arrows: Arrow[], label?: string) => void;
export type Explore = (t: ExploreTarget) => void;
export type PlayFrom = (color: Side, ucis: string[]) => void;

const mover = (fen: string) => fen.split(" ")[1] as Side;

function Row({
  e,
  from,
  to,
  color,
  graph,
  verdictOf,
  onSelect,
  onExplore,
  onClick,
  indent = 0,
  toggle,
  highlight,
  onPlay,
  path,
}: {
  e: Edge;
  from: RepNode;
  to?: RepNode;
  color: Side;
  graph: Record<string, RepNode>;
  verdictOf: VerdictOf;
  onSelect: Select;
  onExplore: Explore;
  onClick?: () => void;
  indent?: number;
  toggle?: ReactNode;
  highlight?: boolean;
  onPlay?: () => void;
  path?: string[]; // moves from the start to `from`
}) {
  const userMove = mover(from.fen) === color;
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);
  const show = () => onSelect(from.fen, color, [uciArrow(e.uci, "blue")], to?.book?.name);
  return (
    <tr ref={ref} data-hl={highlight} className="cursor-pointer" onClick={() => (show(), onClick?.())} onMouseEnter={show}>
      <td style={{ paddingLeft: `${0.4 + indent * 1.1}rem` }}>
        <div className="flex min-w-0 items-center">
          {toggle}
          <span className={`mr-2 whitespace-nowrap ${userMove ? "font-semibold" : "text-muted"}`}>{moveLabel(from.fen, e.san)}</span>
          {e.transposition && (
            <Tip content="Also reached by other move orders (transposition)">
              <ArrowLeftRight size={12} className="ml-1 shrink-0 text-muted" />
            </Tip>
          )}
          <ExploreButton onClick={() => onExplore({ fen: from.fen, orientation: color, graph, played: e.uci, path })} />
          {to?.book && (
            <span className="truncate text-xs text-muted">
              {to.book.eco} {to.book.name}
            </span>
          )}
        </div>
      </td>
      <td className="num text-right">{e.count}</td>
      <td className="num text-right text-muted">{Math.round((e.count / Math.max(1, from.count)) * 100)}%</td>
      <td>
        <WdlBar w={e.w} d={e.d} b={e.b} width={96} />
      </td>
      <td>
        <BookChip s={e.book} />
      </td>
      <td>{userMove ? <VerdictChip v={verdictOf(color, from.key, e.uci)} /> : <span className="text-xs text-muted">opponent</span>}</td>
      <td onClick={(ev) => ev.stopPropagation()} className="text-right">
        {onPlay && (
          <Tip content="Play from here vs the bot">
            <button className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" onClick={onPlay} aria-label="Play from here">
              <Swords size={14} />
            </button>
          </Tip>
        )}
      </td>
    </tr>
  );
}

function LineSearch({ model, color, onPick }: { model: RepertoireModel; color: Side; onPick: (key: string) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return Object.values(model.graphs[color])
      .filter((n) => n.book && `${n.book.eco} ${n.book.name}`.toLowerCase().includes(s))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [q, model, color]);
  return (
    <div className="relative mb-2">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
      <Input
        className="w-full pl-8"
        placeholder={color === "w" ? "Find a line you played (e.g. berlin defense)" : "Find a line you played (e.g. king's indian defense)"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {hits.length > 0 && (
        <div className="ui-card absolute right-0 left-0 z-20 mt-1 max-h-90 overflow-auto p-1" style={{ ["--card-bg" as string]: "var(--surface)" }}>
          {hits.map((n) => (
            <button
              key={n.key}
              className="ui-nav w-full justify-between"
              onClick={() => {
                onPick(n.key);
                setQ("");
              }}
            >
              <span className="truncate">
                <span className="text-muted">{n.book!.eco}</span> {n.book!.name}
              </span>
              <span className="num text-xs text-muted">{n.count} games</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeProps {
  model: RepertoireModel;
  color: Side;
  minGames: number;
  verdictOf: VerdictOf;
  onSelect: Select;
  onExplore: Explore;
  expanded: Set<string>;
  toggle: (id: string) => void;
  highlight: string | null;
  onPlay?: PlayFrom;
}

function TreeRows(p: TreeProps & { nodeKey: string; pathId: string; depth: number; seen: Set<string> }) {
  const g = p.model.graphs[p.color];
  const node = g[p.nodeKey];
  if (!node || p.depth > 40) return null;
  return (
    <>
      {node.edges
        .filter((e) => e.count >= p.minGames || p.highlight?.startsWith(p.pathId ? `${p.pathId},${e.uci}` : e.uci))
        .map((e) => {
          const id = p.pathId ? `${p.pathId},${e.uci}` : e.uci;
          const child = g[e.to];
          const hasKids = !p.seen.has(e.to) && !!child?.edges.length;
          const open = p.expanded.has(id);
          const toggle = (
            <span className="inline-flex w-5 shrink-0 text-muted" onClick={(ev) => (ev.stopPropagation(), hasKids && p.toggle(id))}>
              {hasKids ? open ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : null}
            </span>
          );
          return (
            <Fragment key={e.uci}>
              <Row
                e={e}
                from={node}
                to={child}
                color={p.color}
                graph={g}
                verdictOf={p.verdictOf}
                onSelect={p.onSelect}
                onExplore={p.onExplore}
                indent={p.depth}
                toggle={toggle}
                highlight={p.highlight === id}
                onPlay={p.onPlay && (() => p.onPlay!(p.color, id.split(",")))}
                onClick={() => hasKids && p.toggle(id)}
                path={id.split(",").slice(0, -1)}
              />
              {open && hasKids && <TreeRows {...p} nodeKey={e.to} pathId={id} depth={p.depth + 1} seen={new Set([...p.seen, e.to])} />}
            </Fragment>
          );
        })}
    </>
  );
}

function ColorTree({ model, color, minGames, verdictOf, onSelect, onExplore, onPlay }: Omit<TreeProps, "expanded" | "toggle" | "highlight">) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pick = (key: string) => {
    const path = findPath(model.graphs[color], model.rootKey, key);
    if (!path) return;
    const ids = path.map((_, i) =>
      path
        .slice(0, i + 1)
        .map((e) => e.uci)
        .join(","),
    );
    setExpanded((x) => new Set([...x, ...ids.slice(0, -1)]));
    setHighlight(ids[ids.length - 1]);
    const n = model.graphs[color][key];
    onSelect(n.fen, color, [], n.book?.name);
  };
  return (
    <>
      <LineSearch model={model} color={color} onPick={pick} />
      <div className="-mx-1 overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Move</th>
              <th className="text-right">Games</th>
              <th className="text-right">%</th>
              <th>Results</th>
              <th>Book</th>
              <th>Your move</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <TreeRows
              model={model}
              color={color}
              minGames={minGames}
              verdictOf={verdictOf}
              onSelect={onSelect}
              onExplore={onExplore}
              expanded={expanded}
              toggle={toggle}
              highlight={highlight}
              onPlay={onPlay}
              nodeKey={model.rootKey}
              pathId=""
              depth={0}
              seen={new Set([model.rootKey])}
            />
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RepertoireView({
  model,
  colors,
  minGames,
  verdictOf,
  onSelect,
  onExplore,
  onPlay,
}: {
  model: RepertoireModel;
  colors: Side[];
  minGames: number;
  verdictOf: VerdictOf;
  onSelect: Select;
  onExplore: Explore;
  onPlay?: PlayFrom;
}) {
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {colors.map((c) => (
        <Card key={c}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <SideIcon c={c} /> As {c === "w" ? "White" : "Black"}
              </span>
            }
            sub={`${model.graphs[c][model.rootKey]?.count ?? 0} games · click or hover a move to show it on the board, click again to expand; the book icon opens the explorer`}
          />
          <ColorTree model={model} color={c} minGames={minGames} verdictOf={verdictOf} onSelect={onSelect} onExplore={onExplore} onPlay={onPlay} />
        </Card>
      ))}
    </div>
  );
}
