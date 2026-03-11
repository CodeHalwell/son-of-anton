/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITerminalBlockService } from '../../terminalBlocks/browser/terminalBlockService.js';
import { TerminalBlockKind } from '../../terminalBlocks/common/terminalBlockTypes.js';
import { IAgUiMissionControlBridge, IAgUiRunEvent } from './aguiMissionControlBridge.js';

export const IAgUiTerminalBridge = createDecorator<IAgUiTerminalBridge>('soaAgUiTerminalBridge');

export interface IAgUiTerminalBridge {
	readonly _serviceBrand: undefined;

	/**
	 * Report that an AGUI agent executed a terminal command.
	 * Creates an agent-attributed terminal block.
	 */
	reportTerminalCommand(runId: string, terminalId: string, command: string, agentName: string, model: string): string;
}

export class AgUiTerminalBridge extends Disposable implements IAgUiTerminalBridge {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ITerminalBlockService private readonly terminalBlockService: ITerminalBlockService,
		@IAgUiMissionControlBridge private readonly aguiBridge: IAgUiMissionControlBridge,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Listen for run events to mark system blocks
		this._register(this.aguiBridge.onDidReceiveRunEvent(event => {
			this._handleRunEvent(event);
		}));
	}

	reportTerminalCommand(runId: string, terminalId: string, command: string, agentName: string, model: string): string {
		const block = this.terminalBlockService.createBlock(
			terminalId,
			TerminalBlockKind.AgentOriginated,
			command,
			{
				agentId: runId,
				agentName,
				modelUsed: model,
			},
		);

		this.logService.debug(`[AgUiTerminalBridge] Created agent block ${block.id} for command: ${command}`);
		return block.id;
	}

	private _handleRunEvent(event: IAgUiRunEvent): void {
		// Create system blocks for run lifecycle events
		if (event.type === 'started') {
			this.terminalBlockService.createBlock(
				'agui-system',
				TerminalBlockKind.System,
				`[AG-UI] Agent "${event.agentName}" started (model: ${event.model})`,
				{ agentId: event.runId, agentName: event.agentName, modelUsed: event.model },
			);
		} else if (event.type === 'finished') {
			this.terminalBlockService.createBlock(
				'agui-system',
				TerminalBlockKind.System,
				`[AG-UI] Agent "${event.agentName}" finished — ${event.tokensIn + event.tokensOut} tokens, $${event.costUsd.toFixed(4)}, ${event.elapsedMs}ms`,
				{
					agentId: event.runId,
					agentName: event.agentName,
					modelUsed: event.model,
					costUsd: event.costUsd,
					tokensIn: event.tokensIn,
					tokensOut: event.tokensOut,
				},
			);
		} else if (event.type === 'error') {
			this.terminalBlockService.createBlock(
				'agui-system',
				TerminalBlockKind.System,
				`[AG-UI] Agent "${event.agentName}" error: ${event.detail}`,
				{ agentId: event.runId, agentName: event.agentName, modelUsed: event.model },
			);
		}
	}
}
