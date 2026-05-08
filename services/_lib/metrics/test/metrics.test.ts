// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MetricRegistry, CounterMetric, GaugeMetric, HistogramMetric } from '../src/registry.js';

let registry: MetricRegistry;

describe('MetricRegistry', () => {
	beforeEach(() => {
		registry = new MetricRegistry();
	});

	describe('Counter', () => {
		test('returns same instance on repeated calls', () => {
			const a = registry.counter('req_total', 'help');
			const b = registry.counter('req_total', 'help');
			assert.strictEqual(a, b);
		});

		test('increments by 1 by default', () => {
			const c = registry.counter('c', 'h');
			c.inc();
			c.inc();
			const out = registry.collect();
			assert.match(out, /c\s+2/);
		});

		test('increments by specified amount', () => {
			const c = registry.counter('c2', 'h');
			c.inc({}, 5);
			const out = registry.collect();
			assert.match(out, /c2\s+5/);
		});

		test('distinguishes label sets', () => {
			const c = registry.counter('by_method', 'h');
			c.inc({ method: 'GET' }, 3);
			c.inc({ method: 'POST' }, 7);
			const out = registry.collect();
			assert.match(out, /by_method\{method="GET"\}\s+3/);
			assert.match(out, /by_method\{method="POST"\}\s+7/);
		});

		test('reset clears all values (no value lines emitted)', () => {
			const c = registry.counter('c3', 'h');
			c.inc({}, 10);
			c.reset();
			const out = registry.collect();
			// HELP/TYPE lines remain but no sample line with a number
			assert.doesNotMatch(out, /^c3[\s{]/m);
		});
	});

	describe('Gauge', () => {
		test('set replaces the value', () => {
			const g = registry.gauge('temp', 'h');
			g.set(100, { host: 'a' });
			g.set(42, { host: 'a' });
			const out = registry.collect();
			assert.match(out, /temp\{host="a"\}\s+42/);
		});

		test('inc and dec adjust the value', () => {
			const g = registry.gauge('active', 'h');
			g.inc({}, 3);
			g.dec({}, 1);
			const out = registry.collect();
			assert.match(out, /active\s+2/);
		});
	});

	describe('Histogram', () => {
		test('observe records count, sum, and bucket cumulative counts', () => {
			const h = registry.histogram('latency', 'h', [0.1, 0.5, 1.0]);
			h.observe(0.05);
			h.observe(0.3);
			h.observe(0.8);
			const out = registry.collect();
			assert.match(out, /latency_count\s+3/);
			assert.match(out, /latency_sum\s+1\.15/);
			// 0.05 <= 0.1 → bucket le=0.1 count=1
			assert.match(out, /latency_bucket\{le="0\.1"\}\s+1/);
			// 0.05 + 0.3 <= 0.5 → bucket le=0.5 count=2
			assert.match(out, /latency_bucket\{le="0\.5"\}\s+2/);
			// all three <= 1.0
			assert.match(out, /latency_bucket\{le="1"\}\s+3/);
			// +Inf always equals total count
			assert.match(out, /latency_bucket\{le="\+Inf"\}\s+3/);
		});

		test('separates histogram samples by label set', () => {
			const h = registry.histogram('rpc', 'h', [1]);
			h.observe(0.5, { method: 'A' });
			h.observe(2.0, { method: 'B' });
			const out = registry.collect();
			assert.match(out, /rpc_count\{method="A"\}\s+1/);
			assert.match(out, /rpc_count\{method="B"\}\s+1/);
		});
	});

	describe('Prometheus text format', () => {
		test('includes HELP and TYPE lines for each metric', () => {
			registry.counter('alpha', 'alpha help');
			registry.gauge('beta', 'beta help');
			registry.histogram('gamma', 'gamma help');
			const out = registry.collect();
			assert.match(out, /# HELP alpha alpha help/);
			assert.match(out, /# TYPE alpha counter/);
			assert.match(out, /# HELP beta beta help/);
			assert.match(out, /# TYPE beta gauge/);
			assert.match(out, /# HELP gamma gamma help/);
			assert.match(out, /# TYPE gamma histogram/);
		});

		test('escapes special characters in label values', () => {
			const c = registry.counter('escaped', 'h');
			c.inc({ path: '/a"b\nc' });
			const out = registry.collect();
			assert.match(out, /path="\/a\\"b\\nc"/);
		});

		test('registry reset clears all metric values (no sample lines)', () => {
			const c = registry.counter('r1', 'h');
			const g = registry.gauge('r2', 'h');
			c.inc();
			g.set(99);
			registry.reset();
			const out = registry.collect();
			// After reset, no sample lines — only HELP/TYPE headers remain
			assert.doesNotMatch(out, /^r1[\s{]/m);
			assert.doesNotMatch(out, /^r2[\s{]/m);
		});
	});
});

describe('CounterMetric standalone', () => {
	test('accumulates across multiple inc calls', () => {
		const c = new CounterMetric();
		c.inc({ a: '1' });
		c.inc({ a: '1' });
		c.inc({ a: '2' });
		const result = c.collect()
			.map(s => ({ a: s.labels['a'] ?? '', v: s.value }))
			.sort((a, b) => a.a.localeCompare(b.a));
		assert.deepStrictEqual(result, [{ a: '1', v: 2 }, { a: '2', v: 1 }]);
	});
});

describe('GaugeMetric standalone', () => {
	test('set overwrites previous value', () => {
		const g = new GaugeMetric();
		g.set(10);
		g.set(20);
		assert.deepStrictEqual(g.collect(), [{ labels: {}, value: 20 }]);
	});
});

describe('HistogramMetric standalone', () => {
	test('buckets are cumulative — each bucket includes all observations <= bound', () => {
		const h = new HistogramMetric([1, 2, 3]);
		h.observe(1);
		h.observe(2);
		h.observe(3);
		const [sample] = h.collect();
		assert.ok(sample);
		// bucket le=1 → 1 observation
		assert.strictEqual(sample.buckets.get(1), 1);
		// bucket le=2 → 2 observations (1 and 2)
		assert.strictEqual(sample.buckets.get(2), 2);
		// bucket le=3 → 3 observations
		assert.strictEqual(sample.buckets.get(3), 3);
		// bucket le=+Inf → all
		assert.strictEqual(sample.buckets.get(Infinity), 3);
		assert.strictEqual(sample.sum, 6);
		assert.strictEqual(sample.count, 3);
	});
});
