/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { LlmStreamEvent } from '../llm/types';

/**
 * Manages an active LLM stream and batches token deltas to avoid
 * overwhelming the webview with per-token postMessage calls.
 *
 * Batching strategy: accumulate tokens for up to `throttleMs` milliseconds,
 * then flush the batch as a single delta. This reduces IPC overhead from
 * ~100 messages/sec to ~60 messages/sec while keeping perceived latency low.
 */
export class StreamManager {
	private buffer = '';
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly throttleMs: number;
	private abortController: AbortController | undefined;
	private streaming = false;
	private fullText = '';

	private readonly _onDelta = new vscode.EventEmitter<string>();
	readonly onDelta = this._onDelta.event;

	private readonly _onComplete = new vscode.EventEmitter<{ fullText: string; inputTokens: number; outputTokens: number; cachedTokens: number; elapsedMs: number }>();
	readonly onComplete = this._onComplete.event;

	private readonly _onError = new vscode.EventEmitter<string>();
	readonly onError = this._onError.event;

	private startTime = 0;

	constructor(throttleMs?: number) {
		const config = vscode.workspace.getConfiguration('sota.chat');
		this.throttleMs = throttleMs ?? config.get<number>('streamingThrottle') ?? 16;
	}

	get isStreaming(): boolean {
		return this.streaming;
	}

	get signal(): AbortSignal | undefined {
		return this.abortController?.signal;
	}

	/**
	 * Start a new stream. Resets all state and creates a fresh AbortController.
	 */
	start(): AbortSignal {
		this.reset();
		this.abortController = new AbortController();
		this.streaming = true;
		this.startTime = Date.now();
		return this.abortController.signal;
	}

	/**
	 * Process an LLM stream event. Tokens are buffered and flushed periodically.
	 */
	processEvent(event: LlmStreamEvent): void {
		if (!this.streaming) {
			return;
		}

		switch (event.type) {
			case 'token':
				this.fullText += event.token;
				this.buffer += event.token;
				this.scheduleFlush();
				break;

			case 'complete':
				this.flush();
				this.streaming = false;
				this._onComplete.fire({
					fullText: event.fullText || this.fullText,
					inputTokens: event.inputTokens,
					outputTokens: event.outputTokens,
					cachedTokens: event.cachedTokens,
					elapsedMs: Date.now() - this.startTime,
				});
				break;

			case 'error':
				this.flush();
				this.streaming = false;
				this._onError.fire(event.error);
				break;
		}
	}

	/**
	 * Cancel the active stream.
	 */
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.flush();
		this.streaming = false;
	}

	private scheduleFlush(): void {
		if (this.flushTimer !== undefined) {
			return;
		}
		this.flushTimer = setTimeout(() => {
			this.flushTimer = undefined;
			this.flush();
		}, this.throttleMs);
	}

	private flush(): void {
		if (this.flushTimer !== undefined) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		if (this.buffer.length > 0) {
			this._onDelta.fire(this.buffer);
			this.buffer = '';
		}
	}

	private reset(): void {
		this.cancel();
		this.buffer = '';
		this.fullText = '';
		this.flushTimer = undefined;
		this.abortController = undefined;
	}

	dispose(): void {
		this.cancel();
		this._onDelta.dispose();
		this._onComplete.dispose();
		this._onError.dispose();
	}
}
