// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type * as http from 'node:http';

export type Labels = Record<string, string>;

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function renderLabels(labels: Labels): string {
	const pairs = Object.entries(labels)
		.map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
		.join(',');
	return pairs ? `{${pairs}}` : '';
}

// ── Counter ────────────────────────────────────────────────────────────────

class CounterMetric {
	private readonly values = new Map<string, number>();

	constructor(
		private readonly name: string,
		private readonly help: string,
	) {}

	inc(labels: Labels = {}, amount = 1): void {
		const key = JSON.stringify(labels);
		this.values.set(key, (this.values.get(key) ?? 0) + amount);
	}

	render(): string {
		if (this.values.size === 0) {
			return '';
		}
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
		for (const [key, value] of this.values) {
			const labels = JSON.parse(key) as Labels;
			lines.push(`${this.name}${renderLabels(labels)} ${value}`);
		}
		return lines.join('\n');
	}
}

// ── Gauge ──────────────────────────────────────────────────────────────────

class GaugeMetric {
	private readonly values = new Map<string, number>();

	constructor(
		private readonly name: string,
		private readonly help: string,
	) {}

	set(labels: Labels = {}, value: number): void {
		this.values.set(JSON.stringify(labels), value);
	}

	inc(labels: Labels = {}, amount = 1): void {
		const key = JSON.stringify(labels);
		this.values.set(key, (this.values.get(key) ?? 0) + amount);
	}

	dec(labels: Labels = {}, amount = 1): void {
		const key = JSON.stringify(labels);
		this.values.set(key, (this.values.get(key) ?? 0) - amount);
	}

	render(): string {
		if (this.values.size === 0) {
			return '';
		}
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
		for (const [key, value] of this.values) {
			const labels = JSON.parse(key) as Labels;
			lines.push(`${this.name}${renderLabels(labels)} ${value}`);
		}
		return lines.join('\n');
	}
}

// ── Histogram ──────────────────────────────────────────────────────────────

interface BucketState {
	counts: Map<number, number>;
	sum: number;
	total: number;
}

class HistogramMetric {
	private readonly series = new Map<string, BucketState>();

	constructor(
		private readonly name: string,
		private readonly help: string,
		private readonly buckets: readonly number[],
	) {}

	observe(labels: Labels = {}, value: number): void {
		const key = JSON.stringify(labels);
		let state = this.series.get(key);
		if (!state) {
			state = { counts: new Map(), sum: 0, total: 0 };
			this.series.set(key, state);
		}
		for (const bound of this.buckets) {
			if (value <= bound) {
				state.counts.set(bound, (state.counts.get(bound) ?? 0) + 1);
			}
		}
		state.sum += value;
		state.total += 1;
	}

	startTimer(labels: Labels = {}): () => void {
		const start = Date.now();
		return () => this.observe(labels, (Date.now() - start) / 1000);
	}

	render(): string {
		if (this.series.size === 0) {
			return '';
		}
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
		for (const [key, state] of this.series) {
			const labels = JSON.parse(key) as Labels;
			const labelStr = renderLabels(labels);
			const baseLabelStr = renderLabels(labels);

			for (const bound of this.buckets) {
				const leLabels = Object.keys(labels).length > 0
					? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="${bound}"}`
					: `{le="${bound}"}`;
				lines.push(`${this.name}_bucket${leLabels} ${state.counts.get(bound) ?? 0}`);
			}
			const infLabels = Object.keys(labels).length > 0
				? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="+Inf"}`
				: `{le="+Inf"}`;
			lines.push(`${this.name}_bucket${infLabels} ${state.total}`);
			lines.push(`${this.name}_sum${baseLabelStr} ${state.sum}`);
			lines.push(`${this.name}_count${labelStr} ${state.total}`);
		}
		return lines.join('\n');
	}
}

// ── Registry ───────────────────────────────────────────────────────────────

export class MetricsRegistry {
	private readonly counters = new Map<string, CounterMetric>();
	private readonly gauges = new Map<string, GaugeMetric>();
	private readonly histograms = new Map<string, HistogramMetric>();

	counter(name: string, help: string): CounterMetric {
		if (!this.counters.has(name)) {
			this.counters.set(name, new CounterMetric(name, help));
		}
		return this.counters.get(name)!;
	}

	gauge(name: string, help: string): GaugeMetric {
		if (!this.gauges.has(name)) {
			this.gauges.set(name, new GaugeMetric(name, help));
		}
		return this.gauges.get(name)!;
	}

	histogram(
		name: string,
		help: string,
		buckets: readonly number[] = DEFAULT_BUCKETS,
	): HistogramMetric {
		if (!this.histograms.has(name)) {
			this.histograms.set(name, new HistogramMetric(name, help, buckets));
		}
		return this.histograms.get(name)!;
	}

	prometheus(): string {
		const parts: string[] = [];
		for (const m of this.counters.values()) {
			const rendered = m.render();
			if (rendered) {
				parts.push(rendered);
			}
		}
		for (const m of this.gauges.values()) {
			const rendered = m.render();
			if (rendered) {
				parts.push(rendered);
			}
		}
		for (const m of this.histograms.values()) {
			const rendered = m.render();
			if (rendered) {
				parts.push(rendered);
			}
		}
		return parts.join('\n') + (parts.length > 0 ? '\n' : '');
	}
}

// ── HTTP handler (raw Node.js) ─────────────────────────────────────────────

export function prometheusHandler(
	registry: MetricsRegistry,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
	return (_req, res) => {
		const text = registry.prometheus();
		res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
		res.end(text);
	};
}

// ── Express middleware (duck-typed to avoid adding express as a dep) ────────

interface ExpressRequest {
	method: string;
	path: string;
	route?: { path: string };
}

interface ExpressResponse {
	statusCode: number;
	on(event: 'finish', listener: () => void): void;
}

export function expressMetricsMiddleware(
	registry: MetricsRegistry,
	serviceName: string,
): (req: ExpressRequest, res: ExpressResponse, next: () => void) => void {
	const requestDuration = registry.histogram(
		'http_request_duration_seconds',
		'HTTP request duration in seconds',
		[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	);
	const requestsTotal = registry.counter(
		'http_requests_total',
		'Total HTTP requests',
	);

	return (req, res, next) => {
		const done = requestDuration.startTimer({
			service: serviceName,
			method: req.method,
			route: req.route?.path ?? req.path,
		});
		res.on('finish', () => {
			done();
			requestsTotal.inc({
				service: serviceName,
				method: req.method,
				route: req.route?.path ?? req.path,
				status_code: String(res.statusCode),
			});
		});
		next();
	};
}
