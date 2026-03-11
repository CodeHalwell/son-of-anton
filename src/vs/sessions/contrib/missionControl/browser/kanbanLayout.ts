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
	TicketPriority,
	TicketType,
	ITicketFilter,
} from '../common/missionControlTypes.js';
import { IMissionControlService } from './missionControlService.js';

// --- Column definitions ------------------------------------------------------

/** The six kanban columns, one per TicketStatus value. */
const KANBAN_COLUMN_DEFS: ReadonlyArray<{
	readonly status: TicketStatus;
	readonly label: string;
	readonly color: string;
}> = [
	{ status: TicketStatus.Queued, label: localize('kanban.column.queued', "Queued"), color: '#6B7280' },
	{ status: TicketStatus.Running, label: localize('kanban.column.running', "Running"), color: '#3B82F6' },
	{ status: TicketStatus.Paused, label: localize('kanban.column.paused', "Paused"), color: '#9CA3AF' },
	{ status: TicketStatus.Review, label: localize('kanban.column.review', "Review"), color: '#F59E0B' },
	{ status: TicketStatus.Complete, label: localize('kanban.column.complete', "Complete"), color: '#10B981' },
	{ status: TicketStatus.Failed, label: localize('kanban.column.failed', "Failed"), color: '#EF4444' },
];

/** Map from TicketPriority to a left-border color for cards. */
const PRIORITY_BORDER_COLORS: Record<string, string> = {
	[TicketPriority.Critical]: '#EF4444',
	[TicketPriority.High]: '#F97316',
	[TicketPriority.Medium]: '#F59E0B',
	[TicketPriority.Low]: '#6B7280',
};

/** Map from TicketType to a display label. */
const TYPE_LABELS: Record<string, string> = {
	[TicketType.Epic]: 'Epic',
	[TicketType.Story]: 'Story',
	[TicketType.Subtask]: 'Subtask',
	[TicketType.Bug]: 'Bug',
	[TicketType.Spike]: 'Spike',
};

// --- Events ------------------------------------------------------------------

/** Fired when a ticket is dropped into a new column. */
export interface ITicketDropEvent {
	readonly ticketId: string;
	readonly newStatus: TicketStatus;
}

/** Fired when a ticket card is clicked. */
export interface ITicketClickEvent {
	readonly ticketId: string;
}

// --- KanbanLayout ------------------------------------------------------------

/**
 * Kanban board layout manager that renders tickets in a CSS grid with six
 * columns matching each {@link TicketStatus} value. Supports drag-and-drop
 * ticket movement using the HTML5 drag API.
 */
export class KanbanLayout extends Disposable {

	// --- Events ---

	private readonly _onDidDropTicket = this._register(new Emitter<ITicketDropEvent>());
	readonly onDidDropTicket: Event<ITicketDropEvent> = this._onDidDropTicket.event;

	private readonly _onDidClickTicket = this._register(new Emitter<ITicketClickEvent>());
	readonly onDidClickTicket: Event<ITicketClickEvent> = this._onDidClickTicket.event;

	// --- DOM ---

	private readonly rootElement: HTMLElement;
	private readonly columnElements = new Map<TicketStatus, HTMLElement>();
	private readonly columnTicketLists = new Map<TicketStatus, HTMLElement>();
	private readonly columnCountBadges = new Map<TicketStatus, HTMLElement>();

	// --- Render state ---

	private readonly renderDisposables = this._register(new DisposableStore());
	private currentFilter: ITicketFilter = {};

	constructor(
		parent: HTMLElement,
		private readonly missionControlService: IMissionControlService,
	) {
		super();

		// Build the grid root
		this.rootElement = append(parent, $('div.kanban-grid'));
		this.applyGridStyles();

		// Create the six columns
		for (const def of KANBAN_COLUMN_DEFS) {
			this.createColumn(def);
		}

		// Listen for board changes to re-render
		this._register(this.missionControlService.onDidChangeBoard(() => this.render()));

		// Wire up drop events to the service
		this._register(this.onDidDropTicket(e => {
			this.missionControlService.updateTicketStatus(e.ticketId, e.newStatus);
		}));

		// Initial render
		this.render();
	}

	// --- Public API ---

	/**
	 * Returns the root DOM element of the kanban grid.
	 */
	getDomNode(): HTMLElement {
		return this.rootElement;
	}

	/**
	 * Sets the active filter. Tickets not matching the filter are hidden.
	 */
	setFilter(filter: ITicketFilter): void {
		this.currentFilter = filter;
		this.render();
	}

	// --- Column creation -----------------------------------------------------

