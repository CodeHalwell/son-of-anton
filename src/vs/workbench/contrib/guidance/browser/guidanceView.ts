/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/guidance.css';
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
	GuidanceCategory,
	IAgentRole,
	IGuidanceItem,
	IWorkflowDefinition,
	IWorkflowPhaseDefinition,
	WorkflowPhase,
} from '../common/guidanceTypes.js';
import { IGuidanceService } from './guidanceService.js';

// --- Constants ---

export const GUIDANCE_VIEW_ID = 'workbench.view.soaGuidance';

const enum Tab {
	Workflows = 'workflows',
	Rules = 'rules',
	Skills = 'skills',
	Agents = 'agents',
}

const PHASE_COLORS: Record<string, string> = {
	[WorkflowPhase.Brainstorm]: '#8B5CF6',
	[WorkflowPhase.Spec]: '#3B82F6',
	[WorkflowPhase.Plan]: '#F59E0B',
	[WorkflowPhase.Execute]: '#10B981',
	[WorkflowPhase.Review]: '#F5A623',
	[WorkflowPhase.Test]: '#EF4444',
};


// --- View ---

export class GuidanceView extends ViewPane {

	static readonly ID = GUIDANCE_VIEW_ID;

	private bodyRoot: HTMLElement | undefined;
	private contentArea: HTMLElement | undefined;

	private activeTab: Tab = Tab.Workflows;
	private searchQuery: string = '';
	private expandedCardId: string | undefined;

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
		@IGuidanceService private readonly guidanceService: IGuidanceService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.guidanceService.onDidChangeGuidance(() => this.renderContent()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.bodyRoot = append(container, $('div.guidance-root'));
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

		// --- Header ---
		const header = append(this.bodyRoot, $('div.gd-header'));
		const titleEl = append(header, $('h3.gd-title'));
		titleEl.textContent = localize('guidance.title', "Guidance");

		const searchInput = document.createElement('input');
		searchInput.type = 'search';
		searchInput.className = 'gd-search';
		searchInput.placeholder = localize('guidance.search.placeholder', "Search workflows, rules, skills\u2026");
		searchInput.value = this.searchQuery;
		searchInput.setAttribute('aria-label', localize('guidance.search.label', "Search guidance"));
		header.appendChild(searchInput);

		this.renderDisposables.add(addDisposableListener(searchInput, EventType.INPUT, () => {
			this.searchQuery = searchInput.value;
			this.expandedCardId = undefined;
			this.renderTabContent();
		}));

		// --- Tab bar ---
		const tabBar = append(this.bodyRoot, $('div.gd-tab-bar'));
		const tabs: { id: Tab; label: string }[] = [
			{ id: Tab.Workflows, label: localize('guidance.tab.workflows', "Workflows") },
			{ id: Tab.Rules, label: localize('guidance.tab.rules', "Rules") },
			{ id: Tab.Skills, label: localize('guidance.tab.skills', "Skills") },
			{ id: Tab.Agents, label: localize('guidance.tab.agents', "Agents") },
		];

		for (const tab of tabs) {
			const btn = append(tabBar, $('button.gd-tab'));
			btn.textContent = tab.label;
			btn.setAttribute('aria-selected', String(tab.id === this.activeTab));
			btn.classList.toggle('gd-tab-active', tab.id === this.activeTab);

			this.renderDisposables.add(addDisposableListener(btn, EventType.CLICK, () => {
				this.activeTab = tab.id;
				this.searchQuery = '';
				searchInput.value = '';
				this.expandedCardId = undefined;
				this.renderContent();
			}));
		}

		// --- Content area ---
		this.contentArea = append(this.bodyRoot, $('div.gd-content'));
		this.renderTabContent();
	}

	private renderTabContent(): void {
		if (!this.contentArea) {
			return;
		}
		this.contentArea.textContent = '';

		switch (this.activeTab) {
			case Tab.Workflows:
				this.renderWorkflowsTab(this.contentArea);
				break;
			case Tab.Rules:
				this.renderRulesTab(this.contentArea);
				break;
			case Tab.Skills:
				this.renderSkillsTab(this.contentArea);
				break;
			case Tab.Agents:
				this.renderAgentsTab(this.contentArea);
				break;
		}
	}

