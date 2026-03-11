/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentConfig.css';
import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import {
	IAgentDefinition,
	IAgentProviderAssignment,
	IAgentProviderConfig,
	ModelTier,
	ProviderStatus,
	BUILT_IN_PROVIDERS,
} from '../common/agentConfigTypes.js';
import { IAgentConfigService } from './agentConfigService.js';

export const AGENT_CONFIG_VIEW_ID = 'workbench.view.soaAgentConfig';

const TIER_LABELS: Record<string, string> = {
	[ModelTier.Premium]: 'Premium',
	[ModelTier.Standard]: 'Standard',
	[ModelTier.Economy]: 'Economy',
	[ModelTier.Local]: 'Local',
};

const TIER_COLORS: Record<string, string> = {
	[ModelTier.Premium]: '#8B5CF6',
	[ModelTier.Standard]: '#3B82F6',
	[ModelTier.Economy]: '#10B981',
	[ModelTier.Local]: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
	[ProviderStatus.Connected]: 'Connected',
	[ProviderStatus.Disconnected]: 'Disconnected',
	[ProviderStatus.NotConfigured]: 'Not configured',
};

const STATUS_COLORS: Record<string, string> = {
	[ProviderStatus.Connected]: '#10B981',
	[ProviderStatus.Disconnected]: '#EF4444',
	[ProviderStatus.NotConfigured]: '#6B7280',
};

export class AgentConfigView extends ViewPane {

	static readonly ID = AGENT_CONFIG_VIEW_ID;

