import type { Order } from "@cex/exchange-types";

/*
OrderStore = current-state index for queries.

Holds the same Order object references the book / matcher mutate,
so fills update query results without a second write.
*/

export class OrderStore {
  private readonly byId = new Map<string, Order>();
  private readonly byUser = new Map<string, Set<string>>();

  upsert(order: Order): void {
    this.byId.set(order.orderId, order);

    let ids = this.byUser.get(order.userId);
    if (!ids) {
      ids = new Set();
      this.byUser.set(order.userId, ids);
    }
    ids.add(order.orderId);
  }

  get(orderId: string): Order | undefined { //O(1) getById
    return this.byId.get(orderId);
  }

  // Current orders for a user (any status), newest-ish by insertion order of ids.
  getByUser(userId: string): Order[] {  //O(k) list for a user
    const ids = this.byUser.get(userId);
    if (!ids) return [];

    const out: Order[] = [];
    for (const id of ids) {
      const order = this.byId.get(id);
      if (order) out.push(order);
    }
    return out;
  }

  clear(): void {
    this.byId.clear();
    this.byUser.clear();
  }
}
