import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineClient } from "../src/engine/client.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EngineClient resilience", () => {
  it("retries transient GET failures with bounded backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ ok: true, market: "SOL-USD" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new EngineClient(
      "http://engine",
      "SOL-USD",
      "token",
      { maxRetries: 1, failureThreshold: 5 },
    );

    await expect(client.health()).resolves.toEqual({
      ok: true,
      market: "SOL-USD",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-idempotent command calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "ENGINE_UNAVAILABLE", message: "unavailable" },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new EngineClient(
      "http://engine",
      "SOL-USD",
      "token",
      { maxRetries: 3, failureThreshold: 5 },
    );

    await expect(client.credit("user-1", "USD", 1)).rejects.toThrow(
      "unavailable",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a request after the configured timeout", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new EngineClient(
      "http://engine",
      "SOL-USD",
      "token",
      { timeoutMs: 5, maxRetries: 0 },
    );

    await expect(client.book()).rejects.toThrow("ENGINE_REQUEST_TIMEOUT");
  });
});
