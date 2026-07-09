import { CreateWebWorkerMLCEngine, type MLCEngineInterface } from "@mlc-ai/web-llm";
import { SHORT_MEETING_PROMPT } from "../shared/prompt";

// Verified against the installed @mlc-ai/web-llm@0.2.84 prebuiltAppConfig in
// Task 8 Step 0 (2026-07-09): "gemma3-1b-it-q4f16_1-MLC" is the smallest
// current-generation Gemma instruct model (>=1B) in the catalog
// (711 MB VRAM, low_resource_required, 4096 context window). Update if the
// catalog moves in a later @mlc-ai/web-llm upgrade.
const MODEL_ID = "gemma3-1b-it-q4f16_1-MLC";

export interface InsightEngine {
  init(onProgress: (text: string) => void): Promise<void>;
  generateInsight(context: string): Promise<string>;
  dispose(): void;
}

export class WebLlmInsightEngine implements InsightEngine {
  private engine: MLCEngineInterface | null = null;

  async init(onProgress: (text: string) => void): Promise<void> {
    this.engine = await CreateWebWorkerMLCEngine(
      new Worker(new URL("../workers/llm-worker.ts", import.meta.url), { type: "module" }),
      MODEL_ID,
      { initProgressCallback: (p) => onProgress(p.text) },
    );
  }

  async generateInsight(context: string): Promise<string> {
    if (!this.engine) throw new Error("InsightEngine not initialized");
    const res = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: SHORT_MEETING_PROMPT },
        { role: "user", content: context },
      ],
      temperature: 0.7,
      max_tokens: 512,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  dispose(): void {
    this.engine?.unload();
    this.engine = null;
  }
}
