/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { LlmClient } from '../llm/LlmClient';
import type { ModelId } from '../llm/types';
import type { McpClient } from '../mcp/McpClient';
import { StreamManager } from './StreamManager';
import { ToolExecutor } from './ToolExecutor';
import type {
	ChatMessage,
	ExtToWebviewMessage,
	WebviewToExtMessage,
} from './ChatProtocol';
import type { AgUiEvent } from '../agui/types';
import { AgUiEventType } from '../agui/types';

/**
 * Central chat service that orchestrates LLM requests, streaming,
 * tool execution, and webview communication.
 *
 * Replaces ChatPanel + AgentChatPanel with a unified service.
 */
export class ChatService {
	private readonly messages: ChatMessage[] = [];
	private readonly streamManager: StreamManager;
	private readonly toolExecutor: ToolExecutor;
	private readonly disposables: vscode.Disposable[] = [];
	private postMessageFn: ((msg: ExtToWebviewMessage) => void) | undefined;
	private defaultModel: ModelId = 'sonnet';

	private readonly _onDidAddMessage = new vscode.EventEmitter<ChatMessage>();
	readonly onDidAddMessage = this._onDidAddMessage.event;

	constructor(
		private readonly llmClient: LlmClient,
		mcpClient: McpClient,
	) {
		this.streamManager = new StreamManager();
		this.toolExecutor = new ToolExecutor(mcpClient);

		// Wire stream events to webview
		this.disposables.push(
			this.streamManager.onDelta(content => {
				const last = this.getLastAssistantMessage();
				if (last) {
					last.content += content;
					this.postMessage({ type: 'streamDelta', threadId: 'main', messageId: last.id, content });
				}
			}),
			this.streamManager.onComplete(info => {
				const last = this.getLastAssistantMessage();
				if (last) {
					last.status = 'complete';
					last.content = info.fullText;
					last.tokens = { inputTokens: info.inputTokens, outputTokens: info.outputTokens, cachedTokens: info.cachedTokens };
					last.elapsedMs = info.elapsedMs;
					this.postMessage({
						type: 'streamEnd',
						threadId: 'main',
						messageId: last.id,
						usage: last.tokens,
						elapsedMs: info.elapsedMs,
					});
				}
				this.trimHistory();
			}),
			this.streamManager.onError(message => {
				const last = this.getLastAssistantMessage();
				if (last) {
					last.status = 'error';
				}
				this.postMessage({ type: 'error', threadId: 'main', message });
			}),
		);

		// Wire tool executor events to webview
		this.disposables.push(
			this.toolExecutor.onToolCallStart(info => {
				this.postMessage({
					type: 'toolCallStart',
					threadId: 'main',
					messageId: this.getLastAssistantMessage()?.id ?? '',
					toolId: info.toolId,
					name: info.name,
					args: info.args,
				});
			}),
			this.toolExecutor.onToolCallResult(info => {
				this.postMessage({
					type: 'toolCallResult',
					threadId: 'main',
					messageId: this.getLastAssistantMessage()?.id ?? '',
					toolId: info.toolId,
					result: info.result ?? '',
					isError: info.isError ?? false,
					latencyMs: info.latencyMs ?? 0,
				});
			}),
		);

		// Read default model from settings
		const config = vscode.workspace.getConfiguration('sota');
		this.defaultModel = config.get<ModelId>('defaultModel') ?? 'sonnet';
	}

	/**
	 * Set the function used to post messages to the webview.
	 */
	setPostMessage(fn: (msg: ExtToWebviewMessage) => void): void {
		this.postMessageFn = fn;
	}

	/**
	 * Handle a message from the webview.
	 */
	async handleWebviewMessage(msg: WebviewToExtMessage): Promise<void> {
		switch (msg.type) {
			case 'sendMessage':
				await this.sendMessage(msg.content, msg.model);
				break;
			case 'cancelStream':
				this.streamManager.cancel();
				break;
			case 'approveToolCall':
				this.toolExecutor.approveToolCall(msg.toolId);
				break;
			case 'denyToolCall':
				this.toolExecutor.denyToolCall(msg.toolId);
				break;
			case 'slashCommand':
				// Slash commands are not yet implemented
				this.postMessage({ type: 'error', threadId: 'main', message: `Unknown command: /${msg.command}` });
				break;
			case 'selectModel':
				this.defaultModel = msg.model;
				break;
			case 'clearSession':
				this.clearSession();
				break;
			case 'ready':
				this.restoreSession();
				break;
		}
	}

	/**
	 * Send a user message and stream the response.
	 */
	async sendMessage(content: string, model?: ModelId): Promise<void> {
		if (this.streamManager.isStreaming) {
			this.postMessage({ type: 'error', threadId: 'main', message: 'A response is already in progress. Cancel it first or wait for it to finish.' });
			return;
		}

		const effectiveModel = model ?? this.defaultModel;

		// Build LLM messages from completed history before mutating this.messages
		const llmMessages = this.messages
			.filter(m => m.status === 'complete' && (m.role === 'user' || m.role === 'assistant'))
			.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
		llmMessages.push({ role: 'user', content });

		// Add user message
		const userMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content,
			timestamp: Date.now(),
			status: 'complete',
		};
		this.messages.push(userMsg);
		this._onDidAddMessage.fire(userMsg);

