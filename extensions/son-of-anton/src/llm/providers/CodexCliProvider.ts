/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent } from '../types';

/**
 * Provider that uses the OpenAI Codex CLI (`codex`) to serve requests.
 * Leverages the user's existing OpenAI subscription — no separate API key required.
 *
 * Non-interactive execution mode:
 *   codex exec "<prompt>"
 *
 * Stdout is parsed as plain text and emitted as a single token stream.
 */
export class CodexCliProvider implements LlmProvider {
	readonly name = 'codex-cli';

	async isAvailable(): Promise<boolean> {
		return new Promise(resolve => {
			const proc = spawn('codex', ['--version'], { stdio: 'pipe' });
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
				// Try 'which codex' as a fallback availability check
				const whichProc = spawn('which', ['codex'], { stdio: 'pipe' });
				const whichTimer = setTimeout(() => {
					whichProc.kill();
					resolve(false);
				}, 3000);

				whichProc.on('close', whichCode => {
					clearTimeout(whichTimer);
					resolve(whichCode === 0);
				});

				whichProc.on('error', () => {
					clearTimeout(whichTimer);
					resolve(false);
				});
			});
		});
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const prompt = this.buildPrompt(options);

		let proc: ChildProcess;
		try {
			proc = spawn('codex', ['exec', prompt], { stdio: 'pipe' });
		} catch (err) {
			yield { type: 'error', error: `Failed to spawn codex CLI: ${err}` };
			return;
		}

		const onAbort = () => proc.kill();
		options.signal?.addEventListener('abort', onAbort);

		const result: LlmStreamEvent = yield* this.readStream(proc, options.signal);

		options.signal?.removeEventListener('abort', onAbort);
		yield result;
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

	private async *readStream(proc: ChildProcess, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		let fullText = '';
		let buffer = '';

		const lines: string[] = [];
		let resolveNext: (() => void) | undefined;
		let done = false;

		proc.stdout?.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			// Emit chunks as they arrive (codex outputs plain text, not NDJSON)
			lines.push(buffer);
			buffer = '';
			resolveNext?.();
		});

		proc.on('close', () => {
			if (buffer) {
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

			const chunk = lines.shift()!;
			fullText += chunk;
			yield { type: 'token', token: chunk };
		}

		if (signal?.aborted) {
			yield { type: 'error', error: 'Request cancelled' };
			return;
		}

		yield {
			type: 'complete',
			fullText,
			inputTokens: 0, // Codex CLI does not expose token counts
			outputTokens: 0,
			cachedTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
	}
}

function sanitizePrompt(text: string): string {
	return text.replace(/^(Human|Assistant|System):\s*/gim, '');
}
