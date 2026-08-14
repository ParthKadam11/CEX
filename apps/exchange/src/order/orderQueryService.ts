import type {MarketSymbol,Order,OrderEvent, OrderQueryFilter, OrderStatus } from "@cex/exchange-types";
import { OrderEventLog } from "./orderEventLog.js";
import { OrderStore } from "./orderStore.js";

/*
  OrderQueryService = read facade over OrderStore + OrderEventLog.

  Live state  → store
  History     → event log
*/

const OPEN_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "OPEN",
  "PARTIALLY_FILLED",
]);

export class OrderQueryService {
  constructor(
    private readonly store: OrderStore,
    private readonly log: OrderEventLog,
  ) {}

  getById(orderId: string): Order | undefined {
    return this.store.get(orderId);
  }

  getByUser(userId: string, filter?: OrderQueryFilter): Order[] {
    let orders = this.store.getByUser(userId);

    if (filter?.openOnly) {
      orders = orders.filter((o) => OPEN_STATUSES.has(o.status));
    }

    if (filter?.status !== undefined) {
      const wanted = new Set(
        Array.isArray(filter.status) ? filter.status : [filter.status],
      );
      orders = orders.filter((o) => wanted.has(o.status));
    }

    if (filter?.market !== undefined) {
      orders = orders.filter((o) => o.market === filter.market);
    }

    return orders;
  }

  getOpenByUser(userId: string, market?: MarketSymbol): Order[] {
    return this.getByUser(userId, { openOnly: true, market });
  }

  getHistory(orderId: string): OrderEvent[] {
    return this.log.forOrder(orderId);
  }

  getEventsByUser(userId: string): OrderEvent[] {
    return this.log.forUser(userId);
  }
}
