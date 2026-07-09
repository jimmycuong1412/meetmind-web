// AudioWorklet: accumulates 128-frame render quanta into 3200-sample (200 ms @ 16 kHz)
// chunks and posts them to the main thread.
const CHUNK_SIZE = 3200;

class PcmChunker extends AudioWorkletProcessor {
  private buffer = new Float32Array(CHUNK_SIZE);
  private offset = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let read = 0;
    while (read < channel.length) {
      const n = Math.min(channel.length - read, CHUNK_SIZE - this.offset);
      this.buffer.set(channel.subarray(read, read + n), this.offset);
      this.offset += n;
      read += n;
      if (this.offset === CHUNK_SIZE) {
        this.port.postMessage(this.buffer.slice());
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-chunker", PcmChunker);
