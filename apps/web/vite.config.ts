import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";

// COOP/COEP make the page cross-origin isolated, which multi-threaded
// Stockfish builds need (SharedArrayBuffer). PoC P5 checks it from a remote browser.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 7444),
    strictPort: true,
    headers: isolationHeaders,
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8080" },
  },
  // Old Android WebViews run the bundled app (a OnePlus 8 Pro on Android 11 had Chrome 90; stock
  // Android 11 ships 83): newer syntax is compiled down for them.
  build: { target: ["chrome80", "edge88", "firefox78", "safari14"] },
  worker: { format: "es" },
});
