// Copyright (c) Son-Of-Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type { Labels } from './types.js';

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function labelsKey(labels: Labels): string {
	const keys = Object.keys(labels).sort();
	if (keys.length === 0) {
		return '__empty__';
	}
	return keys.map(k => `${k}=${labels[k]}`).join('\x00');
}

function renderLabels(labels: Labels): string {
	const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) {
		return '';
	}
	return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

export class Counter {
	private readonly values = new Map<string, { labels: Labels; value: number }>();

	constructor(
		readonly name: string,
		readonly help: string,
	) {}

	inc(labels: Labels = {}, value = 1): void {
		const key = labelsKey(labels);
		const existing = this.values.get(key);
		if (existing) {
			existing.value += value;
		} else {
			this.values.set(key, { labels: { ...labels }, value });
		}
	}

	prometheus(): string {
		const lines: string[] = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} counter`,
		];
		for (const { labels, value } of this.values.values()) {
			lines.push(`${this.name}${renderLabels(labels)} ${value}`);
		}
		return lines.join('\n');
	}
}

export class Gauge {
	private readonly values = new Map<string, { labels: Labels; value: number }>();

	constructor(
		readonly name: string,
		readonly help: string,
	) {}

	set(labels: Labels = {}, value: number): void {
		const key = labelsKey(labels);
		this.values.set(key, { labels: { ...labels }, value });
	}

	inc(labels: Labels = {}, value = 1): void {
		const key = labelsKey(labels);
		const existing = this.values.get(key);
		if (existing) {
			existing.value += value;
		} else {
			this.values.set(key, { labels: { ...labels }, value });
		}
	}

	dec(labels: Labels = {}, value = 1): void {
		this.inc(labels, -value);
	}

	prometheus(): string {
		const lines: string[] = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} gauge`,
		];
		for (const { labels, value } of this.values.values()) {
			lines.push(`${this.name}${renderLabels(labels)} ${value}`);
		}
		return lines.join('\n');
	}
}

interface HistogramData {
	labels: Labels;
	count: number;
	sum: number;
	bucketCounts: number[];
}

export class Histogram {
	private readonly data = new Map<string, HistogramData>();
	private readonly buckets: number[];

	constructor(
		readonly name: string,
		readonly help: string,
		buckets: number[] = DEFAULT_BUCKETS,
	) {
		this.buckets = [...buckets].sort((a, b) => a - b);
	}

	observe(labels: Labels = {}, value: number): void {
		const key = labelsKey(labels);
		let entry = this.data.get(key);
		if (!entry) {
			entry = {
				labels: { ...labels },
				count: 0,
				sum: 0,
				bucketCounts: new Array<number>(this.buckets.length).fill(0),
			};
			this.data.set(key, entry);
		}
		entry.count += 1;
		entry.sum += value;
		for (let i = 0; i < this.buckets.length; i++) {
			if (value <= this.buckets[i]) {
				entry.bucketCounts[i] += 1;
			}
		}
	}

	prometheus(): string {
		const lines: string[] = [
			`# HELP ${this.name} ${this.help}`,
			`# TYPE ${this.name} histogram`,
		];
		for (const d of this.data.values()) {
			// bucketCounts[i] already holds the cumulative count of observations <= buckets[i]
			for (let i = 0; i < this.buckets.length; i++) {
				const bucketLabels = { ...d.labels, le: String(this.buckets[i]) };
				lines.push(`${this.name}_bucket${renderLabels(bucketLabels)} ${d.bucketCounts[i]}`);
			}
			const infLabels = { ...d.labels, le: '+Inf' };
			lines.push(`${this.name}_bucket${renderLabels(infLabels)} ${d.count}`);
			lines.push(`${this.name}_sum${renderLabels(d.labels)} ${d.sum}`);
			lines.push(`${this.name}_count${renderLabels(d.labels)} ${d.count}`);
		}
		return lines.join('\n');
	}
}

export class MetricRegistry {
	private readonly counters = new Map<string, Counter>();
	private readonly gauges = new Map<string, Gauge>();
	private readonly histograms = new Map<string, Histogram>();

	counter(name: string, help = ''): Counter {
		const existing = this.counters.get(name);
		if (existing) {
			return existing;
		}
		const c = new Counter(name, help);
		this.counters.set(name, c);
		return c;
	}

	gauge(name: string, help = ''): Gauge {
		const existing = this.gauges.get(name);
		if (existing) {
			return existing;
		}
		const g = new Gauge(name, help);
		this.gauges.set(name, g);
		return g;
	}

	histogram(name: string, help = '', buckets?: number[]): Histogram {
		const existing = this.histograms.get(name);
		if (existing) {
			return existing;
		}
		const h = new Histogram(name, help, buckets);
		this.histograms.set(name, h);
		return h;
	}

	prometheus(): string {
		const sections: string[] = [];
		for (const c of this.counters.values()) {
			sections.push(c.prometheus());
		}
		for (const g of this.gauges.values()) {
			sections.push(g.prometheus());
		}
		for (const h of this.histograms.values()) {
			sections.push(h.prometheus());
		}
		return sections.length > 0 ? sections.join('\n\n') + '\n' : '';
	}
}
