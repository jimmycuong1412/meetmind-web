import { SessionController } from "./session";
import { sendToSidepanel, type AppMessage } from "../shared/messages";

const session = new SessionController();

chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  handle(msg).then(
    () => sendResponse({ ok: true }),
    (err) => {
      console.error("offscreen handler failed:", err);
      sendToSidepanel({
        target: "sidepanel",
        type: "FATAL_ERROR",
        code: "ENGINE_FAILED",
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
      await session.start(msg.streamId, msg.micEnabled);
      break;
    case "OFFSCREEN_STOP_CAPTURE":
      session.stop();
      break;
    case "OFFSCREEN_SET_MIC":
      await session.setMicEnabled(msg.enabled);
      break;
  }
}
