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
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IMissionControlService, MissionControlService } from './missionControlService.js';
import { MissionControlView } from './missionControlView.js';
import { MissionControlEditorInput } from './missionControlEditorInput.js';
import { MissionControlEditorPane } from './missionControlEditorPane.js';

// --- Service registration ---
registerSingleton(IMissionControlService, MissionControlService, InstantiationType.Delayed);

// --- View registration (sidebar) ---
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
}], missionControlViewContainer);

// --- Editor pane registration (full-width tab) ---
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MissionControlEditorPane,
		MissionControlEditorPane.ID,
		localize('missionControlEditor', "Mission Control")
	),
	[
		new SyncDescriptor(MissionControlEditorInput)
	]
);

// --- Command: open Mission Control as editor tab ---
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'soa.missionControl.openInEditor',
			title: localize2('openMissionControlEditor', 'Open Mission Control in Editor'),
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
				weight: KeybindingWeight.WorkbenchContrib,
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const input = new MissionControlEditorInput();
		await editorService.openEditor(input);
	}
});
