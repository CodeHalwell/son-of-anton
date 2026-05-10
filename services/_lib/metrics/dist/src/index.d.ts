import type * as http from 'node:http';
export type Labels = Record<string, string>;
declare class CounterMetric {
    private readonly name;
    private readonly help;
    private readonly values;
    constructor(name: string, help: string);
    inc(labels?: Labels, amount?: number): void;
    render(): string;
}
declare class GaugeMetric {
    private readonly name;
    private readonly help;
    private readonly values;
    constructor(name: string, help: string);
    set(labels: Labels | undefined, value: number): void;
    inc(labels?: Labels, amount?: number): void;
    dec(labels?: Labels, amount?: number): void;
    render(): string;
}
declare class HistogramMetric {
    private readonly name;
    private readonly help;
    private readonly buckets;
    private readonly series;
    constructor(name: string, help: string, buckets: readonly number[]);
    observe(labels: Labels | undefined, value: number): void;
    startTimer(labels?: Labels): () => void;
    render(): string;
}
export declare class MetricsRegistry {
    private readonly counters;
    private readonly gauges;
    private readonly histograms;
    counter(name: string, help: string): CounterMetric;
    gauge(name: string, help: string): GaugeMetric;
    histogram(name: string, help: string, buckets?: readonly number[]): HistogramMetric;
    prometheus(): string;
}
export declare function prometheusHandler(registry: MetricsRegistry): (req: http.IncomingMessage, res: http.ServerResponse) => void;
interface ExpressRequest {
    method: string;
    path: string;
    route?: {
        path: string;
    };
}
interface ExpressResponse {
    statusCode: number;
    on(event: 'finish', listener: () => void): void;
}
export declare function expressMetricsMiddleware(registry: MetricsRegistry, serviceName: string): (req: ExpressRequest, res: ExpressResponse, next: () => void) => void;
export {};
//# sourceMappingURL=index.d.ts.map