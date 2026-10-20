// Client for the PoC API: account, saved games, shared eval cache.
import { getToken } from "./auth";
import { standardEval } from "./evalCache";
import type { PosEval, RawGame } from "@outofbook/core/types";

export const authHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  try {
    const dev = localStorage.getItem("devUser"); // PoC testing only; ignored unless the API runs with DEV_AUTH=1
    if (dev) h["X-Dev-User"] = dev;
  } catch {
    /* ignore */
  }
  return h;
};

/** A Lichess login (or the PoC dev user): the server will know who we are. */
export const hasAuth = () => {
  const h = authHeaders();
  return !!(h.Authorization || h["X-Dev-User"]);
};

export interface Me {
  username: string;
  unlimited: boolean;
  savedGames: number;
  limit: number | null;
}

export async function me(): Promise<Me | null> {
  const r = await fetch("/api/me", { headers: authHeaders() }).catch(() => null);
  return r?.ok ? r.json() : null;
}

export async function saveGames(games: RawGame[]): Promise<{ saved: number } | { error: string }> {
  const r = await fetch("/api/games", { method: "PUT", headers: authHeaders(), body: JSON.stringify(games) });
  return r.json();
}

export async function loadSavedGames(): Promise<RawGame[]> {
  const r = await fetch("/api/games", { headers: authHeaders() });
  return r.ok ? r.json() : [];
}

export async function serverEvals(keys: string[], minDepth: number): Promise<Record<string, PosEval>> {
  const out: Record<string, PosEval> = {};
  for (let i = 0; i < keys.length; i += 1000) {
    const r = await fetch("/api/evals/get", { method: "POST", headers: authHeaders(), body: JSON.stringify({ keys: keys.slice(i, i + 1000), minDepth }) }).catch(() => null);
    if (r?.ok) for (const [k, e] of Object.entries((await r.json()) as Record<string, PosEval>)) out[k] = standardEval(k, e);
  }
  return out;
}

// Writes are batched and flushed every few seconds.
let queue: { key: string; eval: PosEval }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
export function shareEval(key: string, e: PosEval, canWrite: boolean) {
  if (!canWrite) return;
  queue.push({ key, eval: e });
  if (!timer)
    timer = setTimeout(async () => {
      const batch = queue;
      queue = [];
      timer = null;
      await fetch("/api/evals/put", { method: "POST", headers: authHeaders(), body: JSON.stringify(batch) }).catch(() => {});
    }, 3000);
}
