/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent } from '../types';

/**
 * Provider that uses the VS Code Language Model API (`vscode.lm`).
 * This lets users leverage their existing GitHub Copilot, Claude Code,
 * or OpenAI Codex subscriptions without additional API keys.
 *
 * Model discovery runs in the background and also listens for
 * `vscode.lm.onDidChangeChatModels` so that late-registering
 * extensions (Claude Code, GitHub Copilot, Codex) are picked up
 * automatically.
 */
export class CopilotProvider implements LlmProvider {
	readonly name = 'copilot';

	private cachedModels: vscode.LanguageModelChat[] | undefined;
	private discoveryPromise: Promise<void>;
	private discoveryDone = false;
	private readonly modelChangeListener: vscode.Disposable;

	private readonly _onDidBecomeAvailable = new vscode.EventEmitter<void>();
	readonly onDidBecomeAvailable = this._onDidBecomeAvailable.event;

	constructor() {
		// Fire-and-forget background discovery with retries
		this.discoveryPromise = this.discoverModels();

		// Listen for extensions registering models after startup
		this.modelChangeListener = vscode.lm.onDidChangeChatModels(async () => {
			const wasCached = (this.cachedModels?.length ?? 0) > 0;
			try {
				const models = await vscode.lm.selectChatModels();
				console.log(`[SoA] vscode.lm model change event: ${models.length} models${models.length > 0 ? ` [${models.map(m => m.id).join(', ')}]` : ''}`);
				if (models.length > 0) {
					this.cachedModels = models;
					if (!wasCached) {
						this._onDidBecomeAvailable.fire();
					}
				}
			} catch (err) {
				console.log(`[SoA] vscode.lm model change query failed: ${err}`);
			}
		});
	}

	dispose(): void {
		this.modelChangeListener.dispose();
		this._onDidBecomeAvailable.dispose();
	}

	private async discoverModels(): Promise<void> {
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const models = await Promise.race([
					vscode.lm.selectChatModels(),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
				]);
				console.log(`[SoA] vscode.lm.selectChatModels() attempt ${attempt + 1}: found ${models.length} models${models.length > 0 ? ` [${models.map(m => m.id).join(', ')}]` : ''}`);
				if (models.length > 0) {
					this.cachedModels = models;
					break;
				}
			} catch (err) {
				console.log(`[SoA] vscode.lm.selectChatModels() attempt ${attempt + 1} error: ${err}`);
			}
			if (attempt < 2) {
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}
		this.discoveryDone = true;
	}

	async isAvailable(): Promise<boolean> {
		if (!this.discoveryDone) {
			// Wait at most 1s for background discovery to finish
			await Promise.race([
				this.discoveryPromise,
				new Promise<void>(resolve => setTimeout(resolve, 1000)),
			]);
		}
		return (this.cachedModels?.length ?? 0) > 0;
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		try {
			// Re-query models if cache is empty (models may have registered since isAvailable)
			const models = this.cachedModels?.length
				? this.cachedModels
				: await vscode.lm.selectChatModels();
			if (models.length === 0) {
				yield { type: 'error', error: 'No language models available via VS Code LM API. Install GitHub Copilot or another LM extension.' };
				return;
			}

			// Pick the best available model — prefer Claude models, then any available
			const model = this.selectBestModel(models, options.model);
			console.log(`[SoA] Using VS Code LM model: ${model.id} (${model.name})`);

			const messages: vscode.LanguageModelChatMessage[] = [];

			// Add system prompt as the first user message (VS Code LM API convention)
			if (options.systemPrompt) {
				messages.push(vscode.LanguageModelChatMessage.User(options.systemPrompt));
			}

			// Convert conversation messages
			for (const msg of options.messages) {
				if (msg.role === 'user') {
					messages.push(vscode.LanguageModelChatMessage.User(msg.content));
				} else {
					messages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
				}
			}

			// Wire AbortSignal to VS Code CancellationToken
			const cts = new vscode.CancellationTokenSource();
			const onAbort = () => cts.cancel();
			options.signal?.addEventListener('abort', onAbort);

			try {
				const response = await model.sendRequest(
					messages,
					{},
					cts.token,
				);

				let fullText = '';
				for await (const chunk of response.text) {
					fullText += chunk;
					yield { type: 'token', token: chunk };
				}

				yield {
					type: 'complete',
					fullText,
					inputTokens: 0, // VS Code LM API doesn't expose token counts
					outputTokens: 0,
					cachedTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
				};
			} finally {
				options.signal?.removeEventListener('abort', onAbort);
				cts.dispose();
			}
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
			} else {
				const message = err instanceof Error ? err.message : String(err);
				yield { type: 'error', error: `Copilot provider error: ${message}` };
			}
		}
	}

	/**
	 * Select the best model from available VS Code LM models.
	 * Prefers Claude models for opus/sonnet/haiku mapping, falls back to any available model.
	 */
	private selectBestModel(models: vscode.LanguageModelChat[], _preferredTier: string): vscode.LanguageModelChat {
		// Try to find a Claude model first
		const claudeModel = models.find(m =>
			m.id.toLowerCase().includes('claude') || m.name.toLowerCase().includes('claude')
		);
		if (claudeModel) {
			return claudeModel;
		}

		// Try GPT-4 class models
		const gpt4Model = models.find(m =>
			m.id.toLowerCase().includes('gpt-4') || m.name.toLowerCase().includes('gpt-4')
		);
		if (gpt4Model) {
			return gpt4Model;
		}

		// Fall back to first available model
		return models[0];
	}
}
