import { AudioCapture } from "./audioCapture";
import { SherpaSttEngine } from "../engines/sttEngine";
import { sendToSidepanel, type AppMessage } from "../shared/messages";

const capture = new AudioCapture();
const stt = new SherpaSttEngine();

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
      sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "downloading" });
      await stt.init((received, total, file) =>
        sendToSidepanel({ target: "sidepanel", type: "DOWNLOAD_PROGRESS", file, received, total }),
      );
      stt.onSegment = (segment) =>
        sendToSidepanel({ target: "sidepanel", type: "SEGMENT", segment });
      await capture.start(
        msg.streamId,
        msg.micEnabled,
        (samples) => stt.acceptPcm(samples),
        () => {
          capture.stop();
          stt.dispose();
          sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "stopped" });
        },
      );
      sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "recording" });
      break;
    case "OFFSCREEN_STOP_CAPTURE":
      capture.stop();
      stt.dispose();
      sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state: "stopped" });
      break;
    case "OFFSCREEN_SET_MIC":
      await capture.setMicEnabled(msg.enabled);
      break;
  }
}
