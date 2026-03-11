/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	AcpAgentStatus,
	AcpMethods,
	AcpTransport,
	IAcpAgentManifest,
	IAcpRegisteredAgent,
	IAcpRequest,
	IAcpResponse,
} from '../common/acpTypes.js';

// --- Service Interface --------------------------------------------------------

export const IAcpClientService = createDecorator<IAcpClientService>('soaAcpClientService');

export interface IAcpClientService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeAgentStatus: Event<IAcpRegisteredAgent>;
	readonly onDidRegisterAgent: Event<IAcpRegisteredAgent>;
	readonly onDidUnregisterAgent: Event<string>;

	// Agent registry
	registerAgent(manifest: IAcpAgentManifest): Promise<IAcpRegisteredAgent>;
	unregisterAgent(agentId: string): void;
	getAgent(agentId: string): IAcpRegisteredAgent | undefined;
	listAgents(): IAcpRegisteredAgent[];

	// Communication
	sendRequest(agentId: string, method: string, params?: Record<string, unknown>): Promise<IAcpResponse>;
	sendNotification(agentId: string, method: string, params?: Record<string, unknown>): void;

	// Discovery
	discoverAgents(workspacePath: string): Promise<IAcpAgentManifest[]>;
}

// --- Implementation -----------------------------------------------------------

