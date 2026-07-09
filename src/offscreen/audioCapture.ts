export class AudioCapture {
  private ctx: AudioContext | null = null;
  private tabStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private mixer: GainNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  async start(
    streamId: string,
    micEnabled: boolean,
    onPcm: (samples: Float32Array) => void,
    onStreamEnded: () => void,
  ): Promise<void> {
    // Chrome-specific constraint shape for consuming a tabCapture stream ID.
    this.tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
      },
    } as MediaStreamConstraints);

    this.tabStream.getAudioTracks()[0].addEventListener("ended", onStreamEnded);

    this.ctx = new AudioContext({ sampleRate: 16000 });
    const tabSource = this.ctx.createMediaStreamSource(this.tabStream);

    // Route tab audio back to the speakers — tabCapture mutes the tab otherwise.
    tabSource.connect(this.ctx.destination);

    this.mixer = this.ctx.createGain();
    tabSource.connect(this.mixer);
    if (micEnabled) await this.setMicEnabled(true);

    // Loaded via chrome.runtime.getURL rather than `new URL(..., import.meta.url)`:
    // Vite/CRXJS inlines a same-folder `.ts` sibling referenced that way as a base64
    // data: URI containing untranspiled TypeScript, which AudioContext.audioWorklet
    // cannot execute. pcm-chunker.ts is built as its own Rollup entry (see
    // vite.config.ts) and emitted as a real, transpiled `pcm-chunker.js` asset that
    // this extension URL resolves to at runtime.
    await this.ctx.audioWorklet.addModule(chrome.runtime.getURL("pcm-chunker.js"));
    const chunker = new AudioWorkletNode(this.ctx, "pcm-chunker");
    // Chunker is a sink: connect mixer → chunker, but NOT chunker → destination
    // (its output is silence; connecting it would add nothing).
    this.mixer.connect(chunker);
    chunker.port.onmessage = (e: MessageEvent<Float32Array>) => onPcm(e.data);
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    if (!this.ctx || !this.mixer) return;
    if (enabled && !this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.mixer);
    } else if (!enabled && this.micStream) {
      this.micSource?.disconnect();
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      this.micSource = null;
    }
  }

  stop(): void {
    this.tabStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.tabStream = null;
    this.micStream = null;
    this.mixer = null;
    this.micSource = null;
  }
}
