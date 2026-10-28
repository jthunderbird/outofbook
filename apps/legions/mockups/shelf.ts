// Stills for the Collection's shelves, rendered in the game's own scene:
// ?tribe=<id> stands the whole tribe together on a clear background (a cutout
// to stand on a shelf); ?court=<id> shows a court from a steep angle, tall, with
// a little of its scenery. window.shelfReady turns true when everything has
// loaded; advance(ms) steps time for capture under software rendering.
import { Color, type Object3D, type Scene } from "three";
import type { Role } from "@outofbook/legions/figures";
import { LegionsScene } from "@outofbook/legions/scene";
import { tribe } from "@outofbook/legions/tribes";

const q = new URLSearchParams(location.search);
const tribeId = q.get("tribe");
const courtId = q.get("court");
// A finish or a color: a few of the Staunton set's pieces wearing it, both sides.
const lookId = q.get("finish") ?? q.get("color");
const look = !lookId ? null : lookId === "original" ? {} : q.get("finish") ? { finish: lookId } : { color: lookId };
const s = new LegionsScene(document.getElementById("stage")!);
// The scene's insides, for a cutout: no board, no labels, no sky.
const inner = s as unknown as { scene: Scene; board: { group: Object3D }; labels: Object3D };

const drawing = q.get("drawing");
if (drawing) {
  // A pencil drawing of one of the game's characters on paper ("stormcourt:k"), for the Sketch court's desk.
  const [tid, role] = drawing.split(":");
  const t = tribe(tid);
  await t.ready?.();
  s.setTribes({ w: t, b: t });
  s.setPosition("8/8/8/8/8/8/8/8 w - - 0 1");
  const f = t.figure(role as Role, "w");
  f.root.rotation.y = 0.5;
  s.addFigure(f);
  s.setMode("sketch");
  s.setShowcase({ pos: [0, 1.3, 4.2], target: [0, 0.85, 0], fov: 34 });
  inner.scene.background = new Color(0xf4efe2);
  inner.board.group.visible = false;
  inner.labels.visible = false;
} else if (tribeId || look) {
  const t = tribe(tribeId ?? "staunton");
  await t.ready?.();
  s.setTribes({ w: t, b: t });
  // The key light over the viewer's shoulder, not behind the tribe.
  s.setOrientation("b");
  if (look) s.setLooks({ w: look, b: look });
  s.setPosition(look ? "8/8/8/8/8/8/8/2NQKbqk w - - 0 1" : "8/8/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1");
  // Seen from the far side, so the tribe faces the viewer, pawns in front of the taller pieces.
  s.setShowcase({ pos: [0, 3.4, -5.2], target: [0, 0.75, 4], fov: 30 });
  inner.scene.background = null;
  inner.board.group.visible = false;
  inner.labels.visible = false;
} else {
  s.setGlow(true);
  s.setCourt(courtId ?? "staunton");
  // Steep and tall: the whole board, angled up toward the viewer, a little scenery beyond.
  s.setShowcase({ pos: [0, 12, 8.6], target: [0, 0, -1.2], fov: 52 });
}
await new Promise((r) => setTimeout(r, 1500));
(window as unknown as { shelfReady: boolean }).shelfReady = true;
(window as unknown as { advance: (ms: number) => void }).advance = (ms: number) => {
  s.manual = true;
  for (let t = 0; t < ms; t += 150) s.step(150);
};
