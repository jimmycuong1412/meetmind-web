# MeetMind Web

MeetMind Web is a Chrome extension (Manifest V3) that turns any browser-based meeting
into a live, on-device transcript with periodic AI-generated insight cards — titles,
summaries, and action items — without sending any audio or text to a server. Speech
recognition and language-model inference both run locally in the browser, using WASM
and WebGPU respectively, so nothing about the meeting ever leaves the machine. It is
the browser-based sibling of [MeetMind Assistant](https://github.com/jimmycuong1412/meetmind-assistant),
an Android app that does the same on-device transcription-and-insight pipeline as a
native app; the two projects share the same meeting-analysis prompt and the same
insight-parsing logic, ported line-for-line between Kotlin and TypeScript.

## Requirements

- Chrome ≥ 124 (Manifest V3 side panel API, offscreen documents).
- A WebGPU-capable GPU. The extension checks for WebGPU on startup and refuses to
  start capture if it isn't available — see "Failure modes" in
  `docs/MANUAL_TESTS.md`.
- Roughly 1 GB of free disk: the extension downloads a ~70 MB speech-recognition
  model on first use (cached in OPFS) and WebLLM separately caches several hundred
  MB of language-model weights on its own first run.

## Dev setup

```bash
npm install
npm run build   # tsc type-check, then vite build into dist/
npm test        # vitest run — unit tests for the parser, scheduler, and download planner
```

To load the extension in Chrome: open `chrome://extensions`, enable **Developer
mode**, click **Load unpacked**, and select the `dist/` directory produced by
`npm run build`. Rebuild and reload the extension after any source change — there
is no dev-server hot reload for the MV3 background/offscreen contexts.

## Architecture

MeetMind Web is a four-component MV3 extension:

- **Service worker** (`src/background`) — the orchestration hub. It owns the typed
  message protocol (`src/shared/messages.ts`), starts and stops capture sessions,
  and relays state between the offscreen document and the side panel.
- **Offscreen document** (`src/offscreen`) — the only context in an MV3 extension
  that can hold a persistent `AudioContext`. It captures tab audio via
  `chrome.tabCapture`, optionally mixes in the local microphone, resamples both to
  16 kHz PCM through an `AudioWorklet` (`pcm-chunker.js`), and hosts the session
  controller that drives the STT engine, the tick scheduler, and the LLM engine.
- **Side panel UI** (`src/sidepanel`) — the user-facing surface. It shows model
  download progress, the live transcript, and insight cards as they're generated,
  plus copy/download controls.
- **Web Workers** (`src/workers`) — `stt-worker.ts` runs the sherpa-onnx WASM
  streaming recognizer off the main/offscreen thread; `llm-worker.ts` hosts the
  WebLLM engine so model inference doesn't block audio capture.

### Cross-repo rule

`src/shared/prompt.ts` and `src/pipeline/insightParser.ts` are direct ports of the
Android app's `strings.xml` (`prompt_short_meeting`) and `InsightOutputParser.kt`,
respectively — same prompt text, same JSON schema (`title` / `summary` /
`action_items`), same tolerant-parsing rules for `<think>` blocks, code fences, and
unescaped inner quotes. **If the insight JSON schema or prompt changes in one repo,
it must be mirrored in the other.** The two engines are otherwise independent
(different STT/LLM runtimes), but they must keep agreeing on what the model is
asked to produce and how its output is parsed.

## Upstream models and versions

- **STT engine**: [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) WASM
  build, release tag `v1.13.4`, asset
  `sherpa-onnx-wasm-simd-v1.13.4-en-asr-zipformer.tar.bz2`. Only the WASM glue
  (`sherpa-onnx-wasm-main-asr.js/.wasm`, `sherpa-onnx-asr.js`) is vendored under
  `public/sherpa/`; the release's embedded 190 MB model package is intentionally
  **not** vendored and is bypassed at runtime (see `public/sherpa/VERSION.txt` for
  the exact mechanism) in favor of a model downloaded at runtime.
- **STT model**: [csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26)
  on Hugging Face — int8 encoder, joiner, decoder, and tokens files, downloaded
  into OPFS on first run and resumed on interruption (`src/engines/opfsDownloader.ts`,
  `src/engines/sttModelManifest.ts`).
  English-only for v1.
- **LLM engine**: [WebLLM](https://github.com/mlc-ai/web-llm) (`@mlc-ai/web-llm`
  `0.2.84`) running `gemma3-1b-it-q4f16_1-MLC`, the smallest current-generation
  Gemma instruct model in WebLLM's prebuilt catalog, requiring WebGPU.

### Toolchain substitutions made during the build

- **TypeScript pinned to `^6.0.3`** — TypeScript 7 breaks CRXJS's manifest
  declaration types; the extension will not type-check on TS 7 until CRXJS
  publishes compatible types.
- **`skipLibCheck: true`** in `tsconfig.json` — the DOM and WebWorker lib
  definitions conflict when both are included (needed because the extension has
  both window-context and worker-context code in one project), and `skipLibCheck`
  is the standard way around that conflict.
- **The AudioWorklet is a dedicated Rollup build entry** (`dist/pcm-chunker.js`,
  configured in `vite.config.ts`) loaded at runtime via
  `chrome.runtime.getURL(...)` rather than an `import.meta.url`-relative worklet
  import. Vite/CRXJS inline the latter as an unusable base64 `data:` URI of
  untranspiled TypeScript inside an MV3 build, so the worklet has to be emitted as
  its own file and referenced by URL instead.

## Verification

Audio capture, model downloads, and end-to-end meeting-page behavior depend on
real browser APIs (`chrome.tabCapture`, WebGPU, live network conditions) and a
real meeting page — none of that is meaningfully testable in CI. Unit tests
(`npm test`) cover the pure logic: the insight parser, the tick scheduler, and the
download planner. **`docs/MANUAL_TESTS.md` is the acceptance gate for everything
else** — it must be run against MS Teams web (the primary target), Google Meet,
Zoom web, and YouTube before every release, and a Teams failure blocks the
release.
