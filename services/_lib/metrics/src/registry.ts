// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { LabelSet, MetricFamily, MetricSample, HistogramSample } from './types.js';

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labelKey(labels: LabelSet): string {
	return JSON.stringify(Object.entries(labels).sort());
}

export class CounterMetric {
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

	reset(): void {
		this.values.clear();
	}

	collect(): MetricSample[] {
		return Array.from(this.values.values()).map(e => ({ labels: e.labels, value: e.value }));
	}
}

export class GaugeMetric {
	private readonly values = new Map<string, { labels: LabelSet; value: number }>();

	set(value: number, labels: LabelSet = {}): void {
		const key = labelKey(labels);
		this.values.set(key, { labels: { ...labels }, value });
	}

	inc(labels: LabelSet = {}, amount = 1): void {
		const key = labelKey(labels);
		const entry = this.values.get(key);
		if (entry) {
			entry.value += amount;
		} else {
			this.values.set(key, { labels: { ...labels }, value: amount });
		}
	}

	dec(labels: LabelSet = {}, amount = 1): void {
		this.inc(labels, -amount);
	}

	reset(): void {
		this.values.clear();
	}

	collect(): MetricSample[] {
		return Array.from(this.values.values()).map(e => ({ labels: e.labels, value: e.value }));
	}
}

export class HistogramMetric {
	private readonly bucketBounds: number[];
	private readonly values = new Map<string, HistogramSample>();

	constructor(buckets: number[] = DEFAULT_HISTOGRAM_BUCKETS) {
		this.bucketBounds = [...buckets].sort((a, b) => a - b);
	}

	observe(value: number, labels: LabelSet = {}): void {
		const key = labelKey(labels);
		let entry = this.values.get(key);
		if (!entry) {
			const buckets = new Map<number, number>(
				[...this.bucketBounds, Infinity].map(b => [b, 0])
			);
			entry = { labels: { ...labels }, buckets, sum: 0, count: 0 };
			this.values.set(key, entry);
		}
		entry.sum += value;
		entry.count += 1;
		for (const [bound] of entry.buckets) {
			if (value <= bound) {
				entry.buckets.set(bound, (entry.buckets.get(bound) ?? 0) + 1);
			}
		}
	}

	reset(): void {
		this.values.clear();
	}

	collect(): HistogramSample[] {
		return Array.from(this.values.values());
	}
}

interface StoredMetric {
	family: MetricFamily;
	metric: CounterMetric | GaugeMetric | HistogramMetric;
}

export class MetricRegistry {
	private readonly metrics = new Map<string, StoredMetric>();

	counter(name: string, help: string): CounterMetric {
		const existing = this.metrics.get(name);
		if (existing) {
			return existing.metric as CounterMetric;
		}
		const metric = new CounterMetric();
		this.metrics.set(name, { family: { name, help, type: 'counter' }, metric });
		return metric;
	}

	gauge(name: string, help: string): GaugeMetric {
		const existing = this.metrics.get(name);
		if (existing) {
			return existing.metric as GaugeMetric;
		}
		const metric = new GaugeMetric();
		this.metrics.set(name, { family: { name, help, type: 'gauge' }, metric });
		return metric;
	}

	histogram(name: string, help: string, buckets?: number[]): HistogramMetric {
		const existing = this.metrics.get(name);
		if (existing) {
			return existing.metric as HistogramMetric;
		}
		const metric = new HistogramMetric(buckets);
		this.metrics.set(name, { family: { name, help, type: 'histogram' }, metric });
		return metric;
	}

	collect(): string {
		return formatPrometheus(this.metrics);
	}

	reset(): void {
		for (const { metric } of this.metrics.values()) {
			metric.reset();
		}
	}
}

function escapeLabelValue(v: string): string {
	return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels: LabelSet): string {
	const pairs = Object.keys(labels).sort().map(k => `${k}="${escapeLabelValue(labels[k])}"`);
	return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
}

function formatPrometheus(metrics: Map<string, StoredMetric>): string {
	const lines: string[] = [];

	for (const { family, metric } of metrics.values()) {
		lines.push(`# HELP ${family.name} ${family.help}`);
		lines.push(`# TYPE ${family.name} ${family.type}`);

		if (family.type === 'counter' || family.type === 'gauge') {
			const samples = (metric as CounterMetric | GaugeMetric).collect();
			for (const s of samples) {
				lines.push(`${family.name}${renderLabels(s.labels)} ${s.value}`);
			}
		} else if (family.type === 'histogram') {
			const samples = (metric as HistogramMetric).collect();
			for (const s of samples) {
				for (const [bound, count] of [...s.buckets.entries()].sort((a, b) => a[0] - b[0])) {
					const leLabel = isFinite(bound) ? String(bound) : '+Inf';
					const bucketLabels = { ...s.labels, le: leLabel };
					lines.push(`${family.name}_bucket${renderLabels(bucketLabels)} ${count}`);
				}
				lines.push(`${family.name}_sum${renderLabels(s.labels)} ${s.sum}`);
				lines.push(`${family.name}_count${renderLabels(s.labels)} ${s.count}`);
			}
		}
	}

	return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

export const globalRegistry = new MetricRegistry();
