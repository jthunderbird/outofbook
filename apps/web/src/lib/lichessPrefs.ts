// The user's own Lichess preferences (GET /api/account/preferences, scope
// preference:read), so our boards behave like their Lichess board. Cached in
// localStorage; bot play reads the cache too.
const KEY = "lichessPrefs";

/** The subset of Lichess prefs we follow (numbers as in the Lichess API). */
export interface LichessPrefs {
  autoQueen: 1 | 2 | 3; // 1 never, 2 when premoving, 3 always
  premove: boolean;
  clockTenths: 0 | 1 | 2; // 0 never, 1 below 10 s, 2 always
  clockSound: boolean; // low-time warning
  soundSet: string; // standard, piano, nes, sfx, futuristic, robot, silent, music, speech
  animation: 0 | 1 | 2 | 3; // none, fast, normal, slow
  highlight: boolean; // last move and check
  destination: boolean; // legal move dots
  coords: 0 | 1 | 2 | 3; // none, inside, outside, all squares
  rookCastle: 0 | 1; // 1: castle by moving the king onto the rook
  moveEvent: 0 | 1 | 2; // 0 click, 1 drag, 2 both
  confirmResign: 0 | 1;
  ratings: 0 | 1 | 2; // 0 hide, 1 show, 2 hide during games
  pieceSet: string; // cburnett, merida, alpha...
  theme: string; // the 2D board: brown, blue, wood...; OutOfBook's board setting decides whether it is used
}

/** Lichess's own defaults, used until the user's prefs are loaded. */
export const LICHESS_DEFAULTS: LichessPrefs = {
  autoQueen: 2,
  premove: true,
  clockTenths: 1,
  clockSound: true,
  soundSet: "standard",
  animation: 2,
  highlight: true,
  destination: true,
  coords: 1,
  rookCastle: 1,
  moveEvent: 2,
  confirmResign: 1,
  ratings: 1,
  pieceSet: "cburnett",
  theme: "brown",
};

export const ANIMATION_MS = [0, 120, 250, 500];

export function cachedPrefs(): LichessPrefs | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return p ? { ...LICHESS_DEFAULTS, ...p } : null;
  } catch {
    return null;
  }
}

/** Fetches and caches the prefs; resolves null without the preference:read scope. */
export async function loadPrefs(token: string): Promise<LichessPrefs | null> {
  try {
    const r = await fetch("https://lichess.org/api/account/preferences", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const all = (await r.json()).prefs as Record<string, unknown>;
    const p = Object.fromEntries(
      Object.keys(LICHESS_DEFAULTS)
        .filter((k) => k in all)
        .map((k) => [k, all[k]]),
    );
    const prefs = { ...LICHESS_DEFAULTS, ...p } as LichessPrefs;
    localStorage.setItem(KEY, JSON.stringify(prefs));
    return prefs;
  } catch {
    return null;
  }
}

export const clearPrefs = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
};
