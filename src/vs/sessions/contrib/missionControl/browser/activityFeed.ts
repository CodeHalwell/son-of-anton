/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType, clearNode } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import {
	IMissionControlTicket,
	TicketStatus,
} from '../common/missionControlTypes.js';
import { IMissionControlService } from './missionControlService.js';

// --- Constants ---------------------------------------------------------------

/** Maximum number of entries kept in the activity feed. Oldest entries are evicted first. */
const MAX_ENTRIES = 200;

/** Map from TicketStatus to a human-readable past-tense label. */
const STATUS_CHANGE_LABELS: Record<string, string> = {
	[TicketStatus.Queued]: localize('activityFeed.status.queued', "moved to Queued"),
	[TicketStatus.Running]: localize('activityFeed.status.running', "started Running"),
	[TicketStatus.Paused]: localize('activityFeed.status.paused', "was Paused"),
	[TicketStatus.Review]: localize('activityFeed.status.review', "moved to Review"),
	[TicketStatus.Complete]: localize('activityFeed.status.complete', "marked Complete"),
	[TicketStatus.Failed]: localize('activityFeed.status.failed', "marked Failed"),
};

// --- Activity entry types ----------------------------------------------------

export const enum ActivityEntryKind {
	StatusChange = 'statusChange',
	CostUpdate = 'costUpdate',
	CommentAdded = 'commentAdded',
	AgentAssigned = 'agentAssigned',
	TraceAppended = 'traceAppended',
	TicketCreated = 'ticketCreated',
}

export interface IActivityEntry {
	readonly id: number;
	readonly timestamp: number;
	readonly kind: ActivityEntryKind;
	readonly ticketId: string;
	readonly ticketTitle: string;
	readonly agentId: string | undefined;
	readonly detail: string;
}

// --- Filter types ------------------------------------------------------------

export interface IActivityFilter {
	agentId?: string;
	kind?: ActivityEntryKind;
}

// --- Events ------------------------------------------------------------------

export interface IActivityEntryClickEvent {
	readonly ticketId: string;
}

// --- ActivityFeed ------------------------------------------------------------

/**
 * Scrollable activity feed that displays real-time agent activity for the
 * Mission Control board. Listens to {@link IMissionControlService.onDidChangeTicket}
 * events and renders trace entries, status changes, cost updates, and comments
 * with timestamps.
 *
 * The feed maintains at most {@link MAX_ENTRIES} entries and auto-scrolls to
 * the latest entry.
 */
export class ActivityFeed extends Disposable {

	// --- Events ---

	private readonly _onDidClickEntry = this._register(new Emitter<IActivityEntryClickEvent>());
	readonly onDidClickEntry: Event<IActivityEntryClickEvent> = this._onDidClickEntry.event;

	// --- DOM ---

	private readonly rootElement: HTMLElement;
	private readonly headerElement: HTMLElement;
	private readonly filterContainer: HTMLElement;
	private readonly scrollContainer: HTMLElement;
	private readonly entryListElement: HTMLElement;
	private readonly emptyMessage: HTMLElement;

	// --- State ---

	private readonly entries: IActivityEntry[] = [];
	private entryCounter = 0;
	private currentFilter: IActivityFilter = {};
	private readonly renderDisposables = this._register(new DisposableStore());

	/** Tracks the previous status for each ticket to detect status changes. */
	private readonly ticketStatusSnapshot = new Map<string, TicketStatus>();

	/** Tracks the previous cost for each ticket to detect cost updates. */
	private readonly ticketCostSnapshot = new Map<string, number>();

	/** Tracks comment counts for each ticket to detect new comments. */
	private readonly ticketCommentCountSnapshot = new Map<string, number>();

	/** Tracks trace counts for each ticket to detect new trace entries. */
	private readonly ticketTraceCountSnapshot = new Map<string, number>();

