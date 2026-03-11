/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export interface McpToolCall {
	server: string;
	tool: string;
	inputs: Record<string, unknown>;
}

export interface McpToolResult {
	content: string;
	isError: boolean;
	latencyMs: number;
}

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

interface McpToolInfo {
	server: string;
	tool: string;
	description: string;
}

/**
 * Client for communicating with the MCP gateway via SSE transport.
 * Connects to the MCP gateway service which exposes 18 tools for
 * code graph queries, vector search, memory, specs, and build DAG.
 */
export class McpClient {
	private sessionId: string | undefined;
	private eventSource: { close: () => void } | undefined;
	private connected = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	private reconnectDelay = 1000;
	private readonly maxReconnectDelay = 30000;
	private nextRequestId = 1;
	private readonly pendingRequests = new Map<number, {
		resolve: (value: unknown) => void;
		reject: (reason: Error) => void;
	}>();
	private cachedTools: McpToolInfo[] | undefined;
	private readonly outputChannel: vscode.OutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Son of Anton: MCP');
	}

	private getGatewayUrl(): string {
		const config = vscode.workspace.getConfiguration('sota');
		return config.get<string>('mcpGatewayUrl') ?? 'http://localhost:3100';
	}

	/**
	 * Establish SSE connection to the MCP gateway.
	 * Non-blocking — logs warnings on failure and schedules reconnection.
	 */
	async connect(): Promise<void> {
		const gatewayUrl = this.getGatewayUrl();

		try {
			// First check if the gateway is reachable
			const healthResponse = await fetch(`${gatewayUrl}/health`, {
				signal: AbortSignal.timeout(3000),
			});

			if (!healthResponse.ok) {
				this.outputChannel.appendLine(`[MCP] Gateway health check failed: ${healthResponse.status}`);
				this.scheduleReconnect();
				return;
			}

			const health = await healthResponse.json();
			this.outputChannel.appendLine(`[MCP] Gateway health: ${JSON.stringify(health)}`);

			// Establish SSE connection
			const sseResponse = await fetch(`${gatewayUrl}/sse`, {
				headers: { 'Accept': 'text/event-stream' },
			});

			if (!sseResponse.ok || !sseResponse.body) {
				this.outputChannel.appendLine(`[MCP] SSE connection failed: ${sseResponse.status}`);
				this.scheduleReconnect();
				return;
			}

			// Parse the SSE stream to extract sessionId from the endpoint event
			const reader = sseResponse.body.getReader();
			const decoder = new TextDecoder();

			// Read and buffer initial SSE data until we find the sessionId.
			// The endpoint event may span multiple chunks due to network fragmentation.
			let initBuffer = '';
			const maxInitReads = 10;
			for (let i = 0; i < maxInitReads; i++) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}
				initBuffer += decoder.decode(value, { stream: true });
				const match = initBuffer.match(/sessionId=([a-zA-Z0-9_-]+)/);
				if (match) {
					this.sessionId = match[1];
					break;
				}
			}

			if (!this.sessionId) {
				this.outputChannel.appendLine('[MCP] Failed to extract sessionId from SSE endpoint');
				reader.cancel();
				this.scheduleReconnect();
				return;
			}

			// Store the reader for cleanup (we keep reading SSE events in the background)
			this.startSSEListener(reader, decoder);

			this.connected = true;
			this.reconnectDelay = 1000; // Reset backoff on successful connect
			this.outputChannel.appendLine(`[MCP] Connected with sessionId: ${this.sessionId}`);

			// Cache available tools
			try {
				this.cachedTools = await this.listTools();
				this.outputChannel.appendLine(`[MCP] Discovered ${this.cachedTools.length} tools`);
			} catch {
				this.outputChannel.appendLine('[MCP] Warning: failed to enumerate tools');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[MCP] Connection failed: ${message}`);
			this.scheduleReconnect();
		}
	}

	/**
	 * Listen for SSE events from the gateway (responses to our JSON-RPC requests).
	 */
	private async startSSEListener(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder): Promise<void> {
		this.eventSource = {
			close: () => {
				reader.cancel();
			}
		};

		try {
			let buffer = '';
			while (true) {
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
					if (!data) {
						continue;
					}

					try {
						const message = JSON.parse(data);
						if (message.id !== undefined && this.pendingRequests.has(message.id)) {
							const pending = this.pendingRequests.get(message.id)!;
							this.pendingRequests.delete(message.id);

							if (message.error) {
								pending.reject(new Error(message.error.message ?? 'JSON-RPC error'));
							} else {
								pending.resolve(message.result);
							}
						}
					} catch {
						// Skip malformed SSE data
					}
				}
			}
		} catch {
			// SSE stream ended
		} finally {
			this.connected = false;
			this.sessionId = undefined;
			this.outputChannel.appendLine('[MCP] SSE connection closed');
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		this.outputChannel.appendLine(`[MCP] Reconnecting in ${this.reconnectDelay}ms...`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
			this.connect();
		}, this.reconnectDelay);
	}

	/**
	 * Send a JSON-RPC request to the MCP gateway via POST.
	 */
	private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
		if (!this.connected || !this.sessionId) {
			throw new Error('MCP gateway not connected');
		}

		const gatewayUrl = this.getGatewayUrl();
		const id = this.nextRequestId++;

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			id,
			method,
			params,
		};

		const responsePromise = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error(`MCP request timed out: ${method}`));
				}
			}, 30000);

			this.pendingRequests.set(id, {
				resolve: (value: unknown) => { clearTimeout(timer); resolve(value); },
				reject: (reason: Error) => { clearTimeout(timer); reject(reason); },
			});
		});

		const response = await fetch(`${gatewayUrl}/messages?sessionId=${this.sessionId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const errorText = await response.text();
			this.pendingRequests.delete(id);
			throw new Error(`MCP POST failed (${response.status}): ${errorText}`);
		}

		return responsePromise;
	}

	/**
	 * Call a tool on the MCP gateway.
	 * Falls back to a structured error if the gateway is unreachable.
	 */
	async callTool(call: McpToolCall): Promise<McpToolResult> {
		const start = Date.now();

		if (!this.connected) {
			return {
				content: JSON.stringify({
					error: 'MCP gateway not connected',
					suggestion: 'Start the Docker Compose stack: docker compose up -d',
					tool: `${call.server}/${call.tool}`,
				}),
				isError: true,
				latencyMs: Date.now() - start,
			};
		}

		try {
			const result = await this.sendRequest('tools/call', {
				name: call.tool,
				arguments: call.inputs,
			}) as { content?: Array<{ text?: string }>; isError?: boolean };

			const content = result.content
				?.map(c => c.text ?? '')
				.join('\n') ?? '';

			return {
				content,
				isError: result.isError ?? false,
				latencyMs: Date.now() - start,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: JSON.stringify({ error: message, tool: `${call.server}/${call.tool}` }),
				isError: true,
				latencyMs: Date.now() - start,
			};
		}
	}

	/**
	 * List available tools from the MCP gateway.
	 */
	async listTools(): Promise<McpToolInfo[]> {
		if (this.cachedTools && this.connected) {
			return this.cachedTools;
		}

		if (!this.connected) {
			return [];
		}

		try {
			const result = await this.sendRequest('tools/list') as {
				tools?: Array<{ name: string; description?: string }>;
			};

			return (result.tools ?? []).map(t => ({
				server: 'mcp-gateway',
				tool: t.name,
				description: t.description ?? '',
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Check if the MCP gateway is currently connected.
	 */
	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Clean up the SSE connection and pending requests.
	 */
	dispose(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = undefined;
		}

		for (const [, pending] of this.pendingRequests) {
			pending.reject(new Error('McpClient disposed'));
		}
		this.pendingRequests.clear();

		this.connected = false;
		this.sessionId = undefined;
		this.outputChannel.dispose();
	}
}