	// --- Workflows tab ---

	private renderWorkflowsTab(container: HTMLElement): void {
		const workflows = this.getFilteredWorkflows();

		if (workflows.length === 0) {
			this.renderEmptyState(container, localize('guidance.empty.workflows', "No workflows match your search."));
			return;
		}

		const list = append(container, $('div.gd-card-list'));
		for (const workflow of workflows) {
			this.renderWorkflowCard(list, workflow);
		}
	}

	private renderWorkflowCard(container: HTMLElement, workflow: IWorkflowDefinition): void {
		const isExpanded = this.expandedCardId === workflow.id;
		const card = append(container, $('div.gd-card'));
		card.classList.toggle('gd-card-expanded', isExpanded);

		// Card header (always visible)
		const cardHeader = append(card, $('div.gd-card-header'));
		cardHeader.setAttribute('role', 'button');
		cardHeader.setAttribute('tabindex', '0');
		cardHeader.setAttribute('aria-expanded', String(isExpanded));

		const titleRow = append(cardHeader, $('div.gd-card-title-row'));
		const titleEl = append(titleRow, $('span.gd-card-title'));
		titleEl.textContent = workflow.title;

		const chevron = append(titleRow, $('span.gd-chevron'));
		chevron.textContent = isExpanded ? '\u25BE' : '\u25B8';
		chevron.setAttribute('aria-hidden', 'true');

		const descEl = append(cardHeader, $('div.gd-card-desc'));
		descEl.textContent = workflow.description;

		// Phase badges (always visible)
		const phaseBadges = append(cardHeader, $('div.gd-phase-badges'));
		for (const phase of workflow.phases) {
			this.renderPhaseBadge(phaseBadges, phase);
		}

		// Expanded detail
		if (isExpanded) {
			const detail = append(card, $('div.gd-card-detail'));
			for (const phase of workflow.phases) {
				this.renderPhaseDetail(detail, phase);
			}
		}

		// Toggle expand on click or keyboard
		const onToggle = () => {
			this.expandedCardId = isExpanded ? undefined : workflow.id;
			this.renderTabContent();
		};
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.CLICK, onToggle));
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onToggle();
			}
		}));
	}

	private renderPhaseBadge(container: HTMLElement, phase: IWorkflowPhaseDefinition): void {
		const badge = append(container, $('span.gd-phase-badge'));
		const dot = append(badge, $('span.gd-phase-dot'));
		dot.style.backgroundColor = PHASE_COLORS[phase.phase] ?? '#6B7280';
		dot.setAttribute('aria-hidden', 'true');
		const label = append(badge, $('span.gd-phase-label'));
		label.textContent = phase.title;
	}

	private renderPhaseDetail(container: HTMLElement, phase: IWorkflowPhaseDefinition): void {
		const phaseEl = append(container, $('div.gd-phase-detail'));

		const phaseHeader = append(phaseEl, $('div.gd-phase-detail-header'));
		const dot = append(phaseHeader, $('span.gd-phase-dot'));
		dot.style.backgroundColor = PHASE_COLORS[phase.phase] ?? '#6B7280';
		dot.setAttribute('aria-hidden', 'true');
		const phaseTitle = append(phaseHeader, $('span.gd-phase-detail-title'));
		phaseTitle.textContent = phase.title;

		const phaseDesc = append(phaseEl, $('div.gd-phase-detail-desc'));
		phaseDesc.textContent = phase.description;

		if (phase.requiredInputs.length > 0) {
			const inputsRow = append(phaseEl, $('div.gd-phase-io-row'));
			const inputsLabel = append(inputsRow, $('span.gd-phase-io-label'));
			inputsLabel.textContent = localize('guidance.phase.inputs', "Inputs");
			const inputsList = append(inputsRow, $('span.gd-phase-io-value'));
			inputsList.textContent = phase.requiredInputs.join(', ');
		}

		if (phase.producedOutputs.length > 0) {
			const outputsRow = append(phaseEl, $('div.gd-phase-io-row'));
			const outputsLabel = append(outputsRow, $('span.gd-phase-io-label'));
			outputsLabel.textContent = localize('guidance.phase.outputs', "Outputs");
			const outputsList = append(outputsRow, $('span.gd-phase-io-value'));
			outputsList.textContent = phase.producedOutputs.join(', ');
		}
	}

	// --- Rules tab ---

	private renderRulesTab(container: HTMLElement): void {
		const items = this.getFilteredItems(GuidanceCategory.Rule);

		if (items.length === 0) {
			this.renderEmptyState(container, localize('guidance.empty.rules', "No rules match your search."));
			return;
		}

		const list = append(container, $('div.gd-card-list'));
		for (const item of items) {
			this.renderRuleCard(list, item);
		}
	}

	private renderRuleCard(container: HTMLElement, item: IGuidanceItem): void {
		const isExpanded = this.expandedCardId === item.id;
		const card = append(container, $('div.gd-card'));
		card.classList.toggle('gd-card-expanded', isExpanded);

		const cardHeader = append(card, $('div.gd-card-header'));
		cardHeader.setAttribute('role', 'button');
		cardHeader.setAttribute('tabindex', '0');
		cardHeader.setAttribute('aria-expanded', String(isExpanded));

		const titleRow = append(cardHeader, $('div.gd-card-title-row'));
		const titleEl = append(titleRow, $('span.gd-card-title'));
		titleEl.textContent = item.title;

		const chevron = append(titleRow, $('span.gd-chevron'));
		chevron.textContent = isExpanded ? '\u25BE' : '\u25B8';
		chevron.setAttribute('aria-hidden', 'true');

		const descEl = append(cardHeader, $('div.gd-card-desc'));
		descEl.textContent = item.description;

		// Tags
		if (item.tags.length > 0) {
			const tagRow = append(cardHeader, $('div.gd-tag-row'));
			for (const tag of item.tags) {
				const chip = append(tagRow, $('span.gd-tag-chip'));
				chip.textContent = tag;
			}
		}

		// Expanded detail
		if (isExpanded) {
			const detail = append(card, $('div.gd-card-detail'));
			const content = append(detail, $('div.gd-item-content'));
			content.textContent = item.content;
		}

		const onToggle = () => {
			this.expandedCardId = isExpanded ? undefined : item.id;
			this.renderTabContent();
		};
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.CLICK, onToggle));
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onToggle();
			}
		}));
	}

	// --- Skills tab ---

	private renderSkillsTab(container: HTMLElement): void {
		const items = this.getFilteredItems(GuidanceCategory.Skill);

		if (items.length === 0) {
			this.renderEmptyState(container, localize('guidance.empty.skills', "No skills match your search."));
			return;
		}

		const list = append(container, $('div.gd-card-list'));
		for (const item of items) {
			this.renderSkillCard(list, item);
		}
	}

	private renderSkillCard(container: HTMLElement, item: IGuidanceItem): void {
		const isExpanded = this.expandedCardId === item.id;
		const card = append(container, $('div.gd-card'));
		card.classList.toggle('gd-card-expanded', isExpanded);

		const cardHeader = append(card, $('div.gd-card-header'));
		cardHeader.setAttribute('role', 'button');
		cardHeader.setAttribute('tabindex', '0');
		cardHeader.setAttribute('aria-expanded', String(isExpanded));

		const titleRow = append(cardHeader, $('div.gd-card-title-row'));
		const titleEl = append(titleRow, $('span.gd-card-title'));
		titleEl.textContent = item.title;

		const chevron = append(titleRow, $('span.gd-chevron'));
		chevron.textContent = isExpanded ? '\u25BE' : '\u25B8';
		chevron.setAttribute('aria-hidden', 'true');

		const descEl = append(cardHeader, $('div.gd-card-desc'));
		descEl.textContent = item.description;

		// Tags
		if (item.tags.length > 0) {
			const tagRow = append(cardHeader, $('div.gd-tag-row'));
			for (const tag of item.tags) {
				const chip = append(tagRow, $('span.gd-tag-chip'));
				chip.textContent = tag;
			}
		}

		// Expanded detail
		if (isExpanded) {
			const detail = append(card, $('div.gd-card-detail'));
			const content = append(detail, $('div.gd-item-content'));
			content.textContent = item.content;
		}

		const onToggle = () => {
			this.expandedCardId = isExpanded ? undefined : item.id;
			this.renderTabContent();
		};
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.CLICK, onToggle));
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onToggle();
			}
		}));
	}

	// --- Agents tab ---

	private renderAgentsTab(container: HTMLElement): void {
		const roles = this.getFilteredAgentRoles();

		if (roles.length === 0) {
			this.renderEmptyState(container, localize('guidance.empty.agents', "No agent roles match your search."));
			return;
		}

		const list = append(container, $('div.gd-card-list'));
		for (const role of roles) {
			this.renderAgentCard(list, role);
		}
	}

	private renderAgentCard(container: HTMLElement, role: IAgentRole): void {
		const isExpanded = this.expandedCardId === role.id;
		const card = append(container, $('div.gd-card.gd-agent-card'));
		card.classList.toggle('gd-card-expanded', isExpanded);

		const cardHeader = append(card, $('div.gd-card-header'));
		cardHeader.setAttribute('role', 'button');
		cardHeader.setAttribute('tabindex', '0');
		cardHeader.setAttribute('aria-expanded', String(isExpanded));

		const titleRow = append(cardHeader, $('div.gd-card-title-row'));
		const titleEl = append(titleRow, $('span.gd-card-title'));
		titleEl.textContent = role.label;

		const chevron = append(titleRow, $('span.gd-chevron'));
		chevron.textContent = isExpanded ? '\u25BE' : '\u25B8';
		chevron.setAttribute('aria-hidden', 'true');

		const descEl = append(cardHeader, $('div.gd-card-desc'));
		descEl.textContent = role.description;

		const specEl = append(cardHeader, $('div.gd-agent-spec'));
		const specLabel = append(specEl, $('span.gd-agent-spec-label'));
		specLabel.textContent = localize('guidance.agent.specialisation', "Specialisation");
		const specValue = append(specEl, $('span.gd-agent-spec-value'));
		specValue.textContent = role.specialisation;

		// Expanded detail
		if (isExpanded) {
			const detail = append(card, $('div.gd-card-detail'));

			const toolsLabel = append(detail, $('div.gd-detail-section-title'));
			toolsLabel.textContent = localize('guidance.agent.tools', "Allowed Tools");

			const toolsRow = append(detail, $('div.gd-tag-row'));
			for (const tool of role.allowedTools) {
				const chip = append(toolsRow, $('span.gd-tag-chip.gd-tool-chip'));
				chip.textContent = tool;
			}
		}

		const onToggle = () => {
			this.expandedCardId = isExpanded ? undefined : role.id;
			this.renderTabContent();
		};
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.CLICK, onToggle));
		this.renderDisposables.add(addDisposableListener(cardHeader, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onToggle();
			}
		}));
	}

	// --- Helpers ---

	private renderEmptyState(container: HTMLElement, message: string): void {
		const empty = append(container, $('div.gd-empty-state'));
		const msg = append(empty, $('p.gd-empty-msg'));
		msg.textContent = message;
	}

	private getFilteredWorkflows(): readonly IWorkflowDefinition[] {
		const q = this.searchQuery.toLowerCase().trim();
		if (!q) {
			return this.guidanceService.getWorkflows();
		}
		return this.guidanceService.getWorkflows().filter(w =>
			w.title.toLowerCase().includes(q) ||
			w.description.toLowerCase().includes(q) ||
			w.phases.some(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
		);
	}

	private getFilteredItems(category: GuidanceCategory): readonly IGuidanceItem[] {
		const q = this.searchQuery.toLowerCase().trim();
		if (!q) {
			return this.guidanceService.getItemsByCategory(category);
		}
		return this.guidanceService.searchItems(q).filter(item => item.category === category);
	}

	private getFilteredAgentRoles(): readonly IAgentRole[] {
		const q = this.searchQuery.toLowerCase().trim();
		if (!q) {
			return this.guidanceService.getAgentRoles();
		}
		return this.guidanceService.getAgentRoles().filter(r =>
			r.label.toLowerCase().includes(q) ||
			r.description.toLowerCase().includes(q) ||
			r.specialisation.toLowerCase().includes(q) ||
			r.allowedTools.some(t => t.toLowerCase().includes(q))
		);
	}

}
