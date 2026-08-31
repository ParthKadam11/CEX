# API contracts

The browser only calls the Next.js BFF under `/api`. The BFF obtains the
NextAuth user identity and forwards it as `x-authenticated-user-id`; clients
cannot select another user.

Internal OMS requests require `x-internal-token`. Gateway requests require
`x-internal-token`, and gateway-to-exchange requests require
`x-gateway-token`. Every service response includes an `x-request-id`; clients
may provide a valid request ID to correlate retries.

## Order endpoints

`POST /api/orders` places an order. The body is:

```json
{
  "clientOrderId": "client-123",
  "market": "SOL-USD",
  "side": "BUY",
  "orderType": "LIMIT",
  "timeInForce": "GTC",
  "price": 100,
  "quantity": 1
}
```

`FOK_BUDGET` is only valid with `side: "BUY"` and
`orderType: "MARKET"`. It also requires a positive integer `quoteBudget` and
fills the complete quantity or rejects without matching.

`DELETE /api/orders/:orderId` requests cancellation.

`GET /api/orders?limit=50&cursor=<cursor>` lists the authenticated user's
orders. `limit` is an integer from 1 through 100. The response contains
`orders` and `nextCursor`; pass `nextCursor` to retrieve the next page.

`GET /api/orders/:orderId` returns one order owned by the authenticated user.

## Error envelope

Errors use the same shape across exchange, gateway, OMS, and BFF responses:

```json
{
  "error": {
    "code": "INVALID_LIMIT",
    "message": "INVALID_LIMIT",
    "requestId": "request-123"
  }
}
```

HTTP status codes remain meaningful: `400` for invalid input, `401` for
missing service or user authentication, `403` for ownership failures, `404`
for missing resources, `409` for an idempotency conflict, and `502` when a
gateway dependency is unavailable.
