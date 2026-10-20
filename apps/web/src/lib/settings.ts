import type { Verdict } from "@outofbook/core/types";

export interface Settings {
  depth: number;
  poolSize: number;
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
const VERSION = 2;

export const loadSettings = (): Settings => {
  try {
    const saved = JSON.parse(localStorage.getItem("settings") ?? "{}");
    if (saved.version !== VERSION) return DEFAULTS;
    return { ...DEFAULTS, ...saved };
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
