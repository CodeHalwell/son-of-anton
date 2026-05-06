// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Counter, Gauge, Histogram, MetricsRegistry } from '../index';

// Each test suite creates an isolated registry to avoid cross-test contamination.
function makeRegistry(): MetricsRegistry {
	return new (MetricsRegistry as any)();
}

describe('Counter', () => {
	test('starts at zero and increments', () => {
		const c = new Counter();
		c.inc();
		c.inc();
		const values = [...c.entries()];
		assert.deepStrictEqual(values, [{ labels: {}, value: 2 }]);
	});

	test('segregates by labels', () => {
		const c = new Counter();
		c.inc({ provider: 'a' });
		c.inc({ provider: 'b' });
		c.inc({ provider: 'a' });
		const values = [...c.entries()].sort((x, y) => x.labels['provider']!.localeCompare(y.labels['provider']!));
		assert.deepStrictEqual(values, [
			{ labels: { provider: 'a' }, value: 2 },
			{ labels: { provider: 'b' }, value: 1 },
		]);
	});

	test('inc with custom amount', () => {
		const c = new Counter();
		c.inc({}, 5);
		c.inc({}, 3);
		assert.deepStrictEqual([...c.entries()], [{ labels: {}, value: 8 }]);
	});
});

describe('Gauge', () => {
	test('set replaces previous value', () => {
		const g = new Gauge();
		g.set(10);
		g.set(7);
		assert.deepStrictEqual([...g.entries()], [{ labels: {}, value: 7 }]);
	});

	test('inc and dec', () => {
		const g = new Gauge();
		g.inc({}, 5);
		g.dec({}, 2);
		assert.deepStrictEqual([...g.entries()], [{ labels: {}, value: 3 }]);
	});

	test('segregates by labels', () => {
		const g = new Gauge();
		g.set(1, { model: 'opus' });
		g.set(2, { model: 'sonnet' });
		const values = [...g.entries()].sort((x, y) => x.labels['model']!.localeCompare(y.labels['model']!));
		assert.deepStrictEqual(values, [
			{ labels: { model: 'opus' }, value: 1 },
			{ labels: { model: 'sonnet' }, value: 2 },
		]);
	});
});

describe('Histogram', () => {
	test('observe increments correct cumulative buckets', () => {
		const h = new Histogram([10, 50, 100]);
		h.observe(30);
		const series = [...h.allSeries()];
		assert.equal(series.length, 1);
		const s = series[0]!;
		assert.equal(s.count, 1);
		assert.equal(s.sum, 30);
		// 30 <= 50 and 30 <= 100, not <= 10
		assert.equal(s.buckets.get(10), undefined);
		assert.equal(s.buckets.get(50), 1);
		assert.equal(s.buckets.get(100), 1);
	});

	test('observation above all bounds only in +Inf (count)', () => {
		const h = new Histogram([10, 50]);
		h.observe(200);
		const s = [...h.allSeries()][0]!;
		assert.equal(s.count, 1);
		assert.equal(s.buckets.get(10), undefined);
		assert.equal(s.buckets.get(50), undefined);
	});

	test('startTimer returns elapsed ms', async () => {
		const h = new Histogram([5, 50, 500]);
		const end = h.startTimer();
		await new Promise(r => setTimeout(r, 10));
		end();
		const s = [...h.allSeries()][0]!;
		assert.equal(s.count, 1);
		assert.ok(s.sum >= 10, `expected sum >= 10, got ${s.sum}`);
	});

	test('labels passed to startTimer end function', () => {
		const h = new Histogram([100]);
		const end = h.startTimer();
		end({ route: '/health' });
		const series = [...h.allSeries()];
		assert.equal(series.length, 1);
		assert.deepStrictEqual(series[0]!.labels, { route: '/health' });
	});
});

describe('MetricsRegistry', () => {
	test('returns same instance for same name and kind', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		const c1 = reg.counter('test_counter');
		const c2 = reg.counter('test_counter');
		assert.equal(c1, c2);
	});

	test('throws when same name registered with different kind', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		reg.counter('dup');
		assert.throws(() => reg.gauge('dup'), /already registered/);
	});

	test('format() emits correct Prometheus text for counter', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		const c = reg.counter('req_total', 'Total requests');
		c.inc({ method: 'GET' }, 3);
		c.inc({ method: 'POST' }, 1);
		const text = reg.format();
		assert.ok(text.includes('# HELP req_total Total requests'));
		assert.ok(text.includes('# TYPE req_total counter'));
		assert.ok(text.includes('req_total{method="GET"} 3'));
		assert.ok(text.includes('req_total{method="POST"} 1'));
	});

	test('format() emits correct Prometheus text for gauge', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		const g = reg.gauge('active_sessions', 'Active sessions');
		g.set(5);
		const text = reg.format();
		assert.ok(text.includes('# TYPE active_sessions gauge'));
		assert.ok(text.includes('active_sessions 5'));
	});

	test('format() emits correct Prometheus text for histogram', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		const h = reg.histogram('latency_ms', 'Request latency', [10, 100]);
		h.observe(50, { provider: 'anthropic' });
		const text = reg.format();
		assert.ok(text.includes('# TYPE latency_ms histogram'));
		assert.ok(text.includes('latency_ms_bucket{provider="anthropic",le="10"} 0'));
		assert.ok(text.includes('latency_ms_bucket{provider="anthropic",le="100"} 1'));
		assert.ok(text.includes('latency_ms_bucket{provider="anthropic",le="+Inf"} 1'));
		assert.ok(text.includes('latency_ms_sum{provider="anthropic"} 50'));
		assert.ok(text.includes('latency_ms_count{provider="anthropic"} 1'));
	});

	test('counter emits zero line when no observations', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		reg.counter('empty_counter', 'Unused counter');
		const text = reg.format();
		assert.ok(text.includes('empty_counter 0'));
	});

	test('label values with special characters are escaped', () => {
		const reg = makeRegistry() as any as MetricsRegistry;
		const c = reg.counter('escaped', 'Escape test');
		c.inc({ path: '/foo"bar' });
		const text = reg.format();
		assert.ok(text.includes('path="/foo\\"bar"'), `unexpected text: ${text}`);
	});
});
