/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	AgUiEvent,
	AgUiEventType,
	AgentRunInput,
	RunFinishedEvent,
	RunErrorEvent,
	RunStartedEvent,
	TextMessageStartEvent,
	TextMessageContentEvent,
	TextMessageEndEvent,
	ToolCallStartEvent,
	ToolCallArgsEvent,
	ToolCallEndEvent,
} from './types';
import { LlmClient } from '../llm/LlmClient';
import { LlmRequestOptions, ModelId } from '../llm/types';

// ---------------------------------------------------------------------------
// Tool Call Parser — detects tool-call patterns in streamed text
// ---------------------------------------------------------------------------

/**
 * Matches fenced code blocks tagged with `tool:toolName` and extracts
 * the tool name and JSON arguments body.
 *
 * Example:
 * ```tool:readFile
 * {"path": "/foo/bar.ts"}
 * ```
 */
const TOOL_CALL_REGEX = /```tool:(\S+)\n([\s\S]*?)```/g;

interface ParsedToolCall {
	name: string;
	args: string;
}

function parseToolCalls(text: string): ParsedToolCall[] {
	const calls: ParsedToolCall[] = [];
	TOOL_CALL_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TOOL_CALL_REGEX.exec(text)) !== null) {
		calls.push({ name: match[1], args: match[2].trim() });
	}
	return calls;
}

// ---------------------------------------------------------------------------
// AgUiEventEmitter
// ---------------------------------------------------------------------------

/**
 * Central event emitter that fans out AG-UI events to all subscribers.
 *
 * Manages multiple concurrent agent runs, each identified by a unique runId.
 * Consumers subscribe via the `onEvent` event.
 */
export class AgUiEventEmitter implements vscode.Disposable {
	private readonly _onEvent = new vscode.EventEmitter<AgUiEvent>();

	/** Fires whenever any agent run produces an AG-UI event. */
	readonly onEvent: vscode.Event<AgUiEvent> = this._onEvent.event;

	private readonly activeRuns = new Map<string, AbortController>();

	/**
	 * Register a run so that it can be cancelled later.
	 */
	registerRun(runId: string, controller: AbortController): void {
		this.activeRuns.set(runId, controller);
	}

	/**
	 * Cancel a run by its runId.
	 */
	cancelRun(runId: string): void {
		const controller = this.activeRuns.get(runId);
		if (controller) {
			controller.abort();
			this.activeRuns.delete(runId);
		}
	}

	/**
	 * Emit a single AG-UI event to all subscribers.
	 */
	emit(event: AgUiEvent): void {
		this._onEvent.fire(event);
	}

	/**
	 * Remove a run from the active-runs map (called when it finishes).
	 */
	completeRun(runId: string): void {
		this.activeRuns.delete(runId);
	}

	dispose(): void {
		for (const controller of this.activeRuns.values()) {
			controller.abort();
		}
		this.activeRuns.clear();
		this._onEvent.dispose();
	}
}

// ---------------------------------------------------------------------------
// AgUiAgentRunner
// ---------------------------------------------------------------------------

/**
 * Wraps an {@link LlmClient} and produces a stream of AG-UI events for a
 * single agent invocation.
 *
 * Usage:
 * ```ts
 * const runner = new AgUiAgentRunner(llmClient);
 * for await (const event of runner.runAgent({ prompt: 'Hello' })) {
 *     emitter.emit(event);
 * }
 * ```
 */
export class AgUiAgentRunner {
	private readonly abortControllers = new Map<string, AbortController>();

	constructor(private readonly llmClient: LlmClient) {}

