import { Side, type Position } from "@cex/exchange-types";

export type PerpFillApplyResult = {
  position: Position;
  // Realized PnL in USD (positive = profit credited to available).
  realizedPnl: number;
  //Margin that leaves the position and should be unlocked to available(reduce/close). Open/increase retains margin on the position (stays locked).
  marginUnlocked: number;
  // Margin that stays allocated on the position after this fill.
  marginRetainedOnPosition: number;
};

function sameSign(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b);
}

/*
  Apply one fill to a signed position.
  BUY adds +qty, SELL adds -qty.
  marginIn is the USD margin associated with this fill from the order lock.
*/
export function applyPerpFill(args: {
  position: Position;
  side: Side;
  quantity: number;
  price: number;
  leverage: number;
  marginIn: number;
  timestamp: number;
}): PerpFillApplyResult {
  const { side, quantity, price, leverage, marginIn, timestamp } = args;
  const pos: Position = { ...args.position };
  const delta = side === Side.BUY ? quantity : -quantity;

  if (quantity <= 0) {
    throw new Error("perp fill quantity must be positive");
  }

  // Flat → open
  if (pos.size === 0) {
    pos.size = delta;
    pos.entryPrice = price;
    pos.margin = marginIn;
    pos.leverage = leverage;
    pos.updatedAt = timestamp;
    return {
      position: pos,
      realizedPnl: 0,
      marginUnlocked: 0,
      marginRetainedOnPosition: marginIn,
    };
  }

  // Increase same side
  if (sameSign(pos.size, delta)) {
    const absOld = Math.abs(pos.size);
    const absNew = absOld + quantity;
    pos.entryPrice = Math.floor(
      (absOld * pos.entryPrice + quantity * price) / absNew,
    );
    pos.size += delta;
    pos.margin += marginIn;
    pos.leverage = leverage;
    pos.updatedAt = timestamp;
    return {
      position: pos,
      realizedPnl: 0,
      marginUnlocked: 0,
      marginRetainedOnPosition: marginIn,
    };
  }

  // Reduce and/or flip
  const absSize = Math.abs(pos.size);
  const closeQty = Math.min(absSize, quantity);
  const openQty = quantity - closeQty;
  const sign = Math.sign(pos.size);

  // Long close: (exit - entry) * qty; short close: (entry - exit) * qty
  const realizedPnl = sign * (price - pos.entryPrice) * closeQty;

  const marginUnlockClose =
    absSize > 0 ? Math.floor((pos.margin * closeQty) / absSize) : 0;
  pos.margin -= marginUnlockClose;
  pos.size += delta; // moves toward zero or through

  let marginUnlocked = marginUnlockClose;
  let marginRetainedOnPosition = 0;

  if (pos.size === 0) {
    // Residual dust margin unlocked
    marginUnlocked += pos.margin;
    pos.margin = 0;
    pos.entryPrice = 0;
    // Entire marginIn was for the closing fill — unlock it too (was never
    // needed as position margin; it was sized for the order's new exposure).
    // When fully closing, marginIn for the close portion shouldn't stay locked.
    // The order locked margin for the sell/buy as if opening; on pure close,
    // that marginIn should return to available.
    marginUnlocked += marginIn;
  } else if (openQty > 0) {
    // Flipped: remainder opens the other side at trade price.
    pos.entryPrice = price;
    pos.leverage = leverage;
    // Split marginIn: close share already unlocked via old margin; open share retained.
    const marginOpen =
      quantity > 0 ? Math.floor((marginIn * openQty) / quantity) : 0;
    const marginCloseShare = marginIn - marginOpen;
    marginUnlocked += marginCloseShare;
    pos.margin = marginOpen;
    marginRetainedOnPosition = marginOpen;
  } else {
    // Partial reduce only: marginIn was for reducing order — unlock it.
    marginUnlocked += marginIn;
    marginRetainedOnPosition = 0;
  }

  pos.updatedAt = timestamp;
  return {
    position: pos,
    realizedPnl,
    marginUnlocked,
    marginRetainedOnPosition,
  };
}
