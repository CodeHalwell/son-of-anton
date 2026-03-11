/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentRunInfo, AgentRunStatus } from './types';
import { AgUiRunStore } from './AgUiRunStore';

// ---------------------------------------------------------------------------
// Category Type
// ---------------------------------------------------------------------------

type CategoryType = 'running' | 'completed' | 'error';

// ---------------------------------------------------------------------------
// Tree Items
// ---------------------------------------------------------------------------

/**
 * Union type for all items that can appear in the Agent View tree.
 */
export type AgentViewItem = AgentViewCategory | AgentRunItem | AgentToolCallItem;

/**
 * Top-level category node (Running, Completed, Errors).
 */
export class AgentViewCategory extends vscode.TreeItem {
	constructor(
		public readonly categoryType: CategoryType,
		label: string,
		count: number,
	) {
		super(
			label,
			count > 0
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed,
		);
		this.description = `(${count})`;
		this.contextValue = `agentViewCategory.${categoryType}`;

		switch (categoryType) {
			case 'running':
				this.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.orange'));
				break;
			case 'completed':
				this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
				break;
			case 'error':
				this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
				break;
		}
	}
}

/**
 * Individual agent run node.
 */
export class AgentRunItem extends vscode.TreeItem {
	constructor(public readonly run: AgentRunInfo) {
		const hasChildren = run.status === 'running' && (run.currentToolCall !== undefined);
		super(
			run.agentName,
			hasChildren
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None,
		);

		this.contextValue = `agentRun.${run.status}`;

		// Description varies by status
		switch (run.status) {
			case 'running':
			case 'pending':
				this.description = `${run.model} \u2014 "${run.currentStep ?? 'Starting...'}"`;
				this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.orange'));
				break;
			case 'completed': {
				const totalTokens = formatNumber(run.inputTokens + run.outputTokens);
				const cost = formatCost(run.costUsd);
				this.description = `${run.model} \u2014 ${totalTokens} tokens \u2014 ${cost}`;
				this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
				break;
			}
			case 'error':
				this.description = `${run.model} \u2014 "${lastErrorMessage(run)}"`;
				this.iconPath = new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red'));
				break;
			case 'cancelled':
				this.description = `${run.model} \u2014 cancelled`;
				this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.yellow'));
				break;
		}

		// Tooltip with full details
		this.tooltip = buildTooltip(run);

		// Click opens the agent chat stream
		this.command = {
			command: 'sota.openAgentStream',
			title: 'Open Agent Stream',
			arguments: [run.runId, run.threadId],
		};
	}
}

/**
 * Child node showing the current tool call for a running agent.
 */
export class AgentToolCallItem extends vscode.TreeItem {
	constructor(toolCallName: string, detail?: string) {
		super(`Tool: ${toolCallName}`, vscode.TreeItemCollapsibleState.None);
		this.description = detail;
		this.iconPath = new vscode.ThemeIcon('wrench', new vscode.ThemeColor('charts.orange'));
		this.contextValue = 'agentToolCall';
	}
}

// ---------------------------------------------------------------------------
// Tree Data Provider
// ---------------------------------------------------------------------------

/**
 * Tree data provider for the Agent View sidebar.
 * Shows all live and recent agent runs grouped by status:
 * Running, Completed, and Errors.
 */
export class AgentViewProvider implements vscode.TreeDataProvider<AgentViewItem> {
	private readonly store: AgUiRunStore;
	private readonly disposables: vscode.Disposable[] = [];

	private readonly _onDidChangeTreeData = new vscode.EventEmitter<AgentViewItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<AgentViewItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(store: AgUiRunStore) {
		this.store = store;
		this.disposables.push(
			this.store.onDidChange(() => this.refresh()),
		);
	}

