"use strict";
// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const index_1 = require("../index");
// Each test suite creates an isolated registry to avoid cross-test contamination.
function makeRegistry() {
    return new index_1.MetricsRegistry();
}
(0, node_test_1.describe)('Counter', () => {
    (0, node_test_1.test)('starts at zero and increments', () => {
        const c = new index_1.Counter();
        c.inc();
        c.inc();
        const values = [...c.entries()];
        strict_1.default.deepStrictEqual(values, [{ labels: {}, value: 2 }]);
    });
    (0, node_test_1.test)('segregates by labels', () => {
        const c = new index_1.Counter();
        c.inc({ provider: 'a' });
        c.inc({ provider: 'b' });
        c.inc({ provider: 'a' });
        const values = [...c.entries()].sort((x, y) => x.labels['provider'].localeCompare(y.labels['provider']));
        strict_1.default.deepStrictEqual(values, [
            { labels: { provider: 'a' }, value: 2 },
            { labels: { provider: 'b' }, value: 1 },
        ]);
    });
    (0, node_test_1.test)('inc with custom amount', () => {
        const c = new index_1.Counter();
        c.inc({}, 5);
        c.inc({}, 3);
        strict_1.default.deepStrictEqual([...c.entries()], [{ labels: {}, value: 8 }]);
    });
});
(0, node_test_1.describe)('Gauge', () => {
    (0, node_test_1.test)('set replaces previous value', () => {
        const g = new index_1.Gauge();
        g.set(10);
        g.set(7);
        strict_1.default.deepStrictEqual([...g.entries()], [{ labels: {}, value: 7 }]);
    });
    (0, node_test_1.test)('inc and dec', () => {
        const g = new index_1.Gauge();
        g.inc({}, 5);
        g.dec({}, 2);
        strict_1.default.deepStrictEqual([...g.entries()], [{ labels: {}, value: 3 }]);
    });
    (0, node_test_1.test)('segregates by labels', () => {
        const g = new index_1.Gauge();
        g.set(1, { model: 'opus' });
        g.set(2, { model: 'sonnet' });
        const values = [...g.entries()].sort((x, y) => x.labels['model'].localeCompare(y.labels['model']));
        strict_1.default.deepStrictEqual(values, [
            { labels: { model: 'opus' }, value: 1 },
            { labels: { model: 'sonnet' }, value: 2 },
        ]);
    });
});
(0, node_test_1.describe)('Histogram', () => {
    (0, node_test_1.test)('observe increments correct cumulative buckets', () => {
        const h = new index_1.Histogram([10, 50, 100]);
        h.observe(30);
        const series = [...h.allSeries()];
        strict_1.default.equal(series.length, 1);
        const s = series[0];
        strict_1.default.equal(s.count, 1);
        strict_1.default.equal(s.sum, 30);
        // 30 <= 50 and 30 <= 100, not <= 10
        strict_1.default.equal(s.buckets.get(10), undefined);
        strict_1.default.equal(s.buckets.get(50), 1);
        strict_1.default.equal(s.buckets.get(100), 1);
    });
    (0, node_test_1.test)('observation above all bounds only in +Inf (count)', () => {
        const h = new index_1.Histogram([10, 50]);
        h.observe(200);
        const s = [...h.allSeries()][0];
        strict_1.default.equal(s.count, 1);
        strict_1.default.equal(s.buckets.get(10), undefined);
        strict_1.default.equal(s.buckets.get(50), undefined);
    });
    (0, node_test_1.test)('startTimer returns elapsed ms', async () => {
        const h = new index_1.Histogram([5, 50, 500]);
        const end = h.startTimer();
        await new Promise(r => setTimeout(r, 10));
        end();
        const s = [...h.allSeries()][0];
        strict_1.default.equal(s.count, 1);
        strict_1.default.ok(s.sum >= 10, `expected sum >= 10, got ${s.sum}`);
    });
    (0, node_test_1.test)('labels passed to startTimer end function', () => {
        const h = new index_1.Histogram([100]);
        const end = h.startTimer();
        end({ route: '/health' });
        const series = [...h.allSeries()];
        strict_1.default.equal(series.length, 1);
        strict_1.default.deepStrictEqual(series[0].labels, { route: '/health' });
    });
});
(0, node_test_1.describe)('MetricsRegistry', () => {
    (0, node_test_1.test)('returns same instance for same name and kind', () => {
        const reg = makeRegistry();
        const c1 = reg.counter('test_counter');
        const c2 = reg.counter('test_counter');
        strict_1.default.equal(c1, c2);
    });
    (0, node_test_1.test)('throws when same name registered with different kind', () => {
        const reg = makeRegistry();
        reg.counter('dup');
        strict_1.default.throws(() => reg.gauge('dup'), /already registered/);
    });
    (0, node_test_1.test)('format() emits correct Prometheus text for counter', () => {
        const reg = makeRegistry();
        const c = reg.counter('req_total', 'Total requests');
        c.inc({ method: 'GET' }, 3);
        c.inc({ method: 'POST' }, 1);
        const text = reg.format();
        strict_1.default.ok(text.includes('# HELP req_total Total requests'));
        strict_1.default.ok(text.includes('# TYPE req_total counter'));
        strict_1.default.ok(text.includes('req_total{method="GET"} 3'));
        strict_1.default.ok(text.includes('req_total{method="POST"} 1'));
    });
    (0, node_test_1.test)('format() emits correct Prometheus text for gauge', () => {
        const reg = makeRegistry();
        const g = reg.gauge('active_sessions', 'Active sessions');
        g.set(5);
        const text = reg.format();
        strict_1.default.ok(text.includes('# TYPE active_sessions gauge'));
        strict_1.default.ok(text.includes('active_sessions 5'));
    });
    (0, node_test_1.test)('format() emits correct Prometheus text for histogram', () => {
        const reg = makeRegistry();
        const h = reg.histogram('latency_ms', 'Request latency', [10, 100]);
        h.observe(50, { provider: 'anthropic' });
        const text = reg.format();
        strict_1.default.ok(text.includes('# TYPE latency_ms histogram'));
        strict_1.default.ok(text.includes('latency_ms_bucket{provider="anthropic",le="10"} 0'));
        strict_1.default.ok(text.includes('latency_ms_bucket{provider="anthropic",le="100"} 1'));
        strict_1.default.ok(text.includes('latency_ms_bucket{provider="anthropic",le="+Inf"} 1'));
        strict_1.default.ok(text.includes('latency_ms_sum{provider="anthropic"} 50'));
        strict_1.default.ok(text.includes('latency_ms_count{provider="anthropic"} 1'));
    });
    (0, node_test_1.test)('counter emits zero line when no observations', () => {
        const reg = makeRegistry();
        reg.counter('empty_counter', 'Unused counter');
        const text = reg.format();
        strict_1.default.ok(text.includes('empty_counter 0'));
    });
    (0, node_test_1.test)('label values with special characters are escaped', () => {
        const reg = makeRegistry();
        const c = reg.counter('escaped', 'Escape test');
        c.inc({ path: '/foo"bar' });
        const text = reg.format();
        strict_1.default.ok(text.includes('path="/foo\\"bar"'), `unexpected text: ${text}`);
    });
});
//# sourceMappingURL=metrics.test.js.map