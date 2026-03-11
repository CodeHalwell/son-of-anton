/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import {
	BuildTestResult,
	ITerminalBlock,
	TerminalBlockKind,
	isAgentBlock,
	isBuildFailure
} from '../common/terminalBlockTypes.js';

/**
 * Renders a single terminal block into the DOM.
 *
 * Each terminal command is displayed as a discrete block with a coloured left
 * border indicating its kind, a header showing agent attribution and timing,
 * the command text, collapsible output, and hover-revealed metadata/actions.
 */
export class TerminalBlockRenderer extends Disposable {

	// ---- Events ----------------------------------------------------------

	private readonly _onDidRequestRevert = this._store.add(new Emitter<string>());
	readonly onDidRequestRevert: Event<string> = this._onDidRequestRevert.event;

	private readonly _onDidRequestCheckpoint = this._store.add(new Emitter<string>());
	readonly onDidRequestCheckpoint: Event<string> = this._onDidRequestCheckpoint.event;

	private readonly _onDidRequestCopy = this._store.add(new Emitter<string>());
	readonly onDidRequestCopy: Event<string> = this._onDidRequestCopy.event;

	private readonly _onDidRequestRerun = this._store.add(new Emitter<string>());
	readonly onDidRequestRerun: Event<string> = this._onDidRequestRerun.event;

	// ---- DOM elements ----------------------------------------------------

	private readonly _rootElement: HTMLElement;
	private readonly _headerElement: HTMLElement;
	private readonly _agentBadge: HTMLElement;
	private readonly _agentNameSpan: HTMLElement;
	private readonly _modelSpan: HTMLElement;
	private readonly _timestampSpan: HTMLElement;
	private readonly _commandElement: HTMLElement;
	private readonly _outputWrapper: HTMLElement;
	private readonly _outputElement: HTMLElement;
	private readonly _outputToggle: HTMLButtonElement;
	private readonly _metadataElement: HTMLElement;
	private readonly _actionsElement: HTMLElement;

	/** Disposables for action button listeners, recreated on each update. */
	private readonly _actionListeners = this._store.add(new DisposableStore());

	// ---- State -----------------------------------------------------------

	private _outputCollapsed = true;
	private _currentBlockId: string;

	constructor(
		parent: HTMLElement,
		block: ITerminalBlock,
	) {
		super();

		// -- Root --
		this._rootElement = append(parent, $<HTMLDivElement>('.tb-block'));
		this._rootElement.setAttribute('role', 'region');
		this._rootElement.setAttribute('tabindex', '0');

		// -- Header --
		this._headerElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-header'));
		this._headerElement.setAttribute('role', 'heading');
		this._headerElement.setAttribute('aria-level', '3');

		// Agent attribution badge (icon + name + model, shown only for agent blocks)
		this._agentBadge = append(this._headerElement, $<HTMLSpanElement>('span.tb-agent-badge'));
		this._agentBadge.setAttribute('role', 'status');

		this._agentNameSpan = append(this._agentBadge, $<HTMLSpanElement>('span.tb-agent-name'));
		this._modelSpan = append(this._agentBadge, $<HTMLSpanElement>('span.tb-model-badge'));
		this._timestampSpan = append(this._headerElement, $<HTMLSpanElement>('span.tb-timestamp'));

		// -- Command --
		this._commandElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-command'));
		this._commandElement.setAttribute('role', 'code');

		// -- Output wrapper (for collapse animation) --
		this._outputWrapper = append(this._rootElement, $<HTMLDivElement>('.tb-block-output-wrapper.tb-collapsed'));

		this._outputElement = append(this._outputWrapper, $<HTMLDivElement>('.tb-block-output'));
		this._outputElement.setAttribute('role', 'log');

		// -- Output toggle (button for accessibility) --
		this._outputToggle = append(this._rootElement, $<HTMLButtonElement>('button.tb-block-output-toggle'));
		this._outputToggle.setAttribute('aria-expanded', 'false');

		this._store.add(addDisposableListener(this._outputToggle, EventType.CLICK, () => {
			this._toggleOutput();
		}));

		// -- Metadata --
		this._metadataElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-metadata'));
		this._metadataElement.setAttribute('role', 'contentinfo');

		// -- Actions --
		this._actionsElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-actions'));
		this._actionsElement.setAttribute('role', 'toolbar');
		this._actionsElement.setAttribute('aria-label', localize('terminalBlock.actions', "Block actions"));

		// -- Initial render --
		this._currentBlockId = block.id;
		this._createActionButtons();
		this.update(block);
	}

