export class GatewayMetrics {
  private readonly counters = new Map<string, number>();
  private sseConnected = false;

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  setSseConnected(connected: boolean): void {
    this.sseConnected = connected;
  }

  snapshot(): Record<string, number | boolean> {
    return {
      ...Object.fromEntries(this.counters),
      sseConnected: this.sseConnected,
    };
  }
}
