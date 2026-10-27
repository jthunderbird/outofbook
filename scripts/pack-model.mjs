// Packs a Meshy model for Chess Legions (packages/legions/models/): merges the
// clips of a second file (the rig's walk) into the animated model, and shrinks
// its textures to 1K WebP (14 MB to about 2 MB).
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp@0.34
//   node scripts/pack-model.mjs merged_animations.glb Animation_Walking_withSkin.glb out.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, textureCompress, resample, weld } from "@gltf-transform/functions";
import sharp from "sharp";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [base, extra, out] = process.argv.slice(2);
const doc = await io.read(base);
const walk = await io.read(extra);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
for (const a of walk.getRoot().listAnimations()) {
  const anim = doc.createAnimation("Walking");
  for (const ch of a.listChannels()) {
    const s = ch.getSampler();
    const target = byName.get(ch.getTargetNode().getName());
    if (!target) continue;
    const copy = (acc) => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(root.listBuffers()[0]);
    const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
await doc.transform(resample(), dedup(), weld(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }), prune());
await io.write(out, doc);
console.log(
  root
    .listAnimations()
    .map((a) => `${a.getName()} ${a.listChannels().length}ch`)
    .join(", "),
);