	/**
	 * The root DOM element for this block.
	 */
	get element(): HTMLElement {
		return this._rootElement;
	}

	// ---- Public API ------------------------------------------------------

	/**
	 * Update the renderer with new block data.
	 */
	update(block: ITerminalBlock): void {
		this._currentBlockId = block.id;

		// Kind class
		this._rootElement.className = 'tb-block';
		this._rootElement.classList.add(this._getKindClass(block));

		if (block.endedAt === undefined) {
			this._rootElement.classList.add('tb-running');
		}

		// ARIA label for the block
		this._rootElement.setAttribute('aria-label', this._getAriaLabel(block));

		// -- Agent attribution badge --
		if (isAgentBlock(block) && block.metadata.agentName) {
			this._agentBadge.style.display = '';
			this._agentNameSpan.textContent = block.metadata.agentName;
			this._agentBadge.setAttribute('aria-label', localize(
				'terminalBlock.agentAttribution',
				"Agent: {0}",
				block.metadata.agentName
			));

			if (block.metadata.modelUsed) {
				this._modelSpan.textContent = block.metadata.modelUsed;
				this._modelSpan.className = 'tb-model-badge';
				this._modelSpan.classList.add(this._getModelBadgeClass(block.metadata.modelUsed));
				this._modelSpan.style.display = '';
			} else {
				this._modelSpan.textContent = '';
				this._modelSpan.style.display = 'none';
			}
		} else {
			this._agentBadge.style.display = 'none';
		}

		this._timestampSpan.textContent = this._formatTimestamp(block.startedAt);

		// Command
		this._commandElement.textContent = block.command;

		// Output
		this._outputElement.textContent = block.output;
		if (block.output) {
			this._outputToggle.textContent = this._outputCollapsed
				? localize('terminalBlock.showOutput', "Show output")
				: localize('terminalBlock.hideOutput', "Hide output");
			this._outputToggle.style.display = '';
		} else {
			this._outputToggle.style.display = 'none';
		}

		// Metadata
		this._updateMetadata(block);
	}

	// ---- Private helpers -------------------------------------------------

	private _createActionButtons(): void {
		this._actionListeners.clear();

		const copyButton = append(this._actionsElement, $<HTMLButtonElement>('button.tb-action-btn'));
		copyButton.textContent = localize('terminalBlock.copyOutput', "Copy Output");
		copyButton.setAttribute('aria-label', localize('terminalBlock.copyOutputLabel', "Copy block output to clipboard"));
		this._actionListeners.add(addDisposableListener(copyButton, EventType.CLICK, () => {
			this._onDidRequestCopy.fire(this._currentBlockId);
		}));

		const rerunButton = append(this._actionsElement, $<HTMLButtonElement>('button.tb-action-btn'));
		rerunButton.textContent = localize('terminalBlock.rerun', "Re-run");
		rerunButton.setAttribute('aria-label', localize('terminalBlock.rerunLabel', "Re-run this command"));
		this._actionListeners.add(addDisposableListener(rerunButton, EventType.CLICK, () => {
			this._onDidRequestRerun.fire(this._currentBlockId);
		}));

		const revertButton = append(this._actionsElement, $<HTMLButtonElement>('button.tb-action-btn'));
		revertButton.textContent = localize('terminalBlock.revert', "Revert");
		revertButton.setAttribute('aria-label', localize('terminalBlock.revertLabel', "Revert changes from this block"));
		this._actionListeners.add(addDisposableListener(revertButton, EventType.CLICK, () => {
			this._onDidRequestRevert.fire(this._currentBlockId);
		}));

		const checkpointButton = append(this._actionsElement, $<HTMLButtonElement>('button.tb-action-btn'));
		checkpointButton.textContent = localize('terminalBlock.checkpoint', "Checkpoint");
		checkpointButton.setAttribute('aria-label', localize('terminalBlock.checkpointLabel', "Create a checkpoint at this block"));
		this._actionListeners.add(addDisposableListener(checkpointButton, EventType.CLICK, () => {
			this._onDidRequestCheckpoint.fire(this._currentBlockId);
		}));
	}

