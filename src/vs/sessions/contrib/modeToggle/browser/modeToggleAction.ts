/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IModeToggleService } from './modeToggleService.js';

const SOA_CATEGORY = localize2('soaCategory', "Son of Anton");

class ToggleMissionControlAction extends Action2 {

	static readonly ID = 'soa.toggleMissionControl';

	constructor() {
		super({
			id: ToggleMissionControlAction.ID,
			title: localize2('toggleMissionControl', "Toggle Mission Control"),
			category: SOA_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const modeToggleService = accessor.get(IModeToggleService);
		modeToggleService.toggle();
	}
}

registerAction2(ToggleMissionControlAction);
