// Classic worker (importScripts) because the sherpa-onnx Emscripten glue is not
// an ES module — it defines globals (`Module`, `createOnlineRecognizer`) and
// self-executes `run()` on load.
//
// Messages in:  { type: "INIT", files: { name: string; data: Uint8Array }[] }
//               { type: "PCM", samples: Float32Array }
//               { type: "DISPOSE" }
// Messages out: { type: "READY" }
//               { type: "SEGMENT", text: string, isFinal: boolean, timestamp: number }
//               { type: "ERROR", detail: string }
//
// --- ADAPTATIONS vs the historical brief (verified against the vendored glue,
//     sherpa-onnx v1.13.4; line numbers refer to public/sherpa/sherpa-onnx-asr.js) ---
// 1. Two glue scripts are imported: sherpa-onnx-wasm-main-asr.js (the Emscripten
//    module) and sherpa-onnx-asr.js (defines createOnlineRecognizer + the
//    OnlineRecognizer/OnlineStream classes).
// 2. The vendored release embeds a 190 MB model in a `.data` package. We do NOT
//    ship it. Module.getPreloadedPackage returns an empty buffer so the loader
//    skips the network fetch; the empty placeholder files it writes
//    (/encoder.onnx, …) are never referenced — we point the recognizer at our
//    own /stt-*.onnx files written from OPFS.
// 3. Emscripten init is async: the recognizer is created inside
//    Module.onRuntimeInitialized, not synchronously after importScripts.
// 4. Module config (locateFile, getPreloadedPackage, onRuntimeInitialized) must
//    be assigned to a global `Module` object BEFORE importScripts, because the
//    glue self-executes run() on load.
// 5. createOnlineRecognizer(Module, myConfig) — line 584 — uses `myConfig`
//    verbatim when provided (lines 675-677). getResult() returns parsed JSON
//    with a `.text` field (lines 1994-2002).

/// <reference lib="webworker" />

declare function importScripts(...urls: string[]): void;

interface EmscriptenFS {
  writeFile(path: string, data: Uint8Array): void;
}
interface EmscriptenModule {
  FS: EmscriptenFS;
  locateFile?: (path: string, scriptDirectory?: string) => string;
  getPreloadedPackage?: (name: string, size: number) => ArrayBuffer;
  onRuntimeInitialized?: () => void;
  [key: string]: unknown;
}

interface SherpaResult {
  text: string;
  tokens?: string[];
}
interface SherpaStream {
  // OnlineStream.acceptWaveform(sampleRate, samples) — glue line 1905.
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
}
interface SherpaRecognizer {
  createStream(): SherpaStream; // line 1971
  isReady(s: SherpaStream): boolean; // line 1976
  decode(s: SherpaStream): void; // line 1981
  isEndpoint(s: SherpaStream): boolean; // line 1985
  reset(s: SherpaStream): void; // line 1990
  getResult(s: SherpaStream): SherpaResult; // line 1994
}
// createOnlineRecognizer comes from the vendored sherpa glue (line 584).
declare function createOnlineRecognizer(
  module: EmscriptenModule,
  config: unknown,
): SherpaRecognizer;

// The glue reads the global `Module`. We must populate it before importScripts.
declare let Module: EmscriptenModule;

const SAMPLE_RATE = 16000;

let recognizer: SherpaRecognizer | null = null;
let stream: SherpaStream | null = null;
let lastText = "";

// Base URL of the vendored glue, so the Emscripten runtime can locate the .wasm.
const sherpaBase = chrome.runtime.getURL("sherpa/");

function initRecognizer(files: { name: string; data: Uint8Array }[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Configure the Emscripten Module BEFORE loading the glue (it self-runs).
    // FS is attached by the glue at runtime, so the initial literal omits it and
    // we cast through `unknown` — this is the sanctioned loose Emscripten seam.
    const mod = {
      // Resolve .wasm (and .data, which we intercept) relative to the vendored dir.
      locateFile: (path: string) => sherpaBase + path,
      // Skip the 190 MB embedded-model .data fetch — supply an empty package.
      // The loader writes empty placeholder files we never reference.
      getPreloadedPackage: () => new ArrayBuffer(0),
      onRuntimeInitialized: () => {
        try {
          for (const f of files) mod.FS.writeFile(`/${f.name}`, f.data);
          recognizer = createOnlineRecognizer(mod, {
            featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
            modelConfig: {
              transducer: {
                encoder: "/stt-encoder.onnx",
                decoder: "/stt-decoder.onnx",
                joiner: "/stt-joiner.onnx",
              },
              tokens: "/stt-tokens.txt",
              numThreads: 1,
              provider: "cpu",
              // English BPE zipformer — not the cjkchar default in the glue sample.
              modelingUnit: "bpe",
              debug: 0,
            },
            decodingMethod: "greedy_search",
            enableEndpoint: 1,
            // Endpoint tuning ported from the Android app's VAD experience:
            // trailing silence ends an utterance.
            rule1MinTrailingSilence: 2.4,
            rule2MinTrailingSilence: 1.2,
            rule3MinUtteranceLength: 20,
          });
          stream = recognizer.createStream();
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    } as unknown as EmscriptenModule;
    (self as unknown as { Module: EmscriptenModule }).Module = mod;
    Module = mod;
    try {
      importScripts(sherpaBase + "sherpa-onnx-asr.js");
      importScripts(sherpaBase + "sherpa-onnx-wasm-main-asr.js");
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

interface InitMessage {
  type: "INIT";
  files: { name: string; data: Uint8Array }[];
}
interface PcmMessage {
  type: "PCM";
  samples: Float32Array;
}
interface DisposeMessage {
  type: "DISPOSE";
}
type InMessage = InitMessage | PcmMessage | DisposeMessage;

self.onmessage = (e: MessageEvent<InMessage>): void => {
  const msg = e.data;
  try {
    if (msg.type === "INIT") {
      initRecognizer(msg.files).then(
        () => self.postMessage({ type: "READY" }),
        (err: unknown) => self.postMessage({ type: "ERROR", detail: String(err) }),
      );
    } else if (msg.type === "PCM" && recognizer && stream) {
      stream.acceptWaveform(SAMPLE_RATE, msg.samples);
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      const text = recognizer.getResult(stream).text.trim();
      if (text !== "" && text !== lastText) {
        lastText = text;
        self.postMessage({ type: "SEGMENT", text, isFinal: false, timestamp: Date.now() });
      }
      if (recognizer.isEndpoint(stream)) {
        if (text !== "") {
          self.postMessage({ type: "SEGMENT", text, isFinal: true, timestamp: Date.now() });
        }
        recognizer.reset(stream);
        lastText = "";
      }
    } else if (msg.type === "DISPOSE") {
      self.close();
    }
  } catch (err) {
    self.postMessage({ type: "ERROR", detail: String(err) });
  }
};
