/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowVisibility } from '../../../../workbench/common/views.js';
import { IMemoryService, MemoryService } from './memoryService.js';
import { MEMORY_BROWSER_VIEW_ID, MemoryBrowserView } from './memoryBrowserView.js';
import { MEMORY_GRAPH_VIEW_ID, MemoryGraphView } from './memoryGraphView.js';

// --- Service registration ---
registerSingleton(IMemoryService, MemoryService, InstantiationType.Delayed);

// --- View registration ---
const MEMORY_BROWSER_CONTAINER_ID = 'soa.viewContainer.memoryBrowser';

const memoryBrowserViewIcon = registerIcon('soa-memory-browser-icon', Codicon.database, localize('soaMemoryBrowserIcon', 'View icon for the Memory Browser.'));

const memoryBrowserViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: MEMORY_BROWSER_CONTAINER_ID,
	title: localize2('memoryBrowser', 'Memory Browser'),
	icon: memoryBrowserViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [MEMORY_BROWSER_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: false }]),
	storageId: MEMORY_BROWSER_CONTAINER_ID,
	hideIfEmpty: false,
	order: 14,
	windowVisibility: WindowVisibility.Sessions
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([
	{
		id: MEMORY_BROWSER_VIEW_ID,
		name: localize2('memoryBrowser', 'Memory Browser'),
		containerIcon: memoryBrowserViewIcon,
		ctorDescriptor: new SyncDescriptor(MemoryBrowserView),
		canToggleVisibility: true,
		canMoveView: true,
		weight: 60,
		order: 1,
		windowVisibility: WindowVisibility.Sessions
	},
	{
		id: MEMORY_GRAPH_VIEW_ID,
		name: localize2('memoryGraph', 'Memory Graph'),
		containerIcon: memoryBrowserViewIcon,
		ctorDescriptor: new SyncDescriptor(MemoryGraphView),
		canToggleVisibility: true,
		canMoveView: true,
		weight: 40,
		order: 2,
		windowVisibility: WindowVisibility.Sessions
	},
], memoryBrowserViewContainer);
