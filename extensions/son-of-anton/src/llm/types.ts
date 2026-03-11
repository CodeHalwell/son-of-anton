/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ModelId = 'opus' | 'sonnet' | 'haiku';

export type ProviderType = 'auto' | 'copilot' | 'github-copilot' | 'openai' | 'claude-cli' | 'gemini-cli' | 'codex-cli' | 'ollama' | 'model-router' | 'anthropic' | 'mock';

export interface LlmMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface LlmRequestOptions {
	model: ModelId;
	messages: LlmMessage[];
	maxTokens?: number;
	systemPrompt?: string;
	signal?: AbortSignal;
	/** Enable prompt caching for the system prompt. */
	enableCaching?: boolean;
	/** Agent handle for cache metrics tracking. */
	agentHandle?: string;
}

export interface LlmStreamToken {
	type: 'token';
	token: string;
}

export interface LlmStreamComplete {
	type: 'complete';
	fullText: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
}

export interface LlmStreamError {
	type: 'error';
	error: string;
}

export type LlmStreamEvent = LlmStreamToken | LlmStreamComplete | LlmStreamError;

/**
 * Interface that all LLM providers must implement.
 */
export interface LlmProvider {
	/** Human-readable provider name. */
	readonly name: string;
	/** Check whether this provider is currently available (has credentials, service reachable, etc.). */
	isAvailable(): Promise<boolean>;
	/** Stream a request and yield token-by-token events. */
	streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent>;
}

/**
 * Map ModelId shorthands to full Anthropic model identifiers.
 */
export function getAnthropicModelId(model: ModelId): string {
	switch (model) {
		case 'opus': return 'claude-opus-4-6';
		case 'sonnet': return 'claude-sonnet-4-6';
		case 'haiku': return 'claude-haiku-4-5-20251001';
	}
}
