import {
  OrderType,
  Side,
  TimeInForce,
  type Order,
} from "@cex/exchange-types";
import { OrderBook } from "./orderbook/orderBook.js";

function makeOrder(
  partial: Pick<Order, "orderId" | "side" | "price" | "quantity"> &
    Partial<Order>,
): Order {
  return {
    userId: partial.userId ?? "user-1",
    market: "SOL-USD",
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    filledQuantity: 0,
    status: "OPEN",
    timestamp: Date.now(),
    ...partial,
  };
}

const book = new OrderBook("SOL-USD");

const buy100a = makeOrder({
  orderId: "b1",
  side: Side.BUY,
  price: 100,
  quantity: 1,
});
const buy100b = makeOrder({
  orderId: "b2",
  side: Side.BUY,
  price: 100,
  quantity: 2,
});
const buy99 = makeOrder({
  orderId: "b3",
  side: Side.BUY,
  price: 99,
  quantity: 1.5,
});
const sell101 = makeOrder({
  orderId: "s1",
  side: Side.SELL,
  price: 101,
  quantity: 3,
});
const sell102 = makeOrder({
  orderId: "s2",
  side: Side.SELL,
  price: 102,
  quantity: 1,
});

console.log("--- add orders ---");
book.add(buy100a);
book.add(buy100b);
book.add(buy99);
book.add(sell101);
book.add(sell102);

console.log("BBO:", book.getBbo());
console.log("Snapshot:", JSON.stringify(book.getSnapshot(), null, 2));

console.log("\n--- remove b1 (one of two at 100) ---");
const removed = book.remove("b1");
console.log("Removed:", removed?.orderId);
console.log("Order b1 lookup:", book.getOrder("b1"));
console.log("Order b2 lookup:", book.getOrder("b2")?.quantity);
console.log("Snapshot after remove:", JSON.stringify(book.getSnapshot(), null, 2));

console.log("\n--- best levels ---");
console.log("Best bid:", book.getBestBid()?.price, "vol", book.getBestBid()?.priceLevel.getTotalVolume());
console.log("Best ask:", book.getBestAsk()?.price, "vol", book.getBestAsk()?.priceLevel.getTotalVolume());
