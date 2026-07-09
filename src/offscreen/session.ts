import { AudioCapture } from "./audioCapture";
import { TranscriptStore } from "../pipeline/transcriptStore";
import { TickScheduler } from "../pipeline/tickScheduler";
import { parseInsight } from "../pipeline/insightParser";
import { SherpaSttEngine } from "../engines/sttEngine";
import { WebLlmInsightEngine } from "../engines/insightEngine";
import { sendToSidepanel, type SessionState, type StateSnapshot } from "../shared/messages";
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

    // Invariant: stop() may run during any await in start(); every await is
    // followed by a `running` re-check that disposes anything the continuing
    // start() acquired after stop() already cleaned up, then bails out.
    const { tickIntervalSeconds } = await chrome.storage.local.get<{
      tickIntervalSeconds: number;
    }>({
      tickIntervalSeconds: DEFAULT_TICK_INTERVAL_S,
    });
    if (!this.running) return; // nothing acquired yet

    const scheduler = new TickScheduler(tickIntervalSeconds * 1000, () => this.tick());
    this.scheduler = scheduler;

    this.setState("downloading");
    await this.stt.init((received, total, file) =>
      sendToSidepanel({ target: "sidepanel", type: "DOWNLOAD_PROGRESS", file, received, total }),
    );
    if (!this.running) {
      // stop() disposed the STT engine mid-init; the now-completed init may
      // have re-acquired resources after that dispose, so dispose again.
      this.stt.dispose();
      return;
    }

    this.setState("loading");
    await this.llm.init(() => {});
    if (!this.running) {
      // stop() disposed the LLM mid-init; the now-completed init re-created
      // the engine, so dispose it. stt finished init before this await and
      // was fully disposed by stop() — nothing re-created it since.
      this.llm.dispose();
      return;
    }

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
    // Final check immediately before scheduler.start(): stop() nulled
    // this.scheduler, so starting the local `scheduler` would orphan its
    // interval and leave the session unstoppable (running is already false).
    if (!this.running) {
      // stop() called capture.stop() mid-start; the now-completed start may
      // have re-acquired tracks/audio context after that, so stop it again.
      // Both engines were disposed by stop() and not re-created since their
      // checks above.
      this.capture.stop();
      return;
    }

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

  snapshot(): StateSnapshot {
    return { state: this.state, transcript: this.store.fullText(), insights: [...this.insights] };
  }

  private setState(state: SessionState): void {
    this.state = state;
    sendToSidepanel({ target: "sidepanel", type: "SESSION_STATE", state });
  }
}
