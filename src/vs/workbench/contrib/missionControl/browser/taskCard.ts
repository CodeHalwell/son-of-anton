/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IMissionControlTicket, TicketStatus, TicketType, TicketPriority, ITicketTraceEntry } from '../common/missionControlTypes.js';

/** Event payload when the user requests a status change on a card. */
export interface IStatusChangeRequest {
	readonly ticketId: string;
	readonly currentStatus: TicketStatus;
}

/** Event payload when the user requests to expand a card. */
export interface IExpandRequest {
	readonly ticketId: string;
}

/** Event payload when the user requests to add a comment. */
export interface ICommentRequest {
	readonly ticketId: string;
}

// #region Constants

const TYPE_BADGE_COLORS: Record<string, string> = {
	[TicketType.Epic]: '#7B2D8B',
	[TicketType.Story]: '#2D5B8B',
	[TicketType.Subtask]: '#888888',
	[TicketType.Bug]: '#E74C3C',
	[TicketType.Spike]: '#E67E22',
};

const TYPE_LABELS: Record<string, string> = {
	[TicketType.Epic]: 'Epic',
	[TicketType.Story]: 'Story',
	[TicketType.Subtask]: 'Subtask',
	[TicketType.Bug]: 'Bug',
	[TicketType.Spike]: 'Spike',
};

const PRIORITY_COLORS: Record<string, string> = {
	[TicketPriority.Critical]: '#E74C3C',
	[TicketPriority.High]: '#E67E22',
	[TicketPriority.Medium]: '#F5A623',
	[TicketPriority.Low]: '#888888',
};

const STATUS_COLORS: Record<string, string> = {
	[TicketStatus.Queued]: '#888888',
	[TicketStatus.Running]: '#F5A623',
	[TicketStatus.Paused]: '#888888',
	[TicketStatus.Review]: '#E67E22',
	[TicketStatus.Complete]: '#27AE60',
	[TicketStatus.Failed]: '#E74C3C',
};

const STATUS_LABELS: Record<string, string> = {
	[TicketStatus.Queued]: 'Queued',
	[TicketStatus.Running]: 'Running',
	[TicketStatus.Paused]: 'Paused',
	[TicketStatus.Review]: 'Review',
	[TicketStatus.Complete]: 'Complete',
	[TicketStatus.Failed]: 'Failed',
};

// #endregion

/**
 * Renders an individual task card for the Mission Control kanban board.
 * Each card represents a single ticket (Epic, Story, Subtask, Bug, or Spike).
 */
export class TaskCard extends Disposable {

	// #region Events

	private readonly _onDidRequestStatusChange = this._register(new Emitter<IStatusChangeRequest>());
	readonly onDidRequestStatusChange: Event<IStatusChangeRequest> = this._onDidRequestStatusChange.event;

	private readonly _onDidRequestExpand = this._register(new Emitter<IExpandRequest>());
	readonly onDidRequestExpand: Event<IExpandRequest> = this._onDidRequestExpand.event;

	private readonly _onDidRequestComment = this._register(new Emitter<ICommentRequest>());
	readonly onDidRequestComment: Event<ICommentRequest> = this._onDidRequestComment.event;

	// #endregion

	// #region DOM References

	private readonly cardElement: HTMLElement;
	private readonly typeBadge: HTMLElement;
	private readonly titleElement: HTMLElement;
	private readonly priorityDot: HTMLElement;
	private readonly statusBadge: HTMLElement;
	private readonly agentAttribution: HTMLElement;
	private readonly metricsRow: HTMLElement;
	private readonly labelsRow: HTMLElement;
	private readonly criteriaContainer: HTMLElement;
	private readonly criteriaList: HTMLElement;
	private readonly criteriaToggle: HTMLElement;
	private readonly traceSummary: HTMLElement;
	private readonly blockedOverlay: HTMLElement;

	// #endregion

	private readonly cardDisposables = this._register(new DisposableStore());
	private _selected = false;
	private _criteriaExpanded = false;
	private _ticket: IMissionControlTicket;

