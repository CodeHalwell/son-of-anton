/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, getAnthropicModelId } from '../types';

/**
 * Provider that calls the Anthropic Messages API directly.
 * Requires an API key via `sota.apiKey` setting or `ANTHROPIC_API_KEY` env var.
 *
 * Features:
 * - Prompt caching via `cache_control` + `anthropic-beta` header
 * - Rate limit handling with exponential backoff (429 / 529)
 * - tool_use content block streaming (accumulated as JSON)
 */
export class AnthropicProvider implements LlmProvider {
	readonly name = 'anthropic';
	private static readonly MAX_RETRIES = 3;

	private getApiKey(): string | undefined {
		const config = vscode.workspace.getConfiguration('sota');
		const configKey = config.get<string>('apiKey');
		if (configKey) {
			return configKey;
		}
		return process.env['ANTHROPIC_API_KEY'];
	}

	async isAvailable(): Promise<boolean> {
		return !!this.getApiKey();
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			yield { type: 'error', error: 'No Anthropic API key configured.' };
			return;
		}

		const modelId = getAnthropicModelId(options.model);

		// Build system prompt with cache control for prompt caching
		const systemContent = options.enableCaching
			? [{ type: 'text', text: options.systemPrompt ?? 'You are a helpful coding assistant.', cache_control: { type: 'ephemeral' } }]
			: options.systemPrompt ?? 'You are a helpful coding assistant.';

		const body = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			system: systemContent,
			messages: options.messages.map(m => ({
				role: m.role,
				content: m.content,
			})),
			stream: true,
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		};

		if (options.enableCaching) {
			headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
		}

		// Retry loop for rate limits (429) and overloaded (529)
		let lastError: string | undefined;
		for (let attempt = 0; attempt < AnthropicProvider.MAX_RETRIES; attempt++) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
				return;
			}

			try {
				const response = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers,
					body: JSON.stringify(body),
					signal: options.signal,
				});

				if (response.status === 429 || response.status === 529) {
					const retryAfter = parseInt(response.headers.get('retry-after') ?? '', 10);
					const delayMs = (retryAfter > 0 ? retryAfter * 1000 : 1000) * Math.pow(2, attempt);
					lastError = `Rate limited (${response.status}), retrying in ${Math.round(delayMs / 1000)}s...`;
					await new Promise(resolve => setTimeout(resolve, delayMs));
					continue;
				}

				if (!response.ok) {
					const errorText = await response.text();
					yield { type: 'error', error: `API error ${response.status}: ${errorText}` };
					return;
				}

				// Stream the response
				yield* this.processStream(response, options.signal);
				return;
			} catch (err) {
				if (options.signal?.aborted) {
					yield { type: 'error', error: 'Request cancelled' };
					return;
				}
				lastError = `Request failed: ${err}`;
				if (attempt < AnthropicProvider.MAX_RETRIES) {
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
			yield { type: 'error', error: 'No response body' };
			return;
		}

		const decoder = new TextDecoder();
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheCreationTokens = 0;
		let cacheReadTokens = 0;
		let buffer = '';

		// Track tool_use content blocks being accumulated
		let activeToolBlock: { id: string; name: string; inputJson: string } | undefined;

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

						switch (event.type) {
							case 'message_start':
								if (event.message?.usage) {
									inputTokens = event.message.usage.input_tokens ?? 0;
									cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
									cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
								}
								break;

							case 'content_block_start':
								if (event.content_block?.type === 'tool_use') {
									activeToolBlock = {
										id: event.content_block.id,
										name: event.content_block.name,
										inputJson: '',
									};
								}
								break;

							case 'content_block_delta':
								if (event.delta?.type === 'text_delta' && event.delta.text) {
									const token = event.delta.text;
									fullText += token;
									yield { type: 'token', token };
								} else if (event.delta?.type === 'input_json_delta' && activeToolBlock) {
									activeToolBlock.inputJson += event.delta.partial_json ?? '';
								}
								break;

							case 'content_block_stop':
								if (activeToolBlock) {
									// Emit tool call as a structured text marker for downstream parsing
									const toolMarker = `\n[tool_use: ${activeToolBlock.name}(${activeToolBlock.inputJson})]\n`;
									fullText += toolMarker;
									yield { type: 'token', token: toolMarker };
									activeToolBlock = undefined;
								}
								break;

							case 'message_delta':
								if (event.usage) {
									outputTokens = event.usage.output_tokens ?? 0;
								}
								break;
						}
					} catch {
						// Skip malformed JSON lines in the stream
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
			cachedTokens: cacheReadTokens,
			cacheCreationTokens,
			cacheReadTokens,
		};
	}
}
