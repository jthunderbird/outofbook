// Move verdicts, following Chesskit's moveClassification.ts (GPL-3.0): basic classes
// by win-percentage loss, plus "perfect" (only good move / outcome-changing) and
// "splendid" (sound piece sacrifice).
import { isPieceSacrifice, isSimplePieceRecapture, lineWinPct } from "./chess";
import type { PosEval, Verdict } from "./types";

export interface ClassifyInput {
  fenBefore: string;
  played: string;
  before: PosEval; // MultiPV >= 2 for perfect/splendid
  after: PosEval;
  prevFen?: string;
  prevUci?: string;
  legalCount?: number;
}

export function classify({ fenBefore, played, before, after, prevFen, prevUci, legalCount }: ClassifyInput): Verdict {
  if (legalCount === 1) return "forced";
  const white = fenBefore.split(" ")[1] === "w";
  const sign = white ? 1 : -1;
  const wpBefore = lineWinPct(before.lines[0]);
  const wpAfter = lineWinPct(after.lines[0]);
  const diff = (wpAfter - wpBefore) * sign;
  const alt = before.lines.find((l) => l.pv[0] !== played);
  const wpAlt = alt ? lineWinPct(alt) : undefined;

  const losingOrAltWinning = () => wpAlt === undefined || (white ? wpAfter < 50 : wpAfter > 50) || (white ? wpAlt > 97 : wpAlt < 3);

  if (wpAlt !== undefined && diff >= -2 && isPieceSacrifice(fenBefore, played, after.lines[0].pv) && !losingOrAltWinning()) return "splendid";

  if (wpAlt !== undefined && diff >= -2 && !losingOrAltWinning()) {
    const recapture = prevFen && prevUci ? isSimplePieceRecapture(prevFen, [prevUci, played]) : false;
    if (!recapture) {
      const changedOutcome = diff > 10 && ((wpBefore < 50 && wpAfter > 50) || (wpBefore > 50 && wpAfter < 50));
      const onlyGood = (wpAfter - wpAlt) * sign > 10;
      if (changedOutcome || onlyGood) return "perfect";
    }
  }

  if (before.lines[0].pv[0] === played) return "best";
  if (diff < -20) return "blunder";
  if (diff < -10) return "mistake";
  if (diff < -5) return "inaccuracy";
  if (diff < -2) return "okay";
  return "excellent";
}
