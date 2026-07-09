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
});
