/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent } from '../types';

/**
 * Provider that routes requests through the model-router service.
 * The model-router supports multiple backend providers (Anthropic, OpenAI, Ollama, etc.)
 * with fallback routing and A/B testing.
 */
export class ModelRouterProvider implements LlmProvider {
	readonly name = 'model-router';

	private getBaseUrl(): string {
		const config = vscode.workspace.getConfiguration('sota');
		return config.get<string>('modelRouterUrl') ?? 'http://localhost:3200';
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.getBaseUrl()}/health`, {
				signal: AbortSignal.timeout(2000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const baseUrl = this.getBaseUrl();

		const body = {
			messages: options.messages.map(m => ({
				role: m.role,
				content: m.content,
			})),
			system: options.systemPrompt ?? 'You are a helpful coding assistant.',
			max_tokens: options.maxTokens ?? 4096,
			stream: true,
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'x-agent-role': options.agentHandle ?? 'default',
		};

		try {
			const response = await fetch(`${baseUrl}/v1/messages`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				yield { type: 'error', error: `Model router error ${response.status}: ${errorText}` };
				return;
			}

			// Check if the response is streaming (SSE) or JSON
			const contentType = response.headers.get('content-type') ?? '';

			if (contentType.includes('text/event-stream')) {
				// Streaming response — parse SSE
				yield* this.parseSSEStream(response, options.signal);
			} else {
				// Non-streaming JSON response
				const result = await response.json();
				const text = result.content ?? '';
				yield { type: 'token', token: text };
				yield {
					type: 'complete',
					fullText: text,
					inputTokens: result.inputTokens ?? 0,
					outputTokens: result.outputTokens ?? 0,
					cachedTokens: result.cachedTokens ?? 0,
					cacheCreationTokens: 0,
					cacheReadTokens: result.cachedTokens ?? 0,
				};
			}
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
			} else {
				yield { type: 'error', error: `Model router request failed: ${err}` };
			}
		}
	}

	private async *parseSSEStream(response: Response, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body from model router' };
			return;
		}

		const decoder = new TextDecoder();
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let cachedTokens = 0;
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						if (event.type === 'content_block_delta' && event.delta?.text) {
							const token = event.delta.text;
							fullText += token;
							yield { type: 'token', token };
						} else if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens ?? 0;
							cachedTokens = event.message.usage.cache_read_input_tokens ?? 0;
						} else if (event.type === 'message_delta' && event.usage) {
							outputTokens = event.usage.output_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON
					}
				}
			}
		} finally {
			if (signal?.aborted) {
				reader.cancel();
			}
		}

		yield {
			type: 'complete',
			fullText,
			inputTokens,
			outputTokens,
			cachedTokens,
			cacheCreationTokens: 0,
			cacheReadTokens: cachedTokens,
		};
	}
}
