/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the Agent Client Protocol (ACP) integration.
 *
 * ACP is a JSON-RPC 2.0 standard for multi-agent IDE interoperability,
 * allowing Son of Anton to communicate with external agents like
 * Gemini CLI, Codex CLI, and other ACP-compatible tools.
 */

export const enum AcpTransport {
	Stdio = 'stdio',
	Http = 'http',
	WebSocket = 'websocket'
}

export const enum AcpAgentStatus {
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
	Busy = 'busy',
	Error = 'error'
}

export interface IAcpAgentCapability {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown> | undefined;
	readonly outputSchema: Record<string, unknown> | undefined;
}

export interface IAcpAgentManifest {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly transport: AcpTransport;
	readonly endpoint: string;
	readonly capabilities: IAcpAgentCapability[];
	readonly supportedLanguages: string[];
	readonly maxConcurrentTasks: number;
}

export interface IAcpRegisteredAgent {
	readonly manifest: IAcpAgentManifest;
	status: AcpAgentStatus;
	readonly connectedAt: number | undefined;
	readonly lastActivityAt: number | undefined;
	readonly activeTasks: number;
}

export interface IAcpRequest {
	readonly jsonrpc: '2.0';
	readonly id: string | number;
	readonly method: string;
	readonly params: Record<string, unknown> | undefined;
}

export interface IAcpResponse {
	readonly jsonrpc: '2.0';
	readonly id: string | number;
	readonly result: unknown | undefined;
	readonly error: IAcpError | undefined;
}

export interface IAcpError {
	readonly code: number;
	readonly message: string;
	readonly data: unknown | undefined;
}

export interface IAcpNotification {
	readonly jsonrpc: '2.0';
	readonly method: string;
	readonly params: Record<string, unknown> | undefined;
}

/**
 * Standard ACP method names.
 */
export const AcpMethods = {
	Initialize: 'initialize',
	Shutdown: 'shutdown',
	TaskCreate: 'task/create',
	TaskCancel: 'task/cancel',
	TaskStatus: 'task/status',
	TaskResult: 'task/result',
	AgentCapabilities: 'agent/capabilities',
	AgentHeartbeat: 'agent/heartbeat',
	ContextProvide: 'context/provide',
	ContextRequest: 'context/request'
} as const;
