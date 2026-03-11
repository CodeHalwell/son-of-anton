/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowVisibility } from '../../../../workbench/common/views.js';
import { SpecRendererView } from './specRendererView.js';

// --- View registration ---
const SPEC_RENDERER_CONTAINER_ID = 'soa.viewContainer.specRenderer';

const specRendererViewIcon = registerIcon('soa-spec-renderer-icon', Codicon.notebook, localize('soaSpecRendererIcon', 'View icon for the Spec Renderer.'));

const specRendererViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: SPEC_RENDERER_CONTAINER_ID,
	title: localize2('specRenderer', 'Spec Documents'),
	icon: specRendererViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SPEC_RENDERER_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: SPEC_RENDERER_CONTAINER_ID,
	hideIfEmpty: false,
	order: 16,
	windowVisibility: WindowVisibility.Sessions
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: SpecRendererView.ID,
	name: localize2('specRenderer', 'Spec Documents'),
	containerIcon: specRendererViewIcon,
	ctorDescriptor: new SyncDescriptor(SpecRendererView),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1,
	windowVisibility: WindowVisibility.Sessions
}], specRendererViewContainer);
