/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type { IAcpAgentManifest, IAcpRegisteredAgent } from './acpTypes';

// AcpAgentStatus string value — typed as a literal matching the AcpAgentStatus union
const STATUS_DISCONNECTED = 'disconnected' as const;

/** Name of the ACP manifest file that agents place in their workspace root. */
const ACP_MANIFEST_FILENAME = '.acp.json';

/**
 * Required top-level fields every `.acp.json` manifest must supply.
 */
const REQUIRED_MANIFEST_FIELDS: ReadonlyArray<keyof IAcpAgentManifest> = [
	'id',
	'name',
	'version',
	'description',
	'transport',
	'endpoint',
	'capabilities',
	'supportedLanguages',
	'maxConcurrentTasks',
];

/**
 * Mutable registration record that wraps an agent manifest with runtime state.
 */
interface IRegistrationRecord {
	readonly agentId: string;
	readonly agent: IAcpRegisteredAgent;
}

/**
 * Registry for ACP-compatible agents.
 *
 * Agents are discovered by scanning workspace folders for `.acp.json` manifest
 * files. Manifests are validated for required fields before registration.
 * Registered agents can be queried by id or by declared capability name.
 *
 * The registry does not manage connections — use AcpClient for that.
 */
export class AcpAgentRegistry {
	private readonly registry = new Map<string, IRegistrationRecord>();
	private nextAgentId = 1;

	private readonly outputChannel: vscode.OutputChannel;

	private readonly _onDidRegisterAgent = new vscode.EventEmitter<IAcpRegisteredAgent>();
	/** Fires when an agent is added to the registry. */
	readonly onDidRegisterAgent: vscode.Event<IAcpRegisteredAgent> = this._onDidRegisterAgent.event;

