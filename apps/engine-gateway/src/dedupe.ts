import type Redis from "ioredis";

// Redis-backed commandId dedupe. Keys are written only after successful processing
// so retried commands can reach the engine again when a prior attempt failed early.
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

  async isProcessed(commandId: string): Promise<boolean> {
    const value = await this.redis.get(`${this.keyPrefix}${commandId}`);
    return value !== null;
  }

  async markProcessed(commandId: string): Promise<void> {
    await this.redis.set(
      `${this.keyPrefix}${commandId}`,
      "1",
      "EX",
      this.ttlSeconds,
    );
  }
}
