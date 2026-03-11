/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITaskItem, TaskItemStatus } from '../common/specTypes.js';

/** CSS colour constants — matching the Son of Anton dark theme. */
const CARD_BACKGROUND = '#161616';
const CARD_BORDER = '#2A2A2A';
const EARS_KEYWORD_COLOUR = '#C8962A';
const STATUS_DONE = '#3FB950';
const STATUS_IN_PROGRESS = '#C8962A';
const STATUS_TODO = '#8B949E';
const STATUS_SKIPPED = '#8B949E';
const DEPENDENCY_LINE_COLOUR = '#2A2A2A';

/**
 * Renders an array of {@link ITaskItem} objects as interactive checklist cards
 * with dependency lines, status-coloured checkboxes, and agent attribution badges.
 *
 * The renderer creates DOM elements inside a provided container and returns a
 * {@link Disposable} that cleans up all event listeners when disposed.
 */
export class TaskChecklistRenderer extends Disposable {

	private readonly taskElementMap = new Map<string, HTMLElement>();
	private readonly taskMap = new Map<string, ITaskItem>();
	private readonly listenerStore = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
	) {
		super();
	}

	/**
	 * Render the full task checklist into the container.
	 *
	 * @param tasks — the ordered list of task items to render
	 * @param onStatusToggle — optional callback fired when a user clicks a checkbox
	 */
	render(tasks: readonly ITaskItem[], onStatusToggle?: (taskId: string, newStatus: TaskItemStatus) => void): void {
		this.clear();

		for (const task of tasks) {
			this.taskMap.set(task.id, task);
		}

		for (const task of tasks) {
			this.renderTaskCard(task, onStatusToggle);
		}

		// Draw dependency connector lines after all cards are placed
		this.renderDependencyLines();
	}

	/**
	 * Remove all rendered content and reset internal state.
	 */
	clear(): void {
		this.listenerStore.clear();
		this.taskElementMap.clear();
		this.taskMap.clear();
		while (this.container.firstChild) {
			this.container.removeChild(this.container.firstChild);
		}
	}

	// ---- Card rendering ----------------------------------------------------

	private renderTaskCard(task: ITaskItem, onStatusToggle?: (taskId: string, newStatus: TaskItemStatus) => void): void {
		const card = append(this.container, $('.spec-renderer-task-card'));
		card.style.backgroundColor = CARD_BACKGROUND;
		card.style.border = `1px solid ${CARD_BORDER}`;
		card.style.borderRadius = '6px';
		card.style.padding = '10px 16px';
		card.style.display = 'flex';
		card.style.alignItems = 'flex-start';
		card.style.gap = '10px';
		card.style.position = 'relative';
		card.dataset.taskId = task.id;

		this.taskElementMap.set(task.id, card);

		const statusColour = this.getStatusColour(task.status);
		const isDone = task.status === TaskItemStatus.Done;

		// ---- Checkbox ----
		const checkbox = append(card, $('.spec-renderer-task-checkbox'));
		checkbox.style.width = '16px';
		checkbox.style.height = '16px';
		checkbox.style.borderRadius = '3px';
		checkbox.style.border = `2px solid ${statusColour}`;
		checkbox.style.backgroundColor = isDone ? statusColour : 'transparent';
		checkbox.style.flexShrink = '0';
		checkbox.style.marginTop = '1px';
		checkbox.style.display = 'flex';
		checkbox.style.alignItems = 'center';
		checkbox.style.justifyContent = 'center';
		checkbox.style.fontSize = '11px';
		checkbox.style.color = CARD_BACKGROUND;
		checkbox.style.cursor = 'pointer';
		checkbox.style.transition = 'background-color 0.15s ease, border-color 0.15s ease';
		checkbox.setAttribute('role', 'checkbox');
		checkbox.setAttribute('aria-checked', String(isDone));
		checkbox.setAttribute('aria-label', localize('specRenderer.taskCheckbox.label', "Toggle task: {0}", task.title));

		if (isDone) {
			checkbox.textContent = '\u2713'; // checkmark
		} else if (task.status === TaskItemStatus.InProgress) {
			checkbox.textContent = '\u2022'; // bullet dot for in-progress
		}

		// Toggle handler
		if (onStatusToggle) {
			const handler = () => {
				const nextStatus = this.getNextStatus(task.status);
				onStatusToggle(task.id, nextStatus);
			};
			checkbox.addEventListener('click', handler);
			this.listenerStore.add({ dispose: () => checkbox.removeEventListener('click', handler) });
		}

		// ---- Card body ----
		const body = append(card, $('.spec-renderer-task-body'));
		body.style.flex = '1';
		body.style.minWidth = '0';

		// Title row with agent badge
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

		// Description (hidden for done tasks)
		if (task.description && !isDone) {
			const descEl = append(body, $('.spec-renderer-task-description'));
			descEl.textContent = task.description;
			descEl.style.fontSize = '11px';
			descEl.style.color = STATUS_TODO;
			descEl.style.marginTop = '4px';
			descEl.style.lineHeight = '1.4';
		}

		// Status badge
		const statusBadge = append(body, $('.spec-renderer-task-status'));
		statusBadge.textContent = this.getStatusLabel(task.status);
		statusBadge.style.display = 'inline-block';
		statusBadge.style.fontSize = '10px';
		statusBadge.style.fontWeight = '500';
		statusBadge.style.marginTop = '6px';
		statusBadge.style.padding = '2px 8px';
		statusBadge.style.borderRadius = '10px';
		statusBadge.style.backgroundColor = statusColour + '22';
		statusBadge.style.color = statusColour;

		// Dependency indicator
		if (task.dependsOn.length > 0) {
			const depsContainer = append(body, $('.spec-renderer-task-deps'));
			depsContainer.style.marginTop = '6px';
			depsContainer.style.display = 'flex';
			depsContainer.style.alignItems = 'center';
			depsContainer.style.gap = '4px';
			depsContainer.style.fontSize = '10px';
			depsContainer.style.color = STATUS_TODO;

			const lineSymbol = append(depsContainer, $('span'));
			lineSymbol.textContent = '\u2514'; // box drawings light up and right
			lineSymbol.style.color = DEPENDENCY_LINE_COLOUR;

			const depLabel = append(depsContainer, $('span'));
			const depNames = task.dependsOn
				.map(id => this.taskMap.get(id)?.title ?? id)
				.join(', ');
			depLabel.textContent = localize('specRenderer.task.dependsOn', "depends on: {0}", depNames);
		}
	}

	// ---- Dependency lines --------------------------------------------------

	/**
	 * Render visual dependency connector lines between task cards.
	 *
	 * Uses a left-side vertical bar with horizontal connectors to show which
	 * tasks depend on other tasks.
	 */
	private renderDependencyLines(): void {
		for (const [taskId, taskElement] of this.taskElementMap) {
			const task = this.taskMap.get(taskId);
			if (!task || task.dependsOn.length === 0) {
				continue;
			}

			for (const depId of task.dependsOn) {
				const depElement = this.taskElementMap.get(depId);
				if (!depElement) {
					continue;
				}

				// Add a subtle left border accent to indicate the dependency relationship
				const connector = append(taskElement, $('.spec-renderer-task-dep-connector'));
				connector.style.position = 'absolute';
				connector.style.left = '0';
				connector.style.top = '0';
				connector.style.bottom = '0';
				connector.style.width = '3px';
				connector.style.backgroundColor = DEPENDENCY_LINE_COLOUR;
				connector.style.borderRadius = '6px 0 0 6px';
			}
		}
	}

	// ---- Status helpers ----------------------------------------------------

	private getStatusColour(status: TaskItemStatus): string {
		switch (status) {
			case TaskItemStatus.Done: return STATUS_DONE;
			case TaskItemStatus.InProgress: return STATUS_IN_PROGRESS;
			case TaskItemStatus.Todo: return STATUS_TODO;
			case TaskItemStatus.Skipped: return STATUS_SKIPPED;
		}
	}

	private getStatusLabel(status: TaskItemStatus): string {
		switch (status) {
			case TaskItemStatus.Done: return localize('specRenderer.taskStatus.done', "Done");
			case TaskItemStatus.InProgress: return localize('specRenderer.taskStatus.inProgress', "In Progress");
			case TaskItemStatus.Todo: return localize('specRenderer.taskStatus.todo', "To Do");
			case TaskItemStatus.Skipped: return localize('specRenderer.taskStatus.skipped', "Skipped");
		}
	}

	/**
	 * Cycle through statuses: todo -> inProgress -> done -> todo
	 */
	private getNextStatus(current: TaskItemStatus): TaskItemStatus {
		switch (current) {
			case TaskItemStatus.Todo: return TaskItemStatus.InProgress;
			case TaskItemStatus.InProgress: return TaskItemStatus.Done;
			case TaskItemStatus.Done: return TaskItemStatus.Todo;
			case TaskItemStatus.Skipped: return TaskItemStatus.Todo;
		}
	}
}
