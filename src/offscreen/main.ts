import { SessionController } from "./session";
import { sendToSidepanel, type AppMessage } from "../shared/messages";
import { DownloadError } from "../engines/opfsDownloader";

const session = new SessionController();

chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "OFFSCREEN_START_CAPTURE") {
    // First-run model download can take minutes; ack immediately so the
    // sender's sendMessage() promise doesn't hang, and run the session
    // detached with its own error reporting.
    sendResponse({ ok: true });
    session.start(msg.streamId, msg.micEnabled).catch((err: unknown) => {
      console.error("offscreen handler failed:", err);
      sendToSidepanel({
        target: "sidepanel",
        type: "FATAL_ERROR",
        code: fatalCodeFor(err),
        detail: String(err),
      });
    });
    return undefined;
  }

  if (msg.type === "REQUEST_STATE") {
    sendResponse(session.snapshot());
    return undefined;
  }

  handle(msg).then(
    () => sendResponse({ ok: true }),
    (err) => {
      console.error("offscreen handler failed:", err);
      sendToSidepanel({
        target: "sidepanel",
        type: "FATAL_ERROR",
        code: fatalCodeFor(err),
        detail: String(err),
      });
      sendResponse({ ok: false, error: String(err) });
    },
  );
  return true;
});

function fatalCodeFor(err: unknown): "DOWNLOAD_FAILED" | "ENGINE_FAILED" {
  return err instanceof DownloadError ? "DOWNLOAD_FAILED" : "ENGINE_FAILED";
}

async function handle(msg: Extract<AppMessage, { target: "offscreen" }>): Promise<void> {
  switch (msg.type) {
    case "OFFSCREEN_STOP_CAPTURE":
      session.stop();
      break;
    case "OFFSCREEN_SET_MIC":
      await session.setMicEnabled(msg.enabled);
      break;
  }
}
