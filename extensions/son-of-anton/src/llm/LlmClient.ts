/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ModelId, LlmMessage, LlmRequestOptions, LlmStreamEvent, LlmStreamToken, LlmStreamComplete, LlmStreamError, LlmProvider, ProviderType, getAnthropicModelId } from './types';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { ClaudeCliProvider } from './providers/ClaudeCliProvider';
import { CodexCliProvider } from './providers/CodexCliProvider';
import { CopilotProvider } from './providers/CopilotProvider';
import { GeminiCliProvider } from './providers/GeminiCliProvider';
import { GitHubCopilotProvider } from './providers/GitHubCopilotProvider';
import { MockProvider } from './providers/MockProvider';
import { ModelRouterProvider } from './providers/ModelRouterProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { OpenAiProvider } from './providers/OpenAiProvider';

// Re-export types for backward compatibility
export { ModelId, LlmMessage, LlmRequestOptions, LlmStreamEvent, LlmStreamToken, LlmStreamComplete, LlmStreamError };

/**
 * Routes requests to LLM providers based on configuration.
 *
 * Auto-mode priority:
 * 1. copilot        — VS Code LM API (Claude Code, GitHub Copilot, Codex extensions)
 * 2. github-copilot — Direct GitHub Copilot Chat API (uses GitHub auth session)
 * 3. anthropic      — Direct Anthropic API (requires API key)
 * 4. openai         — Direct OpenAI API (requires API key)
 * 5. ollama         — Local Ollama instance
 * 6. model-router   — Multi-provider routing service (Docker)
 * 7. mock           — Demo fallback
 *
 * CLI providers (claude-cli, gemini-cli, codex-cli) have significant startup
 * overhead and must be explicitly selected via `sota.provider` setting.
 */
export class LlmClient {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private totalCachedTokens = 0;

	private readonly providers: Map<ProviderType, LlmProvider>;
	private activeProvider: LlmProvider | undefined;
	private providerResolved = false;

	private readonly disposables: vscode.Disposable[] = [];

	constructor(_context: vscode.ExtensionContext) {
		const copilotProvider = new CopilotProvider();

		this.providers = new Map<ProviderType, LlmProvider>([
			['copilot', copilotProvider],
			['github-copilot', new GitHubCopilotProvider()],
			['anthropic', new AnthropicProvider()],
			['openai', new OpenAiProvider()],
			['claude-cli', new ClaudeCliProvider()],
			['gemini-cli', new GeminiCliProvider()],
			['codex-cli', new CodexCliProvider()],
			['ollama', new OllamaProvider()],
			['model-router', new ModelRouterProvider()],
			['mock', new MockProvider()],
		]);

		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('sota')) {
					this.resetProvider();
				}
			}),
		);

		// When extension models (Claude Code, Copilot, Codex) register late,
		// auto-switch to the copilot provider if we're in auto mode and
		// currently using a lower-priority provider.
		this.disposables.push(
			copilotProvider.onDidBecomeAvailable(() => {
				const configured = this.getConfiguredProvider();
				if (configured === 'auto' && this.activeProvider?.name !== 'copilot') {
					console.log(`[SoA] Extension models now available — switching from ${this.activeProvider?.name ?? 'none'} to copilot`);
					this.activeProvider = copilotProvider;
					this.providerResolved = true;
				}
			}),
		);

		this.disposables.push(copilotProvider);
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	/**
	 * Get the configured provider type from settings.
	 */
	private getConfiguredProvider(): ProviderType {
		const config = vscode.workspace.getConfiguration('sota');
		return config.get<ProviderType>('provider') ?? 'auto';
	}

	/**
	 * Resolve the active provider. In `auto` mode, tries each provider in priority order.
	 * Caches the result for subsequent calls (reset on config change).
	 */
	private async resolveProvider(): Promise<LlmProvider> {
		if (this.providerResolved && this.activeProvider) {
			return this.activeProvider;
		}

		const configured = this.getConfiguredProvider();

		if (configured !== 'auto') {
			const provider = this.providers.get(configured);
			if (provider) {
				this.activeProvider = provider;
				this.providerResolved = true;
				return provider;
			}
		}

		// Auto mode priority:
		// 1. copilot        — vscode.lm API (catches Claude Code, Copilot, Codex extensions if they register models)
		// 2. github-copilot — Direct Copilot API via GitHub auth (works even if vscode.lm doesn't)
		// 3. anthropic      — Direct Anthropic API (if API key is set)
		// 4. openai         — Direct OpenAI API (if API key is set)
		// 5. ollama         — Local Ollama instance
		// 6. model-router   — Docker service
		// CLI providers excluded from auto — too slow to probe on startup.
		const order: ProviderType[] = [
			'copilot',
			'github-copilot',
			'anthropic',
			'openai',
			'ollama',
			'model-router',
		];

		for (const key of order) {
			const provider = this.providers.get(key)!;
			try {
				console.log(`[SoA] Checking provider: ${key}...`);
				if (await provider.isAvailable()) {
					console.log(`[SoA] Using provider: ${key}`);
					this.activeProvider = provider;
					this.providerResolved = true;
					return provider;
				}
				console.log(`[SoA] Provider ${key} not available`);
			} catch {
				console.log(`[SoA] Provider ${key} check failed`);
			}
		}

		// Fall back to mock
		console.log('[SoA] No providers available, falling back to mock');
		const mock = this.providers.get('mock')!;
		this.activeProvider = mock;
		this.providerResolved = true;
		return mock;
	}

	/**
	 * Reset provider resolution (e.g. after config change).
	 */
	resetProvider(): void {
		this.activeProvider = undefined;
		this.providerResolved = false;
	}

	/**
	 * Get the name of the currently active provider.
	 */
	async getActiveProviderName(): Promise<string> {
		const provider = await this.resolveProvider();
		return provider.name;
	}

	/**
	 * Map our model shorthand to the full model ID.
	 */
	getModelId(model: ModelId): string {
		return getAnthropicModelId(model);
	}

	/**
	 * Stream a request to the LLM via the active provider.
	 */
	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const provider = await this.resolveProvider();

		for await (const event of provider.streamRequest(options)) {
			if (event.type === 'complete') {
				this.totalInputTokens += event.inputTokens;
				this.totalOutputTokens += event.outputTokens;
				this.totalCachedTokens += event.cachedTokens;
			}
			yield event;
		}
	}

	/**
	 * Non-streaming request. Collects all tokens and returns the full response.
	 */
	async request(options: LlmRequestOptions): Promise<string> {
		let result = '';
		for await (const event of this.streamRequest(options)) {
			if (event.type === 'token') {
				result += event.token;
			} else if (event.type === 'error') {
				throw new Error(event.error);
			}
		}
		return result;
	}

	getTokenUsage(): { input: number; output: number; cached: number } {
		return {
			input: this.totalInputTokens,
			output: this.totalOutputTokens,
			cached: this.totalCachedTokens,
		};
	}

	/**
	 * Estimate cost based on token usage (approximate Claude pricing).
	 */
	estimateCost(): number {
		// Approximate pricing per 1M tokens (blended across models)
		const inputCostPer1M = 3.0;
		const outputCostPer1M = 15.0;
		return (this.totalInputTokens / 1_000_000) * inputCostPer1M +
			(this.totalOutputTokens / 1_000_000) * outputCostPer1M;
	}
}
