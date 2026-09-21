const COUNTER_NAMES = [
  "commandsReceived",
  "commandsFailed",
  "commandsDuplicate",
  "commandsOutcomeReplay",
  "commandsDeadLettered",
  "eventsPublished",
  "bboPublished",
  "tradesPublished",
  "sseReconnects",
  "sseGapReconciles",
] as const;

type CounterName = (typeof COUNTER_NAMES)[number];

/** camelCase counter → Prometheus snake_case leaf (without _total). */
const PROM_COUNTER_LEAF: Record<CounterName, string> = {
  commandsReceived: "commands_received",
  commandsFailed: "commands_failed",
  commandsDuplicate: "commands_duplicate",
  commandsOutcomeReplay: "commands_outcome_replay",
  commandsDeadLettered: "commands_dead_lettered",
  eventsPublished: "events_published",
  bboPublished: "bbo_published",
  tradesPublished: "trades_published",
  sseReconnects: "sse_reconnects",
  sseGapReconciles: "sse_gap_reconciles",
};

export class GatewayMetrics {
  private readonly counters = new Map<string, number>();
  private sseConnected = false;

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  setSseConnected(connected: boolean): void {
    this.sseConnected = connected;
  }

  snapshot(): Record<string, number | boolean> {
    return {
      ...Object.fromEntries(this.counters),
      sseConnected: this.sseConnected,
    };
  }

  /** Prometheus text exposition (OpenMetrics-ish, no timestamps). */
  toPrometheus(uptimeSeconds = Math.floor(process.uptime())): string {
    const lines: string[] = [];

    lines.push("# HELP cex_gateway_up 1 if the gateway process is serving.");
    lines.push("# TYPE cex_gateway_up gauge");
    lines.push("cex_gateway_up 1");

    lines.push(
      "# HELP cex_gateway_uptime_seconds Process uptime in seconds.",
    );
    lines.push("# TYPE cex_gateway_uptime_seconds gauge");
    lines.push(`cex_gateway_uptime_seconds ${uptimeSeconds}`);

    lines.push(
      "# HELP cex_gateway_sse_connected 1 if engine SSE fan-in is connected.",
    );
    lines.push("# TYPE cex_gateway_sse_connected gauge");
    lines.push(`cex_gateway_sse_connected ${this.sseConnected ? 1 : 0}`);

    for (const name of COUNTER_NAMES) {
      const leaf = PROM_COUNTER_LEAF[name];
      const metric = `cex_gateway_${leaf}_total`;
      const value = this.counters.get(name) ?? 0;
      lines.push(`# HELP ${metric} Gateway counter ${name}.`);
      lines.push(`# TYPE ${metric} counter`);
      lines.push(`${metric} ${value}`);
    }

    lines.push("");
    return lines.join("\n");
  }
}
