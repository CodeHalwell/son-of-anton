"use strict";
// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsRegistry = void 0;
exports.prometheusHandler = prometheusHandler;
exports.expressMetricsMiddleware = expressMetricsMiddleware;
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
function renderLabels(labels) {
    const pairs = Object.entries(labels)
        .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
        .join(',');
    return pairs ? `{${pairs}}` : '';
}
// ── Counter ────────────────────────────────────────────────────────────────
class CounterMetric {
    name;
    help;
    values = new Map();
    constructor(name, help) {
        this.name = name;
        this.help = help;
    }
    inc(labels = {}, amount = 1) {
        const key = JSON.stringify(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + amount);
    }
    render() {
        if (this.values.size === 0) {
            return '';
        }
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
        for (const [key, value] of this.values) {
            const labels = JSON.parse(key);
            lines.push(`${this.name}${renderLabels(labels)} ${value}`);
        }
        return lines.join('\n');
    }
}
// ── Gauge ──────────────────────────────────────────────────────────────────
class GaugeMetric {
    name;
    help;
    values = new Map();
    constructor(name, help) {
        this.name = name;
        this.help = help;
    }
    set(labels = {}, value) {
        this.values.set(JSON.stringify(labels), value);
    }
    inc(labels = {}, amount = 1) {
        const key = JSON.stringify(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + amount);
    }
    dec(labels = {}, amount = 1) {
        const key = JSON.stringify(labels);
        this.values.set(key, (this.values.get(key) ?? 0) - amount);
    }
    render() {
        if (this.values.size === 0) {
            return '';
        }
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
        for (const [key, value] of this.values) {
            const labels = JSON.parse(key);
            lines.push(`${this.name}${renderLabels(labels)} ${value}`);
        }
        return lines.join('\n');
    }
}
class HistogramMetric {
    name;
    help;
    buckets;
    series = new Map();
    constructor(name, help, buckets) {
        this.name = name;
        this.help = help;
        this.buckets = buckets;
    }
    observe(labels = {}, value) {
        const key = JSON.stringify(labels);
        let state = this.series.get(key);
        if (!state) {
            state = { counts: new Map(), sum: 0, total: 0 };
            this.series.set(key, state);
        }
        for (const bound of this.buckets) {
            if (value <= bound) {
                state.counts.set(bound, (state.counts.get(bound) ?? 0) + 1);
            }
        }
        state.sum += value;
        state.total += 1;
    }
    startTimer(labels = {}) {
        const start = Date.now();
        return () => this.observe(labels, (Date.now() - start) / 1000);
    }
    render() {
        if (this.series.size === 0) {
            return '';
        }
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
        for (const [key, state] of this.series) {
            const labels = JSON.parse(key);
            const labelStr = renderLabels(labels);
            const baseLabelStr = renderLabels(labels);
            for (const bound of this.buckets) {
                const leLabels = Object.keys(labels).length > 0
                    ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="${bound}"}`
                    : `{le="${bound}"}`;
                lines.push(`${this.name}_bucket${leLabels} ${state.counts.get(bound) ?? 0}`);
            }
            const infLabels = Object.keys(labels).length > 0
                ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="+Inf"}`
                : `{le="+Inf"}`;
            lines.push(`${this.name}_bucket${infLabels} ${state.total}`);
            lines.push(`${this.name}_sum${baseLabelStr} ${state.sum}`);
            lines.push(`${this.name}_count${labelStr} ${state.total}`);
        }
        return lines.join('\n');
    }
}
// ── Registry ───────────────────────────────────────────────────────────────
class MetricsRegistry {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    counter(name, help) {
        if (!this.counters.has(name)) {
            this.counters.set(name, new CounterMetric(name, help));
        }
        return this.counters.get(name);
    }
    gauge(name, help) {
        if (!this.gauges.has(name)) {
            this.gauges.set(name, new GaugeMetric(name, help));
        }
        return this.gauges.get(name);
    }
    histogram(name, help, buckets = DEFAULT_BUCKETS) {
        if (!this.histograms.has(name)) {
            this.histograms.set(name, new HistogramMetric(name, help, buckets));
        }
        return this.histograms.get(name);
    }
    prometheus() {
        const parts = [];
        for (const m of this.counters.values()) {
            const rendered = m.render();
            if (rendered) {
                parts.push(rendered);
            }
        }
        for (const m of this.gauges.values()) {
            const rendered = m.render();
            if (rendered) {
                parts.push(rendered);
            }
        }
        for (const m of this.histograms.values()) {
            const rendered = m.render();
            if (rendered) {
                parts.push(rendered);
            }
        }
        return parts.join('\n') + (parts.length > 0 ? '\n' : '');
    }
}
exports.MetricsRegistry = MetricsRegistry;
// ── HTTP handler (raw Node.js) ─────────────────────────────────────────────
function prometheusHandler(registry) {
    return (_req, res) => {
        const text = registry.prometheus();
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(text);
    };
}
function expressMetricsMiddleware(registry, serviceName) {
    const requestDuration = registry.histogram('http_request_duration_seconds', 'HTTP request duration in seconds', [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
    const requestsTotal = registry.counter('http_requests_total', 'Total HTTP requests');
    return (req, res, next) => {
        const done = requestDuration.startTimer({
            service: serviceName,
            method: req.method,
            route: req.route?.path ?? req.path,
        });
        res.on('finish', () => {
            done();
            requestsTotal.inc({
                service: serviceName,
                method: req.method,
                route: req.route?.path ?? req.path,
                status_code: String(res.statusCode),
            });
        });
        next();
    };
}
//# sourceMappingURL=index.js.map