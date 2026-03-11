/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, ModelId } from '../types';

/** A single chunk from Ollama's NDJSON streaming response. */
interface OllamaChatChunk {
	message?: {
		role?: string;
		content?: string;
	};
	done: boolean;
	prompt_eval_count?: number;
	eval_count?: number;
}

/**
 * Provider that uses the local Ollama HTTP API.
 * Free, no internet connection required once models are downloaded.
 * Requires Ollama to be running at http://localhost:11434.
 *
 * POST /api/chat with { model, messages, stream: true }
 * Response is NDJSON — one JSON object per line.
 */
export class OllamaProvider implements LlmProvider {
	readonly name = 'ollama';

	private readonly baseUrl = 'http://localhost:11434';

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(3000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const model = this.mapModel(options.model);
		const messages = this.buildMessages(options);

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, messages, stream: true }),
				signal: options.signal,
			});
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
			} else {
				yield { type: 'error', error: `Failed to reach Ollama at ${this.baseUrl}: ${err}` };
			}
			return;
		}

		if (!response.ok) {
			const errorText = await response.text();
			yield { type: 'error', error: `Ollama API error ${response.status}: ${errorText}` };
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body from Ollama' };
			return;
		}

		const decoder = new TextDecoder();
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let lineBuffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				lineBuffer += decoder.decode(value, { stream: true });
				const lines = lineBuffer.split('\n');
				lineBuffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) {
						continue;
					}

					try {
						const chunk = JSON.parse(line) as OllamaChatChunk;
						const content = chunk.message?.content;

						if (typeof content === 'string' && content) {
							fullText += content;
							yield { type: 'token', token: content };
						}

						if (chunk.done) {
							inputTokens = chunk.prompt_eval_count ?? 0;
							outputTokens = chunk.eval_count ?? 0;
						}
					} catch {
						// Skip malformed NDJSON lines
					}
				}
			}
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
				return;
			}
			yield { type: 'error', error: `Ollama stream error: ${err}` };
			return;
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
		// Use the user-configured model if set, otherwise pick from available models
		const configured = this.getConfiguredModel();
		if (configured) {
			return configured;
		}

		switch (model) {
			case 'opus': return 'qwen2.5-coder:32b';
			case 'haiku': return 'ministral-3:3b-instruct-2512-q4_K_M';
			case 'sonnet':
			default: return 'ministral-3:latest';
		}
	}

	private getConfiguredModel(): string | undefined {
		const config = vscode.workspace.getConfiguration('sota');
		return config.get<string>('ollamaModel') || undefined;
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
