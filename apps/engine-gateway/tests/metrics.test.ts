import { describe, expect, it } from "vitest";
import { GatewayMetrics } from "../src/metrics.js";

describe("GatewayMetrics.toPrometheus", () => {
  it("exposes gauges and counters in Prometheus text format", () => {
    const metrics = new GatewayMetrics();
    metrics.increment("commandsReceived");
    metrics.increment("commandsReceived");
    metrics.increment("commandsFailed");
    metrics.setSseConnected(true);

    const text = metrics.toPrometheus(42);

    expect(text).toContain("cex_gateway_up 1");
    expect(text).toContain("cex_gateway_uptime_seconds 42");
    expect(text).toContain("cex_gateway_sse_connected 1");
    expect(text).toContain("cex_gateway_commands_received_total 2");
    expect(text).toContain("cex_gateway_commands_failed_total 1");
    expect(text).toContain("# TYPE cex_gateway_commands_received_total counter");
  });
});
