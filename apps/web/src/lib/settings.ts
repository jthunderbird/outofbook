import type { Verdict } from "@outofbook/core/types";
import type { BoardChoice } from "./boardLook";
import type { EngineBuild } from "./engine";
import { IS_CAPACITOR } from "./platform";

export interface Settings {
  depth: number;
  poolSize: number;
  engineBuild: EngineBuild; // lite or full Stockfish 18, for all analysis
  reviewDepth: number; // the review page's live engine; 0 = until stopped
  reviewLines: number;
  useCloud: boolean;
  cloudMaxPly: number;
  pliesAfterBook: number;
  treeMaxPly: number;
  minGames: number;
  whoCaresVerdicts: Verdict[];
  whoCaresMinMove: number; // earliest move number that counts for "Book? Who cares"
  claudeKey: string;
  board: BoardChoice; // every board's look
  arena: boolean; // bot and Lichess games on the 3D Arena board
}

export const DEFAULTS: Settings = {
  depth: 14,
  poolSize: 0, // 0 = auto
  engineBuild: "lite",
  reviewDepth: 14,
  reviewLines: 5,
  useCloud: true,
  cloudMaxPly: 14,
  pliesAfterBook: 10,
  treeMaxPly: 30,
  minGames: 5,
  whoCaresVerdicts: ["splendid", "perfect", "best", "excellent"],
  whoCaresMinMove: 5,
  claudeKey: "",
  board: "lichess",
  arena: false,
};

// Bump when a default changes so saved settings pick it up.
const VERSION = 4;

export const loadSettings = (): Settings => {
  try {
    let saved = JSON.parse(localStorage.getItem("settings") ?? "{}");
    // Version 2 had no engine fields: keep its values, the new fields take their defaults.
    if (saved.version !== VERSION && saved.version !== 2 && saved.version !== 3) saved = {};
    // Version 3 defaulted the review to depth 18, too slow on phones: 14 now.
    if (saved.version !== VERSION && saved.reviewDepth === 18) saved.reviewDepth = 14;
    // The board was a Lichess-screen setting before it became the app's.
    if (saved.board === undefined) {
      const old = JSON.parse(localStorage.getItem("liveSettings") ?? "{}").board;
      if (old === "arena") saved.arena = true;
      else if (typeof old === "string") saved.board = old;
    }
    // The bundled Android app ships only the lite engine (the full one is 113 MB).
    return { ...DEFAULTS, ...saved, ...(IS_CAPACITOR ? { engineBuild: "lite" } : {}) };
  } catch {
    return DEFAULTS;
  }
};
export const saveSettings = (s: Settings) => {
  try {
    localStorage.setItem("settings", JSON.stringify({ ...s, version: VERSION }));
  } catch {
    /* private mode */
  }
};
