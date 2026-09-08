CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS trade_tick_keys (
  market text NOT NULL,
  trade_id text NOT NULL,
  first_seen timestamptz NOT NULL,
  CONSTRAINT trade_tick_keys_pkey PRIMARY KEY (market, trade_id)
);

CREATE TABLE IF NOT EXISTS trade_ticks (
  time timestamptz NOT NULL,
  market text NOT NULL,
  trade_id text NOT NULL,
  event_id text NOT NULL,
  engine_sequence bigint NOT NULL,
  price bigint NOT NULL,
  quantity bigint NOT NULL,
  buy_order_id text NOT NULL,
  sell_order_id text NOT NULL,
  CONSTRAINT trade_ticks_pkey PRIMARY KEY (market, time, trade_id)
);

SELECT create_hypertable(
  'trade_ticks',
  'time',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS trade_ticks_market_time_idx
  ON trade_ticks (market, time DESC);

CREATE TABLE IF NOT EXISTS bbo_snapshots (
  time timestamptz NOT NULL,
  market text NOT NULL,
  event_id text NOT NULL,
  engine_sequence bigint NOT NULL,
  best_bid bigint,
  best_ask bigint,
  CONSTRAINT bbo_snapshots_pkey PRIMARY KEY (market, time, engine_sequence)
);

SELECT create_hypertable(
  'bbo_snapshots',
  'time',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS bbo_snapshots_market_time_idx
  ON bbo_snapshots (market, time DESC);

SELECT add_retention_policy(
  'trade_ticks',
  drop_after => INTERVAL '90 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'bbo_snapshots',
  drop_after => INTERVAL '30 days',
  if_not_exists => TRUE
);

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', time) AS bucket,
  market,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(quantity) AS volume,
  count(*) AS trades
FROM trade_ticks
GROUP BY bucket, market
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'candles_1m',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);
