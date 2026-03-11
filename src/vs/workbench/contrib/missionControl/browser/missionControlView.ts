/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as nls from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import {
	IMissionControlTicket,
	TicketStatus,
	TicketType,
	TicketPriority,
	ITicketFilter,
} from '../common/missionControlTypes.js';
import { IMissionControlService } from './missionControlService.js';

// --- Constants ---------------------------------------------------------------

/**
 * The five kanban columns rendered in the board. Paused tickets are folded
 * into the Queued column visually — only five swim-lanes are shown.
 */
const KANBAN_COLUMNS: ReadonlyArray<{ readonly status: TicketStatus; readonly label: string; readonly color: string }> = [
	{ status: TicketStatus.Queued, label: nls.localize('missionControl.column.queued', "Queued"), color: '#6B7280' },
	{ status: TicketStatus.Running, label: nls.localize('missionControl.column.running', "Running"), color: '#3B82F6' },
	{ status: TicketStatus.Review, label: nls.localize('missionControl.column.review', "Review"), color: '#F59E0B' },
	{ status: TicketStatus.Complete, label: nls.localize('missionControl.column.complete', "Complete"), color: '#10B981' },
	{ status: TicketStatus.Failed, label: nls.localize('missionControl.column.failed', "Failed"), color: '#EF4444' },
];

/** Map from TicketType to a display label and badge color. */
const TICKET_TYPE_META: Record<string, { readonly label: string; readonly color: string }> = {
	[TicketType.Epic]: { label: 'Epic', color: '#8B5CF6' },
	[TicketType.Story]: { label: 'Story', color: '#3B82F6' },
	[TicketType.Subtask]: { label: 'Subtask', color: '#6B7280' },
	[TicketType.Bug]: { label: 'Bug', color: '#EF4444' },
	[TicketType.Spike]: { label: 'Spike', color: '#EC4899' },
};

/** Map from TicketPriority to a color for the priority indicator dot. */
const PRIORITY_COLORS: Record<string, string> = {
	[TicketPriority.Critical]: '#EF4444',
	[TicketPriority.High]: '#F97316',
	[TicketPriority.Medium]: '#F59E0B',
	[TicketPriority.Low]: '#6B7280',
};

/** Map from TicketPriority to a localized label. */
const PRIORITY_LABELS: Record<string, string> = {
	[TicketPriority.Critical]: nls.localize('missionControl.priority.critical', "Critical"),
	[TicketPriority.High]: nls.localize('missionControl.priority.high', "High"),
	[TicketPriority.Medium]: nls.localize('missionControl.priority.medium', "Medium"),
	[TicketPriority.Low]: nls.localize('missionControl.priority.low', "Low"),
};

// --- Inline styles -----------------------------------------------------------

/**
 * Returns the full CSS text for the Mission Control kanban board.
 * Injected into a `<style>` element inside the view body so that no
 * external stylesheet is needed (standard pattern for VS Code views
 * that are not webviews).
 */
