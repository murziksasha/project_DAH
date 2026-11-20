/**
 * Phase 2.4: minimal in-process Prometheus metrics (no extra dependency).
 * Exposed at GET /api/metrics (see MetricsController).
 */
const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Key = string;
const requests = new Map<Key, number>();
const durationBuckets = new Map<Key, number[]>();
const durationSum = new Map<Key, number>();
const durationCount = new Map<Key, number>();

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/** Route template keeps label cardinality bounded (ids are replaced by :id). */
export function normalizeRoute(path: string): string {
  return (
    path
      .split('?')[0]
      .split('/')
      .map((seg) =>
        /^[0-9a-f-]{16,}$/i.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg) || /^\d+$/.test(seg) ? ':id' : seg,
      )
      .join('/')
      .slice(0, 120) || '/'
  );
}

export function recordHttpRequest(method: string, path: string, status: number, seconds: number): void {
  const route = normalizeRoute(path);
  const key = `${method}|${route}|${statusClass(status)}`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
  const dkey = `${method}|${route}`;
  const b = durationBuckets.get(dkey) ?? new Array(BUCKETS.length).fill(0);
  BUCKETS.forEach((le, i) => {
    if (seconds <= le) b[i] += 1;
  });
  durationBuckets.set(dkey, b);
  durationSum.set(dkey, (durationSum.get(dkey) ?? 0) + seconds);
  durationCount.set(dkey, (durationCount.get(dkey) ?? 0) + 1);
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

export interface ExtraGauge {
  name: string;
  help: string;
  value: number | null;
  labels?: Record<string, string>;
}

export function renderMetrics(extra: ExtraGauge[] = []): string {
  const out: string[] = [];
  out.push('# HELP dah_http_requests_total HTTP requests by method, route and status class');
  out.push('# TYPE dah_http_requests_total counter');
  for (const [k, v] of requests) {
    const [method, route, cls] = k.split('|');
    out.push(`dah_http_requests_total{method="${esc(method)}",route="${esc(route)}",status="${cls}"} ${v}`);
  }
  out.push('# HELP dah_http_request_duration_seconds HTTP request latency');
  out.push('# TYPE dah_http_request_duration_seconds histogram');
  for (const [k, b] of durationBuckets) {
    const [method, route] = k.split('|');
    const l = `method="${esc(method)}",route="${esc(route)}"`;
    BUCKETS.forEach((le, i) => out.push(`dah_http_request_duration_seconds_bucket{${l},le="${le}"} ${b[i]}`));
    out.push(`dah_http_request_duration_seconds_bucket{${l},le="+Inf"} ${durationCount.get(k) ?? 0}`);
    out.push(`dah_http_request_duration_seconds_sum{${l}} ${(durationSum.get(k) ?? 0).toFixed(6)}`);
    out.push(`dah_http_request_duration_seconds_count{${l}} ${durationCount.get(k) ?? 0}`);
  }
  const mem = process.memoryUsage();
  out.push('# HELP dah_process_uptime_seconds Process uptime');
  out.push('# TYPE dah_process_uptime_seconds gauge');
  out.push(`dah_process_uptime_seconds ${process.uptime().toFixed(0)}`);
  out.push('# HELP dah_process_resident_memory_bytes Resident memory');
  out.push('# TYPE dah_process_resident_memory_bytes gauge');
  out.push(`dah_process_resident_memory_bytes ${mem.rss}`);
  const seen = new Set<string>();
  for (const g of extra) {
    if (!seen.has(g.name)) {
      out.push(`# HELP ${g.name} ${g.help}`);
      out.push(`# TYPE ${g.name} gauge`);
      seen.add(g.name);
    }
    if (g.value === null || !Number.isFinite(g.value)) continue;
    const labels = g.labels
      ? `{${Object.entries(g.labels)
          .map(([k, v]) => `${k}="${esc(v)}"`)
          .join(',')}}`
      : '';
    out.push(`${g.name}${labels} ${g.value}`);
  }
  return out.join('\n') + '\n';
}

/** Test helper. */
export function resetMetrics(): void {
  requests.clear();
  durationBuckets.clear();
  durationSum.clear();
  durationCount.clear();
}
