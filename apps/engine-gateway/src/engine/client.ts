import type {
  AssetId,
  CancelResult,
  CreditResult,
  Balance,
  MarketSymbol,
  Order,
  OrderBookSnapshot,
  PlacementResult,
  Position,
} from "@cex/exchange-types";

export type EngineClientOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  failureThreshold?: number;
  cooldownMs?: number;
};

class EngineCircuitOpenError extends Error {
  constructor() {
    super("ENGINE_CIRCUIT_OPEN");
  }
}

class EngineTimeoutError extends Error {
  constructor() {
    super("ENGINE_REQUEST_TIMEOUT");
  }
}

// Thin HTTP client for apps/exchange. Only process that should use this. 
export class EngineClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly market: MarketSymbol,
    private readonly gatewayToken = "local-dev-exchange-token",
    options: EngineClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 5_000;
  }

  async health(signal?: AbortSignal): Promise<{ ok: boolean; market: string }> {
    const res = await this.request(
      "/health",
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`engine health failed: ${res.status}`);
    return (await res.json()) as { ok: boolean; market: string };
  }

  async credit(
    userId: string,
    asset: AssetId,
    amount: number,
    signal?: AbortSignal,
  ): Promise<CreditResult> {
    const res = await this.request(
      `/v1/markets/${this.market}/credit`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({ userId, asset, amount }),
      },
      false,
      signal,
    );
    const body = (await res.json()) as CreditResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok) {
      throw new Error(
        errorMessage(body.error) ?? `credit failed: ${res.status}`,
      );
    }
    return body;
  }

  async place(order: Order, signal?: AbortSignal): Promise<PlacementResult> {
    const res = await this.request(
      `/v1/markets/${this.market}/orders`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          userId: order.userId,
          side: order.side,
          type: order.type,
          timeInForce: order.timeInForce,
          price: order.price,
          quantity: order.quantity,
          quoteBudget: order.quoteBudget,
          leverage: order.leverage,
        }),
      },
      false,
      signal,
    );
    const body = (await res.json()) as PlacementResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok && body.order === undefined) {
      throw new Error(
        errorMessage(body.error) ?? `place failed: ${res.status}`,
      );
    }
    if (!res.ok) {
      return {
        order: body.order!,
        trades: body.trades ?? [],
        accepted: false,
        reason: errorCode(body.error) as PlacementResult["reason"],
      };
    }
    return body;
  }

  async cancel(orderId: string, signal?: AbortSignal): Promise<CancelResult> {
    const res = await this.request(
      `/v1/markets/${this.market}/orders/${orderId}`,
      { method: "DELETE", headers: this.headers() },
      false,
      signal,
    );
    const body = (await res.json()) as CancelResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok && body.cancelled === undefined) {
      throw new Error(
        errorMessage(body.error) ?? `cancel failed: ${res.status}`,
      );
    }
    return body;
  }

  async openOrders(userId: string, signal?: AbortSignal): Promise<Order[]> {
    const res = await this.request(
      `/v1/markets/${this.market}/orders?userId=${encodeURIComponent(userId)}&openOnly=true`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`orders failed: ${res.status}`);
    const body = (await res.json()) as { orders: Order[] };
    return body.orders ?? [];
  }

  async book(depth = 0, signal?: AbortSignal): Promise<OrderBookSnapshot> {
    const query = depth > 0 ? `?depth=${depth}` : "?depth=0";
    const res = await this.request(
      `/v1/markets/${this.market}/book${query}`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`book failed: ${res.status}`);
    return (await res.json()) as OrderBookSnapshot;
  }

  async mark(
    signal?: AbortSignal,
  ): Promise<{
    market: MarketSymbol;
    mark: number | null;
    source: "mid" | "last" | null;
    bestBid: number | null;
    bestAsk: number | null;
    lastTradePrice: number | null;
    timestamp: number;
  }> {
    const res = await this.request(
      `/v1/markets/${this.market}/mark`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`mark failed: ${res.status}`);
    return (await res.json()) as {
      market: MarketSymbol;
      mark: number | null;
      source: "mid" | "last" | null;
      bestBid: number | null;
      bestAsk: number | null;
      lastTradePrice: number | null;
      timestamp: number;
    };
  }

  /** Dev hard-reset of exchange in-memory state + WAL. */
  async hardReset(signal?: AbortSignal): Promise<void> {
    const res = await this.request(
      `/v1/dev/reset`,
      { method: "POST", headers: this.headers() },
      false,
      signal,
    );
    if (!res.ok) throw new Error(`hardReset failed: ${res.status}`);
  }

  async balances(userId: string, signal?: AbortSignal): Promise<Balance[]> {
    const res = await this.request(
      `/v1/markets/${this.market}/balances/${encodeURIComponent(userId)}`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`balances failed: ${res.status}`);
    const body = (await res.json()) as { balances: Balance[] };
    return body.balances;
  }

  async position(
    userId: string,
    signal?: AbortSignal,
  ): Promise<Position> {
    const res = await this.request(
      `/v1/markets/${this.market}/positions/${encodeURIComponent(userId)}`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`position failed: ${res.status}`);
    const body = (await res.json()) as { position: Position };
    return body.position;
  }

  async positions(
    userId?: string,
    signal?: AbortSignal,
  ): Promise<Position[]> {
    const query = userId
      ? `?userId=${encodeURIComponent(userId)}`
      : "";
    const res = await this.request(
      `/v1/markets/${this.market}/positions${query}`,
      { headers: this.headers() },
      true,
      signal,
    );
    if (!res.ok) throw new Error(`positions failed: ${res.status}`);
    const body = (await res.json()) as { positions: Position[] };
    return body.positions ?? [];
  }

  // SSE endpoint URL for the live engine feed.
  streamUrl(): string {
    return `${this.baseUrl}/v1/markets/${this.market}/stream`;
  }

  streamHeaders(): Record<string, string> {
    return this.headers();
  }

  private headers(): Record<string, string> {
    return { "x-gateway-token": this.gatewayToken };
  }

  private async request(
    path: string,
    init: RequestInit,
    retryable: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const openedAt = this.circuitOpenedAt;
    if (
      openedAt > 0 &&
      Date.now() - openedAt < this.cooldownMs
    ) {
      throw new EngineCircuitOpenError();
    }
    if (openedAt > 0) this.circuitOpenedAt = 0;

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(path, init, signal);
        if (response.status >= 500) {
          this.recordFailure();
          if (retryable && attempt < this.maxRetries) {
            await delay(100 * 2 ** attempt);
            continue;
          }
        } else {
          this.recordSuccess();
        }
        return response;
      } catch (error) {
        if (signal?.aborted) throw error;
        this.recordFailure();
        if (!retryable || attempt >= this.maxRetries) throw error;
        await delay(100 * 2 ** attempt);
      }
    }
  }

  private async fetchWithTimeout(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const abortExternal = () => controller.abort();

    if (signal?.aborted) {
      clearTimeout(timeout);
      throw new DOMException("The operation was aborted", "AbortError");
    }
    signal?.addEventListener("abort", abortExternal, { once: true });

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new EngineTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortExternal);
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenedAt = Date.now();
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(
  error: string | { code?: string; message?: string } | undefined,
): string | undefined {
  if (typeof error === "string") return error;
  return error?.message ?? error?.code;
}

function errorCode(
  error: string | { code?: string; message?: string } | undefined,
): string | undefined {
  return typeof error === "string" ? error : error?.code;
}
