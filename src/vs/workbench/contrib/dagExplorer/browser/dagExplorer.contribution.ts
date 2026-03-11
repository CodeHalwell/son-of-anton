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
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { IDagExplorerService, DagExplorerService } from './dagExplorerService.js';
import { DAG_EXPLORER_VIEW_ID, DagExplorerView } from './dagExplorerView.js';

// --- Service registration ---
registerSingleton(IDagExplorerService, DagExplorerService, InstantiationType.Delayed);

// --- View registration ---
const DAG_EXPLORER_CONTAINER_ID = 'soa.viewContainer.dagExplorer';

const dagExplorerViewIcon = registerIcon('soa-dag-explorer-icon', Codicon.graphLine, localize('soaDagExplorerIcon', 'View icon for the DAG Explorer.'));

const dagExplorerViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: DAG_EXPLORER_CONTAINER_ID,
	title: localize2('dagExplorer', 'DAG Explorer'),
	icon: dagExplorerViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DAG_EXPLORER_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DAG_EXPLORER_CONTAINER_ID,
	hideIfEmpty: false,
	order: 12,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: DAG_EXPLORER_VIEW_ID,
	name: localize2('dagExplorer', 'DAG Explorer'),
	containerIcon: dagExplorerViewIcon,
	ctorDescriptor: new SyncDescriptor(DagExplorerView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
}], dagExplorerViewContainer);
