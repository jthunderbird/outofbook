import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Chess Legions. The engine and model files come from OutOfBook's public folder
// (filled by scripts/fetch-assets.mjs) through the symlinks in public/. COOP/COEP
// make the page cross-origin isolated, as onnxruntime's threads need.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// The public copy (outofbook.net/legions, behind SWAG) sets BASE=/legions/, PLAIN_HTTP=1 (SWAG speaks the
// TLS) and PUBLIC_HOST=outofbook.net; the local one (7445) sets none of them.
const publicHost = process.env.PUBLIC_HOST;

export default defineConfig({
  base: process.env.BASE ?? "/",
  plugins: [react(), ...(process.env.PLAIN_HTTP ? [] : [basicSsl()])],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 7445),
    strictPort: true,
    ...(publicHost ? { allowedHosts: [publicHost], hmr: { protocol: "wss", clientPort: 443 } } : {}),
    headers: isolationHeaders,
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8080" },
  },
  preview: { headers: isolationHeaders },
  build: { target: ["chrome80", "edge88", "firefox78", "safari14"] },
  worker: { format: "es" },
});
