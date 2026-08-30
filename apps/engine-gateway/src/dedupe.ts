
import type Redis from "ioredis";

// Redis-backed commandId dedupe so restarts do not double-hit the engine.
export class CommandDedupe {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: Redis,
    opts?: { ttlMs?: number; keyPrefix?: string },
  ) {
    const ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    this.keyPrefix = opts?.keyPrefix ?? "engine-gateway:dedupe:";
  }

  private readonly keyPrefix: string;

  // Returns true if this commandId was already processed.
  async checkAndMark(commandId: string): Promise<boolean> {
    const result = await this.redis.set(
      `${this.keyPrefix}${commandId}`,
      "1",
      "EX",
      this.ttlSeconds,
      "NX",
    );
    return result === null;
  }
}
