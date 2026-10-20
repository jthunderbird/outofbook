// Settled design (PoC round 5): AI dark glow, command bar layout with the board
// docked right, GitHub dark/light. The only choice left is dark or light; the
// glow and the theme colours are CSS (src/styles.css) keyed on html[data-mode].
// Earlier galleries are archived in poc/archive/.
import { createContext, useContext } from "react";

export type Mode = "dark" | "light";

export const MODES: [Mode, string][] = [
  ["dark", "Dark"],
  ["light", "Light"],
];

export interface Design {
  mode: Mode;
}

export const DEFAULT_DESIGN: Design = { mode: "dark" };

export function applyDesign(d: Design) {
  const el = document.documentElement;
  el.dataset.mode = d.mode;
  el.style.colorScheme = d.mode;
}

export const loadDesign = (): Design => {
  try {
    const d = JSON.parse(localStorage.getItem("design4") ?? "{}");
    return { mode: d.mode === "light" ? "light" : "dark" };
  } catch {
    return DEFAULT_DESIGN;
  }
};
export const saveDesign = (d: Design) => {
  try {
    localStorage.setItem("design4", JSON.stringify(d));
  } catch {
    /* private mode */
  }
};

export const DesignContext = createContext<{ design: Design; setDesign: (d: Partial<Design>) => void }>({ design: DEFAULT_DESIGN, setDesign: () => {} });
export const useDesign = () => useContext(DesignContext);
