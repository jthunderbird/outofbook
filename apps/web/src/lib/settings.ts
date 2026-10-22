import type { Verdict } from "@outofbook/core/types";
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
}

export const DEFAULTS: Settings = {
  depth: 14,
  poolSize: 0, // 0 = auto
  engineBuild: "lite",
  reviewDepth: 18,
  reviewLines: 5,
  useCloud: true,
  cloudMaxPly: 14,
  pliesAfterBook: 10,
  treeMaxPly: 30,
  minGames: 5,
  whoCaresVerdicts: ["splendid", "perfect", "best", "excellent"],
  whoCaresMinMove: 5,
  claudeKey: "",
};

// Bump when a default changes so saved settings pick it up.
const VERSION = 3;

export const loadSettings = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem("settings") ?? "{}");
    // Version 2 had no engine fields: keep its values, the new fields take their defaults.
    if (saved.version !== VERSION && saved.version !== 2) return DEFAULTS;
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
