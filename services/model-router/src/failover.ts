// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AgentEvent, ModelDescriptor, ProviderAdapter, UniformRequest } from './providers/types.js';

/** One entry in the ordered failover chain. */
export interface FailoverTarget {
	readonly provider: string;
	readonly model: string;
	readonly adapter: ProviderAdapter;
}

/**
 * Wraps a primary ProviderAdapter with an ordered fallback chain (§10.1).
 *
 * Failover is triggered when:
 *   - The adapter throws a connection-level exception before content starts.
 *   - The adapter yields an `error` event with `retryable: true` before any
 *     `text_delta` or `tool_use_start` has been yielded (mid-stream errors
 *     cannot be rolled back, so they are forwarded as-is).
 *
 * On each attempt the `model` field in the request is replaced with the
 * target's model so the underlying adapter talks to the right variant.
 */
export class FailoverAdapter implements ProviderAdapter {
	private readonly targets: readonly FailoverTarget[];

	constructor(
		primary: FailoverTarget,
		fallbacks: readonly FailoverTarget[] = [],
	) {
		this.targets = [primary, ...fallbacks];
	}

	get id(): string {
		return `failover:${this.targets[0].provider}`;
	}

	get displayName(): string {
		return `${this.targets[0].adapter.displayName} (with failover)`;
	}

	async isAvailable(): Promise<boolean> {
		for (const target of this.targets) {
			if (await target.adapter.isAvailable()) {
				return true;
			}
		}
		return false;
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return this.targets[0].adapter.listModels();
	}

	async *send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
		let lastErrorEvent: AgentEvent & { type: 'error' } | undefined;

		for (let i = 0; i < this.targets.length; i++) {
			const target = this.targets[i];
			const isLast = i === this.targets.length - 1;

			if (signal.aborted) {
				return;
			}

			try {
				const available = await target.adapter.isAvailable();
				if (!available && !isLast) {
					continue;
				}

				const modifiedReq: UniformRequest = { ...req, model: target.model };
				let hadContent = false;
				let shouldFailover = false;

				for await (const event of target.adapter.send(modifiedReq, signal)) {
					if (event.type === 'text_delta' || event.type === 'tool_use_start') {
						hadContent = true;
					}

					// Only failover pre-stream: once content has started we cannot
					// roll it back, so forward the error to the caller instead.
					if (event.type === 'error' && event.retryable && !hadContent && !isLast) {
						lastErrorEvent = event;
						shouldFailover = true;
						break;
					}

					yield event;

					if (event.type === 'message_stop') {
						return;
					}
				}

				if (!shouldFailover) {
					return;
				}
			} catch (err) {
				if (isLast) {
					yield {
						type: 'error',
						code: 'connection_error',
						message: err instanceof Error ? err.message : 'Unknown connection error',
						retryable: false,
					};
					return;
				}
				// Try next target in chain.
			}
		}

		// All targets exhausted without a successful response.
		yield lastErrorEvent ?? {
			type: 'error',
			code: 'all_providers_exhausted',
			message: 'All provider attempts failed',
			retryable: false,
		};
	}
}
