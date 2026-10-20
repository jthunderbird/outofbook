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
  worker: { format: "es" },
});
