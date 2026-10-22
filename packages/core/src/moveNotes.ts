// What a move means for the user's repertoire, as the bot page and the game
// review show it: left the book, off the usual move, a better move available,
// a new move, or an opponent's surprise. Pure: callers pass the repertoire node,
// the evals and the verdict they already have.
import { BAD_VERDICTS, type BookStatus, type Line, type PosEval, type RepNode, type Side, type Verdict } from "./types";

export const pct = (n: number, of: number) => Math.round((n / Math.max(1, of)) * 100);

/** An eval from one side, in pawns (mate as a large number), and as text. */
export const povPawns = (l: Line, me: Side) => (me === "w" ? 1 : -1) * (l.mate !== undefined ? Math.sign(l.mate) * (1000 - Math.abs(l.mate)) : (l.cp ?? 0) / 100);
export const povText = (l: Line, me: Side) => {
  const s = me === "w" ? 1 : -1;
  if (l.mate !== undefined) return `${l.mate * s > 0 ? "" : "-"}#${Math.abs(l.mate)}`;
  const v = ((l.cp ?? 0) * s) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
};

/** "Your eval is 0.40 worse than your usual Nf3 (c4 +0.20 vs +0.60)." */
export function compareText(mine: Line, ref: Line, me: Side, playedSan: string, what: string) {
  const vs = `(${playedSan} ${povText(mine, me)} vs ${povText(ref, me)})`;
  if (mine.mate !== undefined || ref.mate !== undefined) return `Compared with ${what}: ${vs}.`;
  const d = povPawns(mine, me) - povPawns(ref, me);
  if (Math.abs(d) < 0.05) return `Your eval is the same as ${what} ${vs}.`;
  return `Your eval is ${Math.abs(d).toFixed(2)} ${d < 0 ? "worse" : "better"} than ${what} ${vs}.`;
}

/** The bot page's rule: a repertoire move (played at least twice) that is not bad, while the engine's best is clearly better (the move is only "okay", or 0.15 pawns or more). */
export function betterMoveAvailable(o: { timesPlayed: number; verdict?: Verdict; best?: Line; after?: Line; playedUci: string; me: Side }) {
  if (o.timesPlayed < 2 || !o.verdict || BAD_VERDICTS.includes(o.verdict) || !o.best || !o.after || o.best.pv[0] === o.playedUci) return false;
  return o.verdict === "okay" || povPawns(o.best, o.me) - povPawns(o.after, o.me) >= 0.15;
}

export type NoteKind = "left-book" | "opp-left-book" | "bad" | "off-usual" | "better" | "new-move" | "opp-new" | "opp-known" | "unreached";
export type NoteTone = "bad" | "warn" | "accent" | "info";

export interface MoveNote {
  kind: NoteKind;
  tone: NoteTone;
  title: string;
  text: string;
}

export interface MoveNoteInput {
  me: Side; // the user's color in this game
  mover: Side;
  san: string;
  uci: string;
  book: BookStatus; // this move against the named book
  /** The game left the named book with this move (not when the line just ran out). */
  leftBook: boolean;
  bookSans: string[]; // the named book's moves in the position before
  /** The repertoire node before the move; undefined when the user's games never got here. */
  node?: RepNode;
  /** 1 when this game is among the games the node counts, so it is left out of "how often". */
  thisGame: 0 | 1;
  verdict?: Verdict;
  before?: PosEval; // the position before the move (its first line is the engine's best)
  after?: PosEval; // the position after the move
  usualAfter?: PosEval; // the position after the user's usual move, when they played another
  bestSan?: string;
}

export interface MoveNotes {
  notes: MoveNote[];
  usual?: { uci: string; san: string; count: number }; // the user's usual move, when this one differs
  offUsual: boolean;
  better: boolean;
  bad: boolean;
}

/** The node's moves with this game left out of the counts, most played first. */
function otherGames(node: RepNode | undefined, uci: string, thisGame: 0 | 1) {
  const edges = (node?.edges ?? []).map((e) => ({ ...e, count: e.count - (e.uci === uci ? thisGame : 0) })).filter((e) => e.count > 0);
  return edges.sort((a, b) => b.count - a.count);
}

