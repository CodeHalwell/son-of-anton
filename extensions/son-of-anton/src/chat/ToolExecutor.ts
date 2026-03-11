/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { McpClient, McpToolCall, McpToolResult } from '../mcp/McpClient';
import type { ToolCallInfo, ToolApprovalPolicy } from './ChatProtocol';

/**
 * Executes tool calls from LLM responses, managing approval state
 * and routing to MCP gateway.
 *
 * Default: auto-approve all tools. Users can configure per-tool
 * policies via `sota.toolApproval` setting.
 */
export class ToolExecutor {
	private readonly pendingApprovals = new Map<string, {
		resolve: (approved: boolean) => void;
		call: McpToolCall;
	}>();

	private readonly _onToolCallStart = new vscode.EventEmitter<ToolCallInfo>();
	readonly onToolCallStart = this._onToolCallStart.event;

	private readonly _onToolCallResult = new vscode.EventEmitter<ToolCallInfo>();
	readonly onToolCallResult = this._onToolCallResult.event;

	constructor(private readonly mcpClient: McpClient) {}

	/**
	 * Execute a tool call, respecting the approval policy.
	 */
	async executeTool(call: McpToolCall): Promise<McpToolResult> {
		const toolId = crypto.randomUUID();
		const policy = this.getApprovalPolicy(call.tool);

		const info: ToolCallInfo = {
			toolId,
			name: call.tool,
			args: JSON.stringify(call.inputs),
			status: 'pending',
		};

		if (policy === 'deny') {
			info.status = 'denied';
			info.result = 'Tool denied by policy';
			info.isError = true;
			this._onToolCallStart.fire(info);
			this._onToolCallResult.fire(info);
			return { content: 'Tool denied by policy', isError: true, latencyMs: 0 };
		}

		if (policy === 'manual') {
			this._onToolCallStart.fire(info);
			const approved = await this.waitForApproval(toolId, call);
			if (!approved) {
				info.status = 'denied';
				info.result = 'Tool denied by user';
				info.isError = true;
				this._onToolCallResult.fire(info);
				return { content: 'Tool denied by user', isError: true, latencyMs: 0 };
			}
		}

		// Auto-approve or user approved — execute
		info.status = 'running';
		this._onToolCallStart.fire(info);

		const start = Date.now();
		const result = await this.mcpClient.callTool(call);

		info.status = result.isError ? 'error' : 'completed';
		info.result = result.content;
		info.isError = result.isError;
		info.latencyMs = Date.now() - start;
		this._onToolCallResult.fire(info);

		return result;
	}

	/**
	 * Approve a pending tool call (called from webview via IPC).
	 */
	approveToolCall(toolId: string): void {
		const pending = this.pendingApprovals.get(toolId);
		if (pending) {
			this.pendingApprovals.delete(toolId);
			pending.resolve(true);
		}
	}

	/**
	 * Deny a pending tool call (called from webview via IPC).
	 */
	denyToolCall(toolId: string): void {
		const pending = this.pendingApprovals.get(toolId);
		if (pending) {
			this.pendingApprovals.delete(toolId);
			pending.resolve(false);
		}
	}

	private getApprovalPolicy(toolName: string): ToolApprovalPolicy {
		const config = vscode.workspace.getConfiguration('sota');
		const policies = config.get<Record<string, ToolApprovalPolicy>>('toolApproval') ?? {};
		return policies[toolName] ?? 'auto';
	}

	private waitForApproval(toolId: string, call: McpToolCall): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			this.pendingApprovals.set(toolId, { resolve, call });

			// Auto-deny after 60 seconds if no response
			setTimeout(() => {
				if (this.pendingApprovals.has(toolId)) {
					this.pendingApprovals.delete(toolId);
					resolve(false);
				}
			}, 60_000);
		});
	}

	dispose(): void {
		// Deny all pending approvals
		for (const [, pending] of this.pendingApprovals) {
			pending.resolve(false);
		}
		this.pendingApprovals.clear();
		this._onToolCallStart.dispose();
		this._onToolCallResult.dispose();
	}
}
