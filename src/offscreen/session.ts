import { AudioCapture } from "./audioCapture";
import { TranscriptStore } from "../pipeline/transcriptStore";
import { TickScheduler } from "../pipeline/tickScheduler";
import { parseInsight } from "../pipeline/insightParser";
import { SherpaSttEngine } from "../engines/sttEngine";
import { WebLlmInsightEngine } from "../engines/insightEngine";
import { sendToSidepanel, type SessionState } from "../shared/messages";
import type { Insight } from "../pipeline/types";

const DEFAULT_TICK_INTERVAL_S = 60;
const CONTEXT_WINDOW_CHARS = 6_000;

export class SessionController {
  private capture = new AudioCapture();
  private stt = new SherpaSttEngine();
  private llm = new WebLlmInsightEngine();
  private store = new TranscriptStore();
  private scheduler: TickScheduler | null = null;
  private running = false;
  private state: SessionState = "idle";
  private insights: Insight[] = [];

  async start(streamId: string, micEnabled: boolean): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.store = new TranscriptStore();
    this.insights = [];

    sendToSidepanel({ target: "sidepanel", type: "SESSION_RESET" });

    const { tickIntervalSeconds } = await chrome.storage.local.get<{
      tickIntervalSeconds: number;
    }>({
      tickIntervalSeconds: DEFAULT_TICK_INTERVAL_S,
    });
    const scheduler = new TickScheduler(tickIntervalSeconds * 1000, () => this.tick());
    this.scheduler = scheduler;

    this.setState("downloading");
    await this.stt.init((received, total, file) =>
      sendToSidepanel({ target: "sidepanel", type: "DOWNLOAD_PROGRESS", file, received, total }),
    );

    this.setState("loading");
    await this.llm.init(() => {});

    this.stt.onSegment = (segment) => {
      this.store.append(segment);
      sendToSidepanel({ target: "sidepanel", type: "SEGMENT", segment });
    };

    await this.capture.start(
      streamId,
      micEnabled,
      (samples) => this.stt.acceptPcm(samples),
      () => this.handleStreamEnded(),
    );

    scheduler.start();
    this.setState("recording");
  }

  private async tick(): Promise<void> {
    const window = this.store.consumeTickWindow(CONTEXT_WINDOW_CHARS);
    if (window === null) return; // no new final text since last tick
    const raw = await this.llm.generateInsight(window);
    const parsed = parseInsight(raw);
    const insight: Insight = { ...parsed, createdAt: Date.now() };
    this.insights.push(insight);
    sendToSidepanel({
      target: "sidepanel",
      type: "INSIGHT",
      insight,
    });
  }

  private handleStreamEnded(): void {
    // Meeting tab closed / capture ended: finalize gracefully, keep panel content.
    this.stop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.scheduler?.stop();
    this.scheduler = null;
    this.capture.stop();
    this.stt.dispose();
    this.llm.dispose();
    this.setState("stopped");
  }

  setMicEnabled(enabled: boolean): Promise<void> {
    return this.capture.setMicEnabled(enabled);
  }

  snapshot(): { state: SessionState; transcript: string; insights: Insight[] } {
    return { state: this.state, transcript: this.store.fullText(), insights: [...this.insights] };
  }

  private setState(state: SessionState): void {
    this.state = state;
    sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state });
  }
}
