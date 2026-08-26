# `@cex/app-contracts`

`@cex/app-contracts` defines message contracts for the application layer.

It sits above the exchange engine and below future services such as OMS, the exchange gateway, and the price service.

## Purpose

This package keeps message names and payload shapes in one place so multiple services do not drift over time.

It complements `@cex/exchange-types`:

- `@cex/exchange-types` describes the exchange engine domain
- `@cex/app-contracts` describes application-layer transport messages

## Included contracts

### Redis Streams

- `ORDERS_COMMANDS_STREAM`
- `ORDERS_EVENTS_STREAM`
- `XPG_COMMANDS_GROUP`
- `OMS_EVENTS_GROUP`

These are used for command and event delivery between OMS and the exchange gateway.

### Redis pub/sub

- `mdBboChannel(market)`
- `mdTradeChannel(market)`

These channels are intended for low-latency market-data fan-out.

### Payload types

- `PlaceCommand`
- `CancelCommand`
- `CreditCommand`
- `AppCommand`
- `AppOrderEvent`
- `BboMessage`
- `TradeTickMessage`
- `StreamEnvelope<T>`

## Design notes

- Commands carry `commandId` for idempotency.
- Market data uses integer exchange units, matching the engine.
- This package contains only TypeScript types and constants. It does not talk to Redis or Timescale directly.

## Usage

Import from the package root:

```ts
import {
  ORDERS_COMMANDS_STREAM,
  ORDERS_EVENTS_STREAM,
  mdBboChannel,
  type PlaceCommand,
} from "@cex/app-contracts";
```
