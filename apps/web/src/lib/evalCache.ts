// Position eval cache in IndexedDB (stand-in for the shared server cache), plus
// the Lichess cloud-eval lookup.
import { openDB } from "idb";
import { standardPv } from "@outofbook/core/chess";
import { hasAuth, serverEvals, shareEval } from "./server";
import type { PosEval } from "@outofbook/core/types";

/** Castling in the standard form, also for evals cached before that was done. */
export const standardEval = (fen: string, e: PosEval): PosEval => ({ ...e, lines: e.lines.map((l) => ({ ...l, pv: standardPv(fen, l.pv) })) });

let dbp: ReturnType<typeof openDB> | undefined;
const db = () =>
  (dbp ??= openDB("outofbook", 1, {
    upgrade(d) {
      d.createObjectStore("evals");
      d.createObjectStore("kv");
    },
  }));

export const getEval = async (key: string, minDepth: number): Promise<PosEval | undefined> => {
  const e = (await (await db()).get("evals", key)) as PosEval | undefined;
  return e && e.depth >= minDepth && e.lines.length ? standardEval(key, { ...e, source: "cache" }) : undefined;
};
/** Many positions in one IndexedDB read (getAll): about 45 ms for 2,800 evals, against about 1 s one by one. */
export async function getEvals(keys: string[], minDepth: number): Promise<Map<string, PosEval>> {
  const d = await db();
  const tx = d.transaction("evals");
  const [allKeys, all] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
  const want = new Set(keys);
  const out = new Map<string, PosEval>();
  allKeys.forEach((k, i) => {
    const e = all[i] as PosEval;
    if (want.has(k as string) && e.depth >= minDepth && e.lines.length) out.set(k as string, standardEval(k as string, { ...e, source: "cache" }));
  });
  return out;
}
/** Many evals in one IndexedDB transaction (one by one, 2,800 writes took about 6 s). */
export async function putEvals(entries: [string, PosEval][]) {
  const tx = (await db()).transaction("evals", "readwrite");
  for (const [k, e] of entries) tx.store.put(e, k);
  await tx.done;
}
export const putEval = async (key: string, e: PosEval) => (await db()).put("evals", e, key);
export const countEvals = async () => (await db()).count("evals");
export const clearEvals = async () => (await db()).clear("evals");
export const kvGet = async <T>(k: string) => (await (await db()).get("kv", k)) as T | undefined;
export const kvSet = async (k: string, v: unknown) => (await db()).put("kv", v, k);

let cloudPausedUntil = 0;
export async function cloudEval(fen: string, multiPv = 2): Promise<PosEval | undefined | "busy"> {
  if (Date.now() < cloudPausedUntil) return "busy";
  const r = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`);
  if (r.status === 429) {
    cloudPausedUntil = Date.now() + 60_000;
    return "busy";
  }
  if (!r.ok) return undefined;
  const j = await r.json();
  const lines = (j.pvs as { moves: string; cp?: number; mate?: number }[]).map((p) => ({
    cp: p.cp,
    mate: p.mate,
    pv: standardPv(fen, p.moves.split(" ")),
  }));
  return { lines, depth: j.depth, source: "cloud" };
}

/** One position, now: cache, then cloud, then the given engine pool. */
export async function evalNow(
  fen: string,
  depth: number,
  multiPv: number,
  engine: (fen: string, depth: number, multiPv: number) => Promise<PosEval>,
  minLines = Math.min(multiPv, 2),
  cloud = true, // false: skip the Lichess cloud (it only knows common positions)
): Promise<PosEval> {
  const key = fen.split(" ").slice(0, 4).join(" ");
  const cached = await getEval(key, depth);
  if (cached && cached.lines.length >= minLines) return cached;
  // Then our server's shared cache, then Lichess's cloud, then the engine; new evals are shared back.
  const shared = (await serverEvals([key], depth))[key];
  if (shared && shared.lines.length >= minLines) {
    await putEval(key, shared);
    return shared;
  }
  const c = cloud ? await cloudEval(fen, multiPv).catch(() => undefined) : undefined;
  if (c && c !== "busy" && c.lines.length >= minLines) {
    await putEval(key, c);
    shareEval(key, c, hasAuth());
    return c;
  }
  const e = await engine(fen, depth, multiPv);
  await putEval(key, e);
  shareEval(key, e, hasAuth());
  return e;
}