	constructor(
		ticket: IMissionControlTicket,
		parent: HTMLElement
	) {
		super();
		this._ticket = ticket;

		// Root card element
		this.cardElement = append(parent, $('.mission-control-task-card'));
		this.cardElement.setAttribute('role', 'listitem');
		this.cardElement.setAttribute('data-ticket-id', ticket.id);
		this.applyCardStyles();

		// Blocked overlay (hidden by default)
		this.blockedOverlay = append(this.cardElement, $('.task-card-blocked-overlay'));
		this.applyBlockedOverlayStyles();

		// Header row: type badge, title, priority dot
		const headerRow = append(this.cardElement, $('.task-card-header'));
		this.applyHeaderRowStyles(headerRow);

		this.typeBadge = append(headerRow, $('.task-card-type-badge'));
		this.applyTypeBadgeStyles();

		this.titleElement = append(headerRow, $('.task-card-title'));
		this.applyTitleStyles();

		this.priorityDot = append(headerRow, $('.task-card-priority-dot'));
		this.applyPriorityDotStyles();

		// Status badge
		this.statusBadge = append(this.cardElement, $('.task-card-status-badge'));
		this.applyStatusBadgeStyles();

		// Agent attribution
		this.agentAttribution = append(this.cardElement, $('.task-card-agent'));
		this.applyAgentAttributionStyles();

		// Metrics row
		this.metricsRow = append(this.cardElement, $('.task-card-metrics'));
		this.applyMetricsRowStyles();

		// Labels row
		this.labelsRow = append(this.cardElement, $('.task-card-labels'));
		this.applyLabelsRowStyles();

		// Acceptance criteria (collapsible)
		this.criteriaContainer = append(this.cardElement, $('.task-card-criteria'));
		this.criteriaToggle = append(this.criteriaContainer, $('.task-card-criteria-toggle'));
		this.applyCriteriaToggleStyles();
		this.criteriaList = append(this.criteriaContainer, $('.task-card-criteria-list'));
		this.criteriaList.style.display = 'none';

		// Trace summary
		this.traceSummary = append(this.cardElement, $('.task-card-trace'));
		this.applyTraceSummaryStyles();

		// Actions row
		const actionsRow = append(this.cardElement, $('.task-card-actions'));
		this.applyActionsRowStyles(actionsRow);
		this.createActionButtons(actionsRow);

		// Register hover and click listeners
		this.registerCardListeners();

		// Initial render
		this.renderTicket();
	}

	// #region Public API

	/**
	 * Returns the ticket ID for this card.
	 */
	get ticketId(): string {
		return this._ticket.id;
	}

	/**
	 * Returns whether this card is currently selected.
	 */
	get selected(): boolean {
		return this._selected;
	}

	/**
	 * Sets the selected state of this card.
	 */
	set selected(value: boolean) {
		this._selected = value;
		this.updateBorderState();
	}

	/**
	 * Efficiently updates the card DOM to reflect a new ticket state.
	 */
	update(ticket: IMissionControlTicket): void {
		const prev = this._ticket;
		this._ticket = ticket;

		if (prev.type !== ticket.type) {
			this.renderTypeBadge();
		}
		if (prev.title !== ticket.title) {
			this.renderTitle();
		}
		if (prev.priority !== ticket.priority) {
			this.renderPriorityDot();
		}
		if (prev.status !== ticket.status) {
			this.renderStatusBadge();
			this.updateRunningAnimation();
		}
		if (prev.assignedAgent !== ticket.assignedAgent || prev.modelUsed !== ticket.modelUsed) {
			this.renderAgentAttribution();
		}
		if (prev.totalTokensIn !== ticket.totalTokensIn
			|| prev.totalTokensOut !== ticket.totalTokensOut
			|| prev.totalCostUsd !== ticket.totalCostUsd
			|| prev.elapsedMs !== ticket.elapsedMs) {
			this.renderMetrics();
		}
		if (prev.labels !== ticket.labels) {
			this.renderLabels();
		}
		if (prev.acceptanceCriteria !== ticket.acceptanceCriteria) {
			this.renderAcceptanceCriteria();
		}
		if (prev.trace !== ticket.trace || prev.trace.length !== ticket.trace.length) {
			this.renderTraceSummary();
		}
		if (prev.blockedBy !== ticket.blockedBy) {
			this.updateBlockedState();
		}

		this.cardElement.setAttribute('data-ticket-id', ticket.id);
	}

	/**
	 * Returns the root DOM element for this card.
	 */
	getDomNode(): HTMLElement {
		return this.cardElement;
	}

	// #endregion

	// #region Rendering

	private renderTicket(): void {
		this.renderTypeBadge();
		this.renderTitle();
		this.renderPriorityDot();
		this.renderStatusBadge();
		this.renderAgentAttribution();
		this.renderMetrics();
		this.renderLabels();
		this.renderAcceptanceCriteria();
		this.renderTraceSummary();
		this.updateBlockedState();
		this.updateRunningAnimation();
	}

	private renderTypeBadge(): void {
		const type = this._ticket.type;
		this.typeBadge.textContent = TYPE_LABELS[type] ?? type;
		this.typeBadge.style.backgroundColor = TYPE_BADGE_COLORS[type] ?? '#888888';
	}

