// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isFailoverError, withFailover } from '../src/failover.js';
import type { FailoverEntry } from '../src/failover.js';
import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from '../src/providers/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<UniformRequest> = {}): UniformRequest {
	return {
		model: 'test-model',
		messages: [{ role: 'user', content: 'hello' }],
		requestId: 'req-1',
		...overrides,
	};
}

function neverAborted(): AbortSignal {
	return new AbortController().signal;
}

/** Builds a ProviderAdapter that emits the given events then stops. */
function adapterThatYields(events: AgentEvent[], model = 'model-a'): ProviderAdapter {
	return {
		id: 'fake',
		displayName: 'Fake',
		async isAvailable() { return true; },
		async listModels(): Promise<ModelDescriptor[]> { return []; },
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			for (const e of events) {
				yield e;
			}
		},
	};
}

/** Builds a ProviderAdapter that throws immediately. */
function adapterThatThrows(err: Error): ProviderAdapter {
	return {
		id: 'failing',
		displayName: 'Failing',
		async isAvailable() { return false; },
		async listModels(): Promise<ModelDescriptor[]> { return []; },
		async *send(_req, _signal): AsyncIterable<AgentEvent> {
			throw err;
		},
	};
}

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const e of iter) {
		events.push(e);
	}
	return events;
}

// ---------------------------------------------------------------------------
// isFailoverError
// ---------------------------------------------------------------------------

describe('isFailoverError', () => {
	test('returns false for non-Error values', () => {
		assert.strictEqual(isFailoverError('string error'), false);
		assert.strictEqual(isFailoverError(null), false);
		assert.strictEqual(isFailoverError(42), false);
	});

	test('returns true for ECONNRESET', () => {
		const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ECONNREFUSED', () => {
		const err = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ETIMEDOUT', () => {
		const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for ENOTFOUND', () => {
		const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
		assert.strictEqual(isFailoverError(err), true);
	});

	test('returns true for HTTP 5xx message', () => {
		assert.strictEqual(isFailoverError(new Error('Provider x returned 503: Service Unavailable')), true);
		assert.strictEqual(isFailoverError(new Error('returned 500')), true);
	});

	test('returns true for quota_exceeded', () => {
		assert.strictEqual(isFailoverError(new Error('quota_exceeded: monthly cap reached')), true);
	});

	test('returns true for rate_limit_exceeded', () => {
		assert.strictEqual(isFailoverError(new Error('rate_limit_exceeded')), true);
	});

	test('returns true for 429 in message', () => {
		assert.strictEqual(isFailoverError(new Error('Provider returned 429')), true);
	});

	test('returns false for 4xx non-429 errors', () => {
		assert.strictEqual(isFailoverError(new Error('returned 400: bad request')), false);
		assert.strictEqual(isFailoverError(new Error('returned 401: unauthorized')), false);
		assert.strictEqual(isFailoverError(new Error('returned 403: forbidden')), false);
	});

	test('returns false for generic errors without code or 5xx pattern', () => {
		assert.strictEqual(isFailoverError(new Error('JSON parse error')), false);
		assert.strictEqual(isFailoverError(new Error('unexpected token')), false);
	});
});

// ---------------------------------------------------------------------------
// withFailover
// ---------------------------------------------------------------------------

