import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import App from "./App";
import { applyDesign, DesignContext, loadDesign, saveDesign, type Design } from "./design/design";
import { IS_CAPACITOR, IS_TWA } from "./lib/platform";

function Root() {
  const [design, set] = useState<Design>(loadDesign);
  useLayoutEffect(() => applyDesign(design), [design]);
  const setDesign = (d: Partial<Design>) =>
    set((cur) => {
      const n = { ...cur, ...d };
      saveDesign(n);
      return n;
    });
  return (
    <DesignContext.Provider value={{ design, setDesign }}>
      <App />
    </DesignContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);

// Offline support on the website and in the Play app (the bundled app has its files already).
// The Play app (TWA) also downloads the engine and Maia right away, so the bot works with no connection.
if (import.meta.env.PROD && !IS_CAPACITOR && "serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => IS_TWA && reg.active?.postMessage({ type: "precache" }))
    .catch(() => {});
