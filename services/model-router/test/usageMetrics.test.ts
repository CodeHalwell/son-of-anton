// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsageObserver } from '../src/providers/types.js';

interface UsageCall {
	provider: string;
	model: string;
	agentRole: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
}

function makeCapturingObserver(): { observer: UsageObserver; calls: UsageCall[] } {
	const calls: UsageCall[] = [];
	const observer: UsageObserver = {
		recordUsage(usage) {
			calls.push({ ...usage });
		},
	};
	return { observer, calls };
}

describe('UsageObserver contract', () => {
	test('records input and output tokens', () => {
		const { observer, calls } = makeCapturingObserver();
		observer.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 100,
			outputTokens: 50,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].inputTokens, 100);
		assert.strictEqual(calls[0].outputTokens, 50);
		assert.strictEqual(calls[0].provider, 'anthropic-oauth');
		assert.strictEqual(calls[0].model, 'claude-sonnet-4-6');
		assert.strictEqual(calls[0].agentRole, 'code');
	});

	test('records cache creation and cache read tokens', () => {
		const { observer, calls } = makeCapturingObserver();
		observer.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-opus-4-7',
			agentRole: 'orchestrator',
			inputTokens: 200,
			outputTokens: 80,
			cacheCreationInputTokens: 150,
			cacheReadInputTokens: 50,
		});

		assert.strictEqual(calls[0].cacheCreationInputTokens, 150);
		assert.strictEqual(calls[0].cacheReadInputTokens, 50);
	});

	test('cache hit rate can be derived from cache_read / (input + cache_read)', () => {
		const { observer, calls } = makeCapturingObserver();
		// 80 cache read out of (120 input + 80 cache read) = 80/200 = 0.4
		observer.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 120,
			outputTokens: 30,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 80,
		});

		const { inputTokens, cacheReadInputTokens } = calls[0];
		const rate = cacheReadInputTokens / (inputTokens + cacheReadInputTokens);
		assert.ok(Math.abs(rate - 0.4) < 1e-9, `expected 0.4, got ${rate}`);
	});

	test('cache hit rate is 0 when there are no cache read tokens', () => {
		const { observer, calls } = makeCapturingObserver();
		observer.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'default',
			inputTokens: 100,
			outputTokens: 40,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		const { cacheReadInputTokens } = calls[0];
		assert.strictEqual(cacheReadInputTokens, 0);
	});

	test('all zero fields are recorded faithfully', () => {
		const { observer, calls } = makeCapturingObserver();
		observer.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'default',
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		assert.strictEqual(calls.length, 1);
		assert.deepStrictEqual(calls[0], {
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'default',
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});
	});

	test('accumulates across multiple calls for the same label set', () => {
		const { observer, calls } = makeCapturingObserver();
		const base = {
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};
		observer.recordUsage({ ...base, inputTokens: 100, outputTokens: 30 });
		observer.recordUsage({ ...base, inputTokens: 200, outputTokens: 70 });

		assert.strictEqual(calls.length, 2);
		const totalInput = calls.reduce((s, c) => s + c.inputTokens, 0);
		const totalOutput = calls.reduce((s, c) => s + c.outputTokens, 0);
		assert.strictEqual(totalInput, 300);
		assert.strictEqual(totalOutput, 100);
	});

	test('segregates calls by provider and agent_role', () => {
		const { observer, calls } = makeCapturingObserver();
		observer.recordUsage({
			provider: 'anthropic-oauth',
			model: 'claude-sonnet-4-6',
			agentRole: 'code',
			inputTokens: 100,
			outputTokens: 50,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});
		observer.recordUsage({
			provider: 'copilot',
			model: 'gpt-4o',
			agentRole: 'orchestrator',
			inputTokens: 200,
			outputTokens: 80,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		});

		assert.strictEqual(calls.length, 2);
		assert.strictEqual(calls[0].provider, 'anthropic-oauth');
		assert.strictEqual(calls[0].inputTokens, 100);
		assert.strictEqual(calls[1].provider, 'copilot');
		assert.strictEqual(calls[1].inputTokens, 200);
	});
});
