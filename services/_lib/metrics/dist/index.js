"use strict";
// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRegistry = exports.MetricsRegistry = exports.Histogram = exports.Gauge = exports.Counter = void 0;
exports.counter = counter;
exports.gauge = gauge;
exports.histogram = histogram;
exports.expressMetricsMiddleware = expressMetricsMiddleware;
exports.prometheusHandler = prometheusHandler;
const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
function escapeLabel(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
function serializeLabels(labels) {
    const pairs = Object.entries(labels);
    if (pairs.length === 0) {
        return '';
    }
    return `{${pairs.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`;
}
function serializeLabelsWithExtra(labels, extraKey, extraValue) {
    const pairs = [...Object.entries(labels), [extraKey, extraValue]];
    return `{${pairs.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`;
}
// --- Counter ---
class Counter {
    values = new Map();
    inc(labels = {}, amount = 1) {
        const key = serializeLabels(labels);
        const existing = this.values.get(key);
        if (existing) {
            existing.value += amount;
        }
        else {
            this.values.set(key, { labels, value: amount });
        }
    }
    /** @internal */
    entries() {
        return this.values.values();
    }
}
exports.Counter = Counter;
// --- Gauge ---
class Gauge {
    values = new Map();
    set(value, labels = {}) {
        const key = serializeLabels(labels);
        const existing = this.values.get(key);
        if (existing) {
            existing.value = value;
        }
        else {
            this.values.set(key, { labels, value });
        }
    }
    inc(labels = {}, amount = 1) {
        const key = serializeLabels(labels);
        const existing = this.values.get(key);
        if (existing) {
            existing.value += amount;
        }
        else {
            this.values.set(key, { labels, value: amount });
        }
    }
    dec(labels = {}, amount = 1) {
        this.inc(labels, -amount);
    }
    /** @internal */
    entries() {
        return this.values.values();
    }
}
exports.Gauge = Gauge;
class Histogram {
    series = new Map();
    bounds;
    constructor(buckets = DEFAULT_HISTOGRAM_BUCKETS) {
        this.bounds = [...buckets].sort((a, b) => a - b);
    }
    observe(value, labels = {}) {
        const key = serializeLabels(labels);
        let s = this.series.get(key);
        if (!s) {
            s = { labels, sum: 0, count: 0, buckets: new Map() };
            this.series.set(key, s);
        }
        s.sum += value;
        s.count++;
        for (const b of this.bounds) {
            if (value <= b) {
                s.buckets.set(b, (s.buckets.get(b) ?? 0) + 1);
            }
        }
    }
    startTimer() {
        const start = Date.now();
        return (labels = {}) => this.observe(Date.now() - start, labels);
    }
    /** @internal */
    allSeries() {
        return this.series.values();
    }
    /** @internal */
    getBounds() {
        return this.bounds;
    }
}
exports.Histogram = Histogram;
class MetricsRegistry {
    entries = new Map();
    register(name, kind, help, factory) {
        const existing = this.entries.get(name);
        if (existing) {
            if (existing.kind !== kind) {
                throw new Error(`Metric "${name}" already registered as ${existing.kind}, cannot re-register as ${kind}`);
            }
            return existing.metric;
        }
        const metric = factory();
        this.entries.set(name, { kind, help, metric });
        return metric;
    }
    counter(name, help = '') {
        return this.register(name, 'counter', help, () => new Counter());
    }
    gauge(name, help = '') {
        return this.register(name, 'gauge', help, () => new Gauge());
    }
    histogram(name, help = '', buckets) {
        return this.register(name, 'histogram', help, () => new Histogram(buckets));
    }
    format() {
        const lines = [];
        for (const [name, entry] of this.entries) {
            lines.push(`# HELP ${name} ${entry.help}`);
            lines.push(`# TYPE ${name} ${entry.kind}`);
            if (entry.kind === 'counter') {
                const c = entry.metric;
                let hasValues = false;
                for (const { labels, value } of c.entries()) {
                    lines.push(`${name}${serializeLabels(labels)} ${value}`);
                    hasValues = true;
                }
                if (!hasValues) {
                    lines.push(`${name} 0`);
                }
            }
            else if (entry.kind === 'gauge') {
                const g = entry.metric;
                let hasValues = false;
                for (const { labels, value } of g.entries()) {
                    lines.push(`${name}${serializeLabels(labels)} ${value}`);
                    hasValues = true;
                }
                if (!hasValues) {
                    lines.push(`${name} 0`);
                }
            }
            else if (entry.kind === 'histogram') {
                const h = entry.metric;
                const bounds = h.getBounds();
                for (const s of h.allSeries()) {
                    for (const b of bounds) {
                        const cnt = s.buckets.get(b) ?? 0;
                        lines.push(`${name}_bucket${serializeLabelsWithExtra(s.labels, 'le', String(b))} ${cnt}`);
                    }
                    lines.push(`${name}_bucket${serializeLabelsWithExtra(s.labels, 'le', '+Inf')} ${s.count}`);
                    lines.push(`${name}_sum${serializeLabels(s.labels)} ${s.sum}`);
                    lines.push(`${name}_count${serializeLabels(s.labels)} ${s.count}`);
                }
            }
        }
        return lines.join('\n') + '\n';
    }
}
exports.MetricsRegistry = MetricsRegistry;
/** Global per-process registry. */
exports.globalRegistry = new MetricsRegistry();
/**
 * Get or create a counter in the global registry.
 */
function counter(name, help = '') {
    return exports.globalRegistry.counter(name, help);
}
/**
 * Get or create a gauge in the global registry.
 */
function gauge(name, help = '') {
    return exports.globalRegistry.gauge(name, help);
}
/**
 * Get or create a histogram in the global registry.
 */
function histogram(name, help = '', buckets) {
    return exports.globalRegistry.histogram(name, help, buckets);
}
/**
 * Express-compatible middleware that records request duration and count for every route.
 *
 * Records standard labels: service, method, route, status_code.
 */
function expressMetricsMiddleware(serviceName) {
    const service = serviceName ?? process.env['SERVICE_NAME'] ?? 'unknown';
    const requestDuration = histogram('http_request_duration_ms', 'HTTP request duration in milliseconds');
    const requestTotal = counter('http_requests_total', 'Total number of HTTP requests');
    return (req, res, next) => {
        const method = req.method ?? 'GET';
        const endTimer = requestDuration.startTimer();
        res.on('finish', () => {
            const route = req.route?.path ?? req.url ?? '/';
            const statusCode = String(res.statusCode);
            const labels = { service, method, route, status_code: statusCode };
            endTimer(labels);
            requestTotal.inc(labels);
        });
        next();
    };
}
/**
 * Returns a handler for plain `http.createServer` that serves Prometheus metrics at `/metrics`.
 *
 * Usage:
 * ```ts
 * const metricsHandler = prometheusHandler();
 * // In your HTTP handler:
 * if (url.pathname === '/metrics') { metricsHandler(req, res); return; }
 * ```
 */
function prometheusHandler() {
    return (_req, res) => {
        const body = exports.globalRegistry.format();
        res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        });
        res.end(body);
    };
}
//# sourceMappingURL=index.js.map