export class TickScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => Promise<void>,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      this.onTick()
        .catch((err) => console.error("tick failed:", err))
        .finally(() => (this.busy = false));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
