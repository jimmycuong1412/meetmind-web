import { sendToBackground } from "../shared/messages";

const btn = document.createElement("button");
btn.textContent = "Start (dev)";
btn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await sendToBackground({ target: "background", type: "START_SESSION", tabId: tab.id, micEnabled: false });
};
document.body.append(btn);
