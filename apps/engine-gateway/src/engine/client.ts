import type {
  AssetId,
  CancelResult,
  CreditResult,
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
  ) {}

  async health(): Promise<{ ok: boolean; market: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, asset, amount }),
      },
    );
    const body = (await res.json()) as CreditResult & { error?: string };
    if (!res.ok) {
      throw new Error(body.error ?? `credit failed: ${res.status}`);
    }
    return body;
  }

  async place(order: Order): Promise<PlacementResult> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/orders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
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
    const body = (await res.json()) as PlacementResult & { error?: string };
    if (!res.ok && body.order === undefined) {
      throw new Error(body.error ?? `place failed: ${res.status}`);
    }
    return body;
  }

  async cancel(orderId: string): Promise<CancelResult> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/orders/${orderId}`,
      { method: "DELETE" },
    );
    const body = (await res.json()) as CancelResult & { error?: string };
    if (!res.ok && body.cancelled === undefined) {
      throw new Error(body.error ?? `cancel failed: ${res.status}`);
    }
    return body;
  }

  async book(): Promise<OrderBookSnapshot> {
    const res = await fetch(
      `${this.baseUrl}/v1/markets/${this.market}/book`,
    );
    if (!res.ok) throw new Error(`book failed: ${res.status}`);
    return (await res.json()) as OrderBookSnapshot;
  }

  // SSE endpoint URL for the live engine feed.
  streamUrl(): string {
    return `${this.baseUrl}/v1/markets/${this.market}/stream`;
  }
}
