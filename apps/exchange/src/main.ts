import {
  OrderType,
  Side,
  TimeInForce,
  type Order,
} from "@cex/exchange-types";
import { OrderBook } from "./book/orderBook.js";

function order(
  orderId: string,
  side: Side,
  price: number,
  quantity: number,
): Order {
  return {
    orderId,
    userId: "u1",
    market: "SOL-USD",
    side,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    price,
    quantity,
    filledQuantity: 0,
    status: "OPEN",
    timestamp: Date.now(),
  };
}

const book = new OrderBook("SOL-USD");

book.add(order("b1", Side.BUY, 100, 1));
book.add(order("b2", Side.BUY, 99, 2));
book.add(order("s1", Side.SELL, 101, 3));

console.log("BBO", book.getBbo());
console.log("Book", book.getSnapshot());

book.remove("b1");
console.log("After remove b1", book.getSnapshot());
console.log("b1 gone?", book.getOrder("b1") === undefined);