function getMissionControlStyles(): string {
	return /* css */`
		/* ---- Board layout ---- */

		.mc-board-root {
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow: hidden;
			background: #0D0D0D;
			font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: #E5E5E5;
		}

		/* ---- Filter bar ---- */

		.mc-filter-bar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			background: #111111;
			border-bottom: 1px solid #2A2A2A;
			flex-shrink: 0;
		}

		.mc-filter-bar-search {
			flex: 1;
			min-width: 120px;
			max-width: 320px;
			padding: 4px 8px;
			border: 1px solid #2A2A2A;
			border-radius: 4px;
			background: #161616;
			color: #E5E5E5;
			font-size: 12px;
			outline: none;
		}

		.mc-filter-bar-search:focus {
			border-color: #F5A623;
		}

		.mc-filter-bar-search::placeholder {
			color: #6B7280;
		}

		.mc-filter-select {
			padding: 4px 8px;
			border: 1px solid #2A2A2A;
			border-radius: 4px;
			background: #161616;
			color: #E5E5E5;
			font-size: 12px;
			outline: none;
			cursor: pointer;
		}

		.mc-filter-select:focus {
			border-color: #F5A623;
		}

		.mc-filter-bar-actions {
			display: flex;
			align-items: center;
			gap: 4px;
			margin-left: auto;
		}

		.mc-btn {
			padding: 4px 12px;
			border: 1px solid #2A2A2A;
			border-radius: 4px;
			background: #161616;
			color: #E5E5E5;
			font-size: 12px;
			cursor: pointer;
			white-space: nowrap;
		}

		.mc-btn:hover {
			background: #1E1E1E;
			border-color: #F5A623;
		}

		.mc-btn-primary {
			background: #F5A623;
			color: #0D0D0D;
			border-color: #F5A623;
			font-weight: 600;
		}

		.mc-btn-primary:hover {
			background: #D4911E;
			border-color: #D4911E;
		}

		/* ---- Columns container ---- */

		.mc-columns-container {
			display: flex;
			flex: 1;
			overflow-x: auto;
			overflow-y: hidden;
			padding: 8px;
			gap: 8px;
		}

		/* ---- Single column ---- */

		.mc-column {
			display: flex;
			flex-direction: column;
			min-width: 260px;
			max-width: 340px;
			flex: 1;
			background: #111111;
			border-radius: 6px;
			overflow: hidden;
		}

		.mc-column-header {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 12px;
			border-bottom: 1px solid #2A2A2A;
			flex-shrink: 0;
		}

		.mc-column-color-indicator {
			width: 4px;
			height: 18px;
			border-radius: 2px;
			flex-shrink: 0;
		}

		.mc-column-title {
			font-weight: 600;
			font-size: 13px;
			flex: 1;
		}

		.mc-column-count {
			font-size: 11px;
			color: #6B7280;
			background: #1E1E1E;
			padding: 1px 7px;
			border-radius: 10px;
			flex-shrink: 0;
		}

		.mc-column-tickets {
			flex: 1;
			overflow-y: auto;
			padding: 8px;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		.mc-column-tickets::-webkit-scrollbar {
			width: 4px;
		}

		.mc-column-tickets::-webkit-scrollbar-thumb {
			background: #2A2A2A;
			border-radius: 2px;
		}

		.mc-column-empty {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 24px 12px;
			color: #4B5563;
			font-size: 12px;
			font-style: italic;
		}

		/* ---- Ticket card ---- */

		.mc-card {
			background: #161616;
			border: 1px solid #2A2A2A;
			border-radius: 6px;
			padding: 10px 12px;
			cursor: pointer;
			transition: border-color 0.15s ease, box-shadow 0.15s ease;
		}

		.mc-card:hover {
			border-color: #F5A623;
			box-shadow: 0 0 6px rgba(245, 166, 35, 0.15);
		}

		.mc-card:focus {
			outline: 2px solid #F5A623;
			outline-offset: -2px;
		}

		.mc-card-header {
			display: flex;
			align-items: flex-start;
			gap: 6px;
			margin-bottom: 6px;
		}

		.mc-card-priority-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex-shrink: 0;
			margin-top: 4px;
		}

		.mc-card-title {
			font-weight: 600;
			font-size: 13px;
			line-height: 1.3;
			flex: 1;
			overflow: hidden;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
		}

		.mc-card-id {
			font-size: 10px;
			color: #6B7280;
			margin-bottom: 6px;
		}

		/* ---- Badges row ---- */

		.mc-card-badges {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			margin-bottom: 6px;
		}

		.mc-badge {
			display: inline-block;
			padding: 1px 6px;
			border-radius: 3px;
			font-size: 10px;
			font-weight: 600;
			line-height: 16px;
		}

		.mc-badge-type {
			color: #FFFFFF;
		}

		.mc-badge-model {
			background: #1E293B;
			color: #93C5FD;
		}

		.mc-badge-blocked {
			background: #451A1A;
			color: #FCA5A5;
		}

		/* ---- Card metadata ---- */

		.mc-card-meta {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 11px;
			color: #6B7280;
			margin-top: 4px;
		}

		.mc-card-meta-item {
			display: flex;
			align-items: center;
			gap: 3px;
			white-space: nowrap;
		}

		.mc-card-agent {
			display: flex;
			align-items: center;
			gap: 4px;
			font-size: 11px;
			color: #9CA3AF;
			margin-bottom: 4px;
		}

		.mc-card-agent-icon {
			width: 14px;
			height: 14px;
			border-radius: 50%;
			background: #2A2A2A;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 9px;
			color: #F5A623;
		}

		/* ---- Labels ---- */

		.mc-card-labels {
			display: flex;
			flex-wrap: wrap;
			gap: 3px;
			margin-top: 6px;
		}

		.mc-label-tag {
			display: inline-block;
			padding: 0 5px;
			border-radius: 3px;
			font-size: 10px;
			line-height: 16px;
			background: #1E1E1E;
			color: #9CA3AF;
			border: 1px solid #2A2A2A;
		}

		/* ---- Summary bar ---- */

		.mc-summary-bar {
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 6px 12px;
			background: #111111;
			border-top: 1px solid #2A2A2A;
			font-size: 11px;
			color: #6B7280;
			flex-shrink: 0;
		}

		.mc-summary-item {
			display: flex;
			align-items: center;
			gap: 4px;
		}

		.mc-summary-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
		}
	`;
}

