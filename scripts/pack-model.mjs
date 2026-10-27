// Packs a Meshy model for Chess Legions (packages/legions/models/): merges clips
// from other files of the same rig into it (each named on the command line),
// welds and dedups, and shrinks the textures to 1K WebP (14 MB to about 2 MB).
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp@0.34
//   node scripts/pack-model.mjs merged_animations.glb out.glb Walking=Animation_Walking_withSkin.glb Idle=Animation_Idle_withSkin.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, textureCompress, weld } from "@gltf-transform/functions";
import sharp from "sharp";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [base, out, ...extras] = process.argv.slice(2);
const doc = await io.read(base);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const copy = (acc) => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(root.listBuffers()[0]);
for (const extra of extras) {
  const [name, file] = extra.split("=");
  for (const a of (await io.read(file)).getRoot().listAnimations()) {
    const anim = doc.createAnimation(name);
    for (const ch of a.listChannels()) {
      const target = byName.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
}
await doc.transform(resample(), dedup(), weld(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }), prune());
await io.write(out, doc);
console.log(
  out,
  root
    .listAnimations()
    .map((a) => a.getName())
    .join(", "),
);