	private createColumn(def: { readonly status: TicketStatus; readonly label: string; readonly color: string }): void {
		const column = append(this.rootElement, $('div.kanban-column'));
		column.dataset.status = def.status;
		this.applyColumnStyles(column);

		// Header
		const header = append(column, $('div.kanban-column-header'));
		this.applyColumnHeaderStyles(header);

		const colorIndicator = append(header, $('div.kanban-column-indicator'));
		colorIndicator.style.width = '4px';
		colorIndicator.style.height = '18px';
		colorIndicator.style.borderRadius = '2px';
		colorIndicator.style.flexShrink = '0';
		colorIndicator.style.backgroundColor = def.color;

		const titleEl = append(header, $('span.kanban-column-title'));
		titleEl.textContent = def.label;
		titleEl.style.fontWeight = '600';
		titleEl.style.fontSize = '13px';
		titleEl.style.flex = '1';

		const countBadge = append(header, $('span.kanban-column-count'));
		countBadge.textContent = '0';
		this.applyCountBadgeStyles(countBadge);

		// Ticket list (scrollable, drop target)
		const ticketList = append(column, $('div.kanban-column-tickets'));
		this.applyTicketListStyles(ticketList);
		ticketList.setAttribute('role', 'list');
		ticketList.setAttribute('aria-label', def.label);

		// Drag-and-drop: allow drops on the ticket list
		this._register(addDisposableListener(ticketList, EventType.DRAG_OVER, (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			ticketList.classList.add('kanban-drop-target');
		}));

		this._register(addDisposableListener(ticketList, EventType.DRAG_LEAVE, () => {
			ticketList.classList.remove('kanban-drop-target');
		}));

		this._register(addDisposableListener(ticketList, EventType.DROP, (e: DragEvent) => {
			e.preventDefault();
			ticketList.classList.remove('kanban-drop-target');
			const ticketId = e.dataTransfer?.getData('text/plain');
			if (ticketId) {
				this._onDidDropTicket.fire({ ticketId, newStatus: def.status });
			}
		}));

		this.columnElements.set(def.status, column);
		this.columnTicketLists.set(def.status, ticketList);
		this.columnCountBadges.set(def.status, countBadge);
	}

	// --- Rendering -----------------------------------------------------------

	/**
	 * Re-renders all columns from the current board state, applying the active filter.
	 */
	private render(): void {
		this.renderDisposables.clear();

		const board = this.missionControlService.board;

		for (const def of KANBAN_COLUMN_DEFS) {
			const ticketList = this.columnTicketLists.get(def.status);
			const countBadge = this.columnCountBadges.get(def.status);
			if (!ticketList || !countBadge) {
				continue;
			}

			clearNode(ticketList);

			const boardColumn = board.columns.find(c => c.status === def.status);
			const rawTickets = boardColumn ? boardColumn.tickets : [];
			const filtered = rawTickets.filter(t => this.matchesFilter(t));

			countBadge.textContent = String(filtered.length);

			if (filtered.length === 0) {
				const empty = append(ticketList, $('div.kanban-column-empty'));
				empty.textContent = localize('kanban.column.empty', "No tickets");
				this.applyEmptyStyles(empty);
			} else {
				for (const ticket of filtered) {
					this.renderCard(ticket, ticketList);
				}
			}
		}
	}

	/**
	 * Renders a single ticket card inside the given column's ticket list.
	 */
	private renderCard(ticket: IMissionControlTicket, parent: HTMLElement): void {
		const card = append(parent, $('div.kanban-card'));
		card.setAttribute('role', 'listitem');
		card.setAttribute('draggable', 'true');
		card.tabIndex = 0;
		card.dataset.ticketId = ticket.id;
		card.setAttribute('aria-label', localize(
			'kanban.card.ariaLabel',
			"{0}: {1}",
			ticket.id,
			ticket.title,
		));

		this.applyCardStyles(card, ticket.priority);

		// Drag start
		this.renderDisposables.add(addDisposableListener(card, EventType.DRAG_START, (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.setData('text/plain', ticket.id);
				e.dataTransfer.effectAllowed = 'move';
			}
			card.style.opacity = '0.5';
		}));

		this.renderDisposables.add(addDisposableListener(card, EventType.DRAG_END, () => {
			card.style.opacity = '1';
		}));

