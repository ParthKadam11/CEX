export type PromMetric = {
  name: string;
  help: string;
  type: "gauge" | "counter";
  value: number;
  labels?: Record<string, string>;
};

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);
  return `{${parts.join(",")}}`;
}

/** Render Prometheus text exposition (no timestamps). */
export function renderPrometheus(metrics: PromMetric[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const metric of metrics) {
    if (!seen.has(metric.name)) {
      seen.add(metric.name);
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
    }
    const value = Number.isFinite(metric.value) ? metric.value : 0;
    lines.push(`${metric.name}${formatLabels(metric.labels)} ${value}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function processUpMetrics(
  service: string,
  uptimeSeconds = Math.floor(process.uptime()),
): PromMetric[] {
  return [
    {
      name: "cex_service_up",
      help: "1 if the process is serving /metrics.",
      type: "gauge",
      value: 1,
      labels: { service },
    },
    {
      name: "cex_service_uptime_seconds",
      help: "Process uptime in seconds.",
      type: "gauge",
      value: uptimeSeconds,
      labels: { service },
    },
  ];
}

export function dependencyOkMetric(
  service: string,
  dep: string,
  ok: boolean,
): PromMetric {
  return {
    name: "cex_dependency_ok",
    help: "1 if a named dependency check is healthy.",
    type: "gauge",
    value: ok ? 1 : 0,
    labels: { service, dep },
  };
}

export function streamLagMetrics(
  service: string,
  stream: string,
  group: string,
  lag: number | null | undefined,
  pending: number | null | undefined,
): PromMetric[] {
  const labels = { service, stream, group };
  return [
    {
      name: "cex_stream_lag",
      help: "Redis consumer group lag (messages).",
      type: "gauge",
      value: lag == null || !Number.isFinite(lag) ? -1 : lag,
      labels,
    },
    {
      name: "cex_stream_pending",
      help: "Redis consumer group pending entries.",
      type: "gauge",
      value: pending == null || !Number.isFinite(pending) ? -1 : pending,
      labels,
    },
  ];
}

export const PROMETHEUS_CONTENT_TYPE =
  "text/plain; version=0.0.4; charset=utf-8";
