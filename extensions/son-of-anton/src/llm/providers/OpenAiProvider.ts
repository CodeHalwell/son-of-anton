/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, ModelId } from '../types';

/**
 * Provider that calls the OpenAI Chat Completions API directly.
 * Supports GPT-4o, GPT-4o-mini, and o1 models.
 *
 * Requires an API key via `sota.openaiApiKey` setting or `OPENAI_API_KEY` env var.
 */
export class OpenAiProvider implements LlmProvider {
	readonly name = 'openai';
	private static readonly MAX_RETRIES = 3;

	private getApiKey(): string | undefined {
		const config = vscode.workspace.getConfiguration('sota');
		const configKey = config.get<string>('openaiApiKey');
		if (configKey) {
			return configKey;
		}
		return process.env['OPENAI_API_KEY'];
	}

	async isAvailable(): Promise<boolean> {
		return !!this.getApiKey();
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			yield { type: 'error', error: 'No OpenAI API key configured. Set OPENAI_API_KEY or sota.openaiApiKey.' };
			return;
		}

		const model = this.mapModel(options.model);
		const messages = this.buildMessages(options);

		const body = {
			model,
			messages,
			stream: true,
			max_completion_tokens: options.maxTokens ?? 4096,
			stream_options: { include_usage: true },
		};

		let lastError: string | undefined;
		for (let attempt = 0; attempt < OpenAiProvider.MAX_RETRIES; attempt++) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
				return;
			}

			try {
				const response = await fetch('https://api.openai.com/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey}`,
					},
					body: JSON.stringify(body),
					signal: options.signal,
				});

				if (response.status === 429) {
					const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
					const delayMs = (retryAfter > 0 ? retryAfter * 1000 : 1000) * Math.pow(2, attempt);
					lastError = `Rate limited (429), retrying in ${Math.round(delayMs / 1000)}s...`;
					await new Promise(resolve => setTimeout(resolve, delayMs));
					continue;
				}

				if (!response.ok) {
					const errorText = await response.text();
					yield { type: 'error', error: `OpenAI API error ${response.status}: ${errorText}` };
					return;
				}

				yield* this.processStream(response, options.signal);
				return;
			} catch (err) {
				if (options.signal?.aborted) {
					yield { type: 'error', error: 'Request cancelled' };
					return;
				}
				lastError = `Request failed: ${err}`;
				if (attempt < OpenAiProvider.MAX_RETRIES - 1) {
					await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
					continue;
				}
			}
		}

		yield { type: 'error', error: lastError ?? 'Max retries exceeded' };
	}

	private async *processStream(response: Response, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body from OpenAI' };
			return;
		}

		const decoder = new TextDecoder();
		let fullText = '';
		let buffer = '';
		let inputTokens = 0;
		let outputTokens = 0;

		try {
			while (true) {
				if (signal?.aborted) {
					yield { type: 'error', error: 'Request cancelled' };
					return;
				}

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
						const delta = event.choices?.[0]?.delta;
						if (delta?.content) {
							fullText += delta.content;
							yield { type: 'token', token: delta.content };
						}

						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		yield {
			type: 'complete',
			fullText,
			inputTokens,
			outputTokens,
			cachedTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
	}

	private mapModel(model: ModelId): string {
		switch (model) {
			case 'opus': return 'o1';
			case 'haiku': return 'gpt-4o-mini';
			case 'sonnet':
			default: return 'gpt-4o';
		}
	}

	private buildMessages(options: LlmRequestOptions): Array<{ role: string; content: string }> {
		const messages: Array<{ role: string; content: string }> = [];

		if (options.systemPrompt) {
			messages.push({ role: 'system', content: options.systemPrompt });
		}

		for (const msg of options.messages) {
			messages.push({ role: msg.role, content: msg.content });
		}

		return messages;
	}
}
