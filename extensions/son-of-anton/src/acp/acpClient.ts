/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';
import type { IAcpAgentManifest, IAcpRequest, IAcpResponse, IAcpNotification } from './acpTypes';

// AcpTransport string values — typed as literals matching the AcpTransport union
const TRANSPORT_STDIO = 'stdio' as const;
const TRANSPORT_HTTP = 'http' as const;

/**
 * Payload emitted on the onDidReceiveNotification event.
 */
export interface IAcpNotificationEvent {
	readonly connectionId: string;
	readonly method: string;
	readonly params: unknown;
}

/**
 * Internal state tracked per active connection.
 */
interface IConnection {
	readonly connectionId: string;
	readonly manifest: IAcpAgentManifest;
	/** Stdio transport only — the spawned child process. */
	process: ChildProcess | undefined;
	/** Pending JSON-RPC requests awaiting a response. */
	readonly pending: Map<string | number, {
		resolve: (value: unknown) => void;
		reject: (reason: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}>;
	/** Partial line buffer for stdio framing. */
	stdioBuffer: string;
	/** Whether the headers have been fully parsed for the current message. */
	stdioContentLength: number;
	/** Raw bytes accumulated for the current message body. */
	stdioBody: string;
}

/**
 * JSON-RPC 2.0 client for the Agent Client Protocol (ACP).
 *
 * Supports two transports:
 *  - stdio: spawns the agent process and frames messages with LSP-style
 *    Content-Length headers.
 *  - http: sends JSON-RPC requests via HTTP POST to the agent's endpoint.
 */
export class AcpClient {
	private readonly connections = new Map<string, IConnection>();
	private nextRequestId = 1;
	private nextConnectionId = 1;

	private readonly outputChannel: vscode.OutputChannel;

	private readonly _onDidReceiveNotification = new vscode.EventEmitter<IAcpNotificationEvent>();
	/** Fires whenever an unsolicited JSON-RPC notification arrives from any connection. */
	readonly onDidReceiveNotification: vscode.Event<IAcpNotificationEvent> = this._onDidReceiveNotification.event;

	private readonly _onDidDisconnect = new vscode.EventEmitter<string>();
	/** Fires with the connectionId when a connection is closed or drops. */
	readonly onDidDisconnect: vscode.Event<string> = this._onDidDisconnect.event;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Son of Anton: ACP');
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Connect to an external agent using the transport specified in its manifest.
	 *
	 * For stdio transport, the manifest endpoint is treated as the executable
	 * path (optionally with space-separated arguments).
	 *
	 * For HTTP transport, the manifest endpoint is the base URL to POST
	 * JSON-RPC requests to.
	 *
	 * Returns a connectionId that identifies this connection for all subsequent
	 * calls.
	 */
	async connect(manifest: IAcpAgentManifest): Promise<string> {
		const connectionId = `acp-conn-${this.nextConnectionId++}`;
		const connection: IConnection = {
			connectionId,
			manifest,
			process: undefined,
			pending: new Map(),
			stdioBuffer: '',
			stdioContentLength: -1,
			stdioBody: '',
		};

		this.connections.set(connectionId, connection);
		this.outputChannel.appendLine(`[ACP] Connecting to agent "${manifest.name}" (${manifest.transport}) — ${connectionId}`);

		if (manifest.transport === TRANSPORT_STDIO) {
			await this.connectStdio(connection);
		} else if (manifest.transport === TRANSPORT_HTTP) {
			// HTTP is stateless — no persistent connection to establish.
			// We verify the agent is reachable by sending an initialize request.
			await this.initializeAgent(connection);
		} else {
			this.connections.delete(connectionId);
			throw new Error(`Unsupported ACP transport: ${manifest.transport}`);
		}

		this.outputChannel.appendLine(`[ACP] Connected: ${connectionId}`);
		return connectionId;
	}

	/**
	 * Disconnect from the agent and clean up all resources for this connection.
	 * Sends a shutdown notification before closing the transport.
	 */
	async disconnect(connectionId: string): Promise<void> {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			return;
		}

		// Best-effort shutdown notification
		try {
			this.sendNotification(connectionId, 'shutdown', undefined);
		} catch {
			// Ignore errors during shutdown notification
		}

		this.cleanupConnection(connection, 'disconnect requested');
	}

	/**
	 * Send a JSON-RPC 2.0 request and await the response.
	 *
	 * Rejects if:
	 *  - The connection does not exist.
	 *  - The server returns a JSON-RPC error.
	 *  - No response arrives within 30 seconds.
	 */
	async sendRequest(connectionId: string, method: string, params?: unknown): Promise<unknown> {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			throw new Error(`ACP connection not found: ${connectionId}`);
		}

