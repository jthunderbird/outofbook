// The Wake built from the ground up: only the ground and the board so far, no pieces.
import { LegionsScene } from "@outofbook/legions/scene";

const s = new LegionsScene(document.getElementById("stage")!);
s.setGlow(true);
s.setCourt("wake");
s.setPosition("8/8/8/8/8/8/8/8 w - - 0 1");
