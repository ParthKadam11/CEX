import type Redis from "ioredis";
import type { AppOrderEvent } from "@cex/app-contracts";

// Redis-backed command journal for the gateway crash window:
// 1) saveOutcome after engine result  2) publish events  3) markProcessed
// On retry: replay saved outcome (no second engine apply) when present.

export class CommandDedupe {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;
  private readonly outcomePrefix: string;

  constructor(
    private readonly redis: Redis,
    opts?: { ttlMs?: number; keyPrefix?: string; outcomePrefix?: string },
  ) {
    const ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    this.keyPrefix = opts?.keyPrefix ?? "engine-gateway:dedupe:";
    this.outcomePrefix = opts?.outcomePrefix ?? "engine-gateway:outcome:";
  }

  async isProcessed(commandId: string): Promise<boolean> {
    const value = await this.redis.get(`${this.keyPrefix}${commandId}`);
    return value !== null;
  }

  async loadOutcome(commandId: string): Promise<AppOrderEvent[] | null> {
    const raw = await this.redis.get(`${this.outcomePrefix}${commandId}`);
    if (raw == null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed as AppOrderEvent[];
    } catch {
      return null;
    }
  }

  async saveOutcome(
    commandId: string,
    events: AppOrderEvent[],
  ): Promise<void> {
    await this.redis.set(
      `${this.outcomePrefix}${commandId}`,
      JSON.stringify(events),
      "EX",
      this.ttlSeconds,
    );
  }

  async markProcessed(commandId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(
      `${this.keyPrefix}${commandId}`,
      "1",
      "EX",
      this.ttlSeconds,
    );
    pipeline.expire(`${this.outcomePrefix}${commandId}`, this.ttlSeconds);
    await pipeline.exec();
  }
}
