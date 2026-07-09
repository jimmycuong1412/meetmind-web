import { describe, it, expect } from "vitest";
import { TranscriptStore } from "../src/pipeline/transcriptStore";

const seg = (text: string) => ({ text, isFinal: true, timestamp: 0 });

describe("TranscriptStore", () => {
  it("accumulates only final segments into fullText", () => {
    const store = new TranscriptStore();
    store.append(seg("Hello."));
    store.append({ text: "partial…", isFinal: false, timestamp: 0 });
    store.append(seg("World."));
    expect(store.fullText()).toBe("Hello. World.");
  });

  it("returns null from consumeTickWindow when nothing new arrived", () => {
    const store = new TranscriptStore();
    expect(store.consumeTickWindow(1000)).toBeNull();
    store.append(seg("First."));
    expect(store.consumeTickWindow(1000)).toBe("First.");
    // No new final text since last consume:
    expect(store.consumeTickWindow(1000)).toBeNull();
  });

  it("returns a window again once new text arrives", () => {
    const store = new TranscriptStore();
    store.append(seg("First."));
    store.consumeTickWindow(1000);
    store.append(seg("Second."));
    expect(store.consumeTickWindow(1000)).toBe("First. Second.");
  });

  it("caps the window at maxChars, keeping the most recent text", () => {
    const store = new TranscriptStore();
    store.append(seg("A".repeat(50)));
    store.append(seg("B".repeat(50)));
    const window = store.consumeTickWindow(60);
    expect(window).not.toBeNull();
    expect(window!.length).toBeLessThanOrEqual(60);
    expect(window!.endsWith("B".repeat(50))).toBe(true);
  });
});
