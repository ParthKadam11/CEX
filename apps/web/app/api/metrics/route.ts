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

type Sample = {
  name: string;
  help: string;
  type: "gauge" | "counter";
  value: number;
  labels?: Record<string, string>;
};

function render(samples: Sample[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const metric of samples) {
    if (!seen.has(metric.name)) {
      seen.add(metric.name);
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
    }
    lines.push(
      `${metric.name}${formatLabels(metric.labels)} ${Number.isFinite(metric.value) ? metric.value : 0}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export const dynamic = "force-dynamic";

export async function GET() {
  const uptime = Math.floor(process.uptime());
  const samples: Sample[] = [
    {
      name: "cex_service_up",
      help: "1 if the process is serving /metrics.",
      type: "gauge",
      value: 1,
      labels: { service: "web" },
    },
    {
      name: "cex_service_uptime_seconds",
      help: "Process uptime in seconds.",
      type: "gauge",
      value: uptime,
      labels: { service: "web" },
    },
  ];

  const heartbeat = (
    globalThis as unknown as {
      __cexMmHeartbeat?: { enabled?: boolean; placeTrades?: boolean };
    }
  ).__cexMmHeartbeat;

  if (heartbeat) {
    samples.push({
      name: "cex_sim_heartbeat_enabled",
      help: "1 if the web market-maker heartbeat is running.",
      type: "gauge",
      value: heartbeat.enabled ? 1 : 0,
      labels: { service: "web" },
    });
    samples.push({
      name: "cex_sim_place_trades",
      help: "1 if retail prints are enabled on the sim heartbeat.",
      type: "gauge",
      value: heartbeat.placeTrades ? 1 : 0,
      labels: { service: "web" },
    });
  }

  return new Response(render(samples), {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