	/**
	 * Manually refresh the entire tree.
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: AgentViewItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: AgentViewItem): AgentViewItem[] {
		if (!element) {
			return this.getRootCategories();
		}

		if (element instanceof AgentViewCategory) {
			return this.getRunsForCategory(element.categoryType);
		}

		if (element instanceof AgentRunItem) {
			return this.getRunChildren(element.run);
		}

		return [];
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	// -- Private helpers ----------------------------------------------------

	private getRootCategories(): AgentViewCategory[] {
		const runs = this.store.getRuns();
		const running = runs.filter(r => r.status === 'running' || r.status === 'pending');
		const completed = runs.filter(r => r.status === 'completed' || r.status === 'cancelled');
		const errors = runs.filter(r => r.status === 'error');

		return [
			new AgentViewCategory('running', 'Running', running.length),
			new AgentViewCategory('completed', 'Completed', completed.length),
			new AgentViewCategory('error', 'Errors', errors.length),
		];
	}

	private getRunsForCategory(categoryType: CategoryType): AgentRunItem[] {
		const runs = this.store.getRuns();
		let filtered: readonly AgentRunInfo[];

		switch (categoryType) {
			case 'running':
				filtered = runs.filter(r => r.status === 'running' || r.status === 'pending');
				break;
			case 'completed':
				filtered = runs.filter(r => r.status === 'completed' || r.status === 'cancelled');
				break;
			case 'error':
				filtered = runs.filter(r => r.status === 'error');
				break;
		}

		// Sort: most recent first
		const sorted = [...filtered].sort((a, b) => b.startedAt - a.startedAt);
		return sorted.map(r => new AgentRunItem(r));
	}

	private getRunChildren(run: AgentRunInfo): AgentToolCallItem[] {
		if (run.status !== 'running' || !run.currentToolCall) {
			return [];
		}
		return [new AgentToolCallItem(run.currentToolCall, run.currentStep)];
	}
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
	return n.toLocaleString('en-US');
}

function formatCost(usd: number): string {
	if (usd < 0.01) {
		return `$${usd.toFixed(4)}`;
	}
	return `$${usd.toFixed(2)}`;
}

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

function lastErrorMessage(run: AgentRunInfo): string {
	// Walk events in reverse to find the most recent RunError
	for (let i = run.events.length - 1; i >= 0; i--) {
		const event = run.events[i];
		if (event.type === 'RUN_ERROR' && 'message' in event) {
			return (event as { message: string }).message;
		}
	}
	return 'Unknown error';
}

function buildTooltip(run: AgentRunInfo): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.supportThemeIcons = true;

	md.appendMarkdown(`**${run.agentName}**\n\n`);
	md.appendMarkdown(`| | |\n|---|---|\n`);
	md.appendMarkdown(`| Model | \`${run.model}\` |\n`);
	md.appendMarkdown(`| Status | ${statusLabel(run.status)} |\n`);
	md.appendMarkdown(`| Run ID | \`${run.runId}\` |\n`);
	md.appendMarkdown(`| Thread | \`${run.threadId}\` |\n`);

	if (run.inputTokens > 0 || run.outputTokens > 0) {
		md.appendMarkdown(`| Input tokens | ${formatNumber(run.inputTokens)} |\n`);
		md.appendMarkdown(`| Output tokens | ${formatNumber(run.outputTokens)} |\n`);
		md.appendMarkdown(`| Total tokens | ${formatNumber(run.inputTokens + run.outputTokens)} |\n`);
	}

	if (run.costUsd > 0) {
		md.appendMarkdown(`| Cost | ${formatCost(run.costUsd)} |\n`);
	}

	const elapsed = (run.finishedAt ?? Date.now()) - run.startedAt;
	md.appendMarkdown(`| Elapsed | ${formatElapsed(elapsed)} |\n`);

	if (run.currentStep) {
		md.appendMarkdown(`\n---\n**Current step:** ${run.currentStep}\n`);
	}

	if (run.currentToolCall) {
		md.appendMarkdown(`\n**Tool call:** \`${run.currentToolCall}\`\n`);
	}

	if (run.status === 'error') {
		md.appendMarkdown(`\n---\n$(error) **Error:** ${lastErrorMessage(run)}\n`);
	}

	return md;
}

function statusLabel(status: AgentRunStatus): string {
	switch (status) {
		case 'pending': return '$(clock) Pending';
		case 'running': return '$(sync~spin) Running';
		case 'completed': return '$(check) Completed';
		case 'error': return '$(error) Error';
		case 'cancelled': return '$(circle-slash) Cancelled';
	}
}
