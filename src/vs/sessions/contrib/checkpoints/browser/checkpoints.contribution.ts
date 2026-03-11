/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ICheckpointService, CheckpointService } from './checkpointService.js';

class CheckpointsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaCheckpoints';

	constructor(
		@ICheckpointService _checkpointService: ICheckpointService,
	) {
		super();
	}
}

registerSingleton(ICheckpointService, CheckpointService, InstantiationType.Delayed);
registerWorkbenchContribution2(CheckpointsContribution.ID, CheckpointsContribution, WorkbenchPhase.AfterRestored);
