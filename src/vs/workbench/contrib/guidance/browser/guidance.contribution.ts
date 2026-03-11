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
import { IGuidanceService, GuidanceService } from './guidanceService.js';
import { GuidanceView, GUIDANCE_VIEW_ID } from './guidanceView.js';

// --- Service registration ---
registerSingleton(IGuidanceService, GuidanceService, InstantiationType.Delayed);

// --- View registration ---
const GUIDANCE_CONTAINER_ID = 'soa.viewContainer.guidance';

const guidanceViewIcon = registerIcon('soa-guidance-icon', Codicon.book, localize('soaGuidanceIcon', 'View icon for Guidance.'));

const guidanceViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: GUIDANCE_CONTAINER_ID,
	title: localize2('guidance', 'Guidance'),
	icon: guidanceViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [GUIDANCE_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: GUIDANCE_CONTAINER_ID,
	hideIfEmpty: false,
	order: 16,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: GUIDANCE_VIEW_ID,
	name: localize2('guidance', 'Guidance'),
	containerIcon: guidanceViewIcon,
	ctorDescriptor: new SyncDescriptor(GuidanceView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
}], guidanceViewContainer);
