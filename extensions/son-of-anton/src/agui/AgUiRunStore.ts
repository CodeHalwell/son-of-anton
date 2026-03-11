/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	AgUiEvent,
	AgUiEventType,
	AgentRunInfo,
	AgentRunInput,
	RunFinishedEvent,
	RunErrorEvent,
	ToolCallStartEvent,
	StepStartedEvent,
	RunStore,
} from './types';

// ---------------------------------------------------------------------------
// AgUiRunStore — Unified run store
// ---------------------------------------------------------------------------

/**
 * In-memory store for agent run state. Single source of truth for both the
 * Agent View sidebar and the Agent Chat Panel.
 *
 * Implements the {@link RunStore} interface so it can be passed directly to
 * the Agent View sidebar and the unified chat panel.
 */
export class AgUiRunStore implements RunStore, vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	private readonly _onRunEvent = new vscode.EventEmitter<{ runId: string; event: AgUiEvent }>();
	private readonly _onRunInfoChanged = new vscode.EventEmitter<{ runId: string; info: AgentRunInfo }>();

	/** Fires when any run is added or updated (for tree view refresh). */
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	private readonly runs = new Map<string, AgentRunInfo>();
	private activeRunId: string | undefined;

	/** Callback to submit a new run — wired in by the extension activation. */
	private submitRunHandler?: (input: AgentRunInput) => Promise<string>;

	/** Callback to cancel a run. */
	private cancelRunHandler?: (runId: string) => void;

	/** Callback to submit a user selection. */
	private selectionHandler?: (requestId: string, values: string[]) => void;

	// -- Configuration setters -----------------------------------------------

	setSubmitRunHandler(handler: (input: AgentRunInput) => Promise<string>): void {
		this.submitRunHandler = handler;
	}

	setCancelRunHandler(handler: (runId: string) => void): void {
		this.cancelRunHandler = handler;
	}

	setSelectionHandler(handler: (requestId: string, values: string[]) => void): void {
		this.selectionHandler = handler;
	}

	// -- Run management ------------------------------------------------------

	/**
	 * Return all stored runs, sorted most recent first.
	 */
	getRuns(): readonly AgentRunInfo[] {
		return Array.from(this.runs.values()).sort((a, b) => b.startedAt - a.startedAt);
	}

	/**
	 * Retrieve a run by its runId.
	 */
	getRun(runId: string): AgentRunInfo | undefined {
		return this.runs.get(runId);
	}

	/**
	 * Get the currently active run id.
	 */
	getActiveRunId(): string | undefined {
		return this.activeRunId;
	}

	/**
	 * Set the active run.
	 */
	setActiveRunId(runId: string | undefined): void {
		this.activeRunId = runId;
	}

	/**
	 * Add a new run to the store.
	 */
	addRun(run: AgentRunInfo): void {
		this.runs.set(run.runId, run);
		this.activeRunId = run.runId;
		this._onDidChange.fire();
	}

	/**
	 * Update an existing run with partial fields.
	 */
	updateRun(runId: string, patch: Partial<AgentRunInfo>): void {
		const existing = this.runs.get(runId);
		if (!existing) {
			return;
		}
		const updated: AgentRunInfo = { ...existing, ...patch };
		this.runs.set(runId, updated);
		this._onDidChange.fire();
		this._onRunInfoChanged.fire({ runId, info: updated });
	}

	/**
	 * Append an AG-UI event to a run's event log and update derived fields.
	 */
	appendEvent(runId: string, event: AgUiEvent): void {
		const existing = this.runs.get(runId);
		if (!existing) {
			return;
		}

		const events = [...existing.events, event];
		const patch: Partial<AgentRunInfo> = { events };

		switch (event.type) {
			case AgUiEventType.RunStarted:
				patch.status = 'running';
				break;
			case AgUiEventType.RunFinished: {
				const finished = event as RunFinishedEvent;
				patch.status = 'completed';
				patch.finishedAt = finished.timestamp;
				patch.inputTokens = finished.inputTokens;
				patch.outputTokens = finished.outputTokens;
				patch.costUsd = finished.costUsd;
				break;
			}
			case AgUiEventType.RunError: {
				const error = event as RunErrorEvent;
				patch.status = error.code === 'CANCELLED' ? 'cancelled' : 'error';
				patch.finishedAt = event.timestamp;
				break;
			}
			case AgUiEventType.StepStarted: {
				const step = event as StepStartedEvent;
				patch.currentStep = step.stepName;
				break;
			}
			case AgUiEventType.StepFinished:
				patch.currentStep = undefined;
				break;
			case AgUiEventType.ToolCallStart: {
				const toolStart = event as ToolCallStartEvent;
				patch.currentToolCall = toolStart.toolCallName;
				break;
			}
			case AgUiEventType.ToolCallEnd:
				patch.currentToolCall = undefined;
				break;
			default:
				break;
		}

		this.updateRun(runId, patch);
		this._onRunEvent.fire({ runId, event });
	}

	// -- RunStore interface ---------------------------------------------------

	onRunEvent(runId: string, listener: (event: AgUiEvent) => void): vscode.Disposable {
		return this._onRunEvent.event(({ runId: id, event }) => {
			if (id === runId) {
				listener(event);
			}
		});
	}

	onRunInfoChanged(runId: string, listener: (info: AgentRunInfo) => void): vscode.Disposable {
		return this._onRunInfoChanged.event(({ runId: id, info }) => {
			if (id === runId) {
				listener(info);
			}
		});
	}

	async submitRun(input: AgentRunInput): Promise<string> {
		if (!this.submitRunHandler) {
			throw new Error('No submit run handler configured');
		}
		return this.submitRunHandler(input);
	}

	cancelRun(runId: string): void {
		this.cancelRunHandler?.(runId);
	}

	submitSelection(requestId: string, values: string[]): void {
		this.selectionHandler?.(requestId, values);
	}

	// -- Cleanup -------------------------------------------------------------

	dispose(): void {
		this._onDidChange.dispose();
		this._onRunEvent.dispose();
		this._onRunInfoChanged.dispose();
		this.runs.clear();
	}
}
