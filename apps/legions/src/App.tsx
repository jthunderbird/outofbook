// Chess Legions: one screen at a time over a moving background (the equipped
// one's colors). The game screen has the 3D scene's own background.
import { useState } from "react";
import { court } from "@outofbook/legions/courts";
import { useProfile } from "./profile";
import { Home } from "./screens/Home";
import { Campaign } from "./screens/Campaign";
import { QuickPlay } from "./screens/QuickPlay";
import { Game, type GameSetup } from "./screens/Game";
import { Collection } from "./screens/Collection";
import { Settings } from "./screens/Settings";
import { Trek } from "./screens/Trek";
import { PuzzleRun } from "./screens/PuzzleRun";

export type Screen =
  | { name: "home" }
  | { name: "campaign" }
  | { name: "quick" }
  | { name: "collection" }
  | { name: "settings" }
  | { name: "game"; setup: GameSetup }
  | { name: "trek" }
  | { name: "puzzle"; challenge: string; nonce: number };

export function App() {
  const [screen, go] = useState<Screen>({ name: "home" });
  const p = useProfile();
  const bg = court(p.equipped.court);
  return (
    <>
      <div className="scene" style={{ ["--bg-top" as string]: bg.top, ["--bg-bottom" as string]: bg.bottom }} />
      {screen.name === "home" && <Home go={go} />}
      {screen.name === "campaign" && <Campaign go={go} />}
      {screen.name === "quick" && <QuickPlay go={go} />}
      {screen.name === "collection" && <Collection go={go} />}
      {screen.name === "settings" && <Settings go={go} />}
      {screen.name === "game" && <Game key={screen.setup.nonce} setup={screen.setup} go={go} />}
      {screen.name === "trek" && <Trek go={go} />}
      {screen.name === "puzzle" && <PuzzleRun key={screen.nonce} id={screen.challenge} go={go} />}
    </>
  );
}
