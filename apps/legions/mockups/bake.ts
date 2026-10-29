// The tool behind scripts/bake-wake.mjs, not a page to play: it builds The Wake with
// recording on and hands the baked pieces (geometry, scene graphs, textures) to the script.
import { LegionsScene } from "@outofbook/legions/scene";
import { finishRecording, startRecording } from "@outofbook/legions/wakeBake";

startRecording();
const s = new LegionsScene(document.getElementById("stage")!);
s.setCourt("wake");

/** The recorded pack as plain data: the index, the geometry binary in base64 chunks, each texture as a WebP data URL. */
async function collect() {
  const { index, bin, canvases } = finishRecording();
  const chunks: string[] = [];
  const step = 3 * 1024 * 1024;
  for (let i = 0; i < bin.length; i += step) {
    let str = "";
    const part = bin.subarray(i, Math.min(bin.length, i + step));
    for (let j = 0; j < part.length; j += 0x8000) str += String.fromCharCode(...part.subarray(j, j + 0x8000));
    chunks.push(btoa(str));
  }
  const textures: Record<string, string> = {};
  for (const [key, img] of Object.entries(canvases)) {
    const c = img as HTMLCanvasElement;
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    out.getContext("2d")!.drawImage(c, 0, 0);
    textures[key] = out.toDataURL("image/webp", 0.9);
  }
  return { index, chunks, textures };
}
(window as unknown as { collect: typeof collect }).collect = collect;
