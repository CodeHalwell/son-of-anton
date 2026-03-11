/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService, FileOperationResult, FileOperationError } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import {
	AgentRole,
	IAgentDefinition,
	IAgentProviderAssignment,
	IAgentProviderConfig,
	IProviderDefinition,
	ProviderStatus,
	BUILT_IN_AGENTS,
	BUILT_IN_PROVIDERS,
	createDefaultConfig,
} from '../common/agentConfigTypes.js';

// --- Service interface ---

export const IAgentConfigService = createDecorator<IAgentConfigService>('soaAgentConfigService');

export interface IAgentConfigService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeConfig: Event<IAgentProviderConfig>;
	readonly onDidChangeProviderStatus: Event<{ providerId: string; status: ProviderStatus }>;

	// Configuration
	readonly config: IAgentProviderConfig;
	updateAssignment(agentRole: AgentRole, providerId: string, modelId: string): void;
	updateFallback(agentRole: AgentRole, fallbackProviderId: string, fallbackModelId: string): void;
	setEnabled(agentRole: AgentRole, enabled: boolean): void;
	setGlobalFallback(providerId: string, modelId: string): void;
	setMaxConcurrentAgents(max: number): void;
	setSessionBudget(usd: number): void;
	resetToDefaults(): void;

	// Catalogues
	readonly agents: readonly IAgentDefinition[];
	readonly providers: readonly IProviderDefinition[];

	// Provider status
	getProviderStatus(providerId: string): ProviderStatus;
	refreshProviderStatus(providerId: string): Promise<ProviderStatus>;

	// Persistence
	saveConfig(): Promise<void>;
	loadConfig(): Promise<void>;

	// Lookup helpers
	getAssignment(agentRole: AgentRole): IAgentProviderAssignment | undefined;
	getProvider(providerId: string): IProviderDefinition | undefined;
	getAgent(role: AgentRole): IAgentDefinition | undefined;
}

// --- Service implementation ---

const CONFIG_FILE_NAME = 'agent-config.json';

