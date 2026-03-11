/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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

	// ---- DOM elements ----------------------------------------------------

	private readonly _rootElement: HTMLElement;
	private readonly _headerElement: HTMLElement;
	private readonly _agentNameSpan: HTMLElement;
	private readonly _modelSpan: HTMLElement;
	private readonly _timestampSpan: HTMLElement;
	private readonly _commandElement: HTMLElement;
	private readonly _outputElement: HTMLElement;
	private readonly _outputToggle: HTMLElement;
	private readonly _metadataElement: HTMLElement;
	private readonly _actionsElement: HTMLElement;

	// ---- State -----------------------------------------------------------

	private _outputCollapsed = true;

	constructor(
		parent: HTMLElement,
		block: ITerminalBlock,
	) {
		super();

		// -- Root --
		this._rootElement = append(parent, $<HTMLDivElement>('.tb-block'));

		// -- Header --
		this._headerElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-header'));
		this._agentNameSpan = append(this._headerElement, $<HTMLSpanElement>('span.tb-agent-name'));
		this._modelSpan = append(this._headerElement, $<HTMLSpanElement>('span.tb-model'));
		this._timestampSpan = append(this._headerElement, $<HTMLSpanElement>('span.tb-timestamp'));

		// -- Command --
		this._commandElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-command'));

		// -- Output --
		this._outputElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-output.tb-collapsed'));
		this._outputToggle = append(this._rootElement, $<HTMLSpanElement>('span.tb-block-output-toggle'));

		this._store.add(addDisposableListener(this._outputToggle, EventType.CLICK, () => {
			this._toggleOutput();
		}));

		// -- Metadata --
		this._metadataElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-metadata'));

		// -- Actions --
		this._actionsElement = append(this._rootElement, $<HTMLDivElement>('.tb-block-actions'));

		const revertButton = append(this._actionsElement, $<HTMLButtonElement>('button'));
		revertButton.textContent = localize('terminalBlock.revert', "Revert");
		this._store.add(addDisposableListener(revertButton, EventType.CLICK, () => {
			this._onDidRequestRevert.fire(this._currentBlockId);
		}));

		const checkpointButton = append(this._actionsElement, $<HTMLButtonElement>('button'));
		checkpointButton.textContent = localize('terminalBlock.checkpoint', "Checkpoint");
		this._store.add(addDisposableListener(checkpointButton, EventType.CLICK, () => {
			this._onDidRequestCheckpoint.fire(this._currentBlockId);
		}));

		// -- Initial render --
		this._currentBlockId = block.id;
		this.update(block);
	}

	private _currentBlockId: string;

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

		// Header
		if (isAgentBlock(block) && block.metadata.agentName) {
			this._agentNameSpan.textContent = block.metadata.agentName;
			this._agentNameSpan.style.display = '';
		} else {
			this._agentNameSpan.textContent = '';
			this._agentNameSpan.style.display = 'none';
		}

		if (block.metadata.modelUsed) {
			this._modelSpan.textContent = block.metadata.modelUsed;
			this._modelSpan.style.display = '';
		} else {
			this._modelSpan.textContent = '';
			this._modelSpan.style.display = 'none';
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

	private _toggleOutput(): void {
		this._outputCollapsed = !this._outputCollapsed;

		if (this._outputCollapsed) {
			this._outputElement.classList.add('tb-collapsed');
			this._outputToggle.textContent = localize('terminalBlock.showOutput', "Show output");
		} else {
			this._outputElement.classList.remove('tb-collapsed');
			this._outputToggle.textContent = localize('terminalBlock.hideOutput', "Hide output");
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