	private _getKindClass(block: ITerminalBlock): string {
		switch (block.kind) {
			case TerminalBlockKind.Manual:
				return 'tb-kind-manual';
			case TerminalBlockKind.AgentOriginated:
				return 'tb-kind-agent';
			case TerminalBlockKind.BuildTest:
				return isBuildFailure(block) ? 'tb-kind-build-fail' : 'tb-kind-build-pass';
			case TerminalBlockKind.Checkpoint:
				return 'tb-kind-checkpoint';
			case TerminalBlockKind.System:
				return 'tb-kind-system';
			default:
				return 'tb-kind-manual';
		}
	}

	private _getModelBadgeClass(model: string): string {
		const lower = model.toLowerCase();
		if (lower.includes('opus')) {
			return 'tb-model-badge--opus';
		}
		if (lower.includes('sonnet')) {
			return 'tb-model-badge--sonnet';
		}
		if (lower.includes('haiku')) {
			return 'tb-model-badge--haiku';
		}
		return 'tb-model-badge--default';
	}

	private _getAriaLabel(block: ITerminalBlock): string {
		const kindLabel = this._getKindAriaLabel(block);
		const status = block.endedAt === undefined
			? localize('terminalBlock.running', "running")
			: localize('terminalBlock.completed', "completed");
		return localize(
			'terminalBlock.blockLabel',
			"{0} block, {1}: {2}",
			kindLabel,
			status,
			block.command || localize('terminalBlock.noCommand', "no command")
		);
	}

	private _getKindAriaLabel(block: ITerminalBlock): string {
		switch (block.kind) {
			case TerminalBlockKind.Manual:
				return localize('terminalBlock.kindManual', "Manual");
			case TerminalBlockKind.AgentOriginated:
				return localize('terminalBlock.kindAgent', "Agent");
			case TerminalBlockKind.BuildTest:
				return isBuildFailure(block)
					? localize('terminalBlock.kindBuildFail', "Build fail")
					: localize('terminalBlock.kindBuildPass', "Build pass");
			case TerminalBlockKind.Checkpoint:
				return localize('terminalBlock.kindCheckpoint', "Checkpoint");
			case TerminalBlockKind.System:
				return localize('terminalBlock.kindSystem', "System");
			default:
				return localize('terminalBlock.kindUnknown', "Unknown");
		}
	}

	private _toggleOutput(): void {
		this._outputCollapsed = !this._outputCollapsed;

		if (this._outputCollapsed) {
			this._outputWrapper.classList.add('tb-collapsed');
			this._outputToggle.textContent = localize('terminalBlock.showOutput', "Show output");
			this._outputToggle.setAttribute('aria-expanded', 'false');
		} else {
			this._outputWrapper.classList.remove('tb-collapsed');
			this._outputToggle.textContent = localize('terminalBlock.hideOutput', "Hide output");
			this._outputToggle.setAttribute('aria-expanded', 'true');
		}
	}

	private _updateMetadata(block: ITerminalBlock): void {
		const parts: string[] = [];

		if (block.metadata.costUsd !== undefined) {
			parts.push(localize('terminalBlock.cost', "Cost: ${0}", block.metadata.costUsd.toFixed(4)));
		}
		if (block.metadata.tokensIn !== undefined && block.metadata.tokensOut !== undefined) {
			parts.push(localize('terminalBlock.tokens', "Tokens: {0} in / {1} out", block.metadata.tokensIn, block.metadata.tokensOut));
		}
		if (block.metadata.checkpointId) {
			parts.push(localize('terminalBlock.checkpoint.id', "Checkpoint: {0}", block.metadata.checkpointId));
		}
		if (block.metadata.buildResult !== undefined) {
			const resultLabel = block.metadata.buildResult === BuildTestResult.Pass
				? localize('terminalBlock.buildPass', "Pass")
				: block.metadata.buildResult === BuildTestResult.Fail
					? localize('terminalBlock.buildFail', "Fail")
					: localize('terminalBlock.buildPartial', "Partial");
			parts.push(localize('terminalBlock.buildResult', "Result: {0}", resultLabel));
		}

		this._metadataElement.textContent = parts.join('  \u00B7  ');
	}

	private _formatTimestamp(epochMs: number): string {
		const date = new Date(epochMs);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}
}
