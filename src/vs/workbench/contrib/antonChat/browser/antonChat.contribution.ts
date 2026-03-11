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
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { IAntonGenerationService } from '../common/antonChatGeneration.js';
import { AntonChatBrowserGeneration } from './antonChatGeneration.js';
import { IAntonChatService, AntonChatService } from './antonChatService.js';
import { AntonChatView, ANTON_CHAT_VIEW_ID } from './antonChatView.js';

// --- Service registration ---
registerSingleton(IAntonGenerationService, AntonChatBrowserGeneration, InstantiationType.Delayed);
registerSingleton(IAntonChatService, AntonChatService, InstantiationType.Delayed);

// --- View registration ---
const ANTON_CHAT_CONTAINER_ID = 'soa.viewContainer.antonChat';

const antonChatIcon = registerIcon('soa-anton-chat-icon', Codicon.commentDiscussion, localize('soaAntonChatIcon', 'View icon for Anton Chat.'));

const antonChatContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: ANTON_CHAT_CONTAINER_ID,
	title: localize2('antonChat', 'Anton Chat'),
	icon: antonChatIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ANTON_CHAT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: ANTON_CHAT_CONTAINER_ID,
	hideIfEmpty: false,
	order: 15,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: ANTON_CHAT_VIEW_ID,
	name: localize2('antonChat', 'Anton Chat'),
	containerIcon: antonChatIcon,
	ctorDescriptor: new SyncDescriptor(AntonChatView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
}], antonChatContainer);
