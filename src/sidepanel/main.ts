import { sendToBackground, type AppMessage, type SessionState, type StateSnapshot } from "../shared/messages";
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
// Partial hypotheses arrive several times a second; only this element is
// rewritten for them, final lines are appended once as their own nodes.
const partialEl = document.createElement("div");
partialEl.className = "line partial";
transcriptEl.append(partialEl);
// How close (px) to the bottom still counts as "following" the live transcript.
const FOLLOW_THRESHOLD_PX = 24;

init();

async function init(): Promise<void> {
  if (!(await isWebGpuAvailable())) {
    $<HTMLElement>("screen-unsupported").hidden = false;
    return;
  }
  $<HTMLElement>("screen-main").hidden = false;

  const stored = await chrome.storage.local.get<{ micEnabled: boolean; tickIntervalSeconds: number }>({
    micEnabled: false,
    tickIntervalSeconds: 60,
  });
  chkMic.checked = stored.micEnabled;
  const selInterval = $<HTMLSelectElement>("sel-interval");
  selInterval.value = String(stored.tickIntervalSeconds);
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

  // Panel may have opened mid-session (e.g. reopened while recording); ask
  // the offscreen document for its current state so the UI can catch up.
  try {
    const snap = (await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "REQUEST_STATE",
    })) as StateSnapshot | undefined;
    // chrome.runtime.sendMessage also resolves undefined when no listener
    // answered (e.g. no offscreen document yet) → treat as idle.
    if (snap !== undefined && snap.state !== "idle") {
      finalLines.length = 0;
      if (snap.transcript) finalLines.push(snap.transcript);
      partialLine = "";
      renderTranscript();
      insightsEl.replaceChildren();
      for (const insight of snap.insights) renderInsight(insight);
      applyState(snap.state);
    }
  } catch {
    // No offscreen document yet → stay idle.
  }
}

chrome.runtime.onMessage.addListener((msg: AppMessage) => {
  if (msg.target !== "sidepanel") return;
  switch (msg.type) {
    case "SESSION_STATE":
      applyState(msg.state);
      break;
    case "SESSION_RESET":
      finalLines.length = 0;
      partialLine = "";
      insightsEl.replaceChildren();
      renderTranscript();
      errorEl.hidden = true;
      break;
    case "DOWNLOAD_PROGRESS":
      download.hidden = false;
      downloadLabel.textContent = `Downloading ${msg.file}…`;
      downloadBar.value = msg.total > 0 ? (msg.received / msg.total) * 100 : 0;
      break;
    case "SEGMENT":
      updateTranscript(() => {
        if (msg.segment.isFinal) {
          finalLines.push(msg.segment.text);
          partialLine = "";
          partialEl.before(lineEl(msg.segment.text));
        } else {
          partialLine = msg.segment.text;
        }
        partialEl.textContent = partialLine;
      });
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

/** Rebuilds the transcript pane from `finalLines` + `partialLine`. */
function renderTranscript(): void {
  updateTranscript(() => {
    partialEl.textContent = partialLine;
    transcriptEl.replaceChildren(...finalLines.map(lineEl), partialEl);
  });
}

/**
 * Applies `mutate` to the transcript pane, keeping it scrolled to the newest
 * line only if the user was already at the bottom — so scrolling up to read
 * earlier lines isn't yanked back down by every incoming segment.
 */
function updateTranscript(mutate: () => void): void {
  const el = transcriptEl;
  const following = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
  mutate();
  if (following) el.scrollTop = el.scrollHeight;
  btnCopy.disabled = finalLines.length === 0;
  btnDownload.disabled = finalLines.length === 0;
}

function lineEl(text: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "line";
  div.textContent = text;
  return div;
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
