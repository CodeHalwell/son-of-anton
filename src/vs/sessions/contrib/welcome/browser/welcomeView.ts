/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { $, append } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';

/**
 * Represents a recent project entry displayed in the welcome view.
 */
export interface IRecentProjectEntry {
	readonly path: string;
	readonly timestamp: number;
}

/**
 * Son of Anton branded welcome view.
 *
 * Provides a cold-start experience with the project wordmark,
 * primary action buttons and a recent-projects list.
 */
export class SonOfAntonWelcomeView extends ViewPane {

	static readonly ID = 'sonOfAnton.welcomeView';

	private container!: HTMLElement;
	private recentProjectsContainer!: HTMLElement;
	private modelStatusContainer!: HTMLElement;

	private recentProjects: IRecentProjectEntry[] = [];
	private readonly bodyDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService,
		);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.bodyDisposables.clear();

		this.container = append(container, $('.son-of-anton-welcome'));
		this.applyContainerStyles(this.container);

		// ── Centered content wrapper ───────────────────────────────────
		const content = append(this.container, $('.son-of-anton-welcome-content'));
		this.applyCenteredContentStyles(content);

		// ── Wordmark ───────────────────────────────────────────────────
		const wordmark = append(content, $('h1.son-of-anton-wordmark'));
		wordmark.textContent = nls.localize('sonOfAnton.wordmark', "Son of Anton");
		this.applyWordmarkStyles(wordmark);

		// ── Subtitle ───────────────────────────────────────────────────
		const subtitle = append(content, $('p.son-of-anton-subtitle'));
		subtitle.textContent = nls.localize('sonOfAnton.subtitle', "Agentic development environment");
		this.applySubtitleStyles(subtitle);

		// ── Action buttons ─────────────────────────────────────────────
		const actions = append(content, $('.son-of-anton-actions'));
		actions.style.display = 'flex';
		actions.style.gap = '16px';
		actions.style.marginTop = '32px';
		actions.style.justifyContent = 'center';

		const openProjectButton = this.createActionButton(
			actions,
			nls.localize('sonOfAnton.openProject', "Open Project"),
		);
		this.bodyDisposables.add(openProjectButton.onDidClick);

		const newAgentTaskButton = this.createActionButton(
			actions,
			nls.localize('sonOfAnton.newAgentTask', "New Agent Task"),
		);
		this.bodyDisposables.add(newAgentTaskButton.onDidClick);

		// ── Recent projects ────────────────────────────────────────────
		this.recentProjectsContainer = append(content, $('.son-of-anton-recent-projects'));
		this.recentProjectsContainer.style.marginTop = '48px';
		this.recentProjectsContainer.style.width = '100%';
		this.recentProjectsContainer.style.maxWidth = '480px';
		this.renderRecentProjects();

		// ── Bottom-left status bar ─────────────────────────────────────
		this.modelStatusContainer = append(this.container, $('.son-of-anton-model-status'));
		this.applyModelStatusStyles(this.modelStatusContainer);
		this.renderModelStatus();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.container) {
			this.container.style.width = `${width}px`;
			this.container.style.height = `${height}px`;
		}
	}

	// ── Public API ─────────────────────────────────────────────────────

	/**
	 * Update the list of recent projects displayed on the welcome screen.
	 */
	updateRecentProjects(projects: IRecentProjectEntry[]): void {
		this.recentProjects = projects;
		this.renderRecentProjects();
	}

	// ── Private rendering helpers ──────────────────────────────────────

	private createActionButton(
		parent: HTMLElement,
		label: string,
	): { element: HTMLElement; onDidClick: { dispose(): void } } {
		const button = append(parent, $('button.son-of-anton-action-button'));
		button.textContent = label;

		button.style.padding = '10px 28px';
		button.style.fontSize = '14px';
		button.style.fontWeight = '500';
		button.style.color = '#F5A623';
		button.style.backgroundColor = 'transparent';
		button.style.border = '1.5px solid #F5A623';
		button.style.borderRadius = '6px';
		button.style.cursor = 'pointer';
		button.style.fontFamily = 'Geist, system-ui, sans-serif';
		button.style.transition = 'background-color 150ms ease';

		const onMouseOver = () => {
			button.style.backgroundColor = 'rgba(245, 166, 35, 0.12)';
		};
		const onMouseOut = () => {
			button.style.backgroundColor = 'transparent';
		};
		button.addEventListener('mouseover', onMouseOver);
		button.addEventListener('mouseout', onMouseOut);

		const onClick = () => {
			if (label === nls.localize('sonOfAnton.openProject', "Open Project")) {
				this.commandService.executeCommand('workbench.action.files.openFolder');
			} else {
				this.commandService.executeCommand('sonOfAnton.newAgentTask');
			}
		};
		button.addEventListener('click', onClick);

		const disposable = {
			dispose: () => {
				button.removeEventListener('mouseover', onMouseOver);
				button.removeEventListener('mouseout', onMouseOut);
				button.removeEventListener('click', onClick);
			}
		};

		return { element: button, onDidClick: disposable };
	}

	private renderRecentProjects(): void {
		if (!this.recentProjectsContainer) {
			return;
		}

		this.recentProjectsContainer.textContent = '';

		if (this.recentProjects.length === 0) {
			return;
		}

		const heading = append(this.recentProjectsContainer, $('h3.son-of-anton-recent-heading'));
		heading.textContent = nls.localize('sonOfAnton.recentProjects', "Recent Projects");
		heading.style.color = '#888888';
		heading.style.fontSize = '12px';
		heading.style.fontWeight = '500';
		heading.style.textTransform = 'uppercase';
		heading.style.letterSpacing = '0.05em';
		heading.style.marginBottom = '12px';

		const list = append(this.recentProjectsContainer, $('ul.son-of-anton-recent-list'));
		list.style.listStyle = 'none';
		list.style.padding = '0';
		list.style.margin = '0';

		for (const project of this.recentProjects) {
			const item = append(list, $('li.son-of-anton-recent-item'));
			item.style.display = 'flex';
			item.style.justifyContent = 'space-between';
			item.style.alignItems = 'center';
			item.style.padding = '6px 0';
			item.style.borderBottom = '1px solid rgba(255, 255, 255, 0.06)';

			const pathLabel = append(item, $('span.son-of-anton-recent-path'));
			pathLabel.textContent = project.path;
			pathLabel.style.fontFamily = 'monospace';
			pathLabel.style.fontSize = '13px';
			pathLabel.style.color = '#cccccc';
			pathLabel.style.overflow = 'hidden';
			pathLabel.style.textOverflow = 'ellipsis';
			pathLabel.style.whiteSpace = 'nowrap';

			const timeLabel = append(item, $('span.son-of-anton-recent-time'));
			timeLabel.textContent = this.formatRelativeTime(project.timestamp);
			timeLabel.style.fontFamily = 'monospace';
			timeLabel.style.fontSize = '12px';
			timeLabel.style.color = '#666666';
			timeLabel.style.flexShrink = '0';
			timeLabel.style.marginLeft = '16px';
		}
	}

	private renderModelStatus(): void {
		if (!this.modelStatusContainer) {
			return;
		}

		this.modelStatusContainer.textContent = '';

		const modelStack = append(this.modelStatusContainer, $('span.son-of-anton-model-stack'));
		modelStack.textContent = nls.localize('sonOfAnton.modelStack', "Claude Opus · Sonnet · Haiku");
		modelStack.style.color = '#666666';
		modelStack.style.fontSize = '12px';
		modelStack.style.fontFamily = 'Geist, system-ui, sans-serif';

		const separator = append(this.modelStatusContainer, $('span.son-of-anton-status-separator'));
		separator.textContent = ' · ';
		separator.style.color = '#444444';
		separator.style.fontSize = '12px';

		const memoryStatus = append(this.modelStatusContainer, $('span.son-of-anton-memory-status'));
		memoryStatus.textContent = nls.localize('sonOfAnton.memoryReady', "Memory ready");
		memoryStatus.style.color = '#666666';
		memoryStatus.style.fontSize = '12px';
		memoryStatus.style.fontFamily = 'Geist, system-ui, sans-serif';
	}

	private formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diffMs = now - timestamp;
		const diffSeconds = Math.floor(diffMs / 1000);
		const diffMinutes = Math.floor(diffSeconds / 60);
		const diffHours = Math.floor(diffMinutes / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffDays > 0) {
			return nls.localize('sonOfAnton.daysAgo', "{0}d ago", diffDays);
		}
		if (diffHours > 0) {
			return nls.localize('sonOfAnton.hoursAgo', "{0}h ago", diffHours);
		}
		if (diffMinutes > 0) {
			return nls.localize('sonOfAnton.minutesAgo', "{0}m ago", diffMinutes);
		}
		return nls.localize('sonOfAnton.justNow', "just now");
	}

	// ── Inline styles ──────────────────────────────────────────────────

	private applyContainerStyles(element: HTMLElement): void {
		element.style.backgroundColor = '#0D0D0D';
		element.style.width = '100%';
		element.style.height = '100%';
		element.style.position = 'relative';
		element.style.overflow = 'hidden';
	}

	private applyCenteredContentStyles(element: HTMLElement): void {
		element.style.display = 'flex';
		element.style.flexDirection = 'column';
		element.style.alignItems = 'center';
		element.style.justifyContent = 'center';
		element.style.height = '100%';
		element.style.padding = '48px 24px';
		element.style.boxSizing = 'border-box';
	}

	private applyWordmarkStyles(element: HTMLElement): void {
		element.style.color = '#F5A623';
		element.style.fontFamily = 'Geist, system-ui, sans-serif';
		element.style.fontWeight = '600';
		element.style.fontSize = '42px';
		element.style.margin = '0 0 8px 0';
		element.style.letterSpacing = '-0.02em';
		element.style.textAlign = 'center';
	}

	private applySubtitleStyles(element: HTMLElement): void {
		element.style.color = '#888888';
		element.style.fontFamily = 'Geist, system-ui, sans-serif';
		element.style.fontWeight = '400';
		element.style.fontSize = '16px';
		element.style.margin = '0';
		element.style.textAlign = 'center';
	}

	private applyModelStatusStyles(element: HTMLElement): void {
		element.style.position = 'absolute';
		element.style.bottom = '16px';
		element.style.left = '20px';
		element.style.display = 'flex';
		element.style.alignItems = 'center';
		element.style.gap = '0';
	}
}
