/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ITerminalBlockService, TerminalBlockService } from './terminalBlockService.js';

class TerminalBlocksContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaTerminalBlocks';

	constructor(
		@ITerminalBlockService _terminalBlockService: ITerminalBlockService,
	) {
		super();
	}
}

registerSingleton(ITerminalBlockService, TerminalBlockService, InstantiationType.Delayed);
registerWorkbenchContribution2(TerminalBlocksContribution.ID, TerminalBlocksContribution, WorkbenchPhase.AfterRestored);
