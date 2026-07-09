import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "MeetMind Web",
  version: "0.1.0",
  minimum_chrome_version: "124",
  icons: { "128": "icons/icon128.png" },
  action: { default_title: "MeetMind Web" },
  permissions: ["tabCapture", "sidePanel", "offscreen", "storage", "tabs"],
  background: { service_worker: "src/background/index.ts", type: "module" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  // pcm-chunker.js is loaded at runtime via chrome.runtime.getURL() by
  // AudioContext.audioWorklet.addModule() (see src/offscreen/audioCapture.ts).
  // It is built as its own emitted asset (vite.config.ts) rather than an
  // `import.meta.url`-relative worklet import, which Vite/CRXJS inlines as an
  // unusable base64 data: URI of untranspiled TypeScript.
  // sherpa/* are the vendored sherpa-onnx WASM glue (.js) and runtime (.wasm),
  // loaded inside the STT worker via importScripts(chrome.runtime.getURL(...)).
  // A worker in the extension origin still needs these listed as
  // web-accessible for chrome.runtime.getURL() to resolve them.
  web_accessible_resources: [
    { resources: ["pcm-chunker.js", "sherpa/*"], matches: ["<all_urls>"] },
  ],
});
