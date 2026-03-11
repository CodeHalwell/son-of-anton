/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IModeToggleService, ModeToggleService } from './modeToggleService.js';
import './modeToggleAction.js';

class ModeToggleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaModeToggle';

	constructor(
		@IModeToggleService _modeToggleService: IModeToggleService,
	) {
		super();
	}
}

registerSingleton(IModeToggleService, ModeToggleService, InstantiationType.Delayed);
registerWorkbenchContribution2(ModeToggleContribution.ID, ModeToggleContribution, WorkbenchPhase.AfterRestored);