	private renderTitle(): void {
		this.titleElement.textContent = this._ticket.title;
		this.titleElement.title = this._ticket.title;
	}

	private renderPriorityDot(): void {
		const priority = this._ticket.priority;
		this.priorityDot.style.backgroundColor = PRIORITY_COLORS[priority] ?? '#888888';
		this.priorityDot.title = localize('taskCard.priority', "Priority: {0}", priority);
	}

	private renderStatusBadge(): void {
		const status = this._ticket.status;
		this.statusBadge.textContent = STATUS_LABELS[status] ?? status;
		this.statusBadge.style.backgroundColor = STATUS_COLORS[status] ?? '#888888';
		if (status === TicketStatus.Running) {
			this.statusBadge.style.animation = 'soa-pulse-status 1.5s ease-in-out infinite';
		} else {
			this.statusBadge.style.animation = 'none';
		}
	}

	private renderAgentAttribution(): void {
		const ticket = this._ticket;
		if (ticket.assignedAgent) {
			let text = localize('taskCard.assignedTo', "Assigned to: {0}", ticket.assignedAgent);
			this.agentAttribution.textContent = '';
			const agentText = append(this.agentAttribution, $('span'));
			agentText.textContent = text;

			if (ticket.modelUsed) {
				const modelBadge = append(this.agentAttribution, $('span.task-card-model-badge'));
				modelBadge.textContent = ticket.modelUsed;
				modelBadge.style.marginLeft = '6px';
				modelBadge.style.padding = '1px 6px';
				modelBadge.style.borderRadius = '4px';
				modelBadge.style.fontSize = '10px';
				modelBadge.style.backgroundColor = 'var(--soa-bg-elevated, #161616)';
				modelBadge.style.border = '1px solid var(--soa-border-default, #2A2A2A)';
				modelBadge.style.color = 'var(--soa-text-secondary, #888888)';
			}
			this.agentAttribution.style.display = '';
		} else {
			this.agentAttribution.textContent = localize('taskCard.unassigned', "Unassigned");
			this.agentAttribution.style.display = '';
		}
	}

	private renderMetrics(): void {
		const ticket = this._ticket;
		const tokens = ticket.totalTokensIn + ticket.totalTokensOut;
		const cost = ticket.totalCostUsd.toFixed(2);
		const elapsed = this.formatElapsedTime(ticket.elapsedMs);

		this.metricsRow.textContent = '';

		const tokenSpan = append(this.metricsRow, $('span.task-card-metric'));
		tokenSpan.textContent = localize('taskCard.tokens', "{0} tokens", tokens.toLocaleString());

		const costSpan = append(this.metricsRow, $('span.task-card-metric'));
		costSpan.textContent = `$${cost}`;

		const timeSpan = append(this.metricsRow, $('span.task-card-metric'));
		timeSpan.textContent = elapsed;
	}

	private renderLabels(): void {
		this.labelsRow.textContent = '';
		const labels = this._ticket.labels;
		if (labels.length === 0) {
			this.labelsRow.style.display = 'none';
			return;
		}
		this.labelsRow.style.display = 'flex';
		for (const label of labels) {
			const pill = append(this.labelsRow, $('span.task-card-label'));
			pill.textContent = label;
			pill.style.padding = '1px 8px';
			pill.style.borderRadius = '8px';
			pill.style.fontSize = '10px';
			pill.style.backgroundColor = 'var(--soa-border-default, #2A2A2A)';
			pill.style.color = 'var(--soa-text-secondary, #888888)';
			pill.style.whiteSpace = 'nowrap';
		}
	}

	private renderAcceptanceCriteria(): void {
		const criteria = this._ticket.acceptanceCriteria;
		if (criteria.length === 0) {
			this.criteriaContainer.style.display = 'none';
			return;
		}
		this.criteriaContainer.style.display = '';
		this.criteriaToggle.textContent = localize(
			'taskCard.acceptanceCriteria',
			"Acceptance Criteria ({0})",
			criteria.length
		);
		this.criteriaList.textContent = '';
		for (const criterion of criteria) {
			const item = append(this.criteriaList, $('div.task-card-criterion'));
			const checkbox = append(item, $('span'));
			checkbox.textContent = '\u2610 ';
			checkbox.style.marginRight = '4px';
			const text = append(item, $('span'));
			text.textContent = criterion;
			item.style.fontSize = '11px';
			item.style.color = 'var(--soa-text-secondary, #888888)';
			item.style.padding = '2px 0';
		}
	}

