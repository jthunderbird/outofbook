// Chess Legions: one screen at a time over a moving background (the equipped
// one's colors). The game screen has the 3D scene's own background.
import { useState } from "react";
import { BACKGROUNDS } from "@outofbook/legions/backgrounds";
import { useProfile } from "./profile";
import { Home } from "./screens/Home";
import { Campaign } from "./screens/Campaign";
import { QuickPlay } from "./screens/QuickPlay";
import { Game, type GameSetup } from "./screens/Game";
import { Collection } from "./screens/Collection";
import { Settings } from "./screens/Settings";

export type Screen = { name: "home" } | { name: "campaign" } | { name: "quick" } | { name: "collection" } | { name: "settings" } | { name: "game"; setup: GameSetup };

export function App() {
  const [screen, go] = useState<Screen>({ name: "home" });
  const p = useProfile();
  const bg = BACKGROUNDS.find((b) => b.id === p.equipped.background) ?? BACKGROUNDS[0];
  return (
    <>
      <div className="scene" style={{ ["--bg-top" as string]: bg.top, ["--bg-bottom" as string]: bg.bottom }} />
      {screen.name === "home" && <Home go={go} />}
      {screen.name === "campaign" && <Campaign go={go} />}
      {screen.name === "quick" && <QuickPlay go={go} />}
      {screen.name === "collection" && <Collection go={go} />}
      {screen.name === "settings" && <Settings go={go} />}
      {screen.name === "game" && <Game key={screen.setup.nonce} setup={screen.setup} go={go} />}
    </>
  );
}