describe('withFailover', () => {
	test('emits error + message_stop when entries is empty', async () => {
		const events = await collect(withFailover([], makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'NO_PROVIDERS', message: 'No providers configured', retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('passes through all events from successful single adapter', async () => {
		const expected: AgentEvent[] = [
			{ type: 'message_start', requestId: 'req-1', provider: 'fake', model: 'model-a' },
			{ type: 'text_delta', text: 'hello' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [{ adapter: adapterThatYields(expected), model: 'model-a' }];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, expected);
	});

	test('overrides model in request per entry', async () => {
		let capturedModel: string | undefined;
		const adapter: ProviderAdapter = {
			id: 'spy',
			displayName: 'Spy',
			async isAvailable() { return true; },
			async listModels(): Promise<ModelDescriptor[]> { return []; },
			async *send(req, _signal): AsyncIterable<AgentEvent> {
				capturedModel = req.model;
				yield { type: 'message_stop', stopReason: 'end_turn' };
			},
		};

		const entries: FailoverEntry[] = [{ adapter, model: 'overridden-model' }];
		await collect(withFailover(entries, makeRequest({ model: 'original-model' }), neverAborted()));
		assert.strictEqual(capturedModel, 'overridden-model');
	});

	test('fails over to second adapter when first throws a failover-worthy error', async () => {
		const connErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		const successEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatYields(successEvents), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, successEvents);
	});

	test('does NOT fail over on non-failover error (last adapter surfaces the error)', async () => {
		const authErr = new Error('returned 401: unauthorized');
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(authErr), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'PROVIDER_ERROR', message: authErr.message, retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('walks full chain of three providers, succeeds on third', async () => {
		const connErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
		const quotaErr = new Error('quota_exceeded: limit hit');
		const successEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'third wins' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatThrows(quotaErr), model: 'model-b' },
			{ adapter: adapterThatYields(successEvents), model: 'model-c' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, successEvents);
	});

	test('all providers fail: surfaces last error', async () => {
		const err5xx = new Error('returned 503: unavailable');
		const errConn = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(err5xx), model: 'model-a' },
			{ adapter: adapterThatThrows(errConn), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		// Last error is ECONNRESET — code exposed
		assert.strictEqual(events[0].type, 'error');
		const errorEvent = events[0] as Extract<AgentEvent, { type: 'error' }>;
		assert.strictEqual(errorEvent.code, 'ECONNRESET');
		assert.strictEqual(events[1].type, 'message_stop');
	});

	test('aborted signal surfaces cancelled error without trying fallback', async () => {
		const ac = new AbortController();
		ac.abort();
		const connErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatThrows(connErr), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), ac.signal));
		assert.deepStrictEqual(events, [
			{ type: 'error', code: 'cancelled', message: 'Request cancelled', retryable: false },
			{ type: 'message_stop', stopReason: 'error' },
		]);
	});

	test('fails over when adapter yields retryable error event before message_stop', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'partial...' },
			{ type: 'error', code: 'STREAM_RESET', message: 'upstream reset', retryable: true },
		];
		const fallbackEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
			{ adapter: adapterThatYields(fallbackEvents), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		// Sees events from both providers: primary's partial output then fallback's response
		assert.deepStrictEqual(events, [...primaryEvents, ...fallbackEvents]);
	});

	test('does NOT fail over on retryable error when it is the last adapter', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'error', code: 'STREAM_RESET', message: 'upstream reset', retryable: true },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		// Last adapter: retryable error is surfaced as-is (no more fallbacks)
		assert.deepStrictEqual(events, primaryEvents);
	});

	test('stops immediately after message_stop; does not consume further events', async () => {
		const primaryEvents: AgentEvent[] = [
			{ type: 'text_delta', text: 'done' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		];
		const entries: FailoverEntry[] = [
			{ adapter: adapterThatYields(primaryEvents), model: 'model-a' },
			{ adapter: adapterThatYields([{ type: 'text_delta', text: 'should not appear' }, { type: 'message_stop', stopReason: 'end_turn' }]), model: 'model-b' },
		];

		const events = await collect(withFailover(entries, makeRequest(), neverAborted()));
		assert.deepStrictEqual(events, primaryEvents);
	});
});

// ---------------------------------------------------------------------------
// resolveFallbackChain via ModelRouter
// ---------------------------------------------------------------------------

describe('ModelRouter.resolveFallbackChain', () => {
	// Import inline to avoid re-reading files above
	test('returns empty array when no fallback configured', async () => {
		const { ModelRouter } = await import('../src/router.js');
		const router = new ModelRouter({
			routes: [{
				name: 'r1',
				match: { agentRole: '*' },
				provider: 'anthropic',
				model: 'claude-sonnet-4-6',
				priority: 1,
			}],
			providers: {
				anthropic: { baseUrl: 'https://api.anthropic.com', apiKey: 'test', format: 'anthropic' },
			},
		});
		const route = router.getConfig().routes[0];
		assert.deepStrictEqual(router.resolveFallbackChain(route), []);
	});

	test('resolves chain of two fallbacks in order', async () => {
		const { ModelRouter } = await import('../src/router.js');
		const router = new ModelRouter({
			routes: [{
				name: 'r1',
				match: { agentRole: 'orchestrator' },
				provider: 'primary',
				model: 'model-p',
				priority: 1,
				fallback: [
					{ provider: 'fallback-a', model: 'model-a' },
					{ provider: 'fallback-b', model: 'model-b' },
				],
			}],
			providers: {
				primary: { baseUrl: 'https://primary.example.com', format: 'anthropic' },
				'fallback-a': { baseUrl: 'https://fa.example.com', format: 'openai' },
				'fallback-b': { baseUrl: 'https://fb.example.com', format: 'anthropic' },
			},
		});
		const route = router.getConfig().routes[0];
		const chain = router.resolveFallbackChain(route);
		assert.strictEqual(chain.length, 2);
		assert.strictEqual(chain[0].provider, 'fallback-a');
		assert.strictEqual(chain[0].model, 'model-a');
		assert.strictEqual(chain[0].providerConfig.baseUrl, 'https://fa.example.com');
		assert.strictEqual(chain[0].providerConfig.format, 'openai');
		assert.strictEqual(chain[1].provider, 'fallback-b');
		assert.strictEqual(chain[1].model, 'model-b');
		assert.strictEqual(chain[1].providerConfig.baseUrl, 'https://fb.example.com');
		assert.strictEqual(chain[1].providerConfig.format, 'anthropic');
	});
});
