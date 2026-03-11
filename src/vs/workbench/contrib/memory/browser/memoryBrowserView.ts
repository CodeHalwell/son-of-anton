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
import { IMemoryService } from './memoryService.js';

export const MEMORY_BROWSER_VIEW_ID = 'workbench.view.soaMemoryBrowser';

export class MemoryBrowserView extends ViewPane {

	static readonly ID = MEMORY_BROWSER_VIEW_ID;

	private bodyContainer: HTMLElement | undefined;
	private searchInput: HTMLInputElement | undefined;
	private resultsList: HTMLElement | undefined;
	private placeholderContainer: HTMLElement | undefined;

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

		// Search bar
		const searchBar = append(this.bodyContainer, $('div.soa-memory-search'));
		this.searchInput = append(searchBar, $('input.soa-memory-search-input')) as HTMLInputElement;
		this.searchInput.type = 'text';
		this.searchInput.placeholder = localize('memorySearch.placeholder', "Search memory graph...");

		// Results list
		this.resultsList = append(this.bodyContainer, $('div.soa-memory-results'));

		// Placeholder
		this.placeholderContainer = append(this.bodyContainer, $('div.soa-memory-placeholder'));
		this.placeholderContainer.textContent = localize('memoryBrowser.placeholder', "No memory nodes yet. Start an agent session to begin building the knowledge graph.");

		this.renderDisposables.add({
			dispose: () => {
				this.searchInput?.removeEventListener('input', this.handleSearch);
			}
		});

		this.searchInput.addEventListener('input', this.handleSearch);
	}

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
			this.placeholderContainer.style.display = 'block';
		}
	}

	private performSearch(query: string): void {
		const results = this.memoryService.search({
			query,
			maxResults: 50,
			minScore: 0.3,
			includeVector: false,
			includeKeyword: true,
			includeGraph: false,
			filterKinds: undefined,
		});
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
				const title = append(item, $('div.soa-memory-result-title'));
				title.textContent = result.node.label;
				const kind = append(item, $('span.soa-memory-result-kind'));
				kind.textContent = result.node.kind;
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
