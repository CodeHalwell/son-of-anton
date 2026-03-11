/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/memoryBrowser.css';
import { $, append } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IMemoryQueryOptions } from '../common/memoryTypes.js';
import { IMemoryService } from './memoryService.js';

export const MEMORY_BROWSER_VIEW_ID = 'workbench.view.soaMemoryBrowser';

type SearchMode = 'keyword' | 'semantic' | 'graph';

export class MemoryBrowserView extends ViewPane {

	static readonly ID = MEMORY_BROWSER_VIEW_ID;

	private bodyContainer: HTMLElement | undefined;
	private searchInput: HTMLInputElement | undefined;
	private resultsList: HTMLElement | undefined;
	private placeholderContainer: HTMLElement | undefined;
	private statNodes: HTMLElement | undefined;
	private statEdges: HTMLElement | undefined;

	private _searchMode: SearchMode = 'keyword';
	private readonly _modeButtons: HTMLButtonElement[] = [];

	private readonly renderDisposables = this._register(new DisposableStore());

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
		@IMemoryService private readonly memoryService: IMemoryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.bodyContainer = append(container, $('div.soa-memory-browser'));

		// Mode toggle (keyword / semantic / graph)
		this._renderModeToggle();

		// Search bar
		const searchBar = append(this.bodyContainer, $('div.soa-memory-search'));
		this.searchInput = append(searchBar, $('input.soa-memory-search-input')) as HTMLInputElement;
		this.searchInput.type = 'text';
		this.searchInput.placeholder = localize('memorySearch.placeholder', "Search memory graph...");

		// Results list
		this.resultsList = append(this.bodyContainer, $('div.soa-memory-results'));

		// Placeholder
		this.placeholderContainer = append(this.bodyContainer, $('div.soa-memory-placeholder'));

		const placeholderIcon = append(this.placeholderContainer, $('div.soa-memory-placeholder-icon'));
		placeholderIcon.textContent = '\uD83E\uDDE0'; // brain emoji

		const placeholderTitle = append(this.placeholderContainer, $('div.soa-memory-placeholder-title'));
		placeholderTitle.textContent = localize('memoryBrowser.placeholderTitle', "Memory Browser");

		const placeholderSub = append(this.placeholderContainer, $('div.soa-memory-placeholder-sub'));
		placeholderSub.textContent = localize('memoryBrowser.placeholder', "No memory nodes yet. Start an agent session to begin building the knowledge graph.");

		// Stats footer
		this._renderStatsFooter();

		this.renderDisposables.add({
			dispose: () => {
				this.searchInput?.removeEventListener('input', this.handleSearch);
			}
		});

		this.searchInput.addEventListener('input', this.handleSearch);

		// Listen for memory changes to refresh stats
		this.renderDisposables.add(this.memoryService.onDidChangeMemory(() => {
			this._updateStats();
			// Re-run search if there is an active query
			const query = this.searchInput?.value?.trim();
			if (query) {
				this.performSearch(query);
			}
		}));

