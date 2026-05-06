// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type Labels = Record<string, string>;

const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function escapeLabel(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function serializeLabels(labels: Labels): string {
	const pairs = Object.entries(labels);
	if (pairs.length === 0) {
		return '';
	}
	return `{${pairs.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`;
}

function serializeLabelsWithExtra(labels: Labels, extraKey: string, extraValue: string): string {
	const pairs = [...Object.entries(labels), [extraKey, extraValue]];
	return `{${pairs.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`;
}

// --- Counter ---

export class Counter {
	private readonly values = new Map<string, { labels: Labels; value: number }>();

	inc(labels: Labels = {}, amount = 1): void {
		const key = serializeLabels(labels);
		const existing = this.values.get(key);
		if (existing) {
			existing.value += amount;
		} else {
			this.values.set(key, { labels, value: amount });
		}
	}

	/** @internal */
	entries(): IterableIterator<{ labels: Labels; value: number }> {
		return this.values.values();
	}
}

// --- Gauge ---

export class Gauge {
	private readonly values = new Map<string, { labels: Labels; value: number }>();

	set(value: number, labels: Labels = {}): void {
		const key = serializeLabels(labels);
		const existing = this.values.get(key);
		if (existing) {
			existing.value = value;
		} else {
			this.values.set(key, { labels, value });
		}
	}

	inc(labels: Labels = {}, amount = 1): void {
		const key = serializeLabels(labels);
		const existing = this.values.get(key);
		if (existing) {
			existing.value += amount;
		} else {
			this.values.set(key, { labels, value: amount });
		}
	}

	dec(labels: Labels = {}, amount = 1): void {
		this.inc(labels, -amount);
	}

	/** @internal */
	entries(): IterableIterator<{ labels: Labels; value: number }> {
		return this.values.values();
	}
}

// --- Histogram ---

interface HistogramSeries {
	labels: Labels;
	sum: number;
	count: number;
	/** Cumulative counts per upper bound — incremented for every bound >= observed value. */
	buckets: Map<number, number>;
}

export class Histogram {
	private readonly series = new Map<string, HistogramSeries>();
	private readonly bounds: number[];

	constructor(buckets: number[] = DEFAULT_HISTOGRAM_BUCKETS) {
		this.bounds = [...buckets].sort((a, b) => a - b);
	}

	observe(value: number, labels: Labels = {}): void {
		const key = serializeLabels(labels);
		let s = this.series.get(key);
		if (!s) {
			s = { labels, sum: 0, count: 0, buckets: new Map() };
			this.series.set(key, s);
		}
		s.sum += value;
		s.count++;
		for (const b of this.bounds) {
			if (value <= b) {
				s.buckets.set(b, (s.buckets.get(b) ?? 0) + 1);
			}
		}
	}

	startTimer(): (labels?: Labels) => void {
		const start = Date.now();
		return (labels: Labels = {}) => this.observe(Date.now() - start, labels);
	}

	/** @internal */
	allSeries(): IterableIterator<HistogramSeries> {
		return this.series.values();
	}

	/** @internal */
	getBounds(): number[] {
		return this.bounds;
	}
}

// --- Global registry ---

type MetricKind = 'counter' | 'gauge' | 'histogram';

interface RegistryEntry {
	kind: MetricKind;
	help: string;
	metric: Counter | Gauge | Histogram;
}

export class MetricsRegistry {
	private readonly entries = new Map<string, RegistryEntry>();

	private register<T extends Counter | Gauge | Histogram>(name: string, kind: MetricKind, help: string, factory: () => T): T {
		const existing = this.entries.get(name);
		if (existing) {
			if (existing.kind !== kind) {
				throw new Error(`Metric "${name}" already registered as ${existing.kind}, cannot re-register as ${kind}`);
			}
			return existing.metric as T;
		}
		const metric = factory();
		this.entries.set(name, { kind, help, metric });
		return metric;
	}

	counter(name: string, help = ''): Counter {
		return this.register(name, 'counter', help, () => new Counter());
	}

	gauge(name: string, help = ''): Gauge {
		return this.register(name, 'gauge', help, () => new Gauge());
	}

	histogram(name: string, help = '', buckets?: number[]): Histogram {
		return this.register(name, 'histogram', help, () => new Histogram(buckets));
	}

	format(): string {
		const lines: string[] = [];
		for (const [name, entry] of this.entries) {
			lines.push(`# HELP ${name} ${entry.help}`);
			lines.push(`# TYPE ${name} ${entry.kind}`);

			if (entry.kind === 'counter') {
				const c = entry.metric as Counter;
				let hasValues = false;
				for (const { labels, value } of c.entries()) {
					lines.push(`${name}${serializeLabels(labels)} ${value}`);
					hasValues = true;
				}
				if (!hasValues) {
					lines.push(`${name} 0`);
				}
			} else if (entry.kind === 'gauge') {
				const g = entry.metric as Gauge;
				let hasValues = false;
				for (const { labels, value } of g.entries()) {
					lines.push(`${name}${serializeLabels(labels)} ${value}`);
					hasValues = true;
				}
				if (!hasValues) {
					lines.push(`${name} 0`);
				}
			} else if (entry.kind === 'histogram') {
				const h = entry.metric as Histogram;
				const bounds = h.getBounds();
				for (const s of h.allSeries()) {
					for (const b of bounds) {
						const cnt = s.buckets.get(b) ?? 0;
						lines.push(`${name}_bucket${serializeLabelsWithExtra(s.labels, 'le', String(b))} ${cnt}`);
					}
					lines.push(`${name}_bucket${serializeLabelsWithExtra(s.labels, 'le', '+Inf')} ${s.count}`);
					lines.push(`${name}_sum${serializeLabels(s.labels)} ${s.sum}`);
					lines.push(`${name}_count${serializeLabels(s.labels)} ${s.count}`);
				}
			}
		}
		return lines.join('\n') + '\n';
	}
}

/** Global per-process registry. */
export const globalRegistry = new MetricsRegistry();

/**
 * Get or create a counter in the global registry.
 */
export function counter(name: string, help = ''): Counter {
	return globalRegistry.counter(name, help);
}

/**
 * Get or create a gauge in the global registry.
 */
export function gauge(name: string, help = ''): Gauge {
	return globalRegistry.gauge(name, help);
}

/**
 * Get or create a histogram in the global registry.
 */
export function histogram(name: string, help = '', buckets?: number[]): Histogram {
	return globalRegistry.histogram(name, help, buckets);
}

/**
 * Express-compatible middleware that records request duration and count for every route.
 *
 * Records standard labels: service, method, route, status_code.
 */
export function expressMetricsMiddleware(serviceName?: string): (req: any, res: any, next: () => void) => void {
	const service = serviceName ?? process.env['SERVICE_NAME'] ?? 'unknown';

	const requestDuration = histogram(
		'http_request_duration_ms',
		'HTTP request duration in milliseconds',
	);
	const requestTotal = counter(
		'http_requests_total',
		'Total number of HTTP requests',
	);

	return (req: any, res: any, next: () => void): void => {
		const method = (req.method as string | undefined) ?? 'GET';
		const endTimer = requestDuration.startTimer();

		res.on('finish', () => {
			const route: string = (req.route as { path?: string } | undefined)?.path ?? (req.url as string | undefined) ?? '/';
			const statusCode = String(res.statusCode as number);
			const labels: Labels = { service, method, route, status_code: statusCode };
			endTimer(labels);
			requestTotal.inc(labels);
		});

		next();
	};
}

/**
 * Returns a handler for plain `http.createServer` that serves Prometheus metrics at `/metrics`.
 *
 * Usage:
 * ```ts
 * const metricsHandler = prometheusHandler();
 * // In your HTTP handler:
 * if (url.pathname === '/metrics') { metricsHandler(req, res); return; }
 * ```
 */
export function prometheusHandler(): (req: IncomingMessage, res: ServerResponse) => void {
	return (_req, res) => {
		const body = globalRegistry.format();
		res.writeHead(200, {
			'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
		});
		res.end(body);
	};
}
