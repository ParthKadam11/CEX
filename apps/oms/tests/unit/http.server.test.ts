import { describe, expect, it, vi } from "vitest";
import { createOmsApp } from "../../src/http/server.js";
import type { OrderService } from "../../src/orders/service.js";

const serviceResult = {
  order: { id: "db-order", status: "PENDING" },
  command: { commandId: "place-command" },
  existing: false,
};

describe("OMS HTTP authentication", () => {
  it("rejects requests without the internal service token", async () => {
    const app = createOmsApp(
      {} as OrderService,
      { internalToken: "secret" },
    );

    const response = await app.request("/orders", { method: "GET" });

    expect(response.status).toBe(401);
  });

  it("uses the authenticated identity instead of a body userId", async () => {
    const service = {
      place: vi.fn().mockResolvedValue(serviceResult),
    } as unknown as OrderService;
    const app = createOmsApp(service, { internalToken: "secret" });

    const response = await app.request("/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": "secret",
        "x-authenticated-user-id": "owner",
      },
      body: JSON.stringify({
        userId: "attacker",
        clientOrderId: "client-1",
        market: "SOL-USD",
        side: "BUY",
        orderType: "LIMIT",
        timeInForce: "GTC",
        price: 100,
        quantity: 1,
      }),
    });

    expect(response.status).toBe(202);
    expect(service.place).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner" }),
    );
  });

  it("uses the authenticated identity for order queries and cancellation", async () => {
    const service = {
      listForUser: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue({
        order: { id: "db-order", status: "CANCEL_REQUESTED" },
        command: { commandId: "cancel-command" },
      }),
    } as unknown as OrderService;
    const app = createOmsApp(service, { internalToken: "secret" });
    const headers = {
      "x-internal-token": "secret",
      "x-authenticated-user-id": "owner",
    };

    const listResponse = await app.request(
      "/orders?userId=attacker",
      { headers },
    );
    const cancelResponse = await app.request("/orders/engine-order", {
      method: "DELETE",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker" }),
    });

    expect(listResponse.status).toBe(200);
    expect(service.listForUser).toHaveBeenCalledWith(
      "owner",
      undefined,
      undefined,
    );
    expect(cancelResponse.status).toBe(202);
    expect(service.cancel).toHaveBeenCalledWith(
      "owner",
      "engine-order",
      undefined,
    );
  });

  it("returns request IDs and enforces bounded pagination", async () => {
    const service = {
      listForUser: vi.fn().mockResolvedValue({
        orders: [],
        nextCursor: null,
      }),
    } as unknown as OrderService;
    const app = createOmsApp(service, { internalToken: "secret" });
    const headers = {
      "x-internal-token": "secret",
      "x-authenticated-user-id": "owner",
      "x-request-id": "request-123",
    };

    const valid = await app.request("/orders?limit=2&cursor=cursor-1", {
      headers,
    });
    const invalid = await app.request("/orders?limit=101", { headers });

    expect(valid.status).toBe(200);
    expect(valid.headers.get("x-request-id")).toBe("request-123");
    expect(service.listForUser).toHaveBeenCalledWith(
      "owner",
      2,
      "cursor-1",
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_LIMIT");
  });
});
