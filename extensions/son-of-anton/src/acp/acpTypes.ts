/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local re-declaration of the ACP type contracts defined in
 * src/vs/sessions/contrib/acp/common/acpTypes.ts.
 *
 * These are kept in sync manually. A `const enum` cannot be imported across
 * package boundaries when bundled with esbuild (isolatedModules), so the
 * transport and status values are represented as plain string literal unions
 * here and inlined at the call sites.
 */

export type AcpTransport = 'stdio' | 'http' | 'websocket';

export type AcpAgentStatus = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'error';

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
	ContextRequest: 'context/request',
} as const;
