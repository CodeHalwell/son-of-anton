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
import { IMissionControlService, MissionControlService } from './missionControlService.js';
import { MissionControlView } from './missionControlView.js';

// --- Service registration ---
registerSingleton(IMissionControlService, MissionControlService, InstantiationType.Delayed);

// --- View registration ---
const MISSION_CONTROL_CONTAINER_ID = 'soa.viewContainer.missionControl';

const missionControlViewIcon = registerIcon('soa-mission-control-icon', Codicon.project, localize('soaMissionControlIcon', 'View icon for the Mission Control board.'));

const missionControlViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: MISSION_CONTROL_CONTAINER_ID,
	title: localize2('missionControl', 'Mission Control'),
	icon: missionControlViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [MISSION_CONTROL_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: MISSION_CONTROL_CONTAINER_ID,
	hideIfEmpty: false,
	order: 10,
	windowVisibility: WindowVisibility.Sessions
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: MissionControlView.ID,
	name: localize2('missionControl', 'Mission Control'),
	containerIcon: missionControlViewIcon,
	ctorDescriptor: new SyncDescriptor(MissionControlView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
	windowVisibility: WindowVisibility.Sessions
}], missionControlViewContainer);