/** The user's usual move here (played at least twice in other games) when this game's move differs. */
export function usualMove(node: RepNode | undefined, uci: string, thisGame: 0 | 1) {
  const top = otherGames(node, uci, thisGame)[0];
  return top && top.uci !== uci && top.count >= 2 ? { uci: top.uci, san: top.san, count: top.count } : undefined;
}

/** Everything worth saying about one move of the game, most important first. */
export function moveNotes(i: MoveNoteInput): MoveNotes {
  const mine = i.mover === i.me;
  const notes: MoveNote[] = [];
  const edges = otherGames(i.node, i.uci, i.thisGame);
  const reached = (i.node?.count ?? 0) - i.thisGame;
  const edge = edges.find((e) => e.uci === i.uci);
  const top = edges[0];
  const bookList = i.bookSans.length ? ` Book: ${i.bookSans.slice(0, 4).join(", ")}.` : "";
  const bad = mine && !!i.verdict && BAD_VERDICTS.includes(i.verdict);
  const usual = mine ? usualMove(i.node, i.uci, i.thisGame) : undefined;
  const best = i.before?.lines[0];
  const afterLine = i.after?.lines[0];
  const better = mine && !bad && betterMoveAvailable({ timesPlayed: edge?.count ?? 0, verdict: i.verdict, best, after: afterLine, playedUci: i.uci, me: i.me });

  if (i.leftBook) {
    notes.push(
      mine
        ? { kind: "left-book", tone: "bad", title: "You left the book", text: `${i.san} is not in the named book here.${bookList}` }
        : { kind: "opp-left-book", tone: "warn", title: "Your opponent left the book", text: `${i.san} is not in the named book here.${bookList}` },
    );
  }
  if (bad) {
    const lost = best && afterLine ? povPawns(best, i.me) - povPawns(afterLine, i.me) : undefined;
    notes.push({
      kind: "bad",
      tone: "bad",
      title: `${i.verdict![0].toUpperCase()}${i.verdict!.slice(1)}`,
      text: `${i.san}${edge ? ` (you have played it ${edge.count}× here before)` : ""}.${i.bestSan ? ` Best was ${i.bestSan}` : ""}${lost !== undefined && best!.mate === undefined && afterLine!.mate === undefined ? `, ${lost.toFixed(2)} pawns better` : ""}.`,
    });
  }
  if (usual) {
    const u = i.usualAfter?.lines[0];
    notes.push({
      kind: "off-usual",
      tone: "warn",
      title: "Not your usual move",
      text: `You usually play ${usual.san} here (${usual.count}×); you played ${i.san}${edge ? ` (${edge.count}× before)` : ", for the first time"}.${u && afterLine ? ` ${compareText(afterLine, u, i.me, i.san, `your usual ${usual.san}`)}` : ""}`,
    });
  }
  if (better && best && afterLine) {
    notes.push({
      kind: "better",
      tone: "accent",
      title: "Better move available",
      text: `You have played ${i.san} here ${edge!.count}× and it is ${i.verdict}, but ${i.bestSan ?? best.pv[0]} is stronger: ${povText(best, i.me)} vs ${povText(afterLine, i.me)}.`,
    });
  }
  if (!i.node || reached <= 0) {
    notes.push({ kind: "unreached", tone: "info", title: "New position", text: "Your other games never reached this position." });
  } else if (mine && !edge && !usual) {
    notes.push({ kind: "new-move", tone: "info", title: "New move", text: `You never played ${i.san} here before (position reached in ${reached} other games).` });
  } else if (!mine && !edge) {
    notes.push({
      kind: "opp-new",
      tone: "warn",
      title: "A surprise",
      text: `Your opponents never played ${i.san} here${top ? `; they usually play ${top.san} (${pct(top.count, reached)}%)` : ""}.`,
    });
  } else if (!mine && edge) {
    notes.push({ kind: "opp-known", tone: "info", title: "Seen before", text: `Your opponents chose ${i.san} ${edge.count}× here (${pct(edge.count, reached)}%).` });
  }
  return { notes, usual, offUsual: !!usual, better, bad };
}
