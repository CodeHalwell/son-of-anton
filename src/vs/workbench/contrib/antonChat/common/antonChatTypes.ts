/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum ChatMessageRole {
	User = 'user',
	Assistant = 'assistant',
	System = 'system',
}

export const enum ChatMessageStatus {
	Pending = 'pending',
	Streaming = 'streaming',
	Complete = 'complete',
	Error = 'error',
}

export interface IChatMessage {
	readonly id: string;
	readonly role: ChatMessageRole;
	readonly content: string;
	readonly timestamp: number;
	readonly status: ChatMessageStatus;
	readonly agentId?: string;
	readonly modelUsed?: string;
	readonly tokensIn?: number;
	readonly tokensOut?: number;
	readonly costUsd?: number;
	readonly elapsedMs?: number;
}

export interface IChatSession {
	readonly id: string;
	readonly messages: readonly IChatMessage[];
	readonly createdAt: number;
	readonly title?: string;
}

export const SLASH_COMMANDS: readonly { readonly command: string; readonly description: string }[] = [
	{ command: '/plan', description: 'Decompose a request into subtasks with dependency ordering' },
	{ command: '/approve', description: 'Execute the most recently presented plan' },
	{ command: '/status', description: 'Show status of running agents and active tasks' },
	{ command: '/metrics', description: 'Display session cost, tokens, and performance' },
	{ command: '/checkpoint', description: 'Create a manual workspace checkpoint' },
	{ command: '/rollback', description: 'Restore workspace to a previous checkpoint' },
	{ command: '/spec', description: 'Start the spec-driven development pipeline' },
	{ command: '/review', description: 'Run the review agent on recent changes' },
	{ command: '/test', description: 'Generate and run tests for specified code' },
	{ command: '/security', description: 'Run security scan on the workspace' },
];
