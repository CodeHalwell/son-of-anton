/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local mirror of the chat protocol types for the webview.
 *
 * The webview cannot import from the extension host source tree at compile time
 * (outside rootDir). Keep in sync with src/chat/ChatProtocol.ts and src/llm/types.ts.
 */

// From src/llm/types.ts
export type ModelId = 'opus' | 'sonnet' | 'haiku';

// From src/chat/ChatProtocol.ts
export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ChatMessage {
	id: string;
	role: ChatMessageRole;
	content: string;
	timestamp: number;
	status: ChatMessageStatus;
	model?: string;
	agentName?: string;
	tokens?: TokenUsage;
	costUsd?: number;
	elapsedMs?: number;
	toolCalls?: ToolCallInfo[];
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'denied';

export interface ToolCallInfo {
	toolId: string;
	name: string;
	args: string;
	status: ToolCallStatus;
	result?: string;
	isError?: boolean;
	latencyMs?: number;
}

export type ToolApprovalPolicy = 'auto' | 'manual' | 'deny';

// Extension -> Webview Messages
export type ExtToWebviewMessage =
	| { type: 'streamStart'; threadId: string; messageId: string; model: string; agentName?: string }
	| { type: 'streamDelta'; threadId: string; messageId: string; content: string }
	| { type: 'streamEnd'; threadId: string; messageId: string; usage: TokenUsage; elapsedMs: number }
	| { type: 'toolCallStart'; threadId: string; messageId: string; toolId: string; name: string; args: string }
	| { type: 'toolCallResult'; threadId: string; messageId: string; toolId: string; result: string; isError: boolean; latencyMs: number }
	| { type: 'reasoningStart'; threadId: string; messageId: string }
	| { type: 'reasoningDelta'; threadId: string; messageId: string; content: string }
	| { type: 'reasoningEnd'; threadId: string; messageId: string }
	| { type: 'error'; threadId: string; messageId?: string; message: string }
	| { type: 'sessionRestore'; messages: ChatMessage[] }
	| { type: 'configUpdate'; defaultModel: ModelId; provider: string };

// Webview -> Extension Messages
export type WebviewToExtMessage =
	| { type: 'sendMessage'; content: string; model?: ModelId }
	| { type: 'cancelStream' }
	| { type: 'approveToolCall'; toolId: string }
	| { type: 'denyToolCall'; toolId: string }
	| { type: 'slashCommand'; command: string; args: string }
	| { type: 'selectModel'; model: ModelId }
	| { type: 'clearSession' }
	| { type: 'ready' };
