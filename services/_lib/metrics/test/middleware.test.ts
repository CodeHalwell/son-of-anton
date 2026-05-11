// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { globalRegistry } from '../src/registry.js';
import { recordHttpRequest, prometheusHandler, expressMetricsMiddleware } from '../src/middleware.js';

// Reset global metrics state between tests so counts don't bleed across cases.
beforeEach(() => globalRegistry.reset());

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

function makeExpressReq(opts: { method?: string; route?: string } = {}): {
	method: string;
	route?: { path: string };
} {
	return {
		method: opts.method ?? 'GET',
		...(opts.route !== undefined ? { route: { path: opts.route } } : {}),
	};
}

interface FakeRes extends EventEmitter {
	statusCode: number;
}

function makeExpressRes(statusCode = 200): FakeRes {
	const res = new EventEmitter() as FakeRes;
	res.statusCode = statusCode;
	return res;
}

function makeHttpRes(): { headers: Record<string, string>; statusCode: number; body: string; setHeader(name: string, value: string): void; writeHead(code: number, headers?: Record<string, string>): void; end(data: string): void } {
	const res = {
		headers: {} as Record<string, string>,
		statusCode: 0,
		body: '',
		setHeader(name: string, value: string) {
			this.headers[name] = value;
		},
		writeHead(code: number, headers?: Record<string, string>) {
			this.statusCode = code;
			if (headers) { Object.assign(this.headers, headers); }
		},
		end(data: string) { this.body = data; },
	};
	return res;
}

// ---------------------------------------------------------------------------
// recordHttpRequest
// ---------------------------------------------------------------------------

describe('recordHttpRequest', () => {
	test('emits counter and histogram samples', () => {
		recordHttpRequest('svc', 'GET', '/health', 200, 42);
		const out = globalRegistry.collect();
		assert.match(out, /http_requests_total\{.*route="\/health".*\}\s+1/);
		assert.match(out, /http_request_duration_seconds_count\{.*route="\/health".*\}\s+1/);
	});

	test('accumulates across multiple calls', () => {
		recordHttpRequest('svc', 'POST', '/api', 201, 10);
		recordHttpRequest('svc', 'POST', '/api', 201, 20);
		const out = globalRegistry.collect();
		assert.match(out, /http_requests_total\{.*route="\/api".*\}\s+2/);
	});

	test('uses status_code as a label', () => {
		recordHttpRequest('svc', 'GET', '/x', 404, 5);
		const out = globalRegistry.collect();
		assert.match(out, /status_code="404"/);
	});
});

// ---------------------------------------------------------------------------
// prometheusHandler
// ---------------------------------------------------------------------------

describe('prometheusHandler', () => {
	test('returns 200 with Prometheus content-type', () => {
		const handler = prometheusHandler();
		const res = makeHttpRes();
		// IncomingMessage not needed — handler ignores it
		handler({} as never, res as never);
		assert.strictEqual(res.statusCode, 200);
		assert.match(res.headers['Content-Type'] ?? '', /text\/plain/);
	});

	test('body includes registered metrics', () => {
		recordHttpRequest('svc', 'GET', '/ping', 200, 1);
		const handler = prometheusHandler();
		const res = makeHttpRes();
		handler({} as never, res as never);
		assert.match(res.body, /http_requests_total/);
	});
});

// ---------------------------------------------------------------------------
// expressMetricsMiddleware
// ---------------------------------------------------------------------------

describe('expressMetricsMiddleware', () => {
	test('calls next()', () => {
		const middleware = expressMetricsMiddleware({ service: 'test' });
		let called = false;
		const req = makeExpressReq({ method: 'GET', route: '/health' });
		const res = makeExpressRes(200);
		middleware(req, res, () => { called = true; });
		assert.ok(called);
	});

	test('records metrics on finish', () => {
		const middleware = expressMetricsMiddleware({ service: 'test' });
		const req = makeExpressReq({ method: 'GET', route: '/items' });
		const res = makeExpressRes(200);
		middleware(req, res, () => {});
		res.emit('finish');
		const out = globalRegistry.collect();
		assert.match(out, /http_requests_total\{.*route="\/items".*\}\s+1/);
	});

	test('falls back to "unknown" when route is not resolved', () => {
		const middleware = expressMetricsMiddleware({ service: 'test' });
		// No route property on request
		const req = makeExpressReq({ method: 'GET' });
		const res = makeExpressRes(200);
		middleware(req, res, () => {});
		res.emit('finish');
		const out = globalRegistry.collect();
		assert.match(out, /route="unknown"/);
	});

	test('does not record until finish fires', () => {
		const middleware = expressMetricsMiddleware({ service: 'test' });
		const req = makeExpressReq({ method: 'DELETE', route: '/items' });
		const res = makeExpressRes(204);
		middleware(req, res, () => {});
		// finish has not fired yet
		const out = globalRegistry.collect();
		assert.doesNotMatch(out, /http_requests_total\{.*route="\/items".*\}/);
	});
});
