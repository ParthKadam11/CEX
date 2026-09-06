import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineClient } from "../src/engine/client.js";
import { EngineSseClient } from "../src/engine/sse.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

describe("SSE catch-up", () => {
  it("EngineClient.streamUrl appends afterSeq", () => {
    const client = new EngineClient("http://engine", "SOL-USD", "token");
    expect(client.streamUrl()).toBe("http://engine/v1/markets/SOL-USD/stream");
    expect(client.streamUrl(42)).toBe(
      "http://engine/v1/markets/SOL-USD/stream?afterSeq=42",
    );
  });

  it("reconnects with afterSeq from last received streamSeq", async () => {
    const urls: string[] = [];
    const credit = {
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 10,
      streamSeq: 7,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);

      if (urls.length === 1) {
        return new Response(
          sseBody([
            `id: 7\nevent: CREDIT\ndata: ${JSON.stringify(credit)}\n\n`,
          ]),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      }

      // Second connection: hang until abort so the client stays "connected".
      return new Response(
        new ReadableStream({
          start() {
            // Intentionally never closes; client.stop() aborts fetch.
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const seen: number[] = [];
    const sse = new EngineSseClient(
      (afterSeq) =>
        afterSeq == null
          ? "http://engine/stream"
          : `http://engine/stream?afterSeq=${afterSeq}`,
      (event) => {
        if (event.kind === "CREDIT") seen.push(event.streamSeq);
      },
    );

    sse.start();

    await vi.waitFor(() => {
      expect(seen).toEqual([7]);
    });
    await vi.waitFor(() => {
      expect(urls.length).toBeGreaterThanOrEqual(2);
    });

    expect(urls[0]).toBe("http://engine/stream");
    expect(urls[1]).toBe("http://engine/stream?afterSeq=7");
    expect(sse.cursor).toBe(7);

    sse.stop();
  });
});
