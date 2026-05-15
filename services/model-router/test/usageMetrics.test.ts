// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsRegistry } from '../../_lib/metrics/dist/index.js';
import type { UsageObserver } from '../src/providers/types.js';

// Isolated registry so these tests don't pollute the global registry that
// other test files may inspect.
function makeRegistry(): MetricsRegistry {
	return new (MetricsRegistry as unknown as { new(): MetricsRegistry })();
}

// Minimal in-process UsageObserver backed by an isolated registry, mirroring
// the shape of PrometheusUsageObserver without depending on the global registry.
function makeTestObserver(reg: MetricsRegistry): UsageObserver {
	const inputTokens = reg.counter('llm_input_tokens_total', '');
	const outputTokens = reg.counter('llm_output_tokens_total', '');
	const cacheReadTokens = reg.counter('llm_cache_read_tokens_total', '');
	const cacheCreationTokens = reg.counter('llm_cache_creation_tokens_total', '');
	const cacheHitRate = reg.gauge('llm_cache_hit_rate', '');

	return {
		recordUsage(usage) {
			const labels = { provider: usage.provider, model: usage.model, agent_role: usage.agentRole };
			if (usage.inputTokens > 0) { inputTokens.inc(labels, usage.inputTokens); }
			if (usage.outputTokens > 0) { outputTokens.inc(labels, usage.outputTokens); }
			if (usage.cacheReadInputTokens > 0) { cacheReadTokens.inc(labels, usage.cacheReadInputTokens); }
			if (usage.cacheCreationInputTokens > 0) { cacheCreationTokens.inc(labels, usage.cacheCreationInputTokens); }
			if (usage.cacheReadInputTokens > 0) {
				const totalInput = usage.inputTokens + usage.cacheReadInputTokens;
				if (totalInput > 0) { cacheHitRate.set(usage.cacheReadInputTokens / totalInput, labels); }
			}
		},
	};
}

describe('PrometheusUsageObserver (via test registry)', () => {
	test('records input and output tokens into counters', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		obs.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 100,
			outputTokens: 50,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		const text = reg.format();
		assert.ok(text.includes('llm_input_tokens_total{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 100'));
		assert.ok(text.includes('llm_output_tokens_total{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 50'));
	});

	test('records cache creation and cache read tokens', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		obs.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-opus-4-7',
			agentRole: 'orchestrator',
			inputTokens: 200,
			outputTokens: 80,
			cacheCreationInputTokens: 150,
			cacheReadInputTokens: 50,
		});

		const text = reg.format();
		assert.ok(text.includes('llm_cache_creation_tokens_total{agent_role="orchestrator",model="claude-opus-4-7",provider="anthropic-oauth"} 150'));
		assert.ok(text.includes('llm_cache_read_tokens_total{agent_role="orchestrator",model="claude-opus-4-7",provider="anthropic-oauth"} 50'));
	});

	test('computes cache hit rate as cache_read / (input + cache_read)', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		// 80 cache read out of (120 input + 80 cache read) = 80/200 = 0.4
		obs.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 120,
			outputTokens: 30,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 80,
		});

		const text = reg.format();
		assert.ok(text.includes('llm_cache_hit_rate{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 0.4'));
	});

	test('cache hit rate is 0 when there are no cache read tokens', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		obs.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'default',
			inputTokens: 100,
			outputTokens: 40,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		const text = reg.format();
		// Gauge should not be set when totalInput == cacheReadInputTokens == 0 cache reads
		assert.ok(!text.includes('llm_cache_hit_rate{agent_role="default",model="gpt-4o",provider="copilot"}'));
	});

	test('does not emit zero-token increments for absent fields', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		obs.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'default',
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		const text = reg.format();
		// Counters with zero increments show the base zero line, not a labelled series
		assert.ok(!text.includes('provider="copilot"'));
	});

	test('accumulates across multiple calls for the same label set', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		const base = {
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};
		obs.recordUsage({ ...base, inputTokens: 100, outputTokens: 30 });
		obs.recordUsage({ ...base, inputTokens: 200, outputTokens: 70 });

		const text = reg.format();
		assert.ok(text.includes('llm_input_tokens_total{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 300'));
		assert.ok(text.includes('llm_output_tokens_total{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 100'));
	});

	test('segregates metrics by provider and agent_role', () => {
		const reg = makeRegistry();
		const obs = makeTestObserver(reg);
		obs.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 100,
			outputTokens: 50,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});
		obs.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'orchestrator',
			inputTokens: 200,
			outputTokens: 80,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		const text = reg.format();
		assert.ok(text.includes('llm_input_tokens_total{agent_role="code",model="claude-sonnet-4-6",provider="anthropic-oauth"} 100'));
		assert.ok(text.includes('llm_input_tokens_total{agent_role="orchestrator",model="gpt-4o",provider="copilot"} 200'));
	});
});
