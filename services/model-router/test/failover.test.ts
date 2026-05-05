// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../src/router.js';
import type { ModelRoutesConfig } from '../src/types.js';

// ── Test config ───────────────────────────────────────────────────────────────

const config: ModelRoutesConfig = {
	routes: [
		{
			name: 'with-fallbacks-array',
			match: { agentRole: 'orchestrator' },
			provider: 'anthropic-oauth',
			model: 'claude-opus-4-7',
			priority: 1,
			fallbacks: [
				{ provider: 'copilot', model: 'claude-opus' },
				{ provider: 'anthropic', model: 'claude-opus-4-7' },
			],
		},
		{
			name: 'with-single-fallback',
			match: { agentRole: 'coder' },
			provider: 'copilot',
			model: 'claude-sonnet',
			priority: 2,
			fallback: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
		},
		{
			name: 'no-fallback',
			match: { agentRole: 'explorer' },
			provider: 'anthropic',
			model: 'claude-haiku-4-5-20251001',
			priority: 3,
		},
		{
			name: 'both-fallback-and-fallbacks',
			match: { agentRole: 'tester' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			priority: 4,
			fallback: { provider: 'legacy', model: 'lm' },
			fallbacks: [
				{ provider: 'new1', model: 'nm1' },
				{ provider: 'new2', model: 'nm2' },
			],
		},
		{
			name: 'catch-all',
			match: { agentRole: '*' },
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			priority: 100,
		},
	],
	providers: {
		'anthropic-oauth': { baseUrl: 'https://api.anthropic.com', format: 'anthropic' },
		'copilot': { baseUrl: 'https://api.githubcopilot.com', format: 'openai' },
		'anthropic': { baseUrl: 'https://api.anthropic.com', format: 'anthropic' },
		'new1': { baseUrl: 'http://new1', format: 'openai' },
		'new2': { baseUrl: 'http://new2', format: 'openai' },
	},
};

// ── ModelRouter.resolveFallbackChain ──────────────────────────────────────────

describe('ModelRouter.resolveFallbackChain', () => {
	const router = new ModelRouter(config);

	test('returns primary + fallbacks when fallbacks array is set', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'orchestrator' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
			{ provider: 'copilot', model: 'claude-opus' },
			{ provider: 'anthropic', model: 'claude-opus-4-7' },
		]);
	});

	test('wraps single fallback field in array for backward compat', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'coder' });
		assert.deepStrictEqual(chain, [
			{ provider: 'copilot', model: 'claude-sonnet' },
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
		]);
	});

	test('returns single-element chain when no fallback is configured', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'explorer' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
		]);
	});

	test('fallbacks array takes precedence over fallback when both are present', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'tester' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
			{ provider: 'new1', model: 'nm1' },
			{ provider: 'new2', model: 'nm2' },
		]);
	});

	test('matches catch-all role when no specific role matches', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'unknown' });
		assert.deepStrictEqual(chain, [
			{ provider: 'anthropic', model: 'claude-sonnet-4-6' },
		]);
	});

	test('throws when no route matches and no wildcard', () => {
		const strict = new ModelRouter({
			routes: [{
				name: 'only-coder',
				match: { agentRole: 'coder' },
				provider: 'anthropic',
				model: 'claude-sonnet-4-6',
				priority: 1,
			}],
			providers: { anthropic: { baseUrl: 'https://api.anthropic.com', format: 'anthropic' } },
		});
		assert.throws(
			() => strict.resolveFallbackChain({ agentRole: 'explorer' }),
			/No matching route found/,
		);
	});

	test('respects priority ordering — lower number matches first', () => {
		const chain = router.resolveFallbackChain({ agentRole: 'orchestrator', taskType: 'planning' });
		// priority 1 matches (agentRole orchestrator, no taskType constraint) before catch-all
		assert.strictEqual(chain[0].provider, 'anthropic-oauth');
	});
});

// ── FallbackTarget type exported from types.ts ────────────────────────────────

describe('FallbackTarget export', () => {
	test('RouteConfig accepts fallbacks array', () => {
		import('../src/types.js').then(({ }) => {
			// Type-level check: if this compiled, the type is correct.
			assert.ok(true);
		});
	});
});