	private renderTraceSummary(): void {
		const trace = this._ticket.trace;
		if (trace.length === 0) {
			this.traceSummary.style.display = 'none';
			return;
		}
		this.traceSummary.style.display = '';
		const lastEntry: ITicketTraceEntry = trace[trace.length - 1];
		const timeStr = new Date(lastEntry.timestamp).toLocaleTimeString();
		this.traceSummary.textContent = localize(
			'taskCard.lastTrace',
			"{0} \u2014 {1}",
			timeStr,
			lastEntry.action
		);
	}

	// #endregion

	// #region Visual States

	private updateBorderState(): void {
		if (this._selected) {
			this.cardElement.style.borderColor = 'var(--soa-gold-primary, #F5A623)';
			this.cardElement.style.boxShadow = '0 0 0 1px var(--soa-gold-primary, #F5A623)';
		} else {
			this.cardElement.style.borderColor = 'var(--soa-border-default, #2A2A2A)';
			this.cardElement.style.boxShadow = 'none';
		}
	}

	private updateBlockedState(): void {
		const blocked = this._ticket.blockedBy.length > 0;
		if (blocked) {
			this.blockedOverlay.style.display = 'flex';
			this.cardElement.style.opacity = '0.5';
		} else {
			this.blockedOverlay.style.display = 'none';
			this.cardElement.style.opacity = '1';
		}
	}

	private updateRunningAnimation(): void {
		if (this._ticket.status === TicketStatus.Running) {
			this.cardElement.style.animation = 'soa-pulse-card 2s ease-in-out infinite';
		} else {
			this.cardElement.style.animation = 'none';
		}
	}

	// #endregion

	// #region Event Listeners

	private registerCardListeners(): void {
		this.cardDisposables.add(addDisposableListener(this.cardElement, EventType.MOUSE_ENTER, () => {
			if (!this._selected) {
				this.cardElement.style.borderColor = 'var(--soa-gold-primary, #F5A623)';
				this.cardElement.style.boxShadow = '0 0 8px rgba(245, 166, 35, 0.3)';
			}
		}));

		this.cardDisposables.add(addDisposableListener(this.cardElement, EventType.MOUSE_LEAVE, () => {
			if (!this._selected) {
				this.cardElement.style.borderColor = 'var(--soa-border-default, #2A2A2A)';
				this.cardElement.style.boxShadow = 'none';
			}
		}));

		this.cardDisposables.add(addDisposableListener(this.cardElement, EventType.CLICK, () => {
			this._onDidRequestExpand.fire({ ticketId: this._ticket.id });
		}));

		this.cardDisposables.add(addDisposableListener(this.criteriaToggle, EventType.CLICK, (e) => {
			e.stopPropagation();
			this._criteriaExpanded = !this._criteriaExpanded;
			this.criteriaList.style.display = this._criteriaExpanded ? '' : 'none';
			this.criteriaToggle.textContent = (this._criteriaExpanded ? '\u25BC ' : '\u25B6 ') +
				localize(
					'taskCard.acceptanceCriteria',
					"Acceptance Criteria ({0})",
					this._ticket.acceptanceCriteria.length
				);
		}));
	}

	private createActionButtons(parent: HTMLElement): void {
		// Status change button
		const statusBtn = append(parent, $('button.task-card-action-btn'));
		statusBtn.textContent = '\u21BB';
		statusBtn.title = localize('taskCard.changeStatus', "Change Status");
		this.applyActionButtonStyles(statusBtn);
		this.cardDisposables.add(addDisposableListener(statusBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this._onDidRequestStatusChange.fire({
				ticketId: this._ticket.id,
				currentStatus: this._ticket.status
			});
		}));

