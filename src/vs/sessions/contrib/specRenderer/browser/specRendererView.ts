/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
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
	ISpecDocument,
	IEarsClause,
	ITaskItem,
	SpecDocumentKind,
	EarsClauseKind,
	ClauseStatus,
	TaskItemStatus,
	EARS_KEYWORDS
} from '../common/specTypes.js';

/** CSS colour constants for the Son of Anton spec renderer theme. */
const CARD_BACKGROUND = '#161616';
const CARD_BORDER = '#2A2A2A';
const EARS_KEYWORD_COLOUR = '#C8962A';
const PROGRESS_BAR_COLOUR = '#C8962A';
const STATUS_SATISFIED = '#3FB950';
const STATUS_VIOLATED = '#F85149';
const STATUS_PENDING = '#8B949E';
const STATUS_UNTESTED = '#58A6FF';
const TAB_ACTIVE_BORDER = '#C8962A';
const TAB_INACTIVE_TEXT = '#8B949E';

type SpecTab = SpecDocumentKind.Requirements | SpecDocumentKind.Design | SpecDocumentKind.Tasks;

/**
 * Renders spec documents (requirements.md, design.md, tasks.md) as structured
 * engineering objects — EARS clause cards, task checklists with dependency
 * lines, and a completion progress bar.
 */
export class SpecRendererView extends ViewPane {

	static readonly ID = 'sessions.specRenderer';
	static readonly TITLE = localize('specRenderer.title', "Spec Renderer");

	private rootContainer!: HTMLElement;
	private specHeaderContainer!: HTMLElement;
	private progressBarElement!: HTMLElement;
	private progressFillElement!: HTMLElement;
	private tabBarElement!: HTMLElement;
	private contentContainer!: HTMLElement;
	private cardListContainer!: HTMLElement;

	private activeTab: SpecTab = SpecDocumentKind.Requirements;
	private specDocument: ISpecDocument | undefined;

