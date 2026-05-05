// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { FailoverAdapter, type FailoverTarget } from '../src/failover.js';
import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from '../src/providers/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides?: Partial<UniformRequest>): UniformRequest {
	return {
		requestId: 'req-1',
		model: 'model-a',
		messages: [{ role: 'user', content: 'hello' }],
		...overrides,
	};
}

/** A stub adapter that emits a fixed sequence of events. */
class StubAdapter implements ProviderAdapter {
	readonly id: string;
	readonly displayName: string;
	private readonly events: AgentEvent[];
	private readonly throwOnSend?: Error;
	private _available: boolean;

	calls: UniformRequest[] = [];

	constructor(id: string, events: AgentEvent[], options?: { available?: boolean; throwOnSend?: Error }) {
		this.id = id;
		this.displayName = id;
		this.events = events;
		this._available = options?.available ?? true;
		this.throwOnSend = options?.throwOnSend;
	}

	async isAvailable(): Promise<boolean> {
		return this._available;
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return [];
	}

	async *send(req: UniformRequest, _signal: AbortSignal): AsyncIterable<AgentEvent> {
		this.calls.push(req);
		if (this.throwOnSend) {
			throw this.throwOnSend;
		}
		for (const event of this.events) {
			yield event;
		}
	}
}

function makeTarget(id: string, model: string, adapter: StubAdapter): FailoverTarget {
	return { provider: id, model, adapter };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const e of iterable) {
		events.push(e);
	}
	return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FailoverAdapter', () => {
	test('uses primary when it succeeds', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'message_start', requestId: 'r', provider: 'primary', model: 'model-a' },
			{ type: 'text_delta', text: 'hello' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);
		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(primaryAdapter.calls.length, 1);
		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['message_start', 'text_delta', 'message_stop']);
	});

	test('replaces model in request for each target', async () => {
		const primaryAdapter = new StubAdapter('primary', [], {
			throwOnSend: new Error('connection refused'),
		});
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-primary', primaryAdapter),
			[makeTarget('fallback', 'model-fallback', fallbackAdapter)],
		);

		await collectEvents(adapter.send(makeRequest({ model: 'model-original' }), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls[0].model, 'model-fallback');
	});

	test('falls over on retryable error before content', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{
				type: 'error',
				code: 'rate_limit',
				message: 'Rate limited',
				retryable: true,
			},
		]);
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'from fallback' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('does not fall over on retryable error after content has started', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'text_delta', text: 'partial ' },
			{ type: 'error', code: 'stream_interrupted', message: 'mid-stream', retryable: true },
		]);
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'should not appear' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'error']);
	});

	test('does not fall over on non-retryable error', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'error', code: 'auth_failed', message: 'bad token', retryable: false },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 0);
		assert.deepStrictEqual(events.map(e => e.type), ['error']);
	});

	test('falls over on connection exception', async () => {
		const primaryAdapter = new StubAdapter('primary', [], {
			throwOnSend: new Error('ECONNREFUSED'),
		});
		const fallbackAdapter = new StubAdapter('fallback', [
			{ type: 'text_delta', text: 'fallback ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(fallbackAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('tries full chain and emits error when all fail', async () => {
		const errorEvent: AgentEvent = { type: 'error', code: 'quota_exceeded', message: 'Quota', retryable: true };
		const a = new StubAdapter('a', [errorEvent]);
		const b = new StubAdapter('b', [errorEvent]);
		const c = new StubAdapter('c', [errorEvent]);

		const adapter = new FailoverAdapter(
			makeTarget('a', 'model-a', a),
			[makeTarget('b', 'model-b', b), makeTarget('c', 'model-c', c)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(a.calls.length, 1);
		assert.strictEqual(b.calls.length, 1);
		assert.strictEqual(c.calls.length, 1);
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].type, 'error');
	});

	test('skips unavailable providers unless last in chain', async () => {
		const unavailableAdapter = new StubAdapter('unavailable', [], { available: false });
		const availableAdapter = new StubAdapter('available', [
			{ type: 'text_delta', text: 'ok' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', unavailableAdapter),
			[makeTarget('secondary', 'model-b', availableAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), new AbortController().signal));

		assert.strictEqual(unavailableAdapter.calls.length, 0);
		assert.strictEqual(availableAdapter.calls.length, 1);
		assert.deepStrictEqual(events.map(e => e.type), ['text_delta', 'message_stop']);
	});

	test('isAvailable returns true if any target is available', async () => {
		const unavailable = new StubAdapter('x', [], { available: false });
		const available = new StubAdapter('y', [], { available: true });

		const adapter = new FailoverAdapter(
			makeTarget('x', 'model-x', unavailable),
			[makeTarget('y', 'model-y', available)],
		);

		assert.strictEqual(await adapter.isAvailable(), true);
	});

	test('isAvailable returns false when all targets unavailable', async () => {
		const a = new StubAdapter('a', [], { available: false });
		const b = new StubAdapter('b', [], { available: false });

		const adapter = new FailoverAdapter(
			makeTarget('a', 'model-a', a),
			[makeTarget('b', 'model-b', b)],
		);

		assert.strictEqual(await adapter.isAvailable(), false);
	});

	test('stops immediately when signal is aborted', async () => {
		const primaryAdapter = new StubAdapter('primary', [
			{ type: 'error', code: 'rate_limit', message: 'limit', retryable: true },
		]);
		const fallbackAdapter = new StubAdapter('fallback', []);
		const controller = new AbortController();
		controller.abort();

		const adapter = new FailoverAdapter(
			makeTarget('primary', 'model-a', primaryAdapter),
			[makeTarget('fallback', 'model-b', fallbackAdapter)],
		);

		const events = await collectEvents(adapter.send(makeRequest(), controller.signal));

		assert.strictEqual(events.length, 0);
		assert.strictEqual(primaryAdapter.calls.length, 0);
	});
});