export class AgentConfigService extends Disposable implements IAgentConfigService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfig = this._register(new Emitter<IAgentProviderConfig>());
	readonly onDidChangeConfig: Event<IAgentProviderConfig> = this._onDidChangeConfig.event;

	private readonly _onDidChangeProviderStatus = this._register(new Emitter<{ providerId: string; status: ProviderStatus }>());
	readonly onDidChangeProviderStatus: Event<{ providerId: string; status: ProviderStatus }> = this._onDidChangeProviderStatus.event;

	private _config: IAgentProviderConfig;
	private readonly _providers: IProviderDefinition[];
	private readonly _agents: readonly IAgentDefinition[];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._config = createDefaultConfig();
		this._providers = BUILT_IN_PROVIDERS.map(p => ({ ...p }));
		this._agents = BUILT_IN_AGENTS;
		this.loadConfig();
		this.refreshAllProviders();
	}

	private async refreshAllProviders(): Promise<void> {
		for (const provider of this._providers) {
			await this.refreshProviderStatus(provider.id);
		}
	}

	// --- Getters ---

	get config(): IAgentProviderConfig {
		return this._config;
	}

	get agents(): readonly IAgentDefinition[] {
		return this._agents;
	}

	get providers(): readonly IProviderDefinition[] {
		return this._providers;
	}

	// --- Configuration mutations ---

	updateAssignment(agentRole: AgentRole, providerId: string, modelId: string): void {
		const assignments = [...this._config.assignments];
		const idx = assignments.findIndex(a => a.agentRole === agentRole);
		if (idx >= 0) {
			assignments[idx] = { ...assignments[idx], providerId, modelId };
		} else {
			assignments.push({ agentRole, providerId, modelId, enabled: true });
		}
		this._config = { ...this._config, assignments };
		this._onDidChangeConfig.fire(this._config);
		this.saveConfig();
	}

	updateFallback(agentRole: AgentRole, fallbackProviderId: string, fallbackModelId: string): void {
		const assignments = [...this._config.assignments];
		const idx = assignments.findIndex(a => a.agentRole === agentRole);
		if (idx >= 0) {
			assignments[idx] = { ...assignments[idx], fallbackProviderId, fallbackModelId };
			this._config = { ...this._config, assignments };
			this._onDidChangeConfig.fire(this._config);
			this.saveConfig();
		}
	}

	setEnabled(agentRole: AgentRole, enabled: boolean): void {
		const assignments = [...this._config.assignments];
		const idx = assignments.findIndex(a => a.agentRole === agentRole);
		if (idx >= 0) {
			assignments[idx] = { ...assignments[idx], enabled };
			this._config = { ...this._config, assignments };
			this._onDidChangeConfig.fire(this._config);
			this.saveConfig();
		}
	}

	setGlobalFallback(providerId: string, modelId: string): void {
		this._config = { ...this._config, globalFallbackProviderId: providerId, globalFallbackModelId: modelId };
		this._onDidChangeConfig.fire(this._config);
		this.saveConfig();
	}

	setMaxConcurrentAgents(max: number): void {
		this._config = { ...this._config, maxConcurrentAgents: max };
		this._onDidChangeConfig.fire(this._config);
		this.saveConfig();
	}

	setSessionBudget(usd: number): void {
		this._config = { ...this._config, sessionBudgetUsd: usd };
		this._onDidChangeConfig.fire(this._config);
		this.saveConfig();
	}

	resetToDefaults(): void {
		this._config = createDefaultConfig();
		this._onDidChangeConfig.fire(this._config);
		this.saveConfig();
	}

	// --- Provider status ---

	getProviderStatus(providerId: string): ProviderStatus {
		const provider = this._providers.find(p => p.id === providerId);
		return provider?.status ?? ProviderStatus.NotConfigured;
	}

	async refreshProviderStatus(providerId: string): Promise<ProviderStatus> {
		const idx = this._providers.findIndex(p => p.id === providerId);
		if (idx < 0) {
			return ProviderStatus.NotConfigured;
		}

		const provider = this._providers[idx];
		let newStatus: ProviderStatus;

		switch (providerId) {
			// CLI-based providers — the CLI handles auth, so if the built-in entry
			// exists we trust that the tool is available. Actual availability is
			// confirmed at invocation time in the extension host layer.
			case 'claude-code':
			case 'gemini-cli':
			case 'openai-codex':
			case 'github-copilot':
				newStatus = ProviderStatus.Connected;
				break;

			// Local HTTP providers — probe their health endpoints
			case 'ollama':
				newStatus = await this.probeHttpEndpoint('http://localhost:11434/api/tags');
				break;
			case 'lm-studio':
				newStatus = await this.probeHttpEndpoint('http://localhost:1234/v1/models');
				break;

			// API-key providers — check configuration for a stored key
			case 'openrouter':
				newStatus = provider.configuredKeyName
					? this.checkConfiguredKey(provider.configuredKeyName)
					: ProviderStatus.NotConfigured;
				break;

			default:
				newStatus = provider.requiresApiKey
					? ProviderStatus.NotConfigured
					: ProviderStatus.Connected;
				break;
		}

		this._providers[idx] = { ...provider, status: newStatus };
		this._onDidChangeProviderStatus.fire({ providerId, status: newStatus });
		return newStatus;
	}

	private async probeHttpEndpoint(url: string): Promise<ProviderStatus> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);
			const response = await fetch(url, { signal: controller.signal });
			clearTimeout(timeoutId);
			return response.ok ? ProviderStatus.Connected : ProviderStatus.Disconnected;
		} catch {
			return ProviderStatus.Disconnected;
		}
	}

	private checkConfiguredKey(keyName: string): ProviderStatus {
		// Check if the user has configured the key in SoA settings
		const configValue = this.configurationService.getValue<string>(`soa.providers.${keyName}`);
		return configValue ? ProviderStatus.Connected : ProviderStatus.NotConfigured;
	}

	// --- Lookup helpers ---

	getAssignment(agentRole: AgentRole): IAgentProviderAssignment | undefined {
		return this._config.assignments.find(a => a.agentRole === agentRole);
	}

	getProvider(providerId: string): IProviderDefinition | undefined {
		return this._providers.find(p => p.id === providerId);
	}

	getAgent(role: AgentRole): IAgentDefinition | undefined {
		return this._agents.find(a => a.role === role);
	}

	// --- Persistence ---

	private getConfigUri(): URI | undefined {
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}
		return joinPath(folders[0].uri, '.son-of-anton', CONFIG_FILE_NAME);
	}

	async saveConfig(): Promise<void> {
		const uri = this.getConfigUri();
		if (!uri) {
			return;
		}

		try {
			const json = JSON.stringify(this._config, null, '\t');
			await this.fileService.writeFile(uri, VSBuffer.fromString(json));
			this.logService.debug('[AgentConfig] Configuration saved');
		} catch (err) {
			this.logService.error('[AgentConfig] Failed to save configuration', err);
		}
	}

	async loadConfig(): Promise<void> {
		const uri = this.getConfigUri();
		if (!uri) {
			return;
		}

		try {
			const content = await this.fileService.readFile(uri);
			const parsed = JSON.parse(content.value.toString());
			if (parsed && Array.isArray(parsed.assignments)) {
				this._config = parsed as IAgentProviderConfig;
				this._onDidChangeConfig.fire(this._config);
				this.logService.debug('[AgentConfig] Configuration loaded');
			}
		} catch (err) {
			if (err instanceof FileOperationError && err.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				// No config file yet — use defaults
				return;
			}
			this.logService.warn('[AgentConfig] Failed to load configuration, using defaults', err);
		}
	}
}
