// The built repertoire model, kept so a reload does not rebuild it (hybrid
// PoC): the browser keeps the latest one in IndexedDB; the server keeps each
// user's, so a new device or a cleared browser gets it without building.
// Both are keyed by a hash of the games and the build settings.
import { kvGet, kvSet } from "./evalCache";
import { authHeaders, hasAuth } from "./server";
import type { RawGame, RepertoireModel } from "@outofbook/core/types";

/** Bump when buildRepertoire's output changes, so stored models are rebuilt. */
const MODEL_VERSION = 1;

export async function modelHash(games: RawGame[], opts: { pliesAfterBook: number; treeMaxPly: number }) {
  const text = [MODEL_VERSION, opts.pliesAfterBook, opts.treeMaxPly, ...games.map((g) => g.id)].join("|");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function localModel(hash: string) {
  const m = await kvGet<{ hash: string; model: RepertoireModel }>("model").catch(() => undefined);
  return m?.hash === hash ? m.model : null;
}
export const saveLocalModel = (hash: string, model: RepertoireModel) => kvSet("model", { hash, model }).catch(() => {});

export async function serverModel(hash: string): Promise<RepertoireModel | null> {
  if (!hasAuth()) return null;
  const r = await fetch(`/api/model?hash=${hash}`, { headers: authHeaders() }).catch(() => null);
  return r?.ok ? r.json() : null;
}

/** Gzipped in the browser (about 10× smaller), stored by the server as is. */
export async function saveServerModel(hash: string, model: RepertoireModel) {
  if (!hasAuth()) return;
  const gz = await new Response(new Blob([JSON.stringify(model)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  await fetch(`/api/model?hash=${hash}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/gzip" }, body: gz }).catch(() => {});
}