		this._updateStats();
	}

	// ---- Mode toggle ----

	private _renderModeToggle(): void {
		if (!this.bodyContainer) {
			return;
		}

		const toggleContainer = append(this.bodyContainer, $('div.soa-memory-mode-toggle'));

		const modes: { mode: SearchMode; label: string }[] = [
			{ mode: 'keyword', label: localize('memoryBrowser.keyword', "Keyword") },
			{ mode: 'semantic', label: localize('memoryBrowser.semantic', "Semantic") },
			{ mode: 'graph', label: localize('memoryBrowser.graph', "Graph") },
		];

		for (const { mode, label } of modes) {
			const btn = append(toggleContainer, $('button.soa-memory-mode-btn')) as HTMLButtonElement;
			btn.textContent = label;
			btn.type = 'button';
			btn.dataset.mode = mode;

			if (mode === this._searchMode) {
				btn.classList.add('active');
			}

			const onClick = (): void => {
				this._searchMode = mode;
				this._updateModeButtons();
				// Re-run search with new mode
				const query = this.searchInput?.value?.trim();
				if (query) {
					this.performSearch(query);
				}
			};
			btn.addEventListener('click', onClick);
			this.renderDisposables.add({ dispose: () => btn.removeEventListener('click', onClick) });

			this._modeButtons.push(btn);
		}
	}

	private _updateModeButtons(): void {
		for (const btn of this._modeButtons) {
			const isActive = btn.dataset.mode === this._searchMode;
			if (isActive) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}
	}

	// ---- Stats footer ----

	private _renderStatsFooter(): void {
		if (!this.bodyContainer) {
			return;
		}

		const statsBar = append(this.bodyContainer, $('div.soa-memory-stats'));

		const nodesSpan = append(statsBar, $('span'));
		nodesSpan.textContent = localize('memoryBrowser.nodes', "Nodes: ");
		this.statNodes = append(nodesSpan, $('span.soa-memory-stat-value'));
		this.statNodes.textContent = '0';

		const edgesSpan = append(statsBar, $('span'));
		edgesSpan.textContent = localize('memoryBrowser.edges', "Edges: ");
		this.statEdges = append(edgesSpan, $('span.soa-memory-stat-value'));
		this.statEdges.textContent = '0';
	}

	private _updateStats(): void {
		const stats = this.memoryService.getStats();
		if (this.statNodes) {
			this.statNodes.textContent = String(stats.totalNodes);
		}
		if (this.statEdges) {
			this.statEdges.textContent = String(stats.totalEdges);
		}
	}

	// ---- Search ----

	private readonly handleSearch = (): void => {
		const query = this.searchInput?.value ?? '';
		if (!query.trim()) {
			this.showPlaceholder();
			return;
		}
		this.performSearch(query.trim());
	};

	private showPlaceholder(): void {
		if (this.resultsList) {
			this.resultsList.style.display = 'none';
		}
		if (this.placeholderContainer) {
			this.placeholderContainer.style.display = 'flex';
		}
	}

	private _buildQueryOptions(query: string): IMemoryQueryOptions {
		return {
			query,
			maxResults: 50,
			minScore: 0.3,
			includeVector: this._searchMode === 'semantic',
			includeKeyword: this._searchMode === 'keyword',
			includeGraph: this._searchMode === 'graph',
			filterKinds: undefined,
		};
	}

	private performSearch(query: string): void {
		const results = this.memoryService.search(this._buildQueryOptions(query));

		if (this.placeholderContainer) {
			this.placeholderContainer.style.display = 'none';
		}
		if (this.resultsList) {
			this.resultsList.style.display = 'block';
			this.resultsList.textContent = '';

			if (results.length === 0) {
				const noResults = append(this.resultsList, $('div.soa-memory-no-results'));
				noResults.textContent = localize('memoryBrowser.noResults', "No results for \"{0}\"", query);
				return;
			}

			for (const result of results) {
				const item = append(this.resultsList, $('div.soa-memory-result-item'));

				// Header row: kind badge, title, score
				const header = append(item, $('div.soa-memory-result-header'));

				const kindBadge = append(header, $('span.soa-memory-result-kind'));
				kindBadge.textContent = result.node.kind;
				kindBadge.dataset.kind = result.node.kind;

				const title = append(header, $('div.soa-memory-result-title'));
				title.textContent = result.node.label;

				// Score indicator
				const scoreContainer = append(header, $('div.soa-memory-result-score'));
				const scoreBar = append(scoreContainer, $('div.soa-memory-result-score-bar'));
				const scoreFill = append(scoreBar, $('div.soa-memory-result-score-fill'));
				scoreFill.style.width = `${Math.round(result.score * 100)}%`;
				const scoreLabel = append(scoreContainer, $('span.soa-memory-result-score-label'));
				scoreLabel.textContent = `${Math.round(result.score * 100)}%`;

				// Content summary
				if (result.node.content) {
					const summary = append(item, $('div.soa-memory-result-summary'));
					summary.textContent = result.node.content.length > 120
						? result.node.content.substring(0, 120) + '...'
						: result.node.content;
				}
			}
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