	/**
	 * Run an agent invocation and yield AG-UI events as they are produced.
	 */
	async *runAgent(input: AgentRunInput): AsyncGenerator<AgUiEvent> {
		const runId = crypto.randomUUID();
		const threadId = input.threadId ?? crypto.randomUUID();
		const agentName = input.agentName ?? 'default';
		const model: ModelId = (input.model as ModelId) ?? 'sonnet';
		const startTime = Date.now();

		const controller = new AbortController();
		this.abortControllers.set(runId, controller);

		// --- RunStarted ---
		yield {
			type: AgUiEventType.RunStarted,
			timestamp: Date.now(),
			threadId,
			runId,
			agentName,
			model,
		} satisfies RunStartedEvent;

		const messageId = crypto.randomUUID();

		// --- TextMessageStart ---
		yield {
			type: AgUiEventType.TextMessageStart,
			timestamp: Date.now(),
			messageId,
			role: 'assistant',
		} satisfies TextMessageStartEvent;

		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let costUsd = 0;

		const requestOptions: LlmRequestOptions = {
			model,
			messages: [{ role: 'user', content: input.prompt }],
			systemPrompt: input.systemPrompt,
			signal: controller.signal,
			enableCaching: true,
		};

		try {
			for await (const streamEvent of this.llmClient.streamRequest(requestOptions)) {
				if (controller.signal.aborted) {
					break;
				}

				if (streamEvent.type === 'token') {
					fullText += streamEvent.token;

					yield {
						type: AgUiEventType.TextMessageContent,
						timestamp: Date.now(),
						messageId,
						delta: streamEvent.token,
					} satisfies TextMessageContentEvent;
				} else if (streamEvent.type === 'complete') {
					inputTokens = streamEvent.inputTokens;
					outputTokens = streamEvent.outputTokens;
				} else if (streamEvent.type === 'error') {
					// Close the text message before reporting the error
					yield {
						type: AgUiEventType.TextMessageEnd,
						timestamp: Date.now(),
						messageId,
					} satisfies TextMessageEndEvent;

					yield {
						type: AgUiEventType.RunError,
						timestamp: Date.now(),
						threadId,
						runId,
						message: streamEvent.error,
					} satisfies RunErrorEvent;

					this.abortControllers.delete(runId);
					return;
				}
			}

			// --- TextMessageEnd ---
			yield {
				type: AgUiEventType.TextMessageEnd,
				timestamp: Date.now(),
				messageId,
			} satisfies TextMessageEndEvent;

			// --- Tool call detection from response text ---
			const toolCalls = parseToolCalls(fullText);
			for (const call of toolCalls) {
				const toolCallId = crypto.randomUUID();

				yield {
					type: AgUiEventType.ToolCallStart,
					timestamp: Date.now(),
					toolCallId,
					toolCallName: call.name,
					parentMessageId: messageId,
				} satisfies ToolCallStartEvent;

				yield {
					type: AgUiEventType.ToolCallArgs,
					timestamp: Date.now(),
					toolCallId,
					delta: call.args,
				} satisfies ToolCallArgsEvent;

				yield {
					type: AgUiEventType.ToolCallEnd,
					timestamp: Date.now(),
					toolCallId,
				} satisfies ToolCallEndEvent;
			}

			// --- Cost estimation ---
			costUsd = this.llmClient.estimateCost();

			// --- RunFinished ---
			yield {
				type: AgUiEventType.RunFinished,
				timestamp: Date.now(),
				threadId,
				runId,
				inputTokens,
				outputTokens,
				costUsd,
				elapsedMs: Date.now() - startTime,
			} satisfies RunFinishedEvent;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);

			// Close the text message if it was still open
			yield {
				type: AgUiEventType.TextMessageEnd,
				timestamp: Date.now(),
				messageId,
			} satisfies TextMessageEndEvent;

			yield {
				type: AgUiEventType.RunError,
				timestamp: Date.now(),
				threadId,
				runId,
				message,
				code: controller.signal.aborted ? 'CANCELLED' : 'LLM_ERROR',
			} satisfies RunErrorEvent;
		} finally {
			this.abortControllers.delete(runId);
		}
	}

	/**
	 * Cancel an in-progress run.
	 */
	cancelRun(runId: string): void {
		const controller = this.abortControllers.get(runId);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(runId);
		}
	}
}

