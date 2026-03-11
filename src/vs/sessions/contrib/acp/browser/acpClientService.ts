/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	AcpAgentStatus,
	AcpMethods,
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

		// TODO: Implement actual transport dispatch based on agent.manifest.transport.
		// For stdio: spawn child process and write to stdin / read from stdout.
		// For http: POST to agent.manifest.endpoint.
		// For websocket: send over persistent WebSocket connection.
		const response: IAcpResponse = {
			jsonrpc: '2.0',
			id: request.id,
			result: { status: 'ok', message: `Stub response for ${method}` },
			error: undefined,
		};

		return response;
	}

	sendNotification(agentId: string, method: string, params?: Record<string, unknown>): void {
		const agent = this._agents.get(agentId);
		if (!agent) {
			this._logService.warn(`[AcpClient] Cannot send notification to unknown agent: ${agentId}`);
			return;
		}

		this._logService.trace(`[AcpClient] Sending notification to ${agentId}: ${method}`);

		// TODO: Implement actual transport dispatch for notifications.
		// Notifications are fire-and-forget (no response expected per JSON-RPC 2.0).
		void params;
	}

	async discoverAgents(workspacePath: string): Promise<IAcpAgentManifest[]> {
		this._logService.info(`[AcpClient] Discovering agents in workspace: ${workspacePath}`);

		// TODO: Implement agent discovery by scanning for `.acp.json` manifest files
		// in the workspace root and well-known subdirectories (e.g., `.acp/`, `.vscode/`).
		// Each `.acp.json` file should conform to the IAcpAgentManifest schema.
		return [];
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
