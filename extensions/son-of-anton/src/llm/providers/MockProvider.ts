/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LlmProvider, LlmRequestOptions, LlmStreamEvent } from '../types';

const SETUP_INSTRUCTIONS = [
	'',
	'---',
	'**Son of Anton is running in mock mode.** To use a real LLM provider, configure one of these:',
	'',
	'1. **GitHub Copilot / Claude Code / Codex** (recommended — uses your existing subscription):',
	'   Install the GitHub Copilot extension and sign in. Son of Anton will auto-detect it.',
	'',
	'2. **Anthropic API key**:',
	'   Set `sota.apiKey` in VS Code settings, or set the `ANTHROPIC_API_KEY` environment variable.',
	'',
	'3. **Model Router service** (multi-provider routing):',
	'   Start the Docker Compose stack: `docker compose up -d`',
	'   The model-router service runs on port 3200.',
	'',
	'Then set `sota.provider` to `auto` (default) or a specific provider name.',
].join('\n');

/**
 * Mock provider that returns demo responses when no real LLM is configured.
 * Always available as a fallback.
 */
export class MockProvider implements LlmProvider {
	readonly name = 'mock';

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const userMessage = options.messages[options.messages.length - 1]?.content ?? '';
		const mockResponse = this.generateMockResponse(userMessage);

		// Simulate streaming by yielding chunks
		const words = mockResponse.split(' ');
		for (const word of words) {
			yield { type: 'token', token: word + ' ' };
		}

		yield {
			type: 'complete',
			fullText: mockResponse,
			inputTokens: 0,
			outputTokens: words.length,
			cachedTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
	}

	private generateMockResponse(userMessage: string): string {
		const preview = userMessage.length > 80
			? userMessage.slice(0, 80) + '...'
			: userMessage;

		return [
			`I received your message: "${preview}"`,
			'',
			'This is a **mock response** from Son of Anton. ',
			'I can see your request but cannot process it with a real LLM right now.',
			SETUP_INSTRUCTIONS,
		].join('\n');
	}
}
