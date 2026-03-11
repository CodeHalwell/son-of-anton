/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ITitleBarStateService } from '../../titleBar/browser/titleBarStateService.js';
import { IAgUiMissionControlBridge, AgUiMissionControlBridge } from './aguiMissionControlBridge.js';
import { IAgUiDagBridge, AgUiDagBridge } from './aguiDagBridge.js';
import { IAgUiTerminalBridge, AgUiTerminalBridge } from './aguiTerminalBridge.js';

// --- AGUI Bridge service registrations ---
registerSingleton(IAgUiMissionControlBridge, AgUiMissionControlBridge, InstantiationType.Delayed);
registerSingleton(IAgUiDagBridge, AgUiDagBridge, InstantiationType.Delayed);
registerSingleton(IAgUiTerminalBridge, AgUiTerminalBridge, InstantiationType.Delayed);

/**
 * Wires AGUI (Agent GUI Protocol) events into Son of Anton v2 surfaces:
 *
 * - **AGUI → Mission Control**: agent runs create/update tickets
 * - **AGUI → DAG Explorer**: file modifications highlight impacted nodes
 * - **AGUI → Terminal Blocks**: terminal commands get agent attribution
 * - **AGUI → Title Bar**: active run updates model name, cost, context usage
 *
 * This contribution is separate from IntegrationWiringContribution to keep
 * the AGUI integration as a pure Tier 1 addition (new file, no modification
 * of existing code).
 */
class AgUiIntegrationWiringContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaAgUiIntegrationWiring';

	constructor(
		@IAgUiMissionControlBridge private readonly aguiBridge: IAgUiMissionControlBridge,
		@ITitleBarStateService private readonly titleBarStateService: ITitleBarStateService,
	) {
		super();

		this._wireAgUiTitleBar();
	}

	/**
	 * Update title bar with AGUI run information:
	 * - Model name from the active agent
	 * - Accumulated cost from all run events
	 */
	private _wireAgUiTitleBar(): void {
		this._register(this.aguiBridge.onDidReceiveRunEvent(event => {
			switch (event.type) {
				case 'started':
					this.titleBarStateService.updateModel(event.model);
					break;
				case 'finished':
				case 'error':
					this.titleBarStateService.addCost(event.costUsd);
					break;
				case 'toolCall':
				case 'step':
					// Accumulate incremental cost during the run
					if (event.costUsd > 0) {
						this.titleBarStateService.addCost(event.costUsd);
					}
					break;
			}
		}));
	}
}

registerWorkbenchContribution2(AgUiIntegrationWiringContribution.ID, AgUiIntegrationWiringContribution, WorkbenchPhase.Eventually);
