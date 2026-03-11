/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAcpClientService, AcpClientService } from './acpClientService.js';

class AcpContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaAcp';

	constructor(
		@IAcpClientService _acpClientService: IAcpClientService,
	) {
		super();
	}
}

registerSingleton(IAcpClientService, AcpClientService, InstantiationType.Delayed);
registerWorkbenchContribution2(AcpContribution.ID, AcpContribution, WorkbenchPhase.AfterRestored);
