// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type * as http from 'http';
import { globalRegistry } from './registry.js';

const requestDuration = globalRegistry.histogram(
	'http_request_duration_seconds',
	'HTTP request duration in seconds',
	[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

const requestsTotal = globalRegistry.counter(
	'http_requests_total',
	'Total number of HTTP requests'
);

export interface MiddlewareOptions {
	service: string;
}

type NextFn = () => void;
type ExpressMiddleware = (
	req: { method: string; path: string; route?: { path: string } },
	res: { statusCode: number; on: (event: string, fn: () => void) => void },
	next: NextFn
) => void;

/** Express middleware that records request duration and count per route. */
export function expressMetricsMiddleware(options: MiddlewareOptions): ExpressMiddleware {
	const { service } = options;
	return (req, res, next) => {
		const start = process.hrtime.bigint();
		res.on('finish', () => {
			const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
			const route = (req.route?.path as string | undefined) ?? req.path ?? 'unknown';
			const labels = { service, method: req.method, route, status_code: String(res.statusCode) };
			requestDuration.observe(durationSeconds, labels);
			requestsTotal.inc(labels);
		});
		next();
	};
}

/** Handler that serves Prometheus text format metrics. Works with Express and bare http. */
export function prometheusHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
	return (_req, res) => {
		const body = globalRegistry.collect();
		res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
		res.writeHead(200);
		res.end(body);
	};
}

/**
 * Records a single HTTP request for bare-http services that don't use Express.
 * Call this at the end of each request handler with the resolved route name.
 */
export function recordHttpRequest(
	service: string,
	method: string,
	route: string,
	statusCode: number,
	durationMs: number
): void {
	const labels = { service, method, route, status_code: String(statusCode) };
	requestDuration.observe(durationMs / 1000, labels);
	requestsTotal.inc(labels);
}