export class AcpClientService extends Disposable implements IAcpClientService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAgentStatus = this._store.add(new Emitter<IAcpRegisteredAgent>());
	readonly onDidChangeAgentStatus = this._onDidChangeAgentStatus.event;

	private readonly _onDidRegisterAgent = this._store.add(new Emitter<IAcpRegisteredAgent>());
	readonly onDidRegisterAgent = this._onDidRegisterAgent.event;

	private readonly _onDidUnregisterAgent = this._store.add(new Emitter<string>());
	readonly onDidUnregisterAgent = this._onDidUnregisterAgent.event;

	/** agentId -> registered agent */
	private readonly _agents = new Map<string, IAcpRegisteredAgent>();

	/** Monotonically increasing counter for JSON-RPC request IDs. */
	private _nextRequestId = 1;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	async registerAgent(manifest: IAcpAgentManifest): Promise<IAcpRegisteredAgent> {
		if (this._agents.has(manifest.id)) {
			this._logService.warn(`[AcpClient] Agent already registered: ${manifest.id}`);
			this.unregisterAgent(manifest.id);
		}

		const agent: IAcpRegisteredAgent = {
			manifest,
			status: AcpAgentStatus.Connecting,
			connectedAt: undefined,
			lastActivityAt: undefined,
			activeTasks: 0,
		};

		this._agents.set(manifest.id, agent);
		this._onDidRegisterAgent.fire(agent);
		this._logService.info(`[AcpClient] Registered agent: ${manifest.name} (${manifest.id})`);

		// Send initialize request and transition to Connected
		try {
			await this.sendRequest(manifest.id, AcpMethods.Initialize, {
				clientName: 'Son of Anton',
				clientVersion: '1.0.0',
			});

			this._setAgentStatus(manifest.id, AcpAgentStatus.Connected);
		} catch (err) {
			this._logService.error(`[AcpClient] Failed to initialize agent: ${manifest.id}`, err);
			this._setAgentStatus(manifest.id, AcpAgentStatus.Error);
		}

		return this._agents.get(manifest.id)!;
	}

	unregisterAgent(agentId: string): void {
		const agent = this._agents.get(agentId);
		if (!agent) {
			this._logService.warn(`[AcpClient] Cannot unregister unknown agent: ${agentId}`);
			return;
		}

		// Best-effort shutdown notification
		if (agent.status === AcpAgentStatus.Connected || agent.status === AcpAgentStatus.Busy) {
			this.sendNotification(agentId, AcpMethods.Shutdown);
		}

		this._agents.delete(agentId);
		this._onDidUnregisterAgent.fire(agentId);
		this._logService.info(`[AcpClient] Unregistered agent: ${agentId}`);
	}

	getAgent(agentId: string): IAcpRegisteredAgent | undefined {
		return this._agents.get(agentId);
	}

	listAgents(): IAcpRegisteredAgent[] {
		return Array.from(this._agents.values());
	}

	async sendRequest(agentId: string, method: string, params?: Record<string, unknown>): Promise<IAcpResponse> {
		const agent = this._agents.get(agentId);
		if (!agent) {
			throw new Error(`[AcpClient] Unknown agent: ${agentId}`);
		}

		const requestId = this._nextRequestId++;
		const request: IAcpRequest = {
			jsonrpc: '2.0',
			id: requestId,
			method,
			params,
		};

		this._logService.trace(`[AcpClient] Sending request to ${agentId}: ${method} (id=${requestId})`);

		switch (agent.manifest.transport) {
			case AcpTransport.Http:
				return this._sendHttpRequest(agent.manifest.endpoint, request);
			case AcpTransport.Stdio:
				// Stdio transport requires spawning a child process, which is not available
				// in the browser/workbench layer. Delegate to the extension host bridge
				// by returning an error response that callers can handle gracefully.
				this._logService.warn(`[AcpClient] Stdio transport for agent ${agentId} requires extension host bridge (not yet implemented)`);
				return {
					jsonrpc: '2.0',
					id: request.id,
					result: undefined,
					error: {
						code: -32603,
						message: 'Stdio transport requires extension host bridge',
						data: undefined,
					},
				};
			case AcpTransport.WebSocket:
				this._logService.warn(`[AcpClient] WebSocket transport not yet supported for agent ${agentId}`);
				return {
					jsonrpc: '2.0',
					id: request.id,
					result: undefined,
					error: {
						code: -32603,
						message: 'WebSocket transport not yet supported',
						data: undefined,
					},
				};
		}
	}

	sendNotification(agentId: string, method: string, params?: Record<string, unknown>): void {
		const agent = this._agents.get(agentId);
		if (!agent) {
			this._logService.warn(`[AcpClient] Cannot send notification to unknown agent: ${agentId}`);
			return;
		}

		this._logService.trace(`[AcpClient] Sending notification to ${agentId}: ${method}`);

		const notification = {
			jsonrpc: '2.0' as const,
			method,
			params,
		};

		switch (agent.manifest.transport) {
			case AcpTransport.Http:
				// Fire-and-forget — do not await
				this._fireHttpNotification(agent.manifest.endpoint, notification).catch(err => {
					this._logService.warn(`[AcpClient] Failed to send notification ${method} to ${agentId}`, err);
				});
				break;
			case AcpTransport.Stdio:
				this._logService.warn(`[AcpClient] Stdio transport notifications not supported for agent ${agentId}`);
				break;
			case AcpTransport.WebSocket:
				this._logService.warn(`[AcpClient] WebSocket transport notifications not supported for agent ${agentId}`);
				break;
		}
	}

	async discoverAgents(workspacePath: string): Promise<IAcpAgentManifest[]> {
		this._logService.info(`[AcpClient] Discovering agents in workspace: ${workspacePath}`);

		// Candidate paths to scan for .acp.json manifest files
		const searchPaths = [
			workspacePath,
			`${workspacePath}/.acp`,
			`${workspacePath}/.vscode`,
		];

		const manifests: IAcpAgentManifest[] = [];

		for (const searchPath of searchPaths) {
			const dirUri = URI.file(searchPath);

			let children: { resource: URI; name: string; isFile: boolean }[];
			try {
				const stat = await this._fileService.resolve(dirUri);
				children = (stat.children ?? []).map(c => ({ resource: c.resource, name: c.name, isFile: c.isFile }));
			} catch {
				// Directory does not exist or is not readable — skip
				continue;
			}

			for (const child of children) {
				if (!child.isFile || !child.name.endsWith('.acp.json')) {
					continue;
				}

				try {
					const fileContent = await this._fileService.readFile(child.resource);
					const manifest = JSON.parse(fileContent.value.toString()) as IAcpAgentManifest;

					// Basic validation — ensure required fields are present
					if (manifest.id && manifest.name && manifest.transport && manifest.endpoint) {
						manifests.push(manifest);
						this._logService.info(`[AcpClient] Discovered agent manifest: ${manifest.name} (${manifest.id}) at ${child.resource.fsPath}`);
					} else {
						this._logService.warn(`[AcpClient] Skipping malformed manifest at ${child.resource.fsPath}: missing required fields`);
					}
				} catch (err) {
					this._logService.warn(`[AcpClient] Failed to read manifest at ${child.resource.fsPath}`, err);
				}
			}
		}

		this._logService.info(`[AcpClient] Discovered ${manifests.length} agent(s) in workspace: ${workspacePath}`);
		return manifests;
	}

	/**
	 * Send a JSON-RPC 2.0 request to an HTTP endpoint and return the parsed response.
	 */
	private async _sendHttpRequest(endpoint: string, request: IAcpRequest): Promise<IAcpResponse> {
		let httpResponse: Response;
		try {
			httpResponse = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
				},
				body: JSON.stringify(request),
			});
		} catch (err) {
			throw new Error(`[AcpClient] HTTP request to ${endpoint} failed: ${err}`);
		}

		if (!httpResponse.ok) {
			const errorText = await httpResponse.text().catch(() => '(no body)');
			throw new Error(`[AcpClient] HTTP ${httpResponse.status} from ${endpoint}: ${errorText}`);
		}

		let body: IAcpResponse;
		try {
			body = await httpResponse.json() as IAcpResponse;
		} catch (err) {
			throw new Error(`[AcpClient] Failed to parse JSON-RPC response from ${endpoint}: ${err}`);
		}

		return body;
	}

	/**
	 * Send a JSON-RPC 2.0 notification (fire-and-forget) to an HTTP endpoint.
	 */
	private async _fireHttpNotification(endpoint: string, notification: { jsonrpc: '2.0'; method: string; params: Record<string, unknown> | undefined }): Promise<void> {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(notification),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => '(no body)');
			this._logService.warn(`[AcpClient] HTTP notification to ${endpoint} returned ${response.status}: ${errorText}`);
		}
	}

	/**
	 * Update the status of a registered agent and fire the change event.
	 */
	private _setAgentStatus(agentId: string, status: AcpAgentStatus): void {
		const agent = this._agents.get(agentId);
		if (!agent) {
			return;
		}

		const updatedAgent: IAcpRegisteredAgent = {
			manifest: agent.manifest,
			status,
			connectedAt: status === AcpAgentStatus.Connected && agent.connectedAt === undefined
				? Date.now()
				: agent.connectedAt,
			lastActivityAt: Date.now(),
			activeTasks: agent.activeTasks,
		};

		this._agents.set(agentId, updatedAgent);
		this._onDidChangeAgentStatus.fire(updatedAgent);
	}
}
