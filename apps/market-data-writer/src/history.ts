import type { Pool } from "pg";

export async function listTrades(
  pool: Pool,
  market: string,
  limit: number,
) {
  const result = await pool.query(
    `SELECT
       time,
       market,
       trade_id AS "tradeId",
       event_id AS "eventId",
       engine_sequence AS "engineSequence",
       price,
       quantity,
       buy_order_id AS "buyOrderId",
       sell_order_id AS "sellOrderId"
     FROM trade_ticks
     WHERE market = $1
     ORDER BY time DESC, engine_sequence DESC
     LIMIT $2`,
    [market, limit],
  );
  return result.rows;
}

export async function listBbo(
  pool: Pool,
  market: string,
  limit: number,
) {
  const result = await pool.query(
    `SELECT
       time,
       market,
       event_id AS "eventId",
       engine_sequence AS "engineSequence",
       best_bid AS "bestBid",
       best_ask AS "bestAsk"
     FROM bbo_snapshots
     WHERE market = $1
     ORDER BY time DESC, engine_sequence DESC
     LIMIT $2`,
    [market, limit],
  );
  return result.rows;
}

export async function listCandles(
  pool: Pool,
  market: string,
  limit: number,
) {
  const result = await pool.query(
    `SELECT
       bucket,
       market,
       open,
       high,
       low,
       close,
       volume,
       trades
     FROM candles_1m
     WHERE market = $1
     ORDER BY bucket DESC
     LIMIT $2`,
    [market, limit],
  );
  return result.rows;
}