		// Comment button
		const commentBtn = append(parent, $('button.task-card-action-btn'));
		commentBtn.textContent = '\uD83D\uDCAC';
		commentBtn.title = localize('taskCard.addComment', "Add Comment");
		this.applyActionButtonStyles(commentBtn);
		this.cardDisposables.add(addDisposableListener(commentBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this._onDidRequestComment.fire({ ticketId: this._ticket.id });
		}));
	}

	// #endregion

	// #region Inline Styles

	private applyCardStyles(): void {
		const s = this.cardElement.style;
		s.backgroundColor = 'var(--soa-bg-elevated, #161616)';
		s.border = '1px solid var(--soa-border-default, #2A2A2A)';
		s.borderRadius = '6px';
		s.padding = '10px 12px';
		s.marginBottom = '6px';
		s.cursor = 'pointer';
		s.position = 'relative';
		s.transition = 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease';
		s.overflow = 'hidden';
	}

	private applyBlockedOverlayStyles(): void {
		const s = this.blockedOverlay.style;
		s.position = 'absolute';
		s.top = '0';
		s.left = '0';
		s.right = '0';
		s.bottom = '0';
		s.display = 'none';
		s.alignItems = 'center';
		s.justifyContent = 'center';
		s.fontSize = '18px';
		s.pointerEvents = 'none';
		this.blockedOverlay.textContent = '\uD83D\uDEAB';
	}

	private applyHeaderRowStyles(el: HTMLElement): void {
		el.style.display = 'flex';
		el.style.alignItems = 'center';
		el.style.gap = '8px';
		el.style.marginBottom = '6px';
	}

	private applyTypeBadgeStyles(): void {
		const s = this.typeBadge.style;
		s.padding = '1px 6px';
		s.borderRadius = '4px';
		s.fontSize = '10px';
		s.fontWeight = '600';
		s.color = '#FFFFFF';
		s.textTransform = 'uppercase';
		s.letterSpacing = '0.5px';
		s.flexShrink = '0';
	}

	private applyTitleStyles(): void {
		const s = this.titleElement.style;
		s.flex = '1';
		s.fontSize = '12px';
		s.fontWeight = '500';
		s.color = 'var(--soa-text-primary, #E8E8E8)';
		s.overflow = 'hidden';
		s.textOverflow = 'ellipsis';
		s.whiteSpace = 'nowrap';
	}

	private applyPriorityDotStyles(): void {
		const s = this.priorityDot.style;
		s.width = '8px';
		s.height = '8px';
		s.borderRadius = '50%';
		s.flexShrink = '0';
	}

	private applyStatusBadgeStyles(): void {
		const s = this.statusBadge.style;
		s.display = 'inline-block';
		s.padding = '2px 8px';
		s.borderRadius = '10px';
		s.fontSize = '10px';
		s.fontWeight = '600';
		s.color = '#FFFFFF';
		s.marginBottom = '6px';
	}

	private applyAgentAttributionStyles(): void {
		const s = this.agentAttribution.style;
		s.fontSize = '11px';
		s.color = 'var(--soa-text-secondary, #888888)';
		s.marginBottom = '4px';
		s.display = 'flex';
		s.alignItems = 'center';
	}

	private applyMetricsRowStyles(): void {
		const s = this.metricsRow.style;
		s.display = 'flex';
		s.gap = '10px';
		s.fontSize = '10px';
		s.color = 'var(--soa-text-muted, #555555)';
		s.marginBottom = '6px';
	}

	private applyLabelsRowStyles(): void {
		const s = this.labelsRow.style;
		s.display = 'flex';
		s.flexWrap = 'wrap';
		s.gap = '4px';
		s.marginBottom = '6px';
	}

	private applyCriteriaToggleStyles(): void {
		const s = this.criteriaToggle.style;
		s.fontSize = '11px';
		s.color = 'var(--soa-text-secondary, #888888)';
		s.cursor = 'pointer';
		s.padding = '2px 0';
		s.userSelect = 'none';
	}

	private applyTraceSummaryStyles(): void {
		const s = this.traceSummary.style;
		s.fontSize = '10px';
		s.color = 'var(--soa-text-muted, #555555)';
		s.marginBottom = '6px';
		s.fontStyle = 'italic';
	}

	private applyActionsRowStyles(el: HTMLElement): void {
		el.style.display = 'flex';
		el.style.gap = '4px';
		el.style.justifyContent = 'flex-end';
	}

	private applyActionButtonStyles(btn: HTMLElement): void {
		const s = btn.style;
		s.border = '1px solid var(--soa-border-default, #2A2A2A)';
		s.backgroundColor = 'transparent';
		s.color = 'var(--soa-text-secondary, #888888)';
		s.borderRadius = '4px';
		s.padding = '2px 6px';
		s.cursor = 'pointer';
		s.fontSize = '12px';
		s.lineHeight = '1';
	}

	// #endregion

	// #region Helpers

	private formatElapsedTime(ms: number): string {
		if (ms < 1000) {
			return localize('taskCard.elapsed.ms', "{0}ms", ms);
		}
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) {
			return localize('taskCard.elapsed.seconds', "{0}s", seconds);
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		if (minutes < 60) {
			return localize('taskCard.elapsed.minutes', "{0}m {1}s", minutes, remainingSeconds);
		}
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return localize('taskCard.elapsed.hours', "{0}h {1}m", hours, remainingMinutes);
	}

	// #endregion
}