	private readonly viewDisposables = this._register(new DisposableStore());

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
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService,
		);
	}

	// ---- ViewPane overrides ------------------------------------------------

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.rootContainer = append(container, $('.spec-renderer'));
		this.rootContainer.style.display = 'flex';
		this.rootContainer.style.flexDirection = 'column';
		this.rootContainer.style.height = '100%';
		this.rootContainer.style.overflow = 'hidden';
		this.rootContainer.style.fontFamily = 'var(--vscode-font-family)';

		this.renderSpecHeader();
		this.renderTabBar();
		this.renderContent();
		this.renderPlaceholder();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (this.rootContainer) {
			this.rootContainer.style.height = `${height}px`;
			this.rootContainer.style.width = `${width}px`;
		}
	}

	// ---- Header with title and progress bar --------------------------------

	private renderSpecHeader(): void {
		this.specHeaderContainer = append(this.rootContainer, $('.spec-renderer-header'));
		this.specHeaderContainer.style.padding = '12px 16px 8px';
		this.specHeaderContainer.style.flexShrink = '0';

		const titleElement = append(this.specHeaderContainer, $('.spec-renderer-header-title'));
		titleElement.textContent = localize('specRenderer.documentTitle', "Spec Documents");
		titleElement.style.fontSize = '13px';
		titleElement.style.fontWeight = '600';
		titleElement.style.color = 'var(--vscode-foreground)';
		titleElement.style.marginBottom = '8px';

		// Slim progress bar
		this.progressBarElement = append(this.specHeaderContainer, $('.spec-renderer-progress'));
		this.progressBarElement.style.height = '3px';
		this.progressBarElement.style.width = '100%';
		this.progressBarElement.style.backgroundColor = CARD_BORDER;
		this.progressBarElement.style.borderRadius = '2px';
		this.progressBarElement.style.overflow = 'hidden';

		this.progressFillElement = append(this.progressBarElement, $('.spec-renderer-progress-fill'));
		this.progressFillElement.style.height = '100%';
		this.progressFillElement.style.width = '0%';
		this.progressFillElement.style.backgroundColor = PROGRESS_BAR_COLOUR;
		this.progressFillElement.style.borderRadius = '2px';
		this.progressFillElement.style.transition = 'width 0.3s ease';
	}

	// ---- Tab bar -----------------------------------------------------------

	private renderTabBar(): void {
		this.tabBarElement = append(this.rootContainer, $('.spec-renderer-tabs'));
		this.tabBarElement.style.display = 'flex';
		this.tabBarElement.style.gap = '0';
		this.tabBarElement.style.borderBottom = `1px solid ${CARD_BORDER}`;
		this.tabBarElement.style.flexShrink = '0';
		this.tabBarElement.style.padding = '0 16px';

		const tabs: { kind: SpecTab; label: string }[] = [
			{ kind: SpecDocumentKind.Requirements, label: localize('specRenderer.tab.requirements', "Requirements") },
			{ kind: SpecDocumentKind.Design, label: localize('specRenderer.tab.design', "Design") },
			{ kind: SpecDocumentKind.Tasks, label: localize('specRenderer.tab.tasks', "Tasks") },
		];

		for (const tab of tabs) {
			const tabElement = append(this.tabBarElement, $('.spec-renderer-tab'));
			tabElement.textContent = tab.label;
			tabElement.style.padding = '8px 16px';
			tabElement.style.cursor = 'pointer';
			tabElement.style.fontSize = '12px';
			tabElement.style.fontWeight = '500';
			tabElement.style.borderBottom = '2px solid transparent';
			tabElement.style.color = TAB_INACTIVE_TEXT;
			tabElement.style.userSelect = 'none';
			tabElement.dataset.tab = tab.kind;

			if (tab.kind === this.activeTab) {
				tabElement.style.color = 'var(--vscode-foreground)';
				tabElement.style.borderBottomColor = TAB_ACTIVE_BORDER;
			}

			this.viewDisposables.add(new DomClickListener(tabElement, () => {
				this.switchTab(tab.kind);
			}));
		}
	}

	private switchTab(kind: SpecTab): void {
		this.activeTab = kind;

		// Update tab styling
		const tabElements = this.tabBarElement.querySelectorAll('.spec-renderer-tab');
		for (const el of tabElements) {
			const htmlEl = el as HTMLElement;
			if (htmlEl.dataset.tab === kind) {
				htmlEl.style.color = 'var(--vscode-foreground)';
				htmlEl.style.borderBottomColor = TAB_ACTIVE_BORDER;
			} else {
				htmlEl.style.color = TAB_INACTIVE_TEXT;
				htmlEl.style.borderBottomColor = 'transparent';
			}
		}

		this.refreshContent();
	}

	// ---- Scrollable content area -------------------------------------------

	private renderContent(): void {
		this.contentContainer = append(this.rootContainer, $('.spec-renderer-content'));
		this.contentContainer.style.flex = '1';
		this.contentContainer.style.overflow = 'auto';
		this.contentContainer.style.padding = '12px 16px';

		this.cardListContainer = append(this.contentContainer, $('.spec-renderer-card-list'));
		this.cardListContainer.style.display = 'flex';
		this.cardListContainer.style.flexDirection = 'column';
		this.cardListContainer.style.gap = '8px';
	}

	// ---- Placeholder -------------------------------------------------------

	private renderPlaceholder(): void {
		const placeholder = append(this.cardListContainer, $('.spec-renderer-placeholder'));
		placeholder.style.display = 'flex';
		placeholder.style.flexDirection = 'column';
		placeholder.style.alignItems = 'center';
		placeholder.style.justifyContent = 'center';
		placeholder.style.padding = '48px 24px';
		placeholder.style.color = TAB_INACTIVE_TEXT;
		placeholder.style.textAlign = 'center';

		const icon = append(placeholder, $('.spec-renderer-placeholder-icon'));
		icon.textContent = '\u2630'; // trigram for heaven — a structured document icon
		icon.style.fontSize = '32px';
		icon.style.marginBottom = '12px';
		icon.style.opacity = '0.5';

		const title = append(placeholder, $('.spec-renderer-placeholder-title'));
		title.textContent = localize('specRenderer.placeholder.title', "No Spec Documents Loaded");
		title.style.fontSize = '13px';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';

		const subtitle = append(placeholder, $('.spec-renderer-placeholder-subtitle'));
		subtitle.textContent = localize(
			'specRenderer.placeholder.subtitle',
			"Open a requirements.md, design.md, or tasks.md file to view structured specs."
		);
		subtitle.style.fontSize = '12px';
		subtitle.style.lineHeight = '1.4';
	}

	// ---- Public API --------------------------------------------------------

	/**
	 * Set the spec document to render and refresh the view.
	 */
	setSpecDocument(specDocument: ISpecDocument): void {
		this.specDocument = specDocument;
		this.updateProgress(specDocument.completionPercent);
		this.refreshContent();
	}

	/**
	 * Clear the currently rendered spec document.
	 */
	clearSpecDocument(): void {
		this.specDocument = undefined;
		this.updateProgress(0);
		this.clearCardList();
		this.renderPlaceholderIntoCardList();
	}

	// ---- Rendering ---------------------------------------------------------

	private refreshContent(): void {
		this.clearCardList();

		if (!this.specDocument) {
			this.renderPlaceholderIntoCardList();
			return;
		}

		switch (this.activeTab) {
			case SpecDocumentKind.Requirements:
				this.renderRequirements(this.specDocument);
				break;
			case SpecDocumentKind.Design:
				this.renderDesignPlaceholder();
				break;
			case SpecDocumentKind.Tasks:
				this.renderTasks(this.specDocument);
				break;
		}
	}

	private clearCardList(): void {
		while (this.cardListContainer.firstChild) {
			this.cardListContainer.removeChild(this.cardListContainer.firstChild);
		}
	}

	private renderPlaceholderIntoCardList(): void {
		this.renderPlaceholderCard(
			localize('specRenderer.placeholder.title', "No Spec Documents Loaded"),
			localize('specRenderer.placeholder.subtitle', "Open a requirements.md, design.md, or tasks.md file to view structured specs.")
		);
	}

	private renderPlaceholderCard(title: string, subtitle: string): void {
		const placeholder = append(this.cardListContainer, $('.spec-renderer-placeholder'));
		placeholder.style.display = 'flex';
		placeholder.style.flexDirection = 'column';
		placeholder.style.alignItems = 'center';
		placeholder.style.justifyContent = 'center';
		placeholder.style.padding = '48px 24px';
		placeholder.style.color = TAB_INACTIVE_TEXT;
		placeholder.style.textAlign = 'center';

		const titleEl = append(placeholder, $('.spec-renderer-placeholder-title'));
		titleEl.textContent = title;
		titleEl.style.fontSize = '13px';
		titleEl.style.fontWeight = '600';
		titleEl.style.marginBottom = '4px';

		const subtitleEl = append(placeholder, $('.spec-renderer-placeholder-subtitle'));
		subtitleEl.textContent = subtitle;
		subtitleEl.style.fontSize = '12px';
		subtitleEl.style.lineHeight = '1.4';
	}

	// ---- Requirements view: EARS clause cards ------------------------------

	private renderRequirements(doc: ISpecDocument): void {
		if (doc.clauses.length === 0) {
			this.renderPlaceholderCard(
				localize('specRenderer.requirements.empty', "No Requirements Found"),
				localize('specRenderer.requirements.emptyDetail', "The requirements document does not contain any EARS clauses.")
			);
			return;
		}

		for (const clause of doc.clauses) {
			this.renderClauseCard(clause);
		}
	}

	private renderClauseCard(clause: IEarsClause): void {
		const card = append(this.cardListContainer, $('.spec-renderer-clause-card'));
		card.style.backgroundColor = CARD_BACKGROUND;
		card.style.border = `1px solid ${CARD_BORDER}`;
		card.style.borderRadius = '6px';
		card.style.padding = '12px 16px';
		card.style.display = 'flex';
		card.style.alignItems = 'flex-start';
		card.style.gap = '12px';

		// Status indicator
		const statusDot = append(card, $('.spec-renderer-clause-status'));
		statusDot.style.width = '10px';
		statusDot.style.height = '10px';
		statusDot.style.borderRadius = '50%';
		statusDot.style.flexShrink = '0';
		statusDot.style.marginTop = '4px';
		statusDot.style.backgroundColor = this.getClauseStatusColour(clause.status);

		const statusLabel = this.getClauseStatusLabel(clause.status);
		statusDot.title = statusLabel;

		// Card body
		const body = append(card, $('.spec-renderer-clause-body'));
		body.style.flex = '1';
		body.style.minWidth = '0';

		// Clause kind badge
		const kindBadge = append(body, $('.spec-renderer-clause-kind'));
		kindBadge.textContent = this.getClauseKindLabel(clause.kind);
		kindBadge.style.display = 'inline-block';
		kindBadge.style.fontSize = '10px';
		kindBadge.style.fontWeight = '600';
		kindBadge.style.textTransform = 'uppercase';
		kindBadge.style.letterSpacing = '0.05em';
		kindBadge.style.color = EARS_KEYWORD_COLOUR;
		kindBadge.style.marginBottom = '6px';

		// Clause text with highlighted EARS keywords
		const textContainer = append(body, $('.spec-renderer-clause-text'));
		textContainer.style.fontSize = '12px';
		textContainer.style.lineHeight = '1.5';
		textContainer.style.color = 'var(--vscode-foreground)';
		this.renderClauseText(textContainer, clause.rawText);

		// Status label
		const statusBadge = append(body, $('.spec-renderer-clause-status-badge'));
		statusBadge.textContent = statusLabel;
		statusBadge.style.display = 'inline-block';
		statusBadge.style.fontSize = '10px';
		statusBadge.style.fontWeight = '500';
		statusBadge.style.marginTop = '8px';
		statusBadge.style.padding = '2px 8px';
		statusBadge.style.borderRadius = '10px';
		statusBadge.style.backgroundColor = this.getClauseStatusColour(clause.status) + '22';
		statusBadge.style.color = this.getClauseStatusColour(clause.status);
	}

	/**
	 * Render clause text with EARS keywords highlighted in muted amber.
	 */
	private renderClauseText(container: HTMLElement, rawText: string): void {
		// Build a regex that matches any EARS keyword as a whole word.
		// Sort by length descending so "THE SYSTEM SHALL" matches before "SHALL".
		const sorted = [...EARS_KEYWORDS].sort((a, b) => b.length - a.length);
		const pattern = new RegExp(`\\b(${sorted.join('|')})\\b`, 'g');

		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(rawText)) !== null) {
			// Text before the keyword
			if (match.index > lastIndex) {
				container.appendChild(document.createTextNode(rawText.slice(lastIndex, match.index)));
			}

			// Highlighted keyword
			const keyword = append(container, $('span.spec-renderer-ears-keyword'));
			keyword.textContent = match[0];
			keyword.style.color = EARS_KEYWORD_COLOUR;
			keyword.style.fontWeight = '600';

			lastIndex = pattern.lastIndex;
		}

		// Remaining text
		if (lastIndex < rawText.length) {
			container.appendChild(document.createTextNode(rawText.slice(lastIndex)));
		}
	}

	private getClauseStatusColour(status: ClauseStatus): string {
		switch (status) {
			case ClauseStatus.Satisfied: return STATUS_SATISFIED;
			case ClauseStatus.Violated: return STATUS_VIOLATED;
			case ClauseStatus.Pending: return STATUS_PENDING;
			case ClauseStatus.Untested: return STATUS_UNTESTED;
		}
	}

	private getClauseStatusLabel(status: ClauseStatus): string {
		switch (status) {
			case ClauseStatus.Satisfied: return localize('specRenderer.status.satisfied', "Satisfied");
			case ClauseStatus.Violated: return localize('specRenderer.status.violated', "Violated");
			case ClauseStatus.Pending: return localize('specRenderer.status.pending', "Pending");
			case ClauseStatus.Untested: return localize('specRenderer.status.untested', "Untested");
		}
	}

	private getClauseKindLabel(kind: EarsClauseKind): string {
		switch (kind) {
			case EarsClauseKind.Event: return localize('specRenderer.kind.event', "Event-Driven");
			case EarsClauseKind.State: return localize('specRenderer.kind.state', "State-Driven");
			case EarsClauseKind.Feature: return localize('specRenderer.kind.feature', "Feature");
			case EarsClauseKind.Option: return localize('specRenderer.kind.option', "Optional");
			case EarsClauseKind.Ubiquitous: return localize('specRenderer.kind.ubiquitous', "Ubiquitous");
		}
	}

	// ---- Design view (placeholder for now) ---------------------------------

	private renderDesignPlaceholder(): void {
		this.renderPlaceholderCard(
			localize('specRenderer.design.placeholder', "Design View"),
			localize('specRenderer.design.placeholderDetail', "The design document renderer is under development.")
		);
	}

	// ---- Tasks view: checklist with dependency lines -----------------------

	private renderTasks(doc: ISpecDocument): void {
		if (doc.tasks.length === 0) {
			this.renderPlaceholderCard(
				localize('specRenderer.tasks.empty', "No Tasks Found"),
				localize('specRenderer.tasks.emptyDetail', "The tasks document does not contain any implementation steps.")
			);
			return;
		}

		const taskMap = new Map<string, ITaskItem>();
		for (const task of doc.tasks) {
			taskMap.set(task.id, task);
		}

		for (const task of doc.tasks) {
			this.renderTaskCard(task, taskMap);
		}
	}

	private renderTaskCard(task: ITaskItem, taskMap: Map<string, ITaskItem>): void {
		const card = append(this.cardListContainer, $('.spec-renderer-task-card'));
		card.style.backgroundColor = CARD_BACKGROUND;
		card.style.border = `1px solid ${CARD_BORDER}`;
		card.style.borderRadius = '6px';
		card.style.padding = '10px 16px';
		card.style.display = 'flex';
		card.style.alignItems = 'flex-start';
		card.style.gap = '10px';
		card.style.position = 'relative';
		card.dataset.taskId = task.id;

		const isDone = task.status === TaskItemStatus.Done;

		// Checkbox
		const checkbox = append(card, $('.spec-renderer-task-checkbox'));
		checkbox.style.width = '16px';
		checkbox.style.height = '16px';
		checkbox.style.borderRadius = '3px';
		checkbox.style.border = `1px solid ${isDone ? STATUS_SATISFIED : CARD_BORDER}`;
		checkbox.style.backgroundColor = isDone ? STATUS_SATISFIED : 'transparent';
		checkbox.style.flexShrink = '0';
		checkbox.style.marginTop = '1px';
		checkbox.style.display = 'flex';
		checkbox.style.alignItems = 'center';
		checkbox.style.justifyContent = 'center';
		checkbox.style.fontSize = '11px';
		checkbox.style.color = CARD_BACKGROUND;

		if (isDone) {
			checkbox.textContent = '\u2713'; // checkmark
		}

		// Task body
		const body = append(card, $('.spec-renderer-task-body'));
		body.style.flex = '1';
		body.style.minWidth = '0';

		// Title row
		const titleRow = append(body, $('.spec-renderer-task-title-row'));
		titleRow.style.display = 'flex';
		titleRow.style.alignItems = 'center';
		titleRow.style.gap = '8px';

		const titleEl = append(titleRow, $('.spec-renderer-task-title'));
		titleEl.textContent = task.title;
		titleEl.style.fontSize = '12px';
		titleEl.style.fontWeight = '500';
		titleEl.style.color = 'var(--vscode-foreground)';

		if (isDone) {
			titleEl.style.textDecoration = 'line-through';
			titleEl.style.opacity = '0.6';
		}

		// Agent attribution badge
		if (task.agentAttribution) {
			const badge = append(titleRow, $('.spec-renderer-task-agent-badge'));
			badge.textContent = task.agentAttribution;
			badge.style.fontSize = '10px';
			badge.style.fontWeight = '500';
			badge.style.padding = '1px 6px';
			badge.style.borderRadius = '10px';
			badge.style.backgroundColor = EARS_KEYWORD_COLOUR + '22';
			badge.style.color = EARS_KEYWORD_COLOUR;
			badge.style.whiteSpace = 'nowrap';
		}

		// Description (collapsed for done tasks)
		if (task.description && !isDone) {
			const descEl = append(body, $('.spec-renderer-task-description'));
			descEl.textContent = task.description;
			descEl.style.fontSize = '11px';
			descEl.style.color = TAB_INACTIVE_TEXT;
			descEl.style.marginTop = '4px';
			descEl.style.lineHeight = '1.4';
		}

		// Status badge
		const statusBadge = append(body, $('.spec-renderer-task-status'));
		statusBadge.textContent = this.getTaskStatusLabel(task.status);
		statusBadge.style.display = 'inline-block';
		statusBadge.style.fontSize = '10px';
		statusBadge.style.fontWeight = '500';
		statusBadge.style.marginTop = '6px';
		statusBadge.style.padding = '2px 8px';
		statusBadge.style.borderRadius = '10px';
		statusBadge.style.backgroundColor = this.getTaskStatusColour(task.status) + '22';
		statusBadge.style.color = this.getTaskStatusColour(task.status);

		// Dependency lines indicator
		if (task.dependsOn.length > 0) {
			const depsContainer = append(body, $('.spec-renderer-task-deps'));
			depsContainer.style.marginTop = '6px';
			depsContainer.style.display = 'flex';
			depsContainer.style.alignItems = 'center';
			depsContainer.style.gap = '4px';
			depsContainer.style.fontSize = '10px';
			depsContainer.style.color = TAB_INACTIVE_TEXT;

			// Connecting line symbol
			const lineSymbol = append(depsContainer, $('span'));
			lineSymbol.textContent = '\u2514'; // box drawings light up and right
			lineSymbol.style.color = CARD_BORDER;

			const depLabel = append(depsContainer, $('span'));
			const depNames = task.dependsOn
				.map(id => taskMap.get(id)?.title ?? id)
				.join(', ');
			depLabel.textContent = localize('specRenderer.task.dependsOn', "depends on: {0}", depNames);
		}
	}

	private getTaskStatusColour(status: TaskItemStatus): string {
		switch (status) {
			case TaskItemStatus.Done: return STATUS_SATISFIED;
			case TaskItemStatus.InProgress: return EARS_KEYWORD_COLOUR;
			case TaskItemStatus.Todo: return STATUS_PENDING;
			case TaskItemStatus.Skipped: return TAB_INACTIVE_TEXT;
		}
	}

	private getTaskStatusLabel(status: TaskItemStatus): string {
		switch (status) {
			case TaskItemStatus.Done: return localize('specRenderer.taskStatus.done', "Done");
			case TaskItemStatus.InProgress: return localize('specRenderer.taskStatus.inProgress', "In Progress");
			case TaskItemStatus.Todo: return localize('specRenderer.taskStatus.todo', "To Do");
			case TaskItemStatus.Skipped: return localize('specRenderer.taskStatus.skipped', "Skipped");
		}
	}

	// ---- Progress bar ------------------------------------------------------

	private updateProgress(percent: number): void {
		if (this.progressFillElement) {
			const clamped = Math.max(0, Math.min(100, percent));
			this.progressFillElement.style.width = `${clamped}%`;
		}
	}
}

/**
 * Lightweight disposable wrapper around a DOM click listener.
 */
class DomClickListener extends Disposable {
	constructor(element: HTMLElement, handler: () => void) {
		super();
		element.addEventListener('click', handler);
		this._register({
			dispose: () => element.removeEventListener('click', handler),
		});
	}
}
