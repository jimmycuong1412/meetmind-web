import { AudioCapture } from "./audioCapture";
import { sendToSidepanel, type AppMessage } from "../shared/messages";

const capture = new AudioCapture();
let chunkCount = 0; // dev logging; the STT worker replaces onPcm in Task 7

chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  handle(msg).then(
    () => sendResponse({ ok: true }),
    (err) => {
      console.error("offscreen handler failed:", err);
      sendToSidepanel({
        target: "sidepanel",
        type: "FATAL_ERROR",
        code: "CAPTURE_FAILED",
        detail: String(err),
      });
      sendResponse({ ok: false, error: String(err) });
    },
  );
  return true;
});

async function handle(msg: Extract<AppMessage, { target: "offscreen" }>): Promise<void> {
  switch (msg.type) {
    case "OFFSCREEN_START_CAPTURE":
      await capture.start(
        msg.streamId,
        msg.micEnabled,
        (samples) => {
          if (++chunkCount % 25 === 0) console.log(`pcm chunks: ${chunkCount}`);
        },
        () => {
          capture.stop();
          sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "stopped" });
        },
      );
      sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "recording" });
      break;
    case "OFFSCREEN_STOP_CAPTURE":
      capture.stop();
      sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "stopped" });
      break;
    case "OFFSCREEN_SET_MIC":
      await capture.setMicEnabled(msg.enabled);
      break;
  }
}
