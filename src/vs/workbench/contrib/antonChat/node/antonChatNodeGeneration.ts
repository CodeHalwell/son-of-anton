/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IAntonGenerationService,
	IGenerationChunk,
	IGenerationRequest,
	IGenerationResult,
} from '../common/antonChatGeneration.js';

const ANTON_SYSTEM_PROMPT = [
	'You are Anton, the AI orchestrator for the Son of Anton code editor.',
	'You help developers plan, build, review, and explore their codebases.',
	'You coordinate specialist agents when complex multi-step tasks are requested.',
	'Keep responses concise and actionable. Use markdown formatting.',
].join(' ');

export class AntonChatNodeGeneration extends Disposable implements IAntonGenerationService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async generate(
		request: IGenerationRequest,
		onChunk: (chunk: IGenerationChunk) => void,
		token: CancellationToken,
	): Promise<IGenerationResult> {
		const startTime = Date.now();
		const model = request.model ?? 'claude-sonnet-4-6';
		const systemPrompt = request.systemPrompt ?? ANTON_SYSTEM_PROMPT;

		return new Promise<IGenerationResult>((resolve, reject) => {
			if (token.isCancellationRequested) {
				reject(new Error('Generation cancelled'));
				return;
			}

			const args = [
				'--print',
				'--output-format', 'stream-json',
				'--model', model,
				'--system-prompt', systemPrompt,
				request.prompt,
			];

			this.logService.debug('[AntonGeneration] Spawning claude CLI', args.slice(0, 4).join(' '));

			const child = spawn('claude', args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env },
			});

			let fullText = '';
			let lineBuffer = '';

			const cancelListener = token.onCancellationRequested(() => {
				child.kill('SIGTERM');
				reject(new Error('Generation cancelled'));
			});

			child.stdout.on('data', (data: Buffer) => {
				lineBuffer += data.toString();
				const lines = lineBuffer.split('\n');
				// Keep the last potentially incomplete line in the buffer
				lineBuffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) {
						continue;
					}
					try {
						const event = JSON.parse(line);
						const text = this.extractText(event);
						if (text) {
							fullText += text;
							onChunk({ text });
						}
					} catch {
						// Non-JSON line — might be plain text output
						if (line.trim()) {
							fullText += line;
							onChunk({ text: line });
						}
					}
				}
			});

			let stderrOutput = '';
			child.stderr.on('data', (data: Buffer) => {
				stderrOutput += data.toString();
			});

			child.on('error', (err) => {
				cancelListener.dispose();
				this.logService.error('[AntonGeneration] CLI spawn error', err);
				reject(new Error(`Failed to start claude CLI: ${err.message}`));
			});

			child.on('close', (code) => {
				cancelListener.dispose();

				// Process any remaining buffered content
				if (lineBuffer.trim()) {
					try {
						const event = JSON.parse(lineBuffer);
						const text = this.extractText(event);
						if (text) {
							fullText += text;
							onChunk({ text });
						}
					} catch {
						if (lineBuffer.trim()) {
							fullText += lineBuffer;
							onChunk({ text: lineBuffer });
						}
					}
				}

				if (code !== 0 && !fullText) {
					const errorMsg = stderrOutput.trim() || `claude CLI exited with code ${code}`;
					this.logService.error('[AntonGeneration] CLI failed', errorMsg);
					reject(new Error(errorMsg));
					return;
				}

				const elapsedMs = Date.now() - startTime;
				this.logService.debug(`[AntonGeneration] Complete in ${elapsedMs}ms, ${fullText.length} chars`);

				resolve({
					fullText,
					model,
					elapsedMs,
				});
			});
		});
	}

	/**
	 * Extract text content from a Claude CLI stream-json event.
	 * Events follow the format:
	 * - `{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`
	 * - `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}`
	 * - `{"type":"result","result":"..."}`
	 */
	private extractText(event: Record<string, unknown>): string | undefined {
		// content_block_delta (streaming)
		if (event.type === 'content_block_delta') {
			const delta = event.delta as Record<string, unknown> | undefined;
			if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
				return delta.text;
			}
		}

		// result event (final text in --print mode)
		if (event.type === 'result' && typeof event.result === 'string') {
			return event.result;
		}

		// assistant message block
		if (event.type === 'assistant') {
			const message = event.message as Record<string, unknown> | undefined;
			if (message?.content && Array.isArray(message.content)) {
				const texts: string[] = [];
				for (const block of message.content) {
					if ((block as Record<string, unknown>).type === 'text') {
						const text = (block as Record<string, unknown>).text;
						if (typeof text === 'string') {
							texts.push(text);
						}
					}
				}
				return texts.join('') || undefined;
			}
		}

		return undefined;
	}
}
