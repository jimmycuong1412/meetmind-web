import type { TranscriptSegment } from "../pipeline/types";
import { planDownload } from "./downloadPlanner";
import { OpfsDownloader } from "./opfsDownloader";
import { STT_MODEL_FILES } from "./sttModelManifest";

export interface SttEngine {
  init(onProgress: (received: number, total: number, file: string) => void): Promise<void>;
  acceptPcm(samples: Float32Array): void;
  onSegment: (segment: TranscriptSegment) => void;
  dispose(): void;
}

export class SherpaSttEngine implements SttEngine {
  onSegment: (segment: TranscriptSegment) => void = () => {};
  private worker: Worker | null = null;

  async init(
    onProgress: (received: number, total: number, file: string) => void,
  ): Promise<void> {
    const downloader = new OpfsDownloader();
    const names = STT_MODEL_FILES.map((f) => f.name);
    const plan = planDownload(STT_MODEL_FILES, await downloader.existingSizes(names));
    await downloader.download(plan, onProgress);

    const files = await Promise.all(
      STT_MODEL_FILES.map(async (f) => ({ name: f.name, data: await downloader.readFile(f.name) })),
    );

    // Classic worker: the sherpa Emscripten glue is loaded via importScripts,
    // which module workers do not support.
    this.worker = new Worker(new URL("../workers/stt-worker.ts", import.meta.url), {
      type: "classic",
    });

    const ready = new Promise<void>((resolve, reject) => {
      this.worker!.onmessage = (e: MessageEvent) => {
        if (e.data.type === "READY") resolve();
        else if (e.data.type === "ERROR") reject(new Error(e.data.detail));
      };
    });

    // Transfer the model buffers into the worker (zero-copy).
    this.worker.postMessage(
      { type: "INIT", files },
      files.map((f) => f.data.buffer),
    );
    await ready;

    this.worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "SEGMENT") {
        this.onSegment({
          text: e.data.text,
          isFinal: e.data.isFinal,
          timestamp: e.data.timestamp,
        });
      } else if (e.data.type === "ERROR") {
        console.error("stt worker error:", e.data.detail);
      }
    };
  }

  acceptPcm(samples: Float32Array): void {
    // Transfer the PCM buffer (zero-copy). AudioCapture emits a fresh
    // Float32Array per chunk, so it is safe to neuter it here.
    this.worker?.postMessage({ type: "PCM", samples }, [samples.buffer]);
  }

  dispose(): void {
    this.worker?.postMessage({ type: "DISPOSE" });
    this.worker?.terminate();
    this.worker = null;
  }
}