// --- Helper functions --------------------------------------------------------

/**
 * Formats a duration in milliseconds to a human-readable elapsed time string.
 */
function formatElapsed(ms: number): string {
	if (ms < 1000) {
		return nls.localize('missionControl.elapsed.lessThanSec', "<1s");
	}
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) {
		return nls.localize('missionControl.elapsed.seconds', "{0}s", totalSeconds);
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) {
		return seconds > 0
			? nls.localize('missionControl.elapsed.minSec', "{0}m {1}s", minutes, seconds)
			: nls.localize('missionControl.elapsed.min', "{0}m", minutes);
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return nls.localize('missionControl.elapsed.hourMin', "{0}h {1}m", hours, remainingMinutes);
}

/**
 * Formats a USD cost value for display.
 */
function formatCost(usd: number): string {
	if (usd === 0) {
		return '$0.00';
	}
	if (usd < 0.01) {
		return '<$0.01';
	}
	return `$${usd.toFixed(2)}`;
}

// --- Card DOM builder --------------------------------------------------------

/**
 * Builds a single ticket card DOM element.
 */
function renderTicketCard(ticket: IMissionControlTicket, disposables: DisposableStore, onCardClick: (ticket: IMissionControlTicket) => void): HTMLElement {
	const card = $('div.mc-card');
	card.tabIndex = 0;
	card.setAttribute('role', 'listitem');
	card.setAttribute('aria-label', nls.localize(
		'missionControl.card.ariaLabel',
		"{0}, {1}, priority {2}",
		ticket.id,
		ticket.title,
		PRIORITY_LABELS[ticket.priority] ?? ticket.priority
	));
	card.dataset.ticketId = ticket.id;

	// Click / keyboard handler
	disposables.add(addDisposableListener(card, EventType.CLICK, () => onCardClick(ticket)));
	disposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onCardClick(ticket);
		}
	}));

	// --- Header (priority dot + title) ---
	const header = append(card, $('div.mc-card-header'));

	const priorityDot = append(header, $('div.mc-card-priority-dot'));
	priorityDot.style.backgroundColor = PRIORITY_COLORS[ticket.priority] ?? '#6B7280';
	priorityDot.title = PRIORITY_LABELS[ticket.priority] ?? '';

	const title = append(header, $('div.mc-card-title'));
	title.textContent = ticket.title;

	// --- Ticket ID ---
	const idLine = append(card, $('div.mc-card-id'));
	idLine.textContent = ticket.id;

	// --- Badges (type + model + blocked) ---
	const badges = append(card, $('div.mc-card-badges'));

	const typeMeta = TICKET_TYPE_META[ticket.type];
	if (typeMeta) {
		const typeBadge = append(badges, $('span.mc-badge.mc-badge-type'));
		typeBadge.textContent = typeMeta.label;
		typeBadge.style.backgroundColor = typeMeta.color;
	}

	if (ticket.modelUsed) {
		const modelBadge = append(badges, $('span.mc-badge.mc-badge-model'));
		modelBadge.textContent = ticket.modelUsed;
	}

	if (ticket.blockedBy.length > 0) {
		const blockedBadge = append(badges, $('span.mc-badge.mc-badge-blocked'));
		blockedBadge.textContent = nls.localize('missionControl.badge.blocked', "Blocked ({0})", ticket.blockedBy.length);
	}

	// --- Assigned agent ---
	if (ticket.assignedAgent) {
		const agentRow = append(card, $('div.mc-card-agent'));
		const agentIcon = append(agentRow, $('div.mc-card-agent-icon'));
		agentIcon.textContent = ticket.assignedAgent.charAt(0).toUpperCase();
		const agentName = append(agentRow, $('span'));
		agentName.textContent = ticket.assignedAgent;
	}

	// --- Cost / elapsed metadata ---
	if (ticket.totalCostUsd > 0 || ticket.elapsedMs > 0) {
		const meta = append(card, $('div.mc-card-meta'));

		if (ticket.totalCostUsd > 0) {
			const costItem = append(meta, $('span.mc-card-meta-item'));
			costItem.textContent = formatCost(ticket.totalCostUsd);
		}

		if (ticket.elapsedMs > 0) {
			const timeItem = append(meta, $('span.mc-card-meta-item'));
			timeItem.textContent = formatElapsed(ticket.elapsedMs);
		}

		const tokenTotal = ticket.totalTokensIn + ticket.totalTokensOut;
		if (tokenTotal > 0) {
			const tokenItem = append(meta, $('span.mc-card-meta-item'));
			tokenItem.textContent = nls.localize('missionControl.meta.tokens', "{0} tok", tokenTotal.toLocaleString());
		}
	}

	// --- Labels ---
	if (ticket.labels.length > 0) {
		const labelsContainer = append(card, $('div.mc-card-labels'));
		for (const label of ticket.labels) {
			const tag = append(labelsContainer, $('span.mc-label-tag'));
			tag.textContent = label;
		}
	}

	return card;
}

