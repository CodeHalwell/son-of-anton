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
import { IAgentConfigService, AgentConfigService } from './agentConfigService.js';
import { AgentConfigView, AGENT_CONFIG_VIEW_ID } from './agentConfigView.js';

// --- Service registration ---
registerSingleton(IAgentConfigService, AgentConfigService, InstantiationType.Delayed);

// --- View registration ---
const AGENT_CONFIG_CONTAINER_ID = 'soa.viewContainer.agentConfig';

const agentConfigViewIcon = registerIcon('soa-agent-config-icon', Codicon.settingsGear, localize('soaAgentConfigIcon', 'View icon for Agent Configuration.'));

const agentConfigViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: AGENT_CONFIG_CONTAINER_ID,
	title: localize2('agentConfig', 'Agent Configuration'),
	icon: agentConfigViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENT_CONFIG_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: AGENT_CONFIG_CONTAINER_ID,
	hideIfEmpty: false,
	order: 18,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: AGENT_CONFIG_VIEW_ID,
	name: localize2('agentConfig', 'Agent Configuration'),
	containerIcon: agentConfigViewIcon,
	ctorDescriptor: new SyncDescriptor(AgentConfigView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
}], agentConfigViewContainer);
