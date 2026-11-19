import { normalizeRoute, recordHttpRequest, renderMetrics, resetMetrics } from './metrics';
import { REQUEST_ID_RE } from '../middleware/request-logging.middleware';
import { logLevels } from '../logging/json-logger';
import { APP_VERSION } from '../version';

describe('ops: metrics / logging / version', () => {
  beforeEach(() => resetMetrics());

  it('normalizes ids in routes (bounded label cardinality)', () => {
    expect(normalizeRoute('/api/accruals/clx1abcdefghijklmnopqrstu/receipt?x=1')).toBe('/api/accruals/:id/receipt');
    expect(normalizeRoute('/api/meters/123/readings')).toBe('/api/meters/:id/readings');
    expect(normalizeRoute('/api/health')).toBe('/api/health');
  });

  it('renders Prometheus counters, histogram and gauges', () => {
    recordHttpRequest('GET', '/api/health', 200, 0.01);
    recordHttpRequest('GET', '/api/health', 503, 0.3);
    const text = renderMetrics([{ name: 'dah_db_up', help: 'db', value: 1 }]);
    expect(text).toContain('dah_http_requests_total{method="GET",route="/api/health",status="2xx"} 1');
    expect(text).toContain('dah_http_requests_total{method="GET",route="/api/health",status="5xx"} 1');
    expect(text).toContain('dah_http_request_duration_seconds_bucket{method="GET",route="/api/health",le="0.025"} 1');
    expect(text).toContain('dah_http_request_duration_seconds_count{method="GET",route="/api/health"} 2');
    expect(text).toContain('dah_db_up 1');
    expect(text).toContain('# TYPE dah_process_uptime_seconds gauge');
  });

  it('L8: request id format', () => {
    expect(REQUEST_ID_RE.test('3f2a9c1e-77aa-4d1b-9e10-0b1c2d3e4f50')).toBe(true);
    expect(REQUEST_ID_RE.test('short')).toBe(false);
    expect(REQUEST_ID_RE.test('bad id\ninjected=1')).toBe(false);
    expect(REQUEST_ID_RE.test('x'.repeat(200))).toBe(false);
  });

  it('log levels and single product version (L1)', () => {
    expect(logLevels('warn')).toEqual(['fatal', 'error', 'warn']);
    expect(logLevels('info')).toEqual(['fatal', 'error', 'warn', 'log']);
    expect(logLevels(undefined)).toEqual(['fatal', 'error', 'warn', 'log']);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
