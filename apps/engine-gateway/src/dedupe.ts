
// In-memory commandId dedupe so Redis retries do not double-hit the engine. 
export class CommandDedupe {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(opts?: { ttlMs?: number; maxSize?: number }) {
    this.ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxSize = opts?.maxSize ?? 50_000;
  }

  // Returns true if this commandId was already processed. 
  checkAndMark(commandId: string): boolean {
    this.prune();
    if (this.seen.has(commandId)) return true;
    this.seen.set(commandId, Date.now());
    if (this.seen.size > this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return false;
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, at] of this.seen) {
      if (at < cutoff) this.seen.delete(id);
      else break;
    }
  }
}