		// Add placeholder assistant message
		const assistantMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			status: 'streaming',
			model: effectiveModel,
		};
		this.messages.push(assistantMsg);
		this._onDidAddMessage.fire(assistantMsg);

		// Notify webview
		const providerName = await this.llmClient.getActiveProviderName();
		this.postMessage({
			type: 'streamStart',
			threadId: 'main',
			messageId: assistantMsg.id,
			model: `${effectiveModel} (${providerName})`,
		});

		// Start streaming
		const signal = this.streamManager.start();

		try {
			for await (const event of this.llmClient.streamRequest({
				model: effectiveModel,
				messages: llmMessages,
				signal,
				enableCaching: true,
			})) {
				this.streamManager.processEvent(event);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.streamManager.processEvent({ type: 'error', error: message });
		}
	}

	/**
	 * Get all messages in the current session.
	 */
	getMessages(): readonly ChatMessage[] {
		return this.messages;
	}

	private getLastAssistantMessage(): ChatMessage | undefined {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			if (this.messages[i].role === 'assistant') {
				return this.messages[i];
			}
		}
		return undefined;
	}

	private clearSession(): void {
		this.messages.length = 0;
		this.trimHistory();
	}

	private postMessage(msg: ExtToWebviewMessage): void {
		this.postMessageFn?.(msg);
	}

	private trimHistory(): void {
		const config = vscode.workspace.getConfiguration('sota.chat');
		const maxLength = config.get<number>('maxHistoryLength') ?? 100;
		if (this.messages.length > maxLength) {
			this.messages.splice(0, this.messages.length - maxLength);
		}
	}

	private restoreSession(): void {
		if (this.messages.length > 0) {
			this.postMessage({ type: 'sessionRestore', messages: this.messages });
		}
		this.postMessage({
			type: 'configUpdate',
			defaultModel: this.defaultModel,
			provider: 'resolving...',
		});
		// Async provider name resolution
		this.llmClient.getActiveProviderName().then(name => {
			this.postMessage({
				type: 'configUpdate',
				defaultModel: this.defaultModel,
				provider: name,
			});
		});
	}

	/**
	 * Bridge AG-UI events into the chat protocol so agent runs appear
	 * in the unified chat panel.
	 */
	injectAgUiEvent(event: AgUiEvent): void {
		switch (event.type) {
			case AgUiEventType.TextMessageStart: {
				const msgId = event.messageId;
				const assistantMsg: ChatMessage = {
					id: msgId,
					role: 'assistant',
					content: '',
					timestamp: Date.now(),
					status: 'streaming',
					agentName: 'Anton',
				};
				this.messages.push(assistantMsg);
				this._onDidAddMessage.fire(assistantMsg);
				this.postMessage({
					type: 'streamStart',
					threadId: 'main',
					messageId: msgId,
					model: 'agent',
					agentName: 'Anton',
				});
				break;
			}
			case AgUiEventType.TextMessageContent: {
				const msg = this.messages.find(m => m.id === event.messageId);
				if (msg) {
					msg.content += event.delta;
				}
				this.postMessage({
					type: 'streamDelta',
					threadId: 'main',
					messageId: event.messageId,
					content: event.delta,
				});
				break;
			}
			case AgUiEventType.TextMessageEnd: {
				const msg = this.messages.find(m => m.id === event.messageId);
				if (msg) {
					msg.status = 'complete';
				}
				this.postMessage({
					type: 'streamEnd',
					threadId: 'main',
					messageId: event.messageId,
					usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
					elapsedMs: 0,
				});
				break;
			}
			case AgUiEventType.ToolCallStart: {
				this.postMessage({
					type: 'toolCallStart',
					threadId: 'main',
					messageId: event.parentMessageId ?? '',
					toolId: event.toolCallId,
					name: event.toolCallName,
					args: '',
				});
				break;
			}
			case AgUiEventType.ToolCallResult: {
				this.postMessage({
					type: 'toolCallResult',
					threadId: 'main',
					messageId: '',
					toolId: event.toolCallId,
					result: event.content,
					isError: event.isError ?? false,
					latencyMs: 0,
				});
				break;
			}
			case AgUiEventType.RunError: {
				this.postMessage({
					type: 'error',
					threadId: 'main',
					message: event.message,
				});
				break;
			}
			case AgUiEventType.RunFinished: {
				// Update the last assistant message with token counts
				const last = this.getLastAssistantMessage();
				if (last) {
					last.tokens = {
						inputTokens: event.inputTokens,
						outputTokens: event.outputTokens,
						cachedTokens: 0,
					};
					last.elapsedMs = event.elapsedMs;
				}
				break;
			}
		}
	}

	dispose(): void {
		this.streamManager.dispose();
		this.toolExecutor.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this._onDidAddMessage.dispose();
	}
}
