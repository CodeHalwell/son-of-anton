// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

export type LabelSet = Record<string, string>;

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricSample {
	labels: LabelSet;
	value: number;
}

export interface HistogramSample {
	labels: LabelSet;
	buckets: Map<number, number>;
	sum: number;
	count: number;
}

export interface Counter {
	inc(labels?: LabelSet, amount?: number): void;
	reset(): void;
}

export interface Gauge {
	set(value: number, labels?: LabelSet): void;
	inc(labels?: LabelSet, amount?: number): void;
	dec(labels?: LabelSet, amount?: number): void;
	reset(): void;
}

export interface Histogram {
	observe(value: number, labels?: LabelSet): void;
	reset(): void;
}

export interface MetricFamily {
	name: string;
	help: string;
	type: MetricType;
}
