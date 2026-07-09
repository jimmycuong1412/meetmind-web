// WebLLM's stock worker pattern: forward all incoming messages from the
// WebWorkerMLCEngine client to a WebWorkerMLCEngineHandler running the actual
// MLCEngine (model load + inference happen here, off the main thread).
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent): void => handler.onmessage(msg);
