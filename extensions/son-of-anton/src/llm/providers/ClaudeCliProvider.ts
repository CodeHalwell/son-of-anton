/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, ModelId } from '../types';

/**
 * Provider that uses the Claude Code CLI (`claude`) to serve requests.
 * Leverages the user's existing Claude Code subscription — no separate API key required.
 *
 * Non-interactive streaming mode:
 *   claude --print --output-format stream-json --model <model> "<prompt>"
 *
 * Each line of stdout is a JSON object:
 *   { "type": "assistant", "message": { "content": [{ "type": "text", "text": "..." }] } }
 *   { "type": "result", "result": "...", "usage": { "input_tokens": N, "output_tokens": N } }
 */
export class ClaudeCliProvider implements LlmProvider {
	readonly name = 'claude-cli';

	/**
	 * Build a clean environment for spawning the Claude CLI.
	 * Strips CLAUDECODE to avoid "cannot be launched inside another Claude Code session" errors
	 * when the IDE itself is running inside a Claude Code session.
	 */
	private getCleanEnv(): NodeJS.ProcessEnv {
		const env = { ...process.env };
		delete env['CLAUDECODE'];
		return env;
	}

	async isAvailable(): Promise<boolean> {
		return new Promise(resolve => {
			const proc = spawn('claude', ['--version'], { stdio: 'pipe', env: this.getCleanEnv() });
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
		const args = this.buildArgs(options);
		const prompt = this.buildPrompt(options);

		let proc: ChildProcess;
		try {
			proc = spawn('claude', [...args, prompt], { stdio: 'pipe', env: this.getCleanEnv() });
		} catch (err) {
			yield { type: 'error', error: `Failed to spawn claude CLI: ${err}` };
			return;
		}

		// Handle AbortSignal cancellation
		const onAbort = () => proc.kill();
		options.signal?.addEventListener('abort', onAbort);

		const result: LlmStreamEvent = yield* this.readStream(proc, options.signal);

		options.signal?.removeEventListener('abort', onAbort);
		yield result;
	}

	private buildArgs(options: LlmRequestOptions): string[] {
		const args = [
			'--print',
			'--verbose',
			'--output-format', 'stream-json',
			'--model', this.mapModel(options.model),
		];

		if (options.maxTokens) {
			args.push('--max-tokens', String(options.maxTokens));
		}

		if (options.systemPrompt) {
			args.push('--system-prompt', options.systemPrompt);
		}

		return args;
	}

	private buildPrompt(options: LlmRequestOptions): string {
		// Use only the last user message as the prompt.
		// Conversation history is not supported in --print mode without stdin streaming.
		// Sanitize: strip role-prefix patterns that could impersonate turns.
		const lastUserMsg = options.messages.filter(m => m.role === 'user').pop();
		return sanitizePrompt(lastUserMsg?.content ?? '');
	}

	private mapModel(model: ModelId): string {
		switch (model) {
			case 'opus': return 'opus';
			case 'haiku': return 'haiku';
			case 'sonnet':
			default: return 'sonnet';
		}
	}

	private async *readStream(proc: ChildProcess, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let buffer = '';
		let errorOutput = '';

		proc.stderr?.on('data', (chunk: Buffer) => {
			errorOutput += chunk.toString();
		});

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

				if (obj['type'] === 'assistant') {
					const message = obj['message'] as Record<string, unknown> | undefined;
					const content = message?.['content'];
					if (Array.isArray(content)) {
						for (const block of content) {
							if (block && typeof block === 'object' && (block as Record<string, unknown>)['type'] === 'text') {
								const token = String((block as Record<string, unknown>)['text'] ?? '');
								fullText += token;
								yield { type: 'token', token };
							}
						}
					}
				} else if (obj['type'] === 'result') {
					const usage = obj['usage'] as Record<string, unknown> | undefined;
					if (usage) {
						inputTokens = Number(usage['input_tokens'] ?? 0);
						outputTokens = Number(usage['output_tokens'] ?? 0);
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		if (signal?.aborted) {
			yield { type: 'error', error: 'Request cancelled' };
			return;
		}

		// Surface CLI errors if no content was produced
		if (!fullText && errorOutput.trim()) {
			yield { type: 'error', error: `Claude CLI error: ${errorOutput.trim()}` };
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

/**
 * Strip patterns that could impersonate conversation turns in a CLI prompt.
 * Prevents prompt injection via role-prefix impersonation.
 */
function sanitizePrompt(text: string): string {
	return text.replace(/^(Human|Assistant|System):\s*/gim, '');
}
