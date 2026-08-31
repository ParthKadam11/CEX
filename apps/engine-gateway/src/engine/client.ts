import type {
  AssetId,
  CancelResult,
  CreditResult,
  Balance,
  MarketSymbol,
  Order,
  OrderBookSnapshot,
  PlacementResult,
} from "@cex/exchange-types";

// Thin HTTP client for apps/exchange. Only process that should use this. 
export class EngineClient {
  constructor(
    private readonly baseUrl: string,
    private readonly market: MarketSymbol,
    private readonly gatewayToken = "local-dev-exchange-token",
  ) {}

  async health(): Promise<{ ok: boolean; market: string }> {
    const res = await fetch(`${this.baseUrl}/health`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`engine health failed: ${res.status}`);
    return (await res.json()) as { ok: boolean; market: string };
  }

  async credit(
    userId: string,
    asset: AssetId,
    amount: number,
  ): Promise<CreditResult> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/credit`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({ userId, asset, amount }),
      },
    );
    const body = (await res.json()) as CreditResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok) {
      throw new Error(errorMessage(body.error) ?? `credit failed: ${res.status}`);
    }
    return body;
  }

  async place(order: Order): Promise<PlacementResult> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/orders`,
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
        }),
      },
    );
    const body = (await res.json()) as PlacementResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok && body.order === undefined) {
      throw new Error(errorMessage(body.error) ?? `place failed: ${res.status}`);
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

  async cancel(orderId: string): Promise<CancelResult> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/orders/${orderId}`,
      { method: "DELETE", headers: this.headers() },
    );
    const body = (await res.json()) as CancelResult & {
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok && body.cancelled === undefined) {
      throw new Error(errorMessage(body.error) ?? `cancel failed: ${res.status}`);
    }
    return body;
  }

  async book(): Promise<OrderBookSnapshot> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/book`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`book failed: ${res.status}`);
    return (await res.json()) as OrderBookSnapshot;
  }

  async balances(userId: string): Promise<Balance[]> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/balances/${encodeURIComponent(userId)}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`balances failed: ${res.status}`);
    const body = (await res.json()) as { balances: Balance[] };
    return body.balances;
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
