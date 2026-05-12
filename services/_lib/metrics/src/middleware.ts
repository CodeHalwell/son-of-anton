// Copyright (c) Son-Of-Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MetricRegistry } from './registry.js';

type NextFn = (err?: unknown) => void;

/** Express-compatible middleware that records HTTP request duration and count. */
export function expressMetricsMiddleware(
	registry: MetricRegistry,
	serviceName: string,
): (req: IncomingMessage, res: ServerResponse, next: NextFn) => void {
	const requestDuration = registry.histogram(
		'http_request_duration_ms',
		'HTTP request duration in milliseconds',
	);
	const requestsTotal = registry.counter(
		'http_requests_total',
		'Total number of HTTP requests',
	);

	return (req: IncomingMessage, res: ServerResponse, next: NextFn): void => {
		const start = Date.now();
		res.on('finish', () => {
			const duration = Date.now() - start;
			const labels = {
				service: serviceName,
				method: req.method ?? 'UNKNOWN',
				route: (req.url ?? '/').split('?')[0],
				status: String(res.statusCode),
			};
			requestDuration.observe(labels, duration);
			requestsTotal.inc(labels);
		});
		next();
	};
}

/** Returns an HTTP handler that serves Prometheus text format metrics. */
export function prometheusHandler(
	registry: MetricRegistry,
): (req: IncomingMessage, res: ServerResponse) => void {
	return (_req: IncomingMessage, res: ServerResponse): void => {
		const body = registry.prometheus();
		res.writeHead(200, {
			'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
			'Content-Length': String(Buffer.byteLength(body)),
		});
		res.end(body);
	};
}