		const id = this.nextRequestId++;
		const request: IAcpRequest = {
			jsonrpc: '2.0',
			id,
			method,
			params: params as Record<string, unknown> | undefined,
		};

		const responsePromise = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (connection.pending.has(id)) {
					connection.pending.delete(id);
					reject(new Error(`ACP request timed out: ${method} (id=${id})`));
				}
			}, 30_000);

			connection.pending.set(id, { resolve, reject, timer });
		});

		await this.writeMessage(connection, request);
		return responsePromise;
	}

	/**
	 * Send a JSON-RPC 2.0 notification (no response expected).
	 */
	sendNotification(connectionId: string, method: string, params?: unknown): void {
		const connection = this.connections.get(connectionId);
		if (!connection) {
			this.outputChannel.appendLine(`[ACP] Cannot send notification — connection not found: ${connectionId}`);
			return;
		}

		const notification: IAcpNotification = {
			jsonrpc: '2.0',
			method,
			params: params as Record<string, unknown> | undefined,
		};

		this.writeMessage(connection, notification).catch(err => {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP] Failed to send notification "${method}": ${message}`);
		});
	}

	/**
	 * Release all connections and dispose the output channel.
	 */
	dispose(): void {
		for (const connection of this.connections.values()) {
			this.cleanupConnection(connection, 'AcpClient disposed');
		}
		this._onDidReceiveNotification.dispose();
		this._onDidDisconnect.dispose();
		this.outputChannel.dispose();
	}

	// ---------------------------------------------------------------------------
	// Stdio transport
	// ---------------------------------------------------------------------------

	/**
	 * Spawn the agent process and wire up stdin/stdout framing.
	 */
	private async connectStdio(connection: IConnection): Promise<void> {
		// The endpoint for stdio manifests is the command (path + optional args)
		const parts = connection.manifest.endpoint.trim().split(/\s+/);
		const command = parts[0];
		const args = parts.slice(1);

		const child = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: false,
		});

		connection.process = child;

		child.stdout?.on('data', (chunk: Buffer) => {
			this.handleStdioData(connection, chunk.toString('utf8'));
		});

		child.stderr?.on('data', (chunk: Buffer) => {
			this.outputChannel.appendLine(`[ACP][${connection.connectionId}][stderr] ${chunk.toString('utf8').trim()}`);
		});

		child.on('exit', (code, signal) => {
			this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Process exited (code=${code}, signal=${signal})`);
			this.cleanupConnection(connection, `process exited: code=${code}`);
		});

		child.on('error', (err) => {
			this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Spawn error: ${err.message}`);
			this.cleanupConnection(connection, `spawn error: ${err.message}`);
		});

		// Wait briefly to confirm the process did not immediately die
		await new Promise<void>((resolve, reject) => {
			const startTimeout = setTimeout(() => resolve(), 500);
			child.on('exit', (code) => {
				clearTimeout(startTimeout);
				reject(new Error(`Agent process exited immediately with code ${code}`));
			});
			child.on('error', (err) => {
				clearTimeout(startTimeout);
				reject(err);
			});
		});

		await this.initializeAgent(connection);
	}

	/**
	 * Parse LSP-style Content-Length framed messages from a stdio stream.
	 *
	 * The framing format is:
	 *   Content-Length: <n>\r\n
	 *   \r\n
	 *   <n bytes of UTF-8 JSON>
	 */
	private handleStdioData(connection: IConnection, chunk: string): void {
		connection.stdioBuffer += chunk;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (connection.stdioContentLength === -1) {
				// Try to parse the header block
				const headerEnd = connection.stdioBuffer.indexOf('\r\n\r\n');
				if (headerEnd === -1) {
					break; // Need more data
				}

				const headerBlock = connection.stdioBuffer.slice(0, headerEnd);
				connection.stdioBuffer = connection.stdioBuffer.slice(headerEnd + 4);

				const lengthMatch = headerBlock.match(/Content-Length:\s*(\d+)/i);
				if (!lengthMatch) {
					this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Malformed header block — no Content-Length`);
					connection.stdioContentLength = -1;
					continue;
				}

				connection.stdioContentLength = parseInt(lengthMatch[1], 10);
				connection.stdioBody = '';
			}

			// Accumulate body bytes
			const needed = connection.stdioContentLength - connection.stdioBody.length;
			if (connection.stdioBuffer.length < needed) {
				connection.stdioBody += connection.stdioBuffer;
				connection.stdioBuffer = '';
				break; // Need more data
			}

			connection.stdioBody += connection.stdioBuffer.slice(0, needed);
			connection.stdioBuffer = connection.stdioBuffer.slice(needed);

			const rawBody = connection.stdioBody;
			connection.stdioContentLength = -1;
			connection.stdioBody = '';

			try {
				const message = JSON.parse(rawBody);
				this.handleIncomingMessage(connection, message);
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Failed to parse message: ${detail}`);
			}
		}
	}

	/**
	 * Write a JSON-RPC message to the appropriate transport for the connection.
	 */
	private async writeMessage(connection: IConnection, message: IAcpRequest | IAcpNotification): Promise<void> {
		if (connection.manifest.transport === TRANSPORT_STDIO) {
			await this.writeStdioMessage(connection, message);
		} else {
			await this.writeHttpMessage(connection, message);
		}
	}

	/**
	 * Frame and send a message over the stdio pipe.
	 */
	private async writeStdioMessage(connection: IConnection, message: IAcpRequest | IAcpNotification): Promise<void> {
		if (!connection.process?.stdin) {
			throw new Error(`No stdin available for connection ${connection.connectionId}`);
		}

		const body = JSON.stringify(message);
		const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
		const frame = header + body;

		await new Promise<void>((resolve, reject) => {
			connection.process!.stdin!.write(frame, 'utf8', (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	// ---------------------------------------------------------------------------
	// HTTP transport
	// ---------------------------------------------------------------------------

	/**
	 * POST a JSON-RPC message to the agent's HTTP endpoint.
	 * For notifications the response body is ignored.
	 * For requests the response is parsed and dispatched via handleIncomingMessage.
	 */
	private async writeHttpMessage(connection: IConnection, message: IAcpRequest | IAcpNotification): Promise<void> {
		const body = JSON.stringify(message);
		const url = new URL(connection.manifest.endpoint);

		const raw = await new Promise<string>((resolve, reject) => {
			const options: http.RequestOptions = {
				hostname: url.hostname,
				port: url.port || 80,
				path: url.pathname + (url.search ?? ''),
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body, 'utf8'),
				},
			};

			const req = http.request(options, (res) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
				res.on('error', reject);
			});

			req.on('error', reject);
			req.write(body);
			req.end();
		});

		// Notifications have no id — there is no response to dispatch
		if (!('id' in message)) {
			return;
		}

		if (!raw.trim()) {
			return;
		}

		try {
			const parsed = JSON.parse(raw);
			this.handleIncomingMessage(connection, parsed);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Failed to parse HTTP response: ${detail}`);
		}
	}

	// ---------------------------------------------------------------------------
	// Message dispatch
	// ---------------------------------------------------------------------------

	/**
	 * Route an incoming JSON-RPC message to the appropriate handler.
	 *
	 * - If the message has an id and matches a pending request, it resolves
	 *   or rejects the request promise.
	 * - If the message has no id it is treated as a notification and fires
	 *   the onDidReceiveNotification event.
	 */
	private handleIncomingMessage(connection: IConnection, message: IAcpResponse | IAcpNotification): void {
		if ('id' in message && message.id !== undefined) {
			// Response to a pending request
			const response = message as IAcpResponse;
			const pending = connection.pending.get(response.id);
			if (!pending) {
				this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Received response for unknown id: ${response.id}`);
				return;
			}

			clearTimeout(pending.timer);
			connection.pending.delete(response.id);

			if (response.error) {
				pending.reject(new Error(`ACP error ${response.error.code}: ${response.error.message}`));
			} else {
				pending.resolve(response.result);
			}
		} else {
			// Unsolicited notification
			const notification = message as IAcpNotification;
			this._onDidReceiveNotification.fire({
				connectionId: connection.connectionId,
				method: notification.method,
				params: notification.params,
			});
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/**
	 * Send the ACP initialize request to exchange capabilities.
	 * This is mandatory before sending any other request.
	 */
	private async initializeAgent(connection: IConnection): Promise<void> {
		try {
			await this.sendRequest(connection.connectionId, 'initialize', {
				clientName: 'Son of Anton',
				clientVersion: '0.1.0',
				protocolVersion: '0.1',
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Initialize failed: ${message}`);
			throw err;
		}
	}

	/**
	 * Reject all pending requests, kill the child process if any, remove the
	 * connection from the registry, and fire onDidDisconnect.
	 */
	private cleanupConnection(connection: IConnection, reason: string): void {
		if (!this.connections.has(connection.connectionId)) {
			return; // Already cleaned up
		}

		this.outputChannel.appendLine(`[ACP][${connection.connectionId}] Cleaning up: ${reason}`);

		for (const [, pending] of connection.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(`ACP connection closed: ${reason}`));
		}
		connection.pending.clear();

		if (connection.process) {
			try {
				connection.process.stdin?.destroy();
				connection.process.kill('SIGTERM');
			} catch {
				// Process may already be dead
			}
			connection.process = undefined;
		}

		this.connections.delete(connection.connectionId);
		this._onDidDisconnect.fire(connection.connectionId);
	}
}
