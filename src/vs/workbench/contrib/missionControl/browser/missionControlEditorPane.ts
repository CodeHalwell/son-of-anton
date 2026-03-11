/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/missionControl.css';
import { $, append, addDisposableListener, Dimension, EventType } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { MissionControlEditorInput } from './missionControlEditorInput.js';
import {
	IMissionControlTicket,
	TicketStatus,
	TicketType,
	TicketPriority,
	ITicketFilter,
} from '../common/missionControlTypes.js';
import { IMissionControlService } from './missionControlService.js';

// --- Constants (shared with MissionControlView) ---

const KANBAN_COLUMNS: ReadonlyArray<{ readonly status: TicketStatus; readonly label: string; readonly color: string }> = [
	{ status: TicketStatus.Queued, label: nls.localize('mc.col.queued', "Queued"), color: '#6B7280' },
	{ status: TicketStatus.Running, label: nls.localize('mc.col.running', "Running"), color: '#F5A623' },
	{ status: TicketStatus.Review, label: nls.localize('mc.col.review', "Review"), color: '#E67E22' },
	{ status: TicketStatus.Complete, label: nls.localize('mc.col.complete', "Complete"), color: '#27AE60' },
	{ status: TicketStatus.Failed, label: nls.localize('mc.col.failed', "Failed"), color: '#EF4444' },
];

const TICKET_TYPE_META: Record<string, { readonly label: string; readonly color: string }> = {
	[TicketType.Epic]: { label: 'Epic', color: '#8B5CF6' },
	[TicketType.Story]: { label: 'Story', color: '#3B82F6' },
	[TicketType.Subtask]: { label: 'Subtask', color: '#6B7280' },
	[TicketType.Bug]: { label: 'Bug', color: '#EF4444' },
	[TicketType.Spike]: { label: 'Spike', color: '#EC4899' },
};

const PRIORITY_COLORS: Record<string, string> = {
	[TicketPriority.Critical]: '#EF4444',
	[TicketPriority.High]: '#F97316',
	[TicketPriority.Medium]: '#F59E0B',
	[TicketPriority.Low]: '#6B7280',
};

const PRIORITY_LABELS: Record<string, string> = {
	[TicketPriority.Critical]: nls.localize('mc.prio.critical', "Critical"),
	[TicketPriority.High]: nls.localize('mc.prio.high', "High"),
	[TicketPriority.Medium]: nls.localize('mc.prio.medium', "Medium"),
	[TicketPriority.Low]: nls.localize('mc.prio.low', "Low"),
};

