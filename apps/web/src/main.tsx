import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import App from "./App";
import { applyDesign, DesignContext, loadDesign, saveDesign, type Design } from "./design/design";

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