	private bodyRoot: HTMLElement | undefined;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAgentConfigService private readonly agentConfigService: IAgentConfigService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.agentConfigService.onDidChangeConfig(() => this.renderContent()));
		this._register(this.agentConfigService.onDidChangeProviderStatus(() => this.renderContent()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.bodyRoot = append(container, $('div.agent-config-root'));
		this.renderContent();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.bodyRoot) {
			this.bodyRoot.style.height = `${height}px`;
			this.bodyRoot.style.width = `${width}px`;
		}
	}

	private renderContent(): void {
		if (!this.bodyRoot) {
			return;
		}
		this.renderDisposables.clear();
		this.bodyRoot.textContent = '';

		const config = this.agentConfigService.config;
		const agents = this.agentConfigService.agents;

		// --- Header ---
		const header = append(this.bodyRoot, $('div.ac-header'));
		const title = append(header, $('h3.ac-title'));
		title.textContent = localize('agentConfig.title', "Agent Configuration");
		const subtitle = append(header, $('span.ac-subtitle'));
		subtitle.textContent = localize('agentConfig.subtitle', "Assign providers and models to each agent");

		// --- Global settings bar ---
		const globalBar = append(this.bodyRoot, $('div.ac-global-bar'));
		this.renderGlobalSettings(globalBar, config);

		// --- Provider status bar ---
		const providerBar = append(this.bodyRoot, $('div.ac-provider-bar'));
		this.renderProviderStatus(providerBar);

		// --- Agent list ---
		const agentList = append(this.bodyRoot, $('div.ac-agent-list'));
		for (const agent of agents) {
			const assignment = config.assignments.find(a => a.agentRole === agent.role);
			if (assignment) {
				this.renderAgentRow(agentList, agent, assignment);
			}
		}

		// --- Reset button ---
		const footer = append(this.bodyRoot, $('div.ac-footer'));
		const resetBtn = append(footer, $('button.ac-btn-secondary'));
		resetBtn.textContent = localize('agentConfig.resetDefaults', "Reset to Defaults");
		this.renderDisposables.add(addDisposableListener(resetBtn, EventType.CLICK, () => {
			this.agentConfigService.resetToDefaults();
		}));
	}

	private renderGlobalSettings(container: HTMLElement, config: IAgentProviderConfig): void {
		const sectionTitle = append(container, $('div.ac-section-title'));
		sectionTitle.textContent = localize('agentConfig.global', "Global Settings");

		const settingsGrid = append(container, $('div.ac-settings-grid'));

		// Max concurrent agents
		const concurrentRow = append(settingsGrid, $('div.ac-setting-row'));
		const concurrentLabel = append(concurrentRow, $('label.ac-setting-label'));
		concurrentLabel.textContent = localize('agentConfig.maxConcurrent', "Max concurrent agents");
		const concurrentInput = document.createElement('input');
		concurrentInput.type = 'number';
		concurrentInput.className = 'ac-setting-input';
		concurrentInput.min = '1';
		concurrentInput.max = '20';
		concurrentInput.value = String(config.maxConcurrentAgents);
		append(concurrentRow, concurrentInput);
		this.renderDisposables.add(addDisposableListener(concurrentInput, EventType.CHANGE, () => {
			const val = parseInt(concurrentInput.value, 10);
			if (!isNaN(val) && val >= 1) {
				this.agentConfigService.setMaxConcurrentAgents(val);
			}
		}));

		// Session budget
		const budgetRow = append(settingsGrid, $('div.ac-setting-row'));
		const budgetLabel = append(budgetRow, $('label.ac-setting-label'));
		budgetLabel.textContent = localize('agentConfig.sessionBudget', "Session budget (USD)");
		const budgetInput = document.createElement('input');
		budgetInput.type = 'number';
		budgetInput.className = 'ac-setting-input';
		budgetInput.min = '0.10';
		budgetInput.step = '0.50';
		budgetInput.value = config.sessionBudgetUsd.toFixed(2);
		append(budgetRow, budgetInput);
		this.renderDisposables.add(addDisposableListener(budgetInput, EventType.CHANGE, () => {
			const val = parseFloat(budgetInput.value);
			if (!isNaN(val) && val >= 0) {
				this.agentConfigService.setSessionBudget(val);
			}
		}));

		// Global fallback
		const fallbackRow = append(settingsGrid, $('div.ac-setting-row'));
		const fallbackLabel = append(fallbackRow, $('label.ac-setting-label'));
		fallbackLabel.textContent = localize('agentConfig.globalFallback', "Global fallback");
		const fallbackSelect = this.createProviderModelSelect(
			config.globalFallbackProviderId,
			config.globalFallbackModelId,
			(providerId, modelId) => this.agentConfigService.setGlobalFallback(providerId, modelId)
		);
		append(fallbackRow, fallbackSelect);
	}

	private renderProviderStatus(container: HTMLElement): void {
		const sectionTitle = append(container, $('div.ac-section-title'));
		sectionTitle.textContent = localize('agentConfig.providers', "Providers");

		const providerGrid = append(container, $('div.ac-provider-grid'));

		for (const provider of this.agentConfigService.providers) {
			const providerEl = append(providerGrid, $('div.ac-provider-chip'));

			const statusDot = append(providerEl, $('span.ac-provider-status-dot'));
			statusDot.style.backgroundColor = STATUS_COLORS[provider.status] ?? '#6B7280';

			const nameEl = append(providerEl, $('span.ac-provider-name'));
			nameEl.textContent = provider.label;

			const statusEl = append(providerEl, $('span.ac-provider-status-label'));
			statusEl.textContent = STATUS_LABELS[provider.status] ?? 'Unknown';
		}
	}

	private renderAgentRow(container: HTMLElement, agent: IAgentDefinition, assignment: IAgentProviderAssignment): void {
		const row = append(container, $('div.ac-agent-row'));
		row.classList.toggle('ac-agent-row-disabled', !assignment.enabled);

		// Left: agent info
		const agentInfo = append(row, $('div.ac-agent-info'));

		const agentHeader = append(agentInfo, $('div.ac-agent-header'));

		// Enable/disable toggle
		const toggle = document.createElement('input');
		toggle.type = 'checkbox';
		toggle.className = 'ac-agent-toggle';
		toggle.checked = assignment.enabled;
		toggle.setAttribute('aria-label', localize('agentConfig.toggleAgent', "Enable or disable {0}", agent.label));
		append(agentHeader, toggle);
		this.renderDisposables.add(addDisposableListener(toggle, EventType.CHANGE, () => {
			this.agentConfigService.setEnabled(agent.role, toggle.checked);
		}));

		const agentLabel = append(agentHeader, $('span.ac-agent-label'));
		agentLabel.textContent = agent.label;

		const tierBadge = append(agentHeader, $('span.ac-tier-badge'));
		tierBadge.textContent = TIER_LABELS[agent.recommendedTier] ?? '';
		tierBadge.style.backgroundColor = TIER_COLORS[agent.recommendedTier] ?? '#6B7280';

		const agentDesc = append(agentInfo, $('div.ac-agent-desc'));
		agentDesc.textContent = agent.description;

		// Right: provider/model selectors
		const selectors = append(row, $('div.ac-agent-selectors'));

		// Primary assignment
		const primaryLabel = append(selectors, $('div.ac-selector-label'));
		primaryLabel.textContent = localize('agentConfig.primary', "Primary");

		const primarySelect = this.createProviderModelSelect(
			assignment.providerId,
			assignment.modelId,
			(providerId, modelId) => this.agentConfigService.updateAssignment(agent.role, providerId, modelId)
		);
		append(selectors, primarySelect);

		// Fallback
		const fallbackLabel = append(selectors, $('div.ac-selector-label'));
		fallbackLabel.textContent = localize('agentConfig.fallback', "Fallback");

		const fallbackSelect = this.createProviderModelSelect(
			assignment.fallbackProviderId ?? '',
			assignment.fallbackModelId ?? '',
			(providerId, modelId) => {
				if (providerId && modelId) {
					this.agentConfigService.updateFallback(agent.role, providerId, modelId);
				}
			},
			true // allow "none" option
		);
		append(selectors, fallbackSelect);
	}

	private createProviderModelSelect(
		currentProviderId: string,
		currentModelId: string,
		onChange: (providerId: string, modelId: string) => void,
		allowNone: boolean = false,
	): HTMLElement {
		const wrapper = $('div.ac-select-wrapper');

		const select = document.createElement('select');
		select.className = 'ac-select';

		if (allowNone) {
			const noneOpt = document.createElement('option');
			noneOpt.value = '||';
			noneOpt.textContent = localize('agentConfig.none', "None");
			select.appendChild(noneOpt);
		}

		// Build optgroups per provider
		for (const provider of BUILT_IN_PROVIDERS) {
			const group = document.createElement('optgroup');
			group.label = provider.label;

			for (const model of provider.models) {
				const opt = document.createElement('option');
				opt.value = `${provider.id}|${model.id}`;
				opt.textContent = `${model.label} (${TIER_LABELS[model.tier] ?? model.tier})`;
				if (provider.id === currentProviderId && model.id === currentModelId) {
					opt.selected = true;
				}
				group.appendChild(opt);
			}

			select.appendChild(group);
		}

		this.renderDisposables.add(addDisposableListener(select, EventType.CHANGE, () => {
			const parts = select.value.split('|');
			if (parts.length >= 2 && parts[0] && parts[1]) {
				onChange(parts[0], parts[1]);
			}
		}));

		append(wrapper, select);
		return wrapper;
	}
}
