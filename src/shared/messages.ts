import type { TranscriptSegment, Insight } from "../pipeline/types";

export type SessionState = "idle" | "downloading" | "loading" | "recording" | "stopped";
export type FatalCode = "WEBGPU_UNSUPPORTED" | "CAPTURE_FAILED" | "DOWNLOAD_FAILED" | "ENGINE_FAILED";

export interface StateSnapshot {
  state: SessionState;
  transcript: string;
  insights: Insight[];
}

export type AppMessage =
  // side panel → background
  | { target: "background"; type: "START_SESSION"; tabId: number; micEnabled: boolean }
  | { target: "background"; type: "STOP_SESSION" }
  | { target: "background"; type: "SET_MIC_ENABLED"; enabled: boolean }
  // background → offscreen
  | { target: "offscreen"; type: "OFFSCREEN_START_CAPTURE"; streamId: string; micEnabled: boolean }
  | { target: "offscreen"; type: "OFFSCREEN_STOP_CAPTURE" }
  | { target: "offscreen"; type: "OFFSCREEN_SET_MIC"; enabled: boolean }
  | { target: "offscreen"; type: "REQUEST_STATE" }
  // offscreen → side panel (state + data)
  | { target: "sidepanel"; type: "SEGMENT"; segment: TranscriptSegment }
  | { target: "sidepanel"; type: "INSIGHT"; insight: Insight }
  | { target: "sidepanel"; type: "SESSION_STATE"; state: SessionState }
  | { target: "sidepanel"; type: "SESSION_RESET" }
  | { target: "sidepanel"; type: "DOWNLOAD_PROGRESS"; file: string; received: number; total: number }
  | { target: "sidepanel"; type: "FATAL_ERROR"; code: FatalCode; detail: string };

export function sendToBackground(msg: Extract<AppMessage, { target: "background" }>): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}
export function sendToOffscreen(msg: Extract<AppMessage, { target: "offscreen" }>): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}
export function sendToSidepanel(msg: Extract<AppMessage, { target: "sidepanel" }>): Promise<unknown> {
  // Side panel may be closed; a rejected sendMessage is expected and harmless.
  return chrome.runtime.sendMessage(msg).catch(() => undefined);
}