// --- Column DOM builder ------------------------------------------------------

/**
 * Builds a single kanban column, including header and the scrollable ticket list.
 */
function renderColumn(
	columnDef: { readonly status: TicketStatus; readonly label: string; readonly color: string },
	tickets: readonly IMissionControlTicket[],
	disposables: DisposableStore,
	onCardClick: (ticket: IMissionControlTicket) => void,
): HTMLElement {
	const column = $('div.mc-column');
	column.setAttribute('role', 'group');
	column.setAttribute('aria-label', columnDef.label);

	// --- Column header ---
	const header = append(column, $('div.mc-column-header'));

	const colorBar = append(header, $('div.mc-column-color-indicator'));
	colorBar.style.backgroundColor = columnDef.color;

	const titleEl = append(header, $('span.mc-column-title'));
	titleEl.textContent = columnDef.label;

	const countEl = append(header, $('span.mc-column-count'));
	countEl.textContent = String(tickets.length);

	// --- Ticket list ---
	const ticketList = append(column, $('div.mc-column-tickets'));
	ticketList.setAttribute('role', 'list');

	if (tickets.length === 0) {
		const empty = append(ticketList, $('div.mc-column-empty'));
		empty.textContent = nls.localize('missionControl.column.empty', "No tickets");
	} else {
		for (const ticket of tickets) {
			const cardEl = renderTicketCard(ticket, disposables, onCardClick);
			append(ticketList, cardEl);
		}
	}

	return column;
}

// --- Events ------------------------------------------------------------------

/**
 * Fired when the user clicks a ticket card.
 */
export interface IMissionControlViewEvents {
	readonly onDidSelectTicket: Event<IMissionControlTicket>;
	readonly onDidRequestNewTicket: Event<void>;
	readonly onDidChangeFilter: Event<ITicketFilter>;
}

// =============================================================================
// MissionControlView
// =============================================================================

/**
 * The main kanban board view for Son of Anton's Mission Control surface.
 *
 * Renders task tickets in five swim-lane columns (Queued, Running, Review,
 * Complete, Failed) using pure DOM manipulation following VS Code conventions.
 */
export class MissionControlView extends ViewPane {

	static readonly ID = 'workbench.view.soaMissionControl';

	// --- Events ---

