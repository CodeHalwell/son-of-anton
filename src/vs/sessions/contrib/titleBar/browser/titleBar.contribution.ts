/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ITitleBarStateService, TitleBarStateService } from './titleBarStateService.js';

class TitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaTitleBar';

	constructor(
		@ITitleBarStateService _titleBarStateService: ITitleBarStateService,
	) {
		super();
	}
}

registerSingleton(ITitleBarStateService, TitleBarStateService, InstantiationType.Delayed);
registerWorkbenchContribution2(TitleBarContribution.ID, TitleBarContribution, WorkbenchPhase.AfterRestored);