	constructor(
		parent: HTMLElement,
		private readonly missionControlService: IMissionControlService,
	) {
		super();

		// Root
		this.rootElement = append(parent, $('div.activity-feed'));
		this.applyRootStyles();

		// Header
		this.headerElement = append(this.rootElement, $('div.activity-feed-header'));
		this.applyHeaderStyles();
		const headerTitle = append(this.headerElement, $('span.activity-feed-title'));
		headerTitle.textContent = localize('activityFeed.title', "Activity");
		headerTitle.style.fontWeight = '600';
		headerTitle.style.fontSize = '13px';

		// Filter container
		this.filterContainer = append(this.rootElement, $('div.activity-feed-filters'));
		this.applyFilterContainerStyles();
		this.createFilterControls();

		// Scroll container
		this.scrollContainer = append(this.rootElement, $('div.activity-feed-scroll'));
		this.applyScrollContainerStyles();

		// Entry list
		this.entryListElement = append(this.scrollContainer, $('div.activity-feed-entries'));
		this.entryListElement.setAttribute('role', 'log');
		this.entryListElement.setAttribute('aria-label', localize('activityFeed.ariaLabel', "Activity feed"));
		this.entryListElement.style.display = 'flex';
		this.entryListElement.style.flexDirection = 'column';
		this.entryListElement.style.gap = '0';

		// Empty message
		this.emptyMessage = append(this.scrollContainer, $('div.activity-feed-empty'));
		this.emptyMessage.textContent = localize('activityFeed.empty', "No activity yet");
		this.applyEmptyMessageStyles();

		// Initialize snapshots from current board state
		this.initializeSnapshots();

		// Listen for ticket changes
		this._register(this.missionControlService.onDidChangeTicket(ticket => this.onTicketChanged(ticket)));
	}

	// --- Public API ---

	/**
	 * Returns the root DOM element of the activity feed.
	 */
	getDomNode(): HTMLElement {
		return this.rootElement;
	}

	/**
	 * Sets the filter for the activity feed. Only entries matching the filter
	 * are displayed.
	 */
	setFilter(filter: IActivityFilter): void {
		this.currentFilter = filter;
		this.renderEntries();
	}

	/**
	 * Clears all entries from the activity feed.
	 */
	clear(): void {
		this.entries.length = 0;
		this.ticketStatusSnapshot.clear();
		this.ticketCostSnapshot.clear();
		this.ticketCommentCountSnapshot.clear();
		this.ticketTraceCountSnapshot.clear();
		this.renderEntries();
	}

	// --- Snapshot initialization ----------------------------------------------

	private initializeSnapshots(): void {
		const board = this.missionControlService.board;
		for (const column of board.columns) {
			for (const ticket of column.tickets) {
				this.ticketStatusSnapshot.set(ticket.id, ticket.status);
				this.ticketCostSnapshot.set(ticket.id, ticket.totalCostUsd);
				this.ticketCommentCountSnapshot.set(ticket.id, ticket.comments.length);
				this.ticketTraceCountSnapshot.set(ticket.id, ticket.trace.length);
			}
		}
	}

	// --- Ticket change handling -----------------------------------------------

