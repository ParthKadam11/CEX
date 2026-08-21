import type { AssetId, MarketSymbol, OrderEvent } from "@cex/exchange-types";

// Events pushed over SSE to the gateway
export type ExchangeStreamEvent =
  | { kind: "ORDER"; market: MarketSymbol; event: OrderEvent }
  | {
      kind: "BBO";
      market: MarketSymbol;
      bestBid: number | null;
      bestAsk: number | null;
    }
  | {
      kind: "CREDIT";
      market: MarketSymbol;
      userId: string;
      asset: AssetId;
      amount: number;
    };

type Listener = (event: ExchangeStreamEvent) => void;

//In-process pub/sub. HTTP SSE handlers subscribe; MarketRuntime publishes after live commands (not during WAL replay).

export class EventBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ExchangeStreamEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
