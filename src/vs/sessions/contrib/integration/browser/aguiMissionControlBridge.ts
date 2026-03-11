/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMissionControlService } from '../../missionControl/browser/missionControlService.js';
import { TicketType, TicketCreator, TicketStatus } from '../../missionControl/common/missionControlTypes.js';

/**
 * AG-UI run event — a simplified projection of AGUI events that the
 * sessions layer can consume without depending on the extension's types.
 */
export interface IAgUiRunEvent {
	readonly runId: string;
	readonly agentName: string;
	readonly model: string;
	readonly type: 'started' | 'finished' | 'error' | 'toolCall' | 'step';
	readonly detail: string;
	readonly tokensIn: number;
	readonly tokensOut: number;
	readonly costUsd: number;
	readonly elapsedMs: number;
}

export const IAgUiMissionControlBridge = createDecorator<IAgUiMissionControlBridge>('soaAgUiMissionControlBridge');

export interface IAgUiMissionControlBridge {
	readonly _serviceBrand: undefined;
	readonly onDidReceiveRunEvent: Event<IAgUiRunEvent>;

	/**
	 * Feed an AGUI run event into the bridge. The bridge creates or updates
	 * Mission Control tickets and appends trace entries.
	 */
	handleRunEvent(event: IAgUiRunEvent): void;
}

export class AgUiMissionControlBridge extends Disposable implements IAgUiMissionControlBridge {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveRunEvent = this._register(new Emitter<IAgUiRunEvent>());
	readonly onDidReceiveRunEvent: Event<IAgUiRunEvent> = this._onDidReceiveRunEvent.event;

	/** Maps AGUI runId → Mission Control ticketId. */
	private readonly _runToTicket = new Map<string, string>();

	constructor(
		@IMissionControlService private readonly missionControlService: IMissionControlService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	handleRunEvent(event: IAgUiRunEvent): void {
		this._onDidReceiveRunEvent.fire(event);

		switch (event.type) {
			case 'started':
				this._handleRunStarted(event);
				break;
			case 'finished':
				this._handleRunFinished(event);
				break;
			case 'error':
				this._handleRunError(event);
				break;
			case 'toolCall':
			case 'step':
				this._handleRunProgress(event);
				break;
		}
	}

	private _handleRunStarted(event: IAgUiRunEvent): void {
		const ticket = this.missionControlService.createTicket(
			TicketType.Story,
			`Agent run: ${event.agentName}`,
			`Automated agent run via AG-UI protocol.\nModel: ${event.model}\nRun ID: ${event.runId}`,
			TicketCreator.Agent,
			{ labels: ['agui', event.agentName] },
		);

		this._runToTicket.set(event.runId, ticket.id);
		this.missionControlService.assignAgent(ticket.id, event.agentName, event.model);
		this.missionControlService.updateTicketStatus(ticket.id, TicketStatus.Running);

		this.logService.info(`[AgUiBridge] Run ${event.runId} → ticket ${ticket.id}`);
	}

	private _handleRunFinished(event: IAgUiRunEvent): void {
		const ticketId = this._runToTicket.get(event.runId);
		if (!ticketId) {
			return;
		}

		this.missionControlService.appendTrace(ticketId, {
			timestamp: Date.now(),
			agentId: event.agentName,
			modelUsed: event.model,
			tokensIn: event.tokensIn,
			tokensOut: event.tokensOut,
			costUsd: event.costUsd,
			action: 'completion',
			detail: `Run completed in ${event.elapsedMs}ms`,
		});

		this.missionControlService.updateTicketStatus(ticketId, TicketStatus.Review);
		this._runToTicket.delete(event.runId);
	}

	private _handleRunError(event: IAgUiRunEvent): void {
		const ticketId = this._runToTicket.get(event.runId);
		if (!ticketId) {
			return;
		}

		this.missionControlService.appendTrace(ticketId, {
			timestamp: Date.now(),
			agentId: event.agentName,
			modelUsed: event.model,
			tokensIn: event.tokensIn,
			tokensOut: event.tokensOut,
			costUsd: event.costUsd,
			action: 'error',
			detail: event.detail,
		});

		this.missionControlService.updateTicketStatus(ticketId, TicketStatus.Failed);
		this._runToTicket.delete(event.runId);
	}

	private _handleRunProgress(event: IAgUiRunEvent): void {
		const ticketId = this._runToTicket.get(event.runId);
		if (!ticketId) {
			return;
		}

		this.missionControlService.appendTrace(ticketId, {
			timestamp: Date.now(),
			agentId: event.agentName,
			modelUsed: event.model,
			tokensIn: event.tokensIn,
			tokensOut: event.tokensOut,
			costUsd: event.costUsd,
			action: event.type === 'toolCall' ? 'tool_call' : 'decision',
			detail: event.detail,
		});
	}
}
