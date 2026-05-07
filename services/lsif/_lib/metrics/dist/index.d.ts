import type { IncomingMessage, ServerResponse } from 'node:http';
export type Labels = Record<string, string>;
export declare class Counter {
    private readonly values;
    inc(labels?: Labels, amount?: number): void;
    /** @internal */
    entries(): IterableIterator<{
        labels: Labels;
        value: number;
    }>;
}
export declare class Gauge {
    private readonly values;
    set(value: number, labels?: Labels): void;
    inc(labels?: Labels, amount?: number): void;
    dec(labels?: Labels, amount?: number): void;
    /** @internal */
    entries(): IterableIterator<{
        labels: Labels;
        value: number;
    }>;
}
interface HistogramSeries {
    labels: Labels;
    sum: number;
    count: number;
    /** Cumulative counts per upper bound — incremented for every bound >= observed value. */
    buckets: Map<number, number>;
}
export declare class Histogram {
    private readonly series;
    private readonly bounds;
    constructor(buckets?: number[]);
    observe(value: number, labels?: Labels): void;
    startTimer(): (labels?: Labels) => void;
    /** @internal */
    allSeries(): IterableIterator<HistogramSeries>;
    /** @internal */
    getBounds(): number[];
}
export declare class MetricsRegistry {
    private readonly entries;
    private register;
    counter(name: string, help?: string): Counter;
    gauge(name: string, help?: string): Gauge;
    histogram(name: string, help?: string, buckets?: number[]): Histogram;
    format(): string;
}
/** Global per-process registry. */
export declare const globalRegistry: MetricsRegistry;
/**
 * Get or create a counter in the global registry.
 */
export declare function counter(name: string, help?: string): Counter;
/**
 * Get or create a gauge in the global registry.
 */
export declare function gauge(name: string, help?: string): Gauge;
/**
 * Get or create a histogram in the global registry.
 */
export declare function histogram(name: string, help?: string, buckets?: number[]): Histogram;
/**
 * Express-compatible middleware that records request duration and count for every route.
 *
 * Records standard labels: service, method, route, status_code.
 */
export declare function expressMetricsMiddleware(serviceName?: string): (req: any, res: any, next: () => void) => void;
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
export declare function prometheusHandler(): (req: IncomingMessage, res: ServerResponse) => void;
export {};