	private readonly _onDidSelectTicket = this._register(new Emitter<IMissionControlTicket>());
	readonly onDidSelectTicket: Event<IMissionControlTicket> = this._onDidSelectTicket.event;

	private readonly _onDidRequestNewTicket = this._register(new Emitter<void>());
	readonly onDidRequestNewTicket: Event<void> = this._onDidRequestNewTicket.event;

	private readonly _onDidChangeFilter = this._register(new Emitter<ITicketFilter>());
	readonly onDidChangeFilter: Event<ITicketFilter> = this._onDidChangeFilter.event;

	// --- DOM elements ---

	private boardRoot: HTMLElement | undefined;
	private filterBar: HTMLElement | undefined;
	private columnsContainer: HTMLElement | undefined;
	private summaryBar: HTMLElement | undefined;
	private styleElement: HTMLStyleElement | undefined;

	// --- Filter state ---

	private currentFilter: ITicketFilter = {};
	private searchInput: HTMLInputElement | undefined;
	private typeSelect: HTMLSelectElement | undefined;
	private prioritySelect: HTMLSelectElement | undefined;

	// --- Render state ---

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly cardElements = new Map<string, HTMLElement>();

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
		@IMissionControlService private readonly missionControlService: IMissionControlService,
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

		// Re-render the entire board when the board structure changes
		this._register(this.missionControlService.onDidChangeBoard(() => this.renderBoard()));

