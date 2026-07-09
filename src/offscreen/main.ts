import type { AppMessage } from "../shared/messages";

chrome.runtime.onMessage.addListener((msg: AppMessage) => {
  if (msg.target !== "offscreen") return;
  console.log("offscreen received:", msg.type);
});
