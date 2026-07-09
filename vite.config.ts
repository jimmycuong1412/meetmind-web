import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        offscreen: "src/offscreen/index.html",
        "pcm-chunker": "src/offscreen/pcm-chunker.ts",
      },
      output: {
        // Keep the worklet's emitted filename stable/predictable so it can be
        // referenced at runtime via chrome.runtime.getURL(...).
        entryFileNames: (chunk) => (chunk.name === "pcm-chunker" ? "pcm-chunker.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});
