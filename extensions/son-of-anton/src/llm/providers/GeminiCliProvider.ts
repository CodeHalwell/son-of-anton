/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, ModelId } from '../types';

/**
 * Provider that uses the Gemini CLI (`gemini`) to serve requests.
 * Leverages the user's existing Gemini subscription — no separate API key required.
 *
 * Non-interactive streaming mode:
 *   gemini --prompt "<text>" --output-format stream-json --model <model>
 *
 * Each line of stdout is a JSON object with a text delta or completion marker.
 */
export class GeminiCliProvider implements LlmProvider {
	readonly name = 'gemini-cli';

	async isAvailable(): Promise<boolean> {
		return new Promise(resolve => {
			const proc = spawn('gemini', ['--version'], { stdio: 'pipe' });
			const timer = setTimeout(() => {
				proc.kill();
				resolve(false);
			}, 3000);

			proc.on('close', code => {
				clearTimeout(timer);
				resolve(code === 0);
			});

			proc.on('error', () => {
				clearTimeout(timer);
				resolve(false);
			});
		});
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const prompt = this.buildPrompt(options);
		const args = this.buildArgs(options, prompt);

		let proc: ChildProcess;
		try {
			proc = spawn('gemini', args, { stdio: 'pipe' });
		} catch (err) {
			yield { type: 'error', error: `Failed to spawn gemini CLI: ${err}` };
			return;
		}

		const onAbort = () => proc.kill();
		options.signal?.addEventListener('abort', onAbort);

		const result: LlmStreamEvent = yield* this.readStream(proc, options.signal);

		options.signal?.removeEventListener('abort', onAbort);
		yield result;
	}

	private buildArgs(options: LlmRequestOptions, prompt: string): string[] {
		return [
			'--prompt', prompt,
			'--output-format', 'stream-json',
			'--model', this.mapModel(options.model),
		];
	}

	private buildPrompt(options: LlmRequestOptions): string {
		const parts: string[] = [];

		if (options.systemPrompt) {
			parts.push(options.systemPrompt);
			parts.push('');
		}

		// Use only the last user message to avoid role-prefix injection
		const lastUserMsg = options.messages.filter(m => m.role === 'user').pop();
		if (lastUserMsg) {
			parts.push(sanitizePrompt(lastUserMsg.content));
		}

		return parts.join('\n');
	}

	private mapModel(model: ModelId): string {
		switch (model) {
			case 'opus': return 'gemini-2.5-pro';
			case 'haiku': return 'gemini-2.5-flash';
			case 'sonnet':
			default: return 'gemini-2.5-pro';
		}
	}

	private async *readStream(proc: ChildProcess, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let buffer = '';

		const lines: string[] = [];
		let resolveNext: (() => void) | undefined;
		let done = false;

		proc.stdout?.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const parts = buffer.split('\n');
			buffer = parts.pop() ?? '';
			for (const part of parts) {
				if (part.trim()) {
					lines.push(part);
					resolveNext?.();
				}
			}
		});

		proc.on('close', () => {
			if (buffer.trim()) {
				lines.push(buffer);
			}
			done = true;
			resolveNext?.();
		});

		while (true) {
			if (lines.length === 0) {
				if (done) {
					break;
				}
				await new Promise<void>(resolve => {
					resolveNext = resolve;
				});
				resolveNext = undefined;
				continue;
			}

			if (signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
				return;
			}

			const line = lines.shift()!;
			try {
				const obj = JSON.parse(line) as Record<string, unknown>;

				// Gemini CLI stream-json format: { "text": "...", "done": false }
				// or: { "candidates": [{ "content": { "parts": [{ "text": "..." }] } }], "done": false }
				const text = obj['text'];
				if (typeof text === 'string' && text) {
					fullText += text;
					yield { type: 'token', token: text };
				} else {
					const candidates = obj['candidates'];
					if (Array.isArray(candidates) && candidates.length > 0) {
						const candidate = candidates[0] as Record<string, unknown>;
						const content = candidate['content'] as Record<string, unknown> | undefined;
						const parts = content?.['parts'];
						if (Array.isArray(parts)) {
							for (const part of parts) {
								if (part && typeof part === 'object') {
									const partText = (part as Record<string, unknown>)['text'];
									if (typeof partText === 'string' && partText) {
										fullText += partText;
										yield { type: 'token', token: partText };
									}
								}
							}
						}
					}
				}

				const usageMetadata = obj['usageMetadata'] as Record<string, unknown> | undefined;
				if (usageMetadata) {
					inputTokens = Number(usageMetadata['promptTokenCount'] ?? inputTokens);
					outputTokens = Number(usageMetadata['candidatesTokenCount'] ?? outputTokens);
				}
			} catch {
				// Skip malformed lines
			}
		}

		if (signal?.aborted) {
			yield { type: 'error', error: 'Request cancelled' };
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
}

function sanitizePrompt(text: string): string {
	return text.replace(/^(Human|Assistant|System):\s*/gim, '');
}
