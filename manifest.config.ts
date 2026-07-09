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
  // sherpa/* are the vendored sherpa-onnx WASM glue (.js) and runtime (.wasm),
  // loaded inside the STT worker via importScripts(chrome.runtime.getURL(...)).
  // No web_accessible_resources entry is needed for either: both loaders run
  // inside same-extension-origin contexts (the offscreen document and the
  // classic STT worker), which are not gated by web_accessible_resources —
  // that gate only applies to foreign-origin (web page) requests. An entry
  // here would only expose these files to other origins, so it's omitted.
});
