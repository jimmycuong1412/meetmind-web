import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TickScheduler } from "../src/pipeline/tickScheduler";

describe("TickScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onTick every interval", async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const s = new TickScheduler(1000, onTick);
    s.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
    s.stop();
  });

  it("skips a firing while the previous tick is still running", async () => {
    let release!: () => void;
    const onTick = vi.fn(() => new Promise<void>((r) => (release = r)));
    const s = new TickScheduler(1000, onTick);
    s.start();
    await vi.advanceTimersByTimeAsync(1000); // tick 1 starts, never resolves yet
    await vi.advanceTimersByTimeAsync(2000); // two firings while busy → skipped
    expect(onTick).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("stops firing after stop()", async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const s = new TickScheduler(1000, onTick);
    s.start();
    await vi.advanceTimersByTimeAsync(1000);
    s.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
