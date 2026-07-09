import { sendToBackground, type AppMessage, type SessionState } from "../shared/messages";
import { isWebGpuAvailable } from "../shared/webgpu";
import type { Insight } from "../pipeline/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stateBadge = $<HTMLSpanElement>("state-badge");
const btnStart = $<HTMLButtonElement>("btn-start");
const btnStop = $<HTMLButtonElement>("btn-stop");
const chkMic = $<HTMLInputElement>("chk-mic");
const download = $<HTMLDivElement>("download");
const downloadLabel = $<HTMLParagraphElement>("download-label");
const downloadBar = $<HTMLProgressElement>("download-bar");
const insightsEl = $<HTMLDivElement>("insights");
const transcriptEl = $<HTMLDivElement>("transcript");
const btnCopy = $<HTMLButtonElement>("btn-copy");
const btnDownload = $<HTMLButtonElement>("btn-download");
const errorEl = $<HTMLParagraphElement>("error");

const finalLines: string[] = [];
let partialLine = "";

init();

async function init(): Promise<void> {
  if (!(await isWebGpuAvailable())) {
    $<HTMLElement>("screen-unsupported").hidden = false;
    return;
  }
  $<HTMLElement>("screen-main").hidden = false;

  const stored = await chrome.storage.local.get({ micEnabled: false, tickIntervalSeconds: 60 });
  chkMic.checked = (stored.micEnabled as boolean) ?? false;
  const selInterval = $<HTMLSelectElement>("sel-interval");
  selInterval.value = String((stored.tickIntervalSeconds as number) ?? 60);
  // Applies at the next session start (the controller reads it in start()).
  selInterval.onchange = () =>
    chrome.storage.local.set({ tickIntervalSeconds: Number(selInterval.value) });

  btnStart.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return showError("No active tab to capture.");
    errorEl.hidden = true;
    await sendToBackground({
      target: "background",
      type: "START_SESSION",
      tabId: tab.id,
      micEnabled: chkMic.checked,
    });
  };
  btnStop.onclick = () => sendToBackground({ target: "background", type: "STOP_SESSION" });
  chkMic.onchange = async () => {
    await chrome.storage.local.set({ micEnabled: chkMic.checked });
    await sendToBackground({ target: "background", type: "SET_MIC_ENABLED", enabled: chkMic.checked });
  };
  btnCopy.onclick = () => navigator.clipboard.writeText(fullTranscript());
  btnDownload.onclick = () => {
    const blob = new Blob([fullTranscript()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meetmind-transcript-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

chrome.runtime.onMessage.addListener((msg: AppMessage) => {
  if (msg.target !== "sidepanel") return;
  switch (msg.type) {
    case "SESSION_STATE":
      applyState(msg.state);
      break;
    case "DOWNLOAD_PROGRESS":
      download.hidden = false;
      downloadLabel.textContent = `Downloading ${msg.file}…`;
      downloadBar.value = msg.total > 0 ? (msg.received / msg.total) * 100 : 0;
      break;
    case "SEGMENT":
      if (msg.segment.isFinal) {
        finalLines.push(msg.segment.text);
        partialLine = "";
      } else {
        partialLine = msg.segment.text;
      }
      renderTranscript();
      break;
    case "INSIGHT":
      renderInsight(msg.insight);
      break;
    case "FATAL_ERROR":
      showError(`${msg.code}: ${msg.detail}`);
      applyState("idle");
      break;
  }
});

function applyState(state: SessionState): void {
  stateBadge.textContent = state;
  stateBadge.className = `badge ${state === "recording" ? "recording" : ""}`;
  btnStart.hidden = state === "recording" || state === "downloading" || state === "loading";
  btnStop.hidden = !btnStart.hidden;
  if (state === "recording" || state === "stopped") download.hidden = true;
  const hasContent = finalLines.length > 0;
  btnCopy.disabled = !hasContent;
  btnDownload.disabled = !hasContent;
}

function renderTranscript(): void {
  transcriptEl.textContent = finalLines.join("\n");
  if (partialLine !== "") {
    const span = document.createElement("span");
    span.className = "partial";
    span.textContent = (finalLines.length ? "\n" : "") + partialLine;
    transcriptEl.append(span);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  btnCopy.disabled = finalLines.length === 0;
  btnDownload.disabled = finalLines.length === 0;
}

function renderInsight(insight: Insight): void {
  const card = document.createElement("div");
  card.className = "card";
  const h = document.createElement("h3");
  h.textContent = insight.title;
  const p = document.createElement("p");
  p.textContent = insight.summary;
  card.append(h, p);
  if (insight.actionItems.length > 0) {
    const ul = document.createElement("ul");
    for (const item of insight.actionItems) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.append(li);
    }
    card.append(ul);
  }
  insightsEl.prepend(card); // newest first
}

function fullTranscript(): string {
  return finalLines.join("\n");
}

function showError(text: string): void {
  errorEl.textContent = text;
  errorEl.hidden = false;
}
