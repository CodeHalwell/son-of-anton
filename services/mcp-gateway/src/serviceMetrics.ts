// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

/**
 * Self-contained Prometheus metrics helpers for Son-of-Anton services.
 *
 * Mirrors the public API of services/_lib/metrics/ — replace this file with an
 * import from @son-of-anton/metrics once TypeScript project references are wired
 * across services (same engineering constraint as providers/types.ts mirroring
 * _shared/agent-events/index.ts).
 *
 * API surface intentionally matches the published package so the migration is
 * a one-line import change.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ---- types ----

type LabelSet = Record<string, string>;

// ---- serialisation ----

function labelKey(labels: LabelSet): string {
	return JSON.stringify(Object.entries(labels).sort());
}

function renderLabels(labels: LabelSet): string {
	const pairs = Object.entries(labels);
	if (pairs.length === 0) {
		return '';
	}
	return '{' + pairs
		.map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
		.join(',') + '}';
}

// ---- Counter ----

class CounterMetric {
	private readonly values = new Map<string, { labels: LabelSet; value: number }>();

	inc(labels: LabelSet = {}, amount = 1): void {
		if (amount < 0) {
			throw new Error(`Counter increment must be non-negative; got ${amount}`);
		}
		const key = labelKey(labels);
		const entry = this.values.get(key);
		if (entry) {
			entry.value += amount;
		} else {
			this.values.set(key, { labels: { ...labels }, value: amount });
		}
	}

	serialize(name: string, help: string): string {
		const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
		for (const { labels, value } of this.values.values()) {
			lines.push(`${name}${renderLabels(labels)} ${value}`);
		}
		return lines.join('\n');
	}
}

// ---- Histogram ----

class HistogramMetric {
	private readonly entries = new Map<string, { labels: LabelSet; count: number; sum: number; buckets: number[] }>();

	constructor(private readonly boundaries: number[]) {}

	observe(value: number, labels: LabelSet = {}): void {
		const key = labelKey(labels);
		let entry = this.entries.get(key);
		if (!entry) {
			entry = { labels: { ...labels }, count: 0, sum: 0, buckets: new Array<number>(this.boundaries.length).fill(0) };
			this.entries.set(key, entry);
		}
		entry.count += 1;
		entry.sum += value;
		for (let i = 0; i < this.boundaries.length; i++) {
			if (value <= this.boundaries[i]) {
				entry.buckets[i] += 1;
			}
		}
	}

	serialize(name: string, help: string): string {
		const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
		for (const { labels, count, sum, buckets } of this.entries.values()) {
			for (let i = 0; i < this.boundaries.length; i++) {
				lines.push(`${name}_bucket${renderLabels({ ...labels, le: String(this.boundaries[i]) })} ${buckets[i]}`);
			}
			lines.push(`${name}_bucket${renderLabels({ ...labels, le: '+Inf' })} ${count}`);
			lines.push(`${name}_sum${renderLabels(labels)} ${sum}`);
			lines.push(`${name}_count${renderLabels(labels)} ${count}`);
		}
		return lines.join('\n');
	}
}

// ---- Global registry ----

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface RegisteredCounter { metric: CounterMetric; help: string }
interface RegisteredHistogram { metric: HistogramMetric; help: string }

const counters = new Map<string, RegisteredCounter>();
const histograms = new Map<string, RegisteredHistogram>();

function getOrCreateCounter(name: string, help: string): CounterMetric {
	let entry = counters.get(name);
	if (!entry) {
		entry = { metric: new CounterMetric(), help };
		counters.set(name, entry);
	}
	return entry.metric;
}

function getOrCreateHistogram(name: string, help: string, boundaries = DEFAULT_HISTOGRAM_BUCKETS): HistogramMetric {
	let entry = histograms.get(name);
	if (!entry) {
		entry = { metric: new HistogramMetric(boundaries), help };
		histograms.set(name, entry);
	}
	return entry.metric;
}

function collectPrometheusText(): string {
	const parts: string[] = [];
	for (const [name, { metric, help }] of counters) {
		parts.push(metric.serialize(name, help));
	}
	for (const [name, { metric, help }] of histograms) {
		parts.push(metric.serialize(name, help));
	}
	return parts.join('\n\n') + (parts.length ? '\n' : '');
}

// Pre-register the standard HTTP metrics so they are always present in /metrics output.
const requestDuration = getOrCreateHistogram(
	'http_request_duration_seconds',
	'HTTP request duration in seconds',
	[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
);
const requestsTotal = getOrCreateCounter(
	'http_requests_total',
	'Total number of HTTP requests',
);

// ---- Public API — matches @son-of-anton/metrics exports ----

/** Returns a handler that serves Prometheus text metrics. Works with Express and bare http. */
export function prometheusHandler(): (req: IncomingMessage, res: ServerResponse) => void {
	return (_req, res) => {
		const body = collectPrometheusText();
		res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
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
	durationMs: number,
): void {
	const labels = { service, method, route, status_code: String(statusCode) };
	requestDuration.observe(durationMs / 1000, labels);
	requestsTotal.inc(labels);
}

/** Express middleware that records request duration and count per route. */
export function expressMetricsMiddleware(
	options: { service: string },
): (req: { method: string; route?: { path: string } },
	res: { statusCode: number; on(event: string, fn: () => void): void },
	next: () => void) => void {
	const { service } = options;
	return (req, res, next) => {
		const start = Date.now();
		res.on('finish', () => {
			const durationSeconds = (Date.now() - start) / 1000;
			const route = (req.route?.path as string | undefined) ?? 'unknown';
			const labels = { service, method: req.method, route, status_code: String(res.statusCode) };
			requestDuration.observe(durationSeconds, labels);
			requestsTotal.inc(labels);
		});
		next();
	};
}