	private onTicketChanged(ticket: IMissionControlTicket): void {
		const previousStatus = this.ticketStatusSnapshot.get(ticket.id);
		const previousCost = this.ticketCostSnapshot.get(ticket.id);
		const previousCommentCount = this.ticketCommentCountSnapshot.get(ticket.id);
		const previousTraceCount = this.ticketTraceCountSnapshot.get(ticket.id);

		// Detect ticket creation (no previous snapshot)
		if (previousStatus === undefined) {
			this.addEntry({
				kind: ActivityEntryKind.TicketCreated,
				ticketId: ticket.id,
				ticketTitle: ticket.title,
				agentId: ticket.assignedAgent,
				detail: localize('activityFeed.created', "{0} created", ticket.id),
			});
		}

		// Detect status change
		if (previousStatus !== undefined && previousStatus !== ticket.status) {
			const statusLabel = STATUS_CHANGE_LABELS[ticket.status] ?? ticket.status;
			this.addEntry({
				kind: ActivityEntryKind.StatusChange,
				ticketId: ticket.id,
				ticketTitle: ticket.title,
				agentId: ticket.assignedAgent,
				detail: localize('activityFeed.statusChanged', "{0} {1}", ticket.id, statusLabel),
			});
		}

		// Detect cost update
		if (previousCost !== undefined && previousCost !== ticket.totalCostUsd) {
			this.addEntry({
				kind: ActivityEntryKind.CostUpdate,
				ticketId: ticket.id,
				ticketTitle: ticket.title,
				agentId: ticket.assignedAgent,
				detail: localize('activityFeed.costUpdate', "{0} cost updated to ${1}", ticket.id, ticket.totalCostUsd.toFixed(2)),
			});
		}

		// Detect new comments
		if (previousCommentCount !== undefined && ticket.comments.length > previousCommentCount) {
			const newCount = ticket.comments.length - previousCommentCount;
			this.addEntry({
				kind: ActivityEntryKind.CommentAdded,
				ticketId: ticket.id,
				ticketTitle: ticket.title,
				agentId: ticket.assignedAgent,
				detail: localize('activityFeed.commentAdded', "{0} new comment(s) on {1}", newCount, ticket.id),
			});
		}

		// Detect new trace entries
		if (previousTraceCount !== undefined && ticket.trace.length > previousTraceCount) {
			const lastTrace = ticket.trace[ticket.trace.length - 1];
			this.addEntry({
				kind: ActivityEntryKind.TraceAppended,
				ticketId: ticket.id,
				ticketTitle: ticket.title,
				agentId: lastTrace.agentId,
				detail: localize('activityFeed.traceAppended', "{0}: {1}", ticket.id, lastTrace.action),
			});
		}

		// Update snapshots
		this.ticketStatusSnapshot.set(ticket.id, ticket.status);
		this.ticketCostSnapshot.set(ticket.id, ticket.totalCostUsd);
		this.ticketCommentCountSnapshot.set(ticket.id, ticket.comments.length);
		this.ticketTraceCountSnapshot.set(ticket.id, ticket.trace.length);
	}

	// --- Entry management ----------------------------------------------------

	private addEntry(data: Omit<IActivityEntry, 'id' | 'timestamp'>): void {
		const entry: IActivityEntry = {
			id: ++this.entryCounter,
			timestamp: Date.now(),
			...data,
		};

		this.entries.push(entry);

		// Evict oldest entries if over the limit
		while (this.entries.length > MAX_ENTRIES) {
			this.entries.shift();
		}

		this.renderEntries();
		this.scrollToBottom();
	}

	// --- Rendering -----------------------------------------------------------

	private renderEntries(): void {
		this.renderDisposables.clear();
		clearNode(this.entryListElement);

		const filtered = this.entries.filter(e => this.matchesFilter(e));

		if (filtered.length === 0) {
			this.emptyMessage.style.display = '';
		} else {
			this.emptyMessage.style.display = 'none';
			for (const entry of filtered) {
				this.renderEntry(entry);
			}
		}
	}

	private renderEntry(entry: IActivityEntry): void {
		const row = append(this.entryListElement, $('div.activity-entry'));
		row.setAttribute('role', 'listitem');
		this.applyEntryStyles(row);

		// Timeline dot
		const dot = append(row, $('div.activity-entry-dot'));
		this.applyDotStyles(dot, entry.kind);

		// Content
		const content = append(row, $('div.activity-entry-content'));
		content.style.flex = '1';
		content.style.minWidth = '0';

		// Timestamp
		const timeEl = append(content, $('span.activity-entry-time'));
		timeEl.textContent = this.formatTimestamp(entry.timestamp);
		timeEl.style.fontSize = '10px';
		timeEl.style.color = '#6B7280';
		timeEl.style.marginRight = '8px';

		// Detail text
		const detailEl = append(content, $('span.activity-entry-detail'));
		detailEl.textContent = entry.detail;
		detailEl.style.fontSize = '12px';
		detailEl.style.color = '#E5E5E5';

		// Agent badge
		if (entry.agentId) {
			const agentBadge = append(content, $('span.activity-entry-agent'));
			agentBadge.textContent = entry.agentId;
			agentBadge.style.marginLeft = '6px';
			agentBadge.style.fontSize = '10px';
			agentBadge.style.color = '#F5A623';
			agentBadge.style.backgroundColor = '#1E1E1E';
			agentBadge.style.padding = '1px 6px';
			agentBadge.style.borderRadius = '4px';
		}

		// Click handler to navigate to ticket
		row.style.cursor = 'pointer';
		this.renderDisposables.add(addDisposableListener(row, EventType.CLICK, () => {
			this._onDidClickEntry.fire({ ticketId: entry.ticketId });
		}));
	}