	private readonly _onDidUnregisterAgent = new vscode.EventEmitter<string>();
	/** Fires with the agentId when an agent is removed from the registry. */
	readonly onDidUnregisterAgent: vscode.Event<string> = this._onDidUnregisterAgent.event;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Son of Anton: ACP Registry');
	}

	// ---------------------------------------------------------------------------
	// Discovery
	// ---------------------------------------------------------------------------

	/**
	 * Scan all workspace folders for `.acp.json` manifest files.
	 *
	 * Files are parsed, validated, and returned as manifests. Invalid manifests
	 * are logged and skipped. Does not automatically register the discovered
	 * manifests — callers decide whether to register them.
	 */
	async discoverAgents(): Promise<IAcpAgentManifest[]> {
		const manifests: IAcpAgentManifest[] = [];

		const pattern = new vscode.RelativePattern(
			vscode.workspace.workspaceFolders?.[0] ?? '',
			`**/${ACP_MANIFEST_FILENAME}`,
		);

		let uris: vscode.Uri[];
		try {
			uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP Registry] Discovery scan failed: ${message}`);
			return manifests;
		}

		this.outputChannel.appendLine(`[ACP Registry] Found ${uris.length} ${ACP_MANIFEST_FILENAME} file(s)`);

		for (const uri of uris) {
			const manifest = await this.loadManifest(uri);
			if (manifest) {
				manifests.push(manifest);
			}
		}

		return manifests;
	}

	// ---------------------------------------------------------------------------
	// Registration
	// ---------------------------------------------------------------------------

	/**
	 * Add an agent manifest to the registry.
	 *
	 * If an agent with the same manifest id is already registered it is replaced.
	 * Returns the internal agentId assigned by the registry (distinct from
	 * manifest.id, which is the agent's own identifier).
	 */
	registerAgent(manifest: IAcpAgentManifest): string {
		// Replace existing registration for the same manifest id
		const existing = this.findByManifestId(manifest.id);
		if (existing) {
			this.unregisterAgent(existing.agentId);
		}

		const agentId = `acp-agent-${this.nextAgentId++}`;
		const agent: IAcpRegisteredAgent = {
			manifest,
			status: STATUS_DISCONNECTED as IAcpRegisteredAgent['status'],
			connectedAt: undefined,
			lastActivityAt: undefined,
			activeTasks: 0,
		};

		this.registry.set(agentId, { agentId, agent });
		this.outputChannel.appendLine(`[ACP Registry] Registered agent "${manifest.name}" (${manifest.id}) → ${agentId}`);
		this._onDidRegisterAgent.fire(agent);
		return agentId;
	}

	/**
	 * Remove an agent from the registry by its registry-assigned agentId.
	 * No-ops silently if the agentId is not found.
	 */
	unregisterAgent(agentId: string): void {
		const record = this.registry.get(agentId);
		if (!record) {
			return;
		}

		this.registry.delete(agentId);
		this.outputChannel.appendLine(`[ACP Registry] Unregistered agent "${record.agent.manifest.name}" (${agentId})`);
		this._onDidUnregisterAgent.fire(agentId);
	}

	// ---------------------------------------------------------------------------
	// Query
	// ---------------------------------------------------------------------------

	/**
	 * Return the registered agent for the given registry agentId, or undefined
	 * if no such agent is registered.
	 */
	getAgent(agentId: string): IAcpRegisteredAgent | undefined {
		return this.registry.get(agentId)?.agent;
	}

	/**
	 * Return all registered agents that declare the given capability name in
	 * their manifest.
	 */
	getAgentsByCapability(capability: string): IAcpRegisteredAgent[] {
		const results: IAcpRegisteredAgent[] = [];
		for (const { agent } of this.registry.values()) {
			if (agent.manifest.capabilities.some(c => c.name === capability)) {
				results.push(agent);
			}
		}
		return results;
	}

	/**
	 * Return all currently registered agents.
	 */
	getAllAgents(): IAcpRegisteredAgent[] {
		return Array.from(this.registry.values()).map(r => r.agent);
	}

	/**
	 * Release event emitters and the output channel.
	 */
	dispose(): void {
		this._onDidRegisterAgent.dispose();
		this._onDidUnregisterAgent.dispose();
		this.outputChannel.dispose();
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * Read and parse a `.acp.json` file, validate its required fields, and
	 * return the manifest — or undefined on any failure.
	 */
	private async loadManifest(uri: vscode.Uri): Promise<IAcpAgentManifest | undefined> {
		let raw: Uint8Array;
		try {
			raw = await vscode.workspace.fs.readFile(uri);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP Registry] Could not read ${uri.fsPath}: ${message}`);
			return undefined;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`[ACP Registry] Invalid JSON in ${uri.fsPath}: ${message}`);
			return undefined;
		}

		const validationError = this.validateManifest(parsed);
		if (validationError) {
			this.outputChannel.appendLine(`[ACP Registry] Invalid manifest at ${uri.fsPath}: ${validationError}`);
			return undefined;
		}

		this.outputChannel.appendLine(`[ACP Registry] Loaded manifest from ${uri.fsPath}`);
		return parsed as IAcpAgentManifest;
	}

	/**
	 * Validate that the parsed value satisfies the IAcpAgentManifest shape.
	 * Returns a human-readable error string, or undefined if the manifest is valid.
	 */
	private validateManifest(value: unknown): string | undefined {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			return 'Manifest must be a JSON object';
		}

		const obj = value as Record<string, unknown>;

		for (const field of REQUIRED_MANIFEST_FIELDS) {
			if (!(field in obj)) {
				return `Missing required field: ${field}`;
			}
		}

		if (typeof obj['id'] !== 'string' || !obj['id'].trim()) {
			return 'Field "id" must be a non-empty string';
		}

		if (typeof obj['name'] !== 'string' || !obj['name'].trim()) {
			return 'Field "name" must be a non-empty string';
		}

		if (typeof obj['version'] !== 'string') {
			return 'Field "version" must be a string';
		}

		if (typeof obj['description'] !== 'string') {
			return 'Field "description" must be a string';
		}

		const validTransports = ['stdio', 'http', 'websocket'];
		if (!validTransports.includes(obj['transport'] as string)) {
			return `Field "transport" must be one of: ${validTransports.join(', ')}`;
		}

		if (typeof obj['endpoint'] !== 'string' || !obj['endpoint'].trim()) {
			return 'Field "endpoint" must be a non-empty string';
		}

		if (!Array.isArray(obj['capabilities'])) {
			return 'Field "capabilities" must be an array';
		}

		if (!Array.isArray(obj['supportedLanguages'])) {
			return 'Field "supportedLanguages" must be an array';
		}

		if (typeof obj['maxConcurrentTasks'] !== 'number' || obj['maxConcurrentTasks'] < 1) {
			return 'Field "maxConcurrentTasks" must be a positive number';
		}

		return undefined;
	}

	/**
	 * Find an existing registration record by its manifest-level id (not the
	 * registry agentId).
	 */
	private findByManifestId(manifestId: string): IRegistrationRecord | undefined {
		for (const record of this.registry.values()) {
			if (record.agent.manifest.id === manifestId) {
				return record;
			}
		}
		return undefined;
	}
}