function formatElapsed(ms: number): string {
	if (ms < 1000) {
		return '<1s';
	}
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) {
		return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

function formatCost(usd: number): string {
	if (usd === 0) {
		return '$0.00';
	}
	if (usd < 0.01) {
		return '<$0.01';
	}
	return `$${usd.toFixed(2)}`;
}

/**
 * Full-width editor pane for Mission Control. Provides the same kanban board
 * as the sidebar view but laid out across the full editor area for maximum
 * visibility. Opened via "Son of Anton: Open Mission Control in Editor" command.
 */
export class MissionControlEditorPane extends EditorPane {

	static readonly ID = 'workbench.editor.soaMissionControl';

	private boardRoot: HTMLElement | undefined;
	private columnsContainer: HTMLElement | undefined;
	private summaryBar: HTMLElement | undefined;
	private currentFilter: ITicketFilter = {};
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IMissionControlService private readonly missionControlService: IMissionControlService,
	) {
		super(MissionControlEditorPane.ID, group, telemetryService, themeService, storageService);

		this._register(this.missionControlService.onDidChangeBoard(() => this.renderBoard()));
		this._register(this.missionControlService.onDidChangeTicket(() => this.renderBoard()));
	}

	protected createEditor(parent: HTMLElement): void {
		this.boardRoot = append(parent, $('div.mc-editor-root'));
		this.boardRoot.setAttribute('role', 'region');
		this.boardRoot.setAttribute('aria-label', nls.localize('mc.editor.ariaLabel', "Mission Control Board"));

		// --- Header bar ---
		const headerBar = append(this.boardRoot, $('div.mc-editor-header'));

		const title = append(headerBar, $('h2.mc-editor-title'));
		title.textContent = nls.localize('mc.editor.title', "Mission Control");

		const subtitle = append(headerBar, $('span.mc-editor-subtitle'));
		subtitle.textContent = nls.localize('mc.editor.subtitle', "Agent task orchestration board");

		const actions = append(headerBar, $('div.mc-editor-header-actions'));

		// Search
		const searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.className = 'mc-editor-search';
		searchInput.placeholder = nls.localize('mc.editor.search', "Search tickets\u2026");
		append(actions, searchInput);

		this._register(addDisposableListener(searchInput, EventType.INPUT, () => {
			this.currentFilter.searchText = searchInput.value || undefined;
			this.renderBoard();
		}));

		// Type filter
		const typeSelect = document.createElement('select');
		typeSelect.className = 'mc-editor-select';
		const typeAllOpt = document.createElement('option');
		typeAllOpt.value = '';
		typeAllOpt.textContent = nls.localize('mc.filter.allTypes', "All Types");
		typeSelect.appendChild(typeAllOpt);
		for (const [typeValue, meta] of Object.entries(TICKET_TYPE_META)) {
			const opt = document.createElement('option');
			opt.value = typeValue;
			opt.textContent = meta.label;
			typeSelect.appendChild(opt);
		}
		append(actions, typeSelect);

		this._register(addDisposableListener(typeSelect, EventType.CHANGE, () => {
			const val = typeSelect.value;
			this.currentFilter.type = val ? [val as TicketType] : undefined;
			this.renderBoard();
		}));

		// New ticket button
		const newBtn = append(actions, $('button.mc-editor-btn-primary'));
		newBtn.textContent = nls.localize('mc.editor.newTicket', "New Ticket");

		// --- Columns container ---
		this.columnsContainer = append(this.boardRoot, $('div.mc-editor-columns'));

		// --- Summary bar ---
		this.summaryBar = append(this.boardRoot, $('div.mc-editor-summary'));

		this.renderBoard();
	}

	override async setInput(
		input: MissionControlEditorInput,
		options: undefined,
		context: IEditorOpenContext,
		token: CancellationToken
	): Promise<void> {
		await super.setInput(input, options, context, token);
		this.renderBoard();
	}

	override layout(dimension: Dimension): void {
		if (this.boardRoot) {
			this.boardRoot.style.height = `${dimension.height}px`;
			this.boardRoot.style.width = `${dimension.width}px`;
		}
	}

	private matchesFilter(ticket: IMissionControlTicket): boolean {
		const filter = this.currentFilter;
		if (filter.type && filter.type.length > 0 && !filter.type.includes(ticket.type)) {
			return false;
		}
		if (filter.priority && filter.priority.length > 0 && !filter.priority.includes(ticket.priority)) {
			return false;
		}
		if (filter.searchText) {
			const lower = filter.searchText.toLowerCase();
			if (!ticket.title.toLowerCase().includes(lower) &&
				!ticket.description.toLowerCase().includes(lower) &&
				!ticket.id.toLowerCase().includes(lower)) {
				return false;
			}
		}
		return true;
	}

	private renderBoard(): void {
		if (!this.columnsContainer || !this.summaryBar) {
			return;
		}

		this.renderDisposables.clear();
		this.columnsContainer.textContent = '';

		const board = this.missionControlService.board;
		let totalTickets = 0;
		let totalCost = 0;
		let runningCount = 0;

		for (const columnDef of KANBAN_COLUMNS) {
			const boardColumn = board.columns.find(c => c.status === columnDef.status);
			const rawTickets = boardColumn ? boardColumn.tickets : [];
			const filteredTickets = rawTickets.filter(t => this.matchesFilter(t));

			totalTickets += filteredTickets.length;
			for (const t of filteredTickets) {
				totalCost += t.totalCostUsd;
				if (t.status === TicketStatus.Running) {
					runningCount++;
				}
			}

			const column = append(this.columnsContainer, $('div.mc-editor-column'));

			// Column header
			const header = append(column, $('div.mc-editor-col-header'));
			const colorBar = append(header, $('div.mc-editor-col-indicator'));
			colorBar.style.backgroundColor = columnDef.color;
			const titleEl = append(header, $('span.mc-editor-col-title'));
			titleEl.textContent = columnDef.label;
			const countEl = append(header, $('span.mc-editor-col-count'));
			countEl.textContent = String(filteredTickets.length);

			// Ticket list
			const ticketList = append(column, $('div.mc-editor-col-tickets'));

			if (filteredTickets.length === 0) {
				const empty = append(ticketList, $('div.mc-editor-col-empty'));
				empty.textContent = nls.localize('mc.col.empty', "No tickets");
			} else {
				for (const ticket of filteredTickets) {
					append(ticketList, this.renderCard(ticket));
				}
			}
		}

		// Summary
		this.summaryBar.textContent = '';
		const totalItem = append(this.summaryBar, $('span.mc-editor-summary-item'));
		totalItem.textContent = nls.localize('mc.summary.total', "Total: {0}", totalTickets);
		const runningItem = append(this.summaryBar, $('span.mc-editor-summary-item'));
		const runningDot = append(runningItem, $('span.mc-editor-summary-dot'));
		runningDot.style.backgroundColor = '#F5A623';
		const runningLabel = append(runningItem, $('span'));
		runningLabel.textContent = nls.localize('mc.summary.running', " Running: {0}", runningCount);
		const costItem = append(this.summaryBar, $('span.mc-editor-summary-item'));
		costItem.textContent = nls.localize('mc.summary.cost', "Cost: {0}", formatCost(totalCost));
	}

	private renderCard(ticket: IMissionControlTicket): HTMLElement {
		const card = $('div.mc-editor-card');
		card.tabIndex = 0;

		// Header row
		const header = append(card, $('div.mc-editor-card-header'));
		const priorityDot = append(header, $('div.mc-editor-card-priority'));
		priorityDot.style.backgroundColor = PRIORITY_COLORS[ticket.priority] ?? '#6B7280';
		priorityDot.title = PRIORITY_LABELS[ticket.priority] ?? '';
		const titleEl = append(header, $('div.mc-editor-card-title'));
		titleEl.textContent = ticket.title;

		// ID
		const idEl = append(card, $('div.mc-editor-card-id'));
		idEl.textContent = ticket.id;

		// Badges
		const badges = append(card, $('div.mc-editor-card-badges'));
		const typeMeta = TICKET_TYPE_META[ticket.type];
		if (typeMeta) {
			const badge = append(badges, $('span.mc-editor-badge'));
			badge.textContent = typeMeta.label;
			badge.style.backgroundColor = typeMeta.color;
		}
		if (ticket.modelUsed) {
			const modelBadge = append(badges, $('span.mc-editor-badge.mc-editor-badge-model'));
			modelBadge.textContent = ticket.modelUsed;
		}

		// Agent
		if (ticket.assignedAgent) {
			const agentRow = append(card, $('div.mc-editor-card-agent'));
			const icon = append(agentRow, $('div.mc-editor-card-agent-icon'));
			icon.textContent = ticket.assignedAgent.charAt(0).toUpperCase();
			const name = append(agentRow, $('span'));
			name.textContent = ticket.assignedAgent;
		}

		// Metrics
		if (ticket.totalCostUsd > 0 || ticket.elapsedMs > 0) {
			const meta = append(card, $('div.mc-editor-card-meta'));
			if (ticket.totalCostUsd > 0) {
				const cost = append(meta, $('span'));
				cost.textContent = formatCost(ticket.totalCostUsd);
			}
			if (ticket.elapsedMs > 0) {
				const time = append(meta, $('span'));
				time.textContent = formatElapsed(ticket.elapsedMs);
			}
			const tokenTotal = ticket.totalTokensIn + ticket.totalTokensOut;
			if (tokenTotal > 0) {
				const tokens = append(meta, $('span'));
				tokens.textContent = `${tokenTotal.toLocaleString()} tok`;
			}
		}

		// Labels
		if (ticket.labels.length > 0) {
			const labelsRow = append(card, $('div.mc-editor-card-labels'));
			for (const label of ticket.labels) {
				const tag = append(labelsRow, $('span.mc-editor-label-tag'));
				tag.textContent = label;
			}
		}

		return card;
	}
}
