import type { TranscriptSegment } from "./types";

export class TranscriptStore {
  private finalTexts: string[] = [];
  private consumedCount = 0;

  append(segment: TranscriptSegment): void {
    if (!segment.isFinal || segment.text.trim() === "") return;
    this.finalTexts.push(segment.text.trim());
  }

  fullText(): string {
    return this.finalTexts.join(" ");
  }

  /** Returns the most recent transcript slice (≤ maxChars), or null if no new
   *  final text arrived since the last successful consume. */
  consumeTickWindow(maxChars: number): string | null {
    if (this.finalTexts.length === this.consumedCount) return null;
    this.consumedCount = this.finalTexts.length;
    const full = this.fullText();
    return full.length <= maxChars ? full : full.slice(full.length - maxChars);
  }
}
