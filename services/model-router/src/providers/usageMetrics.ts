// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { counter, gauge } from '../../_lib/metrics/dist/index.js';
import type { UsageObserver } from './types.js';

/**
 * Records LLM token usage from provider adapters into the global Prometheus
 * metrics registry (§11.2). Counters are cumulative across all requests; the
 * cache hit rate gauge holds the per-request fraction so it reflects the
 * most-recent observed value per {provider, model, agent_role}.
 *
 * The four counters share names with the inline declarations in server.ts so
 * both code paths (legacy non-streaming and adapter-based streaming) contribute
 * to the same time series. The global registry returns the same Counter
 * instance for a given name, making double-registration safe.
 */
export class PrometheusUsageObserver implements UsageObserver {
	private readonly inputTokens = counter('llm_input_tokens_total', 'Total LLM input tokens consumed');
	private readonly outputTokens = counter('llm_output_tokens_total', 'Total LLM output tokens generated');
	private readonly cacheReadTokens = counter('llm_cache_read_tokens_total', 'Total LLM tokens read from prompt cache');
	private readonly cacheCreationTokens = counter('llm_cache_creation_tokens_total', 'Total LLM tokens written to prompt cache');
	private readonly cacheHitRate = gauge('llm_cache_hit_rate', 'Per-request cache hit rate: cache_read_tokens / (input_tokens + cache_read_tokens)');

	recordUsage(usage: {
		readonly provider: string;
		readonly model: string;
		readonly agentRole: string;
		readonly inputTokens: number;
		readonly outputTokens: number;
		readonly cacheCreationInputTokens: number;
		readonly cacheReadInputTokens: number;
	}): void {
		const labels = { provider: usage.provider, model: usage.model, agent_role: usage.agentRole };

		if (usage.inputTokens > 0) {
			this.inputTokens.inc(labels, usage.inputTokens);
		}
		if (usage.outputTokens > 0) {
			this.outputTokens.inc(labels, usage.outputTokens);
		}
		if (usage.cacheReadInputTokens > 0) {
			this.cacheReadTokens.inc(labels, usage.cacheReadInputTokens);
		}
		if (usage.cacheCreationInputTokens > 0) {
			this.cacheCreationTokens.inc(labels, usage.cacheCreationInputTokens);
		}

		if (usage.cacheReadInputTokens > 0) {
			const totalInput = usage.inputTokens + usage.cacheReadInputTokens;
			if (totalInput > 0) {
				this.cacheHitRate.set(usage.cacheReadInputTokens / totalInput, labels);
			}
		}
	}
}