	// --- Filtering -----------------------------------------------------------

	private matchesFilter(entry: IActivityEntry): boolean {
		const f = this.currentFilter;
		if (f.agentId !== undefined && entry.agentId !== f.agentId) {
			return false;
		}
		if (f.kind !== undefined && entry.kind !== f.kind) {
			return false;
		}
		return true;
	}

	// --- Filter controls -----------------------------------------------------

	private createFilterControls(): void {
		// Agent filter
		const agentLabel = append(this.filterContainer, $('label.activity-filter-label'));
		agentLabel.textContent = localize('activityFeed.filter.agent', "Agent:");
		agentLabel.style.fontSize = '11px';
		agentLabel.style.color = '#6B7280';
		agentLabel.style.marginRight = '4px';

		const agentInput = document.createElement('input');
		agentInput.type = 'text';
		agentInput.className = 'activity-filter-input';
		agentInput.placeholder = localize('activityFeed.filter.agentPlaceholder', "All");
		agentInput.setAttribute('aria-label', localize('activityFeed.filter.agentAriaLabel', "Filter by agent"));
		this.applyFilterInputStyles(agentInput);
		append(this.filterContainer, agentInput);

		this._register(addDisposableListener(agentInput, EventType.INPUT, () => {
			this.currentFilter.agentId = agentInput.value || undefined;
			this.renderEntries();
		}));

		// Event type filter
		const kindLabel = append(this.filterContainer, $('label.activity-filter-label'));
		kindLabel.textContent = localize('activityFeed.filter.type', "Type:");
		kindLabel.style.fontSize = '11px';
		kindLabel.style.color = '#6B7280';
		kindLabel.style.marginLeft = '8px';
		kindLabel.style.marginRight = '4px';

		const kindSelect = document.createElement('select');
		kindSelect.className = 'activity-filter-select';
		kindSelect.setAttribute('aria-label', localize('activityFeed.filter.typeAriaLabel', "Filter by event type"));
		this.applyFilterSelectStyles(kindSelect);

		const allOption = document.createElement('option');
		allOption.value = '';
		allOption.textContent = localize('activityFeed.filter.allTypes', "All");
		kindSelect.appendChild(allOption);

		const kindOptions: Array<{ value: ActivityEntryKind; label: string }> = [
			{ value: ActivityEntryKind.StatusChange, label: localize('activityFeed.kind.statusChange', "Status Change") },
			{ value: ActivityEntryKind.CostUpdate, label: localize('activityFeed.kind.costUpdate', "Cost Update") },
			{ value: ActivityEntryKind.CommentAdded, label: localize('activityFeed.kind.comment', "Comment") },
			{ value: ActivityEntryKind.TraceAppended, label: localize('activityFeed.kind.trace', "Trace") },
			{ value: ActivityEntryKind.TicketCreated, label: localize('activityFeed.kind.created', "Created") },
			{ value: ActivityEntryKind.AgentAssigned, label: localize('activityFeed.kind.assigned', "Agent Assigned") },
		];

		for (const opt of kindOptions) {
			const optEl = document.createElement('option');
			optEl.value = opt.value;
			optEl.textContent = opt.label;
			kindSelect.appendChild(optEl);
		}

		append(this.filterContainer, kindSelect);

		this._register(addDisposableListener(kindSelect, EventType.CHANGE, () => {
			this.currentFilter.kind = kindSelect.value ? kindSelect.value as ActivityEntryKind : undefined;
			this.renderEntries();
		}));
	}