		// Click
		this.renderDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this._onDidClickTicket.fire({ ticketId: ticket.id });
		}));

		// Keyboard activation
		this.renderDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._onDidClickTicket.fire({ ticketId: ticket.id });
			}
		}));

		// Card content: title
		const titleRow = append(card, $('div.kanban-card-title'));
		titleRow.textContent = ticket.title;
		titleRow.style.fontWeight = '600';
		titleRow.style.fontSize = '12px';
		titleRow.style.lineHeight = '1.4';
		titleRow.style.marginBottom = '4px';
		titleRow.style.overflow = 'hidden';
		titleRow.style.textOverflow = 'ellipsis';
		titleRow.style.whiteSpace = 'nowrap';

		// Card content: ID + type
		const infoRow = append(card, $('div.kanban-card-info'));
		infoRow.style.display = 'flex';
		infoRow.style.alignItems = 'center';
		infoRow.style.gap = '6px';
		infoRow.style.fontSize = '10px';
		infoRow.style.color = '#6B7280';

		const idSpan = append(infoRow, $('span'));
		idSpan.textContent = ticket.id;

		const typeLabel = TYPE_LABELS[ticket.type];
		if (typeLabel) {
			const typeSpan = append(infoRow, $('span'));
			typeSpan.textContent = typeLabel;
		}

		// Assigned agent
		if (ticket.assignedAgent) {
			const agentRow = append(card, $('div.kanban-card-agent'));
			agentRow.style.fontSize = '10px';
			agentRow.style.color = '#9CA3AF';
			agentRow.style.marginTop = '4px';
			agentRow.textContent = ticket.assignedAgent;
		}
	}

	// --- Filtering -----------------------------------------------------------

	private matchesFilter(ticket: IMissionControlTicket): boolean {
		const f = this.currentFilter;
		if (f.type && f.type.length > 0 && !f.type.includes(ticket.type)) {
			return false;
		}
		if (f.priority && f.priority.length > 0 && !f.priority.includes(ticket.priority)) {
			return false;
		}
		if (f.status && f.status.length > 0 && !f.status.includes(ticket.status)) {
			return false;
		}
		if (f.labels && f.labels.length > 0) {
			if (!f.labels.some(l => ticket.labels.includes(l))) {
				return false;
			}
		}
		if (f.assignedAgent !== undefined && ticket.assignedAgent !== f.assignedAgent) {
			return false;
		}
		if (f.epicId !== undefined && ticket.epicId !== f.epicId) {
			return false;
		}
		if (f.searchText) {
			const lower = f.searchText.toLowerCase();
			const inTitle = ticket.title.toLowerCase().includes(lower);
			const inDesc = ticket.description.toLowerCase().includes(lower);
			const inId = ticket.id.toLowerCase().includes(lower);
			if (!inTitle && !inDesc && !inId) {
				return false;
			}
		}
		return true;
	}

	// --- Inline styles -------------------------------------------------------

	private applyGridStyles(): void {
		const s = this.rootElement.style;
		s.display = 'grid';
		s.gridTemplateColumns = 'repeat(6, minmax(240px, 1fr))';
		s.gap = '8px';
		s.height = '100%';
		s.overflow = 'auto';
		s.padding = '8px';
		s.backgroundColor = '#0D0D0D';
	}

	private applyColumnStyles(el: HTMLElement): void {
		const s = el.style;
		s.display = 'flex';
		s.flexDirection = 'column';
		s.backgroundColor = '#111111';
		s.borderRadius = '6px';
		s.overflow = 'hidden';
		s.minHeight = '0';
	}

	private applyColumnHeaderStyles(el: HTMLElement): void {
		const s = el.style;
		s.display = 'flex';
		s.alignItems = 'center';
		s.gap = '8px';
		s.padding = '10px 12px';
		s.borderBottom = '1px solid #2A2A2A';
		s.flexShrink = '0';
	}

	private applyCountBadgeStyles(el: HTMLElement): void {
		const s = el.style;
		s.fontSize = '11px';
		s.color = '#6B7280';
		s.backgroundColor = '#1E1E1E';
		s.padding = '1px 7px';
		s.borderRadius = '10px';
		s.flexShrink = '0';
	}

	private applyTicketListStyles(el: HTMLElement): void {
		const s = el.style;
		s.flex = '1';
		s.overflowY = 'auto';
		s.padding = '8px';
		s.display = 'flex';
		s.flexDirection = 'column';
		s.gap = '6px';
		s.minHeight = '60px';
	}

	private applyEmptyStyles(el: HTMLElement): void {
		const s = el.style;
		s.display = 'flex';
		s.alignItems = 'center';
		s.justifyContent = 'center';
		s.padding = '24px 12px';
		s.color = '#4B5563';
		s.fontSize = '12px';
		s.fontStyle = 'italic';
	}

	private applyCardStyles(el: HTMLElement, priority: TicketPriority): void {
		const s = el.style;
		s.backgroundColor = '#161616';
		s.border = '1px solid #2A2A2A';
		s.borderRadius = '6px';
		s.padding = '10px 12px';
		s.cursor = 'grab';
		s.transition = 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease';
		s.borderLeftWidth = '3px';
		s.borderLeftColor = PRIORITY_BORDER_COLORS[priority] ?? '#6B7280';
		s.color = '#E5E5E5';
	}
}
