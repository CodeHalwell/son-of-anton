// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MetricsRegistry, prometheusHandler } from '../src/index.js';

describe('MetricsRegistry', () => {
	test('counter increments and renders Prometheus text', () => {
		const reg = new MetricsRegistry();
		const c = reg.counter('test_requests_total', 'Total test requests');
		c.inc();
		c.inc({ method: 'GET' }, 5);

		const text = reg.prometheus();
		assert.ok(text.includes('# HELP test_requests_total Total test requests'));
		assert.ok(text.includes('# TYPE test_requests_total counter'));
		assert.ok(text.includes('test_requests_total 1'));
		assert.ok(text.includes('test_requests_total{method="GET"} 5'));
	});

	test('counter returns same instance for same name', () => {
		const reg = new MetricsRegistry();
		const c1 = reg.counter('dup_counter', 'Dup');
		const c2 = reg.counter('dup_counter', 'Dup');
		c1.inc({}, 3);
		c2.inc({}, 2);
		const text = reg.prometheus();
		assert.ok(text.includes('dup_counter 5'));
	});

	test('gauge set and inc/dec renders correctly', () => {
		const reg = new MetricsRegistry();
		const g = reg.gauge('active_sessions', 'Active sessions');
		g.set({ service: 'model-router' }, 10);
		g.inc({ service: 'model-router' }, 2);
		g.dec({ service: 'model-router' }, 3);

		const text = reg.prometheus();
		assert.ok(text.includes('# TYPE active_sessions gauge'));
		assert.ok(text.includes('active_sessions{service="model-router"} 9'));
	});

	test('histogram observe renders buckets, sum, count', () => {
		const reg = new MetricsRegistry();
		const h = reg.histogram('req_duration_seconds', 'Request duration', [0.1, 0.5, 1]);
		h.observe({ service: 'indexer' }, 0.05);
		h.observe({ service: 'indexer' }, 0.3);
		h.observe({ service: 'indexer' }, 0.8);

		const text = reg.prometheus();
		assert.ok(text.includes('# TYPE req_duration_seconds histogram'));
		assert.ok(text.includes('le="0.1"} 1'));
		assert.ok(text.includes('le="0.5"} 2'));
		assert.ok(text.includes('le="1"} 3'));
		assert.ok(text.includes('le="+Inf"} 3'));
		assert.ok(text.includes('req_duration_seconds_count{service="indexer"} 3'));
		const sumMatch = text.match(/req_duration_seconds_sum\{service="indexer"\} ([\d.]+)/);
		assert.ok(sumMatch);
		assert.ok(Math.abs(parseFloat(sumMatch[1]) - 1.15) < 0.001);
	});

	test('histogram startTimer records elapsed seconds', async () => {
		const reg = new MetricsRegistry();
		const h = reg.histogram('timer_test_seconds', 'Timer test', [1]);
		const done = h.startTimer({ op: 'noop' });
		await new Promise(r => setTimeout(r, 10));
		done();

		const text = reg.prometheus();
		assert.ok(text.includes('timer_test_seconds_count{op="noop"} 1'));
	});

	test('empty registry produces empty string', () => {
		const reg = new MetricsRegistry();
		assert.strictEqual(reg.prometheus(), '');
	});

	test('metrics with no observations do not appear in output', () => {
		const reg = new MetricsRegistry();
		reg.counter('unused_counter', 'Unused');
		reg.gauge('unused_gauge', 'Unused');
		reg.histogram('unused_hist', 'Unused', [1]);
		assert.strictEqual(reg.prometheus(), '');
	});

	test('label values with special characters are escaped', () => {
		const reg = new MetricsRegistry();
		const c = reg.counter('escaped_labels_total', 'Escaped');
		c.inc({ path: '/api/"test"\n' });
		const text = reg.prometheus();
		assert.ok(text.includes('\\"test\\"'));
		assert.ok(text.includes('\\n'));
	});

	test('prometheusHandler writes Prometheus text with correct content-type', () => {
		const reg = new MetricsRegistry();
		reg.counter('handler_test_total', 'Test').inc();

		const handler = prometheusHandler(reg);

		let writtenHead: [number, Record<string, string>] | undefined;
		let writtenBody = '';
		const mockReq = {} as never;
		const mockRes = {
			writeHead(code: number, headers: Record<string, string>) {
				writtenHead = [code, headers];
			},
			end(body: string) {
				writtenBody = body;
			},
		} as never;

		handler(mockReq, mockRes);

		assert.ok(writtenHead);
		assert.strictEqual(writtenHead[0], 200);
		assert.ok(writtenHead[1]['Content-Type'].startsWith('text/plain'));
		assert.ok(writtenBody.includes('handler_test_total'));
	});
});
