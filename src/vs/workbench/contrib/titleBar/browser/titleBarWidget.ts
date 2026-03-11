/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/titleBar.css';
import { $, append } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITitleBarStateService, ITitleBarState } from './titleBarStateService.js';

/**
 * Custom title bar widget for Son of Anton IDE.
 *
 * Renders three sections horizontally:
 * - **Left**: "Son of Anton" wordmark in amber gold
 * - **Center**: Model indicator pill badge
 * - **Right**: Context usage bar, cost ticker, and active agent count
 *
 * All sections update reactively via {@link ITitleBarStateService}.
 */
export class TitleBarWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly modelLabel: HTMLElement;
	private readonly contextFill: HTMLElement;
	private readonly contextLabel: HTMLElement;
	private readonly costLabel: HTMLElement;
	private readonly agentsBadge: HTMLElement;

	constructor(
		@ITitleBarStateService private readonly titleBarStateService: ITitleBarStateService,
	) {
		super();

		// Root container
		this.element = $('div.soa-titlebar-widget');

		// --- Left section: wordmark ---
		append(this.element, $('span.soa-titlebar-wordmark', undefined, localize('soaWordmark', "Son of Anton")));

		// --- Center section: model indicator ---
		this.modelLabel = append(this.element, $('span.soa-titlebar-model'));

		// --- Right section ---
		const rightSection = append(this.element, $('div.soa-titlebar-right'));

		// Context usage bar
		const contextContainer = append(rightSection, $('div.soa-titlebar-context'));
		const contextBar = append(contextContainer, $('div.soa-titlebar-context-bar'));
		this.contextFill = append(contextBar, $('div.soa-titlebar-context-fill'));
		this.contextLabel = append(contextContainer, $('span.soa-titlebar-context-label'));

		// Cost ticker
		this.costLabel = append(rightSection, $('span.soa-titlebar-cost'));

		// Active agents badge
		this.agentsBadge = append(rightSection, $('span.soa-titlebar-agents'));

		// Initial render from current state
		this.renderState(this.titleBarStateService.state);

		// Subscribe to state changes
		this._register(this.titleBarStateService.onDidChangeState(state => this.renderState(state)));
	}

	/**
	 * Returns the root HTMLElement for appending to the title bar.
	 */
	getElement(): HTMLElement {
		return this.element;
	}

	private renderState(state: ITitleBarState): void {
		// Model indicator
		this.modelLabel.textContent = state.modelName || localize('noModel', "no model");

		// Context usage bar
		const percent = state.contextUsagePercent;
		this.contextFill.style.width = `${percent}%`;
		this.contextFill.classList.toggle('critical', percent > 90);
		this.contextLabel.textContent = localize('contextUsage', "{0}% ctx", Math.round(percent));

		// Cost ticker
		this.costLabel.textContent = `$${state.sessionCostUsd.toFixed(2)}`;

		// Active agents badge
		const agentCount = state.activeAgentCount;
		if (agentCount > 0) {
			this.agentsBadge.textContent = agentCount === 1
				? localize('agentCountSingular', "1 agent")
				: localize('agentCountPlural', "{0} agents", agentCount);
			this.agentsBadge.classList.remove('hidden');
		} else {
			this.agentsBadge.textContent = '';
			this.agentsBadge.classList.add('hidden');
		}
	}
}
