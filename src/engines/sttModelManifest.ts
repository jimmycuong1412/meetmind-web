import type { ModelFile } from "./downloadPlanner";

const HF = "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main";

// Byte sizes verified via HEAD requests on 2026-07-09 (Task 7, Step 0). The
// download planner uses them for resume and progress computation, so they MUST
// match the actual files served by Hugging Face.
export const STT_MODEL_FILES: ModelFile[] = [
  {
    url: `${HF}/encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx`,
    name: "stt-encoder.onnx",
    sizeBytes: 71083163,
  },
  {
    url: `${HF}/decoder-epoch-99-avg-1-chunk-16-left-128.onnx`,
    name: "stt-decoder.onnx",
    sizeBytes: 2092621,
  },
  {
    url: `${HF}/joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx`,
    name: "stt-joiner.onnx",
    sizeBytes: 259335,
  },
  {
    url: `${HF}/tokens.txt`,
    name: "stt-tokens.txt",
    sizeBytes: 5048,
  },
];
