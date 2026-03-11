/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmProvider, LlmRequestOptions, LlmStreamEvent, ModelId } from '../types';

/**
 * Provider that calls the GitHub Copilot Chat API directly using the
 * user's GitHub authentication session from VS Code.
 *
 * Flow:
 * 1. Get GitHub OAuth token via `vscode.authentication.getSession('github', ...)`
 * 2. Exchange for a short-lived Copilot token at GitHub's internal endpoint
 * 3. Call the OpenAI-compatible chat completions endpoint at api.githubcopilot.com
 *
 * Requires a GitHub Copilot subscription.
 */
export class GitHubCopilotProvider implements LlmProvider {
	readonly name = 'github-copilot';

	private copilotToken: string | undefined;
	private tokenExpiresAt = 0;

	async isAvailable(): Promise<boolean> {
		try {
			// Check if the user has a GitHub session — don't prompt for login during availability check
			const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: false });
			if (!session) {
				return false;
			}
			// Try to get a Copilot token to verify the subscription is active
			const token = await this.getCopilotToken(session.accessToken);
			return !!token;
		} catch {
			return false;
		}
	}

	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		try {
			// Get GitHub session — prompt for login if needed during actual request
			const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
			if (!session) {
				yield { type: 'error', error: 'GitHub authentication required for Copilot. Sign in to GitHub in VS Code.' };
				return;
			}

			const token = await this.getCopilotToken(session.accessToken);
			if (!token) {
				yield { type: 'error', error: 'Could not obtain Copilot token. Ensure you have an active GitHub Copilot subscription.' };
				return;
			}

			const model = this.mapModel(options.model);
			const messages = this.buildMessages(options);

			const response = await fetch('https://api.githubcopilot.com/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`,
					'Editor-Version': 'vscode/1.96.0',
					'Editor-Plugin-Version': 'son-of-anton/0.1.0',
					'Openai-Intent': 'conversation-panel',
				},
				body: JSON.stringify({
					model,
					messages,
					stream: true,
					max_tokens: options.maxTokens ?? 4096,
					temperature: 0.1,
				}),
				signal: options.signal,
			});

			if (response.status === 401 || response.status === 403) {
				this.copilotToken = undefined;
				this.tokenExpiresAt = 0;
				yield { type: 'error', error: `Copilot API auth error (${response.status}). Your GitHub Copilot subscription may not be active.` };
				return;
			}

			if (!response.ok) {
				const errorText = await response.text();
				yield { type: 'error', error: `Copilot API error ${response.status}: ${errorText}` };
				return;
			}

			yield* this.processStream(response, options.signal);
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled' };
			} else {
				const message = err instanceof Error ? err.message : String(err);
				yield { type: 'error', error: `GitHub Copilot provider error: ${message}` };
			}
		}
	}

	private async getCopilotToken(githubToken: string): Promise<string | undefined> {
		// Return cached token if still valid (with 60s margin)
		if (this.copilotToken && Date.now() < this.tokenExpiresAt - 60_000) {
			return this.copilotToken;
		}

		try {
			const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
				headers: {
					'Authorization': `token ${githubToken}`,
					'Accept': 'application/json',
				},
				signal: AbortSignal.timeout(5000),
			});

			if (!response.ok) {
				console.log(`[SoA] Copilot token exchange failed: ${response.status}`);
				return undefined;
			}

			const data = await response.json() as { token?: string; expires_at?: number };
			if (!data.token) {
				return undefined;
			}

			this.copilotToken = data.token;
			this.tokenExpiresAt = (data.expires_at ?? 0) * 1000; // Convert to ms
			console.log(`[SoA] Copilot token obtained, expires at ${new Date(this.tokenExpiresAt).toISOString()}`);
			return this.copilotToken;
		} catch (err) {
			console.log(`[SoA] Copilot token exchange error: ${err}`);
			return undefined;
		}
	}

	private async *processStream(response: Response, signal?: AbortSignal): AsyncGenerator<LlmStreamEvent> {
		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: 'error', error: 'No response body from Copilot' };
			return;
		}

		const decoder = new TextDecoder();
		let fullText = '';
		let buffer = '';
		let inputTokens = 0;
		let outputTokens = 0;

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

						// OpenAI-compatible streaming format
						const delta = event.choices?.[0]?.delta;
						if (delta?.content) {
							fullText += delta.content;
							yield { type: 'token', token: delta.content };
						}

						// Token usage (in the final chunk)
						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines
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
			cachedTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
	}

	private mapModel(model: ModelId): string {
		switch (model) {
			case 'opus': return 'claude-3.5-sonnet'; // Best available via Copilot
			case 'haiku': return 'gpt-4o-mini';
			case 'sonnet':
			default: return 'gpt-4o';
		}
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
