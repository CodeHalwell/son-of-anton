// Copyright (c) Son-Of-Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricRegistry } from '../src/registry.js';

describe('MetricRegistry', () => {
	it('produces empty output for an empty registry', () => {
		const reg = new MetricRegistry();
		assert.strictEqual(reg.prometheus(), '');
	});

	it('serialises a counter to Prometheus text format', () => {
		const reg = new MetricRegistry();
		const c = reg.counter('test_requests_total', 'Total requests');
		c.inc({ service: 'test', route: '/health' });
		c.inc({ service: 'test', route: '/health' }, 4);

		const output = reg.prometheus();
		assert.ok(output.includes('# HELP test_requests_total Total requests'), 'missing HELP line');
		assert.ok(output.includes('# TYPE test_requests_total counter'), 'missing TYPE line');
		assert.ok(output.includes('test_requests_total{'), 'missing metric line');
		assert.ok(output.includes('} 5'), 'expected count 5');
	});

	it('returns the same Counter instance for repeated counter() calls', () => {
		const reg = new MetricRegistry();
		assert.strictEqual(reg.counter('dup'), reg.counter('dup'));
	});

	it('serialises a gauge with set/inc/dec', () => {
		const reg = new MetricRegistry();
		const g = reg.gauge('active_sessions', 'Number of active sessions');
		g.set({ service: 'test' }, 7);
		g.dec({ service: 'test' });

		const output = reg.prometheus();
		assert.ok(output.includes('# TYPE active_sessions gauge'), 'missing TYPE line');
		assert.ok(output.includes('} 6'), 'expected value 6');
	});

	it('serialises a histogram with cumulative bucket counts', () => {
		const reg = new MetricRegistry();
		const h = reg.histogram('req_duration_ms', 'Request duration', [10, 50, 100]);
		h.observe({ service: 'test' }, 5);
		h.observe({ service: 'test' }, 30);
		h.observe({ service: 'test' }, 80);

		const output = reg.prometheus();
		// bucket le=10: only 5ms qualifies → cumulative 1
		// labels are sorted alphabetically: le < service
		assert.ok(output.includes('le="10",service="test"} 1'), 'le=10 bucket should be 1');
		// bucket le=50: 5ms + 30ms → cumulative 2
		assert.ok(output.includes('le="50",service="test"} 2'), 'le=50 bucket should be 2');
		// bucket le=100: all three → cumulative 3
		assert.ok(output.includes('le="100",service="test"} 3'), 'le=100 bucket should be 3');
		// +Inf = total count = 3
		assert.ok(output.includes('le="+Inf",service="test"} 3'), '+Inf bucket should be 3');
		// sum = 5 + 30 + 80 = 115
		assert.ok(output.includes('req_duration_ms_sum{service="test"} 115'), 'expected sum 115');
		// count = 3
		assert.ok(output.includes('req_duration_ms_count{service="test"} 3'), 'expected count 3');
	});

	it('labels are rendered in alphabetical order', () => {
		const reg = new MetricRegistry();
		const c = reg.counter('label_order_test');
		c.inc({ z: '1', a: '2', m: '3' });

		const output = reg.prometheus();
		const match = output.match(/label_order_test\{([^}]+)\}/);
		assert.ok(match, 'metric line not found');
		assert.strictEqual(match[1], 'a="2",m="3",z="1"', 'labels not in alphabetical order');
	});

	it('accumulates separate label combinations independently', () => {
		const reg = new MetricRegistry();
		const c = reg.counter('multi_label_counter');
		c.inc({ service: 'a' }, 3);
		c.inc({ service: 'b' }, 7);

		const output = reg.prometheus();
		assert.ok(output.includes('service="a"} 3'), 'service=a count wrong');
		assert.ok(output.includes('service="b"} 7'), 'service=b count wrong');
	});
});
