import { describe, it, expect } from "vitest";
import { planDownload, type ModelFile } from "../src/engines/downloadPlanner";

const files: ModelFile[] = [
  { url: "https://x/encoder.onnx", name: "encoder.onnx", sizeBytes: 1000 },
  { url: "https://x/tokens.txt", name: "tokens.txt", sizeBytes: 100 },
];

describe("planDownload", () => {
  it("fetches everything when nothing exists", () => {
    const plan = planDownload(files, new Map());
    expect(plan.toFetch).toEqual([
      { file: files[0], resumeFrom: 0 },
      { file: files[1], resumeFrom: 0 },
    ]);
    expect(plan.totalBytes).toBe(1100);
    expect(plan.alreadyBytes).toBe(0);
  });

  it("skips complete files", () => {
    const plan = planDownload(files, new Map([["tokens.txt", 100]]));
    expect(plan.toFetch.map((f) => f.file.name)).toEqual(["encoder.onnx"]);
    expect(plan.alreadyComplete.map((f) => f.name)).toEqual(["tokens.txt"]);
    expect(plan.alreadyBytes).toBe(100);
  });

  it("resumes partial files from their current size", () => {
    const plan = planDownload(files, new Map([["encoder.onnx", 400]]));
    expect(plan.toFetch[0]).toEqual({ file: files[0], resumeFrom: 400 });
    expect(plan.alreadyBytes).toBe(400);
  });

  it("re-downloads files larger than expected (corrupt/stale)", () => {
    const plan = planDownload(files, new Map([["encoder.onnx", 5000]]));
    expect(plan.toFetch[0]).toEqual({ file: files[0], resumeFrom: 0 });
    expect(plan.alreadyBytes).toBe(0);
  });
});