	// --- Scrolling -----------------------------------------------------------

	private scrollToBottom(): void {
		requestAnimationFrame(() => {
			this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
		});
	}

	// --- Helpers -------------------------------------------------------------

	private formatTimestamp(ms: number): string {
		const date = new Date(ms);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}

	// --- Inline styles -------------------------------------------------------

	private applyRootStyles(): void {
		const s = this.rootElement.style;
		s.display = 'flex';
		s.flexDirection = 'column';
		s.height = '100%';
		s.backgroundColor = '#0D0D0D';
		s.color = '#E5E5E5';
		s.fontFamily = 'var(--vscode-font-family, sans-serif)';
	}

	private applyHeaderStyles(): void {
		const s = this.headerElement.style;
		s.display = 'flex';
		s.alignItems = 'center';
		s.padding = '10px 12px';
		s.borderBottom = '1px solid #2A2A2A';
		s.flexShrink = '0';
	}

	private applyFilterContainerStyles(): void {
		const s = this.filterContainer.style;
		s.display = 'flex';
		s.alignItems = 'center';
		s.padding = '6px 12px';
		s.borderBottom = '1px solid #2A2A2A';
		s.flexShrink = '0';
		s.gap = '4px';
	}

	private applyScrollContainerStyles(): void {
		const s = this.scrollContainer.style;
		s.flex = '1';
		s.overflowY = 'auto';
		s.padding = '8px 12px';
	}

	private applyEmptyMessageStyles(): void {
		const s = this.emptyMessage.style;
		s.display = '';
		s.padding = '24px 12px';
		s.textAlign = 'center';
		s.color = '#4B5563';
		s.fontSize = '12px';
		s.fontStyle = 'italic';
	}

	private applyEntryStyles(el: HTMLElement): void {
		const s = el.style;
		s.display = 'flex';
		s.alignItems = 'flex-start';
		s.gap = '10px';
		s.padding = '6px 0';
		s.borderLeft = '1px solid #2A2A2A';
		s.marginLeft = '6px';
		s.paddingLeft = '14px';
		s.position = 'relative';
	}

	private applyDotStyles(el: HTMLElement, kind: ActivityEntryKind): void {
		const s = el.style;
		s.width = '8px';
		s.height = '8px';
		s.borderRadius = '50%';
		s.flexShrink = '0';
		s.marginTop = '4px';
		s.position = 'absolute';
		s.left = '2px';

		// Color by entry kind
		switch (kind) {
			case ActivityEntryKind.StatusChange:
				s.backgroundColor = '#3B82F6';
				break;
			case ActivityEntryKind.CostUpdate:
				s.backgroundColor = '#F59E0B';
				break;
			case ActivityEntryKind.CommentAdded:
				s.backgroundColor = '#10B981';
				break;
			case ActivityEntryKind.AgentAssigned:
				s.backgroundColor = '#8B5CF6';
				break;
			case ActivityEntryKind.TraceAppended:
				s.backgroundColor = '#6B7280';
				break;
			case ActivityEntryKind.TicketCreated:
				s.backgroundColor = '#F5A623';
				break;
			default:
				s.backgroundColor = '#6B7280';
				break;
		}
	}

	private applyFilterInputStyles(el: HTMLInputElement): void {
		const s = el.style;
		s.padding = '2px 6px';
		s.border = '1px solid #2A2A2A';
		s.borderRadius = '4px';
		s.backgroundColor = '#161616';
		s.color = '#E5E5E5';
		s.fontSize = '11px';
		s.outline = 'none';
		s.width = '80px';
	}

	private applyFilterSelectStyles(el: HTMLSelectElement): void {
		const s = el.style;
		s.padding = '2px 6px';
		s.border = '1px solid #2A2A2A';
		s.borderRadius = '4px';
		s.backgroundColor = '#161616';
		s.color = '#E5E5E5';
		s.fontSize = '11px';
		s.outline = 'none';
		s.cursor = 'pointer';
	}
}
