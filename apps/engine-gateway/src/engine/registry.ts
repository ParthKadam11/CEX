import type { MarketSymbol } from "@cex/exchange-types";
import { EngineClient, type EngineClientOptions } from "./client.js";

/** Routes HTTP calls to the exchange process for each configured market. */
export class EngineRegistry {
  private readonly byMarket = new Map<MarketSymbol, EngineClient>();

  constructor(
    endpoints: Array<{ market: MarketSymbol; url: string }>,
    gatewayToken: string,
    options?: EngineClientOptions,
  ) {
    for (const endpoint of endpoints) {
      this.byMarket.set(
        endpoint.market,
        new EngineClient(endpoint.url, endpoint.market, gatewayToken, options),
      );
    }
  }

  markets(): MarketSymbol[] {
    return [...this.byMarket.keys()];
  }

  has(market: MarketSymbol): boolean {
    return this.byMarket.has(market);
  }

  get(market: MarketSymbol): EngineClient {
    const client = this.byMarket.get(market);
    if (!client) {
      throw new Error(`UNKNOWN_MARKET:${market}`);
    }
    return client;
  }

  tryGet(market: string): EngineClient | null {
    return this.byMarket.get(market as MarketSymbol) ?? null;
  }

  all(): EngineClient[] {
    return [...this.byMarket.values()];
  }
}
