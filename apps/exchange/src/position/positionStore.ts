import type { MarketSymbol, Position } from "@cex/exchange-types";

function key(userId: string, market: MarketSymbol): string {
  return `${userId}\0${market}`;
}

// In-memory signed positions per user+market.
export class PositionStore {
  private readonly byKey = new Map<string, Position>();

  get(userId: string, market: MarketSymbol): Position | undefined {
    return this.byKey.get(key(userId, market));
  }

  // Flat position placeholder (not stored until non-zero). 
  getOrEmpty(userId: string, market: MarketSymbol): Position {
    return (
      this.get(userId, market) ?? {
        userId,
        market,
        size: 0,
        entryPrice: 0,
        margin: 0,
        leverage: 1,
        updatedAt: 0,
      }
    );
  }

  set(position: Position): void {
    if (position.size === 0 && position.margin === 0) {
      this.byKey.delete(key(position.userId, position.market));
      return;
    }
    this.byKey.set(key(position.userId, position.market), { ...position });
  }

  listAll(): Position[] {
    return [...this.byKey.values()].map((p) => ({ ...p }));
  }

  listByUser(userId: string): Position[] {
    return this.listAll().filter((p) => p.userId === userId);
  }

  listByMarket(market: MarketSymbol): Position[] {
    return this.listAll().filter((p) => p.market === market);
  }

  loadAll(positions: Position[]): void {
    this.byKey.clear();
    for (const position of positions) {
      this.set(position);
    }
  }

  clear(): void {
    this.byKey.clear();
  }
}
