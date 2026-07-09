import { sendToOffscreen, sendToSidepanel, type AppMessage } from "../shared/messages";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

const OFFSCREEN_URL = "src/offscreen/index.html";

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture tab audio and run on-device STT/LLM inference.",
  });
}

chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
  if (msg.target !== "background") return;
  handle(msg).then(
    () => sendResponse({ ok: true }),
    (err) => {
      console.error("background handler failed:", err);
      sendToSidepanel({
        target: "sidepanel",
        type: "FATAL_ERROR",
        code: "CAPTURE_FAILED",
        detail: String(err),
      });
      sendResponse({ ok: false, error: String(err) });
    },
  );
  return true; // async response
});

async function handle(msg: Extract<AppMessage, { target: "background" }>): Promise<void> {
  switch (msg.type) {
    case "START_SESSION": {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId });
      await ensureOffscreenDocument();
      await sendToOffscreen({
        target: "offscreen",
        type: "OFFSCREEN_START_CAPTURE",
        streamId,
        micEnabled: msg.micEnabled,
      });
      break;
    }
    case "STOP_SESSION":
      await sendToOffscreen({ target: "offscreen", type: "OFFSCREEN_STOP_CAPTURE" });
      break;
    case "SET_MIC_ENABLED":
      await sendToOffscreen({ target: "offscreen", type: "OFFSCREEN_SET_MIC", enabled: msg.enabled });
      break;
  }
}