		// Patch a single card when a ticket is updated
		this._register(this.missionControlService.onDidChangeTicket(ticket => this.updateCard(ticket)));
	}

	// --- ViewPane overrides ---------------------------------------------------

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Inject styles
		this.styleElement = document.createElement('style');
		this.styleElement.textContent = getMissionControlStyles();
		container.appendChild(this.styleElement);

		// Build root
		this.boardRoot = append(container, $('div.mc-board-root'));
		this.boardRoot.setAttribute('role', 'region');
		this.boardRoot.setAttribute('aria-label', nls.localize('missionControl.board.ariaLabel', "Mission Control Board"));

		// Filter bar
		this.filterBar = this.createFilterBar();
		append(this.boardRoot, this.filterBar);

		// Columns container
		this.columnsContainer = append(this.boardRoot, $('div.mc-columns-container'));

		// Summary bar
		this.summaryBar = append(this.boardRoot, $('div.mc-summary-bar'));

		// Initial render
		this.renderBoard();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (this.boardRoot) {
			this.boardRoot.style.height = `${height}px`;
			this.boardRoot.style.width = `${width}px`;
		}
	}

	// --- Filter bar -----------------------------------------------------------

	private createFilterBar(): HTMLElement {
		const bar = $('div.mc-filter-bar');

		// Search input
		this.searchInput = document.createElement('input');
		this.searchInput.type = 'text';
		this.searchInput.className = 'mc-filter-bar-search';
		this.searchInput.placeholder = nls.localize('missionControl.filter.searchPlaceholder', "Search tickets\u2026");
		this.searchInput.setAttribute('aria-label', nls.localize('missionControl.filter.searchAriaLabel', "Search tickets by title, description, or ID"));
		append(bar, this.searchInput);

		this._register(addDisposableListener(this.searchInput, EventType.INPUT, () => {
			this.currentFilter.searchText = this.searchInput!.value || undefined;
			this.applyFilter();
		}));

		// Type filter
		this.typeSelect = document.createElement('select');
		this.typeSelect.className = 'mc-filter-select';
		this.typeSelect.setAttribute('aria-label', nls.localize('missionControl.filter.typeAriaLabel', "Filter by ticket type"));

		const typeAllOption = document.createElement('option');
		typeAllOption.value = '';
		typeAllOption.textContent = nls.localize('missionControl.filter.allTypes', "All Types");
		this.typeSelect.appendChild(typeAllOption);

		for (const [typeValue, meta] of Object.entries(TICKET_TYPE_META)) {
			const opt = document.createElement('option');
			opt.value = typeValue;
			opt.textContent = meta.label;
			this.typeSelect.appendChild(opt);
		}
		append(bar, this.typeSelect);

		this._register(addDisposableListener(this.typeSelect, EventType.CHANGE, () => {
			const val = this.typeSelect!.value;
			this.currentFilter.type = val ? [val as TicketType] : undefined;
			this.applyFilter();
		}));

		// Priority filter
		this.prioritySelect = document.createElement('select');
		this.prioritySelect.className = 'mc-filter-select';
		this.prioritySelect.setAttribute('aria-label', nls.localize('missionControl.filter.priorityAriaLabel', "Filter by priority"));

		const prioAllOption = document.createElement('option');
		prioAllOption.value = '';
		prioAllOption.textContent = nls.localize('missionControl.filter.allPriorities', "All Priorities");
		this.prioritySelect.appendChild(prioAllOption);

		for (const [prioValue, label] of Object.entries(PRIORITY_LABELS)) {
			const opt = document.createElement('option');
			opt.value = prioValue;
			opt.textContent = label;
			this.prioritySelect.appendChild(opt);
		}
		append(bar, this.prioritySelect);

		this._register(addDisposableListener(this.prioritySelect, EventType.CHANGE, () => {
			const val = this.prioritySelect!.value;
			this.currentFilter.priority = val ? [val as TicketPriority] : undefined;
			this.applyFilter();
		}));

		// Actions area (right side)
		const actions = append(bar, $('div.mc-filter-bar-actions'));

		// Clear filters button
		const clearBtn = append(actions, $('button.mc-btn'));
		clearBtn.textContent = nls.localize('missionControl.filter.clear', "Clear Filters");
		clearBtn.setAttribute('aria-label', nls.localize('missionControl.filter.clearAriaLabel', "Clear all filters"));
		this._register(addDisposableListener(clearBtn, EventType.CLICK, () => this.clearFilters()));

		// New ticket button
		const newTicketBtn = append(actions, $('button.mc-btn.mc-btn-primary'));
		newTicketBtn.textContent = nls.localize('missionControl.action.newTicket', "New Ticket");
		newTicketBtn.setAttribute('aria-label', nls.localize('missionControl.action.newTicketAriaLabel', "Create a new ticket"));
		this._register(addDisposableListener(newTicketBtn, EventType.CLICK, () => {
			this._onDidRequestNewTicket.fire();
		}));

		return bar;
	}

	// --- Filter logic ---------------------------------------------------------

	private applyFilter(): void {
		this._onDidChangeFilter.fire({ ...this.currentFilter });
		this.renderBoard();
	}

	private clearFilters(): void {
		this.currentFilter = {};
		if (this.searchInput) {
			this.searchInput.value = '';
		}
		if (this.typeSelect) {
			this.typeSelect.value = '';
		}
		if (this.prioritySelect) {
			this.prioritySelect.value = '';
		}
		this.applyFilter();
	}

	/**
	 * Tests whether a ticket passes the current filter.
	 */
	private matchesFilter(ticket: IMissionControlTicket): boolean {
		const filter = this.currentFilter;

		if (filter.type && filter.type.length > 0 && !filter.type.includes(ticket.type)) {
			return false;
		}
		if (filter.priority && filter.priority.length > 0 && !filter.priority.includes(ticket.priority)) {
			return false;
		}
		if (filter.labels && filter.labels.length > 0) {
			if (!filter.labels.some(l => ticket.labels.includes(l))) {
				return false;
			}
		}
		if (filter.assignedAgent !== undefined && ticket.assignedAgent !== filter.assignedAgent) {
			return false;
		}
		if (filter.searchText) {
			const lower = filter.searchText.toLowerCase();
			const inTitle = ticket.title.toLowerCase().includes(lower);
			const inDesc = ticket.description.toLowerCase().includes(lower);
			const inId = ticket.id.toLowerCase().includes(lower);
			if (!inTitle && !inDesc && !inId) {
				return false;
			}
		}
		return true;
	}

	// --- Full board render ----------------------------------------------------

	/**
	 * Clears and re-renders the entire board from the current service state.
	 */
	private renderBoard(): void {
		if (!this.columnsContainer || !this.summaryBar) {
			return;
		}

		// Dispose previous card listeners
		this.renderDisposables.clear();
		this.cardElements.clear();

		// Clear columns container
		this.columnsContainer.textContent = '';

		const board = this.missionControlService.board;
		let totalTickets = 0;
		let totalCost = 0;
		let runningCount = 0;

		for (const columnDef of KANBAN_COLUMNS) {
			const boardColumn = board.columns.find(c => c.status === columnDef.status);
			const rawTickets = boardColumn ? boardColumn.tickets : [];

			// Apply filter
			const filteredTickets = rawTickets.filter(t => this.matchesFilter(t));

			totalTickets += filteredTickets.length;
			for (const t of filteredTickets) {
				totalCost += t.totalCostUsd;
				if (t.status === TicketStatus.Running) {
					runningCount++;
				}
			}

			const columnEl = renderColumn(
				columnDef,
				filteredTickets,
				this.renderDisposables,
				ticket => this._onDidSelectTicket.fire(ticket),
			);

			append(this.columnsContainer, columnEl);

			// Track card elements for incremental updates
			const cards = columnEl.querySelectorAll('.mc-card');
			for (const cardEl of cards) {
				const ticketId = (cardEl as HTMLElement).dataset.ticketId;
				if (ticketId) {
					this.cardElements.set(ticketId, cardEl as HTMLElement);
				}
			}
		}

		// Update summary bar
		this.renderSummaryBar(totalTickets, runningCount, totalCost);
	}

	// --- Summary bar ----------------------------------------------------------

	private renderSummaryBar(totalTickets: number, runningCount: number, totalCost: number): void {
		if (!this.summaryBar) {
			return;
		}
		this.summaryBar.textContent = '';

		// Total tickets
		const totalItem = append(this.summaryBar, $('span.mc-summary-item'));
		totalItem.textContent = nls.localize('missionControl.summary.total', "Total: {0}", totalTickets);

		// Running
		const runningItem = append(this.summaryBar, $('span.mc-summary-item'));
		const runningDot = append(runningItem, $('span.mc-summary-dot'));
		runningDot.style.backgroundColor = '#3B82F6';
		const runningLabel = append(runningItem, $('span'));
		runningLabel.textContent = nls.localize('missionControl.summary.running', "Running: {0}", runningCount);

		// Cost
		const costItem = append(this.summaryBar, $('span.mc-summary-item'));
		costItem.textContent = nls.localize('missionControl.summary.cost', "Cost: {0}", formatCost(totalCost));

		// Session
		const board = this.missionControlService.board;
		if (board.sessionId) {
			const sessionItem = append(this.summaryBar, $('span.mc-summary-item'));
			sessionItem.textContent = nls.localize('missionControl.summary.session', "Session: {0}", board.sessionId);
			sessionItem.style.marginLeft = 'auto';
		}
	}

	// --- Incremental card update ----------------------------------------------

	/**
	 * Attempts to update a single card in-place when a ticket changes.
	 * Falls back to a full re-render if the card is not in the DOM (e.g.
	 * the ticket moved to a different column).
	 */
	private updateCard(ticket: IMissionControlTicket): void {
		const existingCard = this.cardElements.get(ticket.id);
		if (!existingCard) {
			// Card not found — the ticket may have moved columns. Do a full re-render.
			this.renderBoard();
			return;
		}

		// Check whether the card is still in the correct column. If the
		// ticket's status has changed, a full re-render is simpler than
		// moving the DOM node between columns.
		const columnEl = existingCard.closest('.mc-column');
		if (columnEl) {
			const columnAriaLabel = columnEl.getAttribute('aria-label');
			const expectedColumnDef = KANBAN_COLUMNS.find(c => c.status === ticket.status);
			if (expectedColumnDef && columnAriaLabel !== expectedColumnDef.label) {
				this.renderBoard();
				return;
			}
		}

		// Re-render the card in-place
		const cardDisposables = new DisposableStore();
		this.renderDisposables.add(cardDisposables);

		const newCard = renderTicketCard(ticket, cardDisposables, t => this._onDidSelectTicket.fire(t));

		existingCard.replaceWith(newCard);
		this.cardElements.set(ticket.id, newCard);
	}

	// --- Dispose --------------------------------------------------------------

	override dispose(): void {
		this.cardElements.clear();
		super.dispose();
	}
}
