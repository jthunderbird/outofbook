import { buildRepertoire, type BuildOptions } from "@outofbook/core/repertoire";
import type { RawGame } from "@outofbook/core/types";

self.onmessage = (ev: MessageEvent<{ games: RawGame[]; opts: BuildOptions }>) => {
  const model = buildRepertoire(ev.data.games, ev.data.opts);
  (self as unknown as Worker).postMessage(model);
};
