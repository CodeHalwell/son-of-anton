/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IMissionControlService } from '../../missionControl/browser/missionControlService.js';
import { ICheckpointService } from '../../checkpoints/browser/checkpointService.js';
import { IMemoryService } from '../../memory/browser/memoryService.js';
import { IDagExplorerService } from '../../dagExplorer/browser/dagExplorerService.js';
import { ITitleBarStateService } from '../../titleBar/browser/titleBarStateService.js';
import { CheckpointTrigger } from '../../checkpoints/common/checkpointTypes.js';
import { TicketStatus } from '../../missionControl/common/missionControlTypes.js';
import { MemoryNodeKind } from '../../memory/common/memoryTypes.js';
import { DagNodeStatus } from '../../dagExplorer/common/dagTypes.js';

/**
 * Wires together all Son of Anton v2 subsystems:
 *
 * - **Mission Control → Checkpoints**: auto-checkpoint before agent actions
 * - **Mission Control → Memory**: index completed tickets as knowledge
 * - **Mission Control → DAG Explorer**: update node status for running tasks
 * - **Mission Control → Title Bar**: update active agent count
 */
class IntegrationWiringContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.soaIntegrationWiring';

	constructor(
		@IMissionControlService private readonly missionControlService: IMissionControlService,
		@ICheckpointService private readonly checkpointService: ICheckpointService,
		@IMemoryService private readonly memoryService: IMemoryService,
		@IDagExplorerService private readonly dagExplorerService: IDagExplorerService,
		@ITitleBarStateService private readonly titleBarStateService: ITitleBarStateService,
	) {
		super();

		this._wireCheckpoints();
		this._wireMemory();
		this._wireDagExplorer();
		this._wireTitleBar();
	}

	/**
	 * Auto-create checkpoints when tickets transition to Running status.
	 */
	private _wireCheckpoints(): void {
		this._register(this.missionControlService.onDidChangeTicket(ticket => {
			if (ticket.status === TicketStatus.Running) {
				this.checkpointService.createCheckpoint(
					CheckpointTrigger.PreAgentAction,
					`Before ${ticket.type}-${ticket.id}: ${ticket.title}`,
					ticket.assignedAgent,
					ticket.id,
				).catch(() => {
					// Checkpoint creation is best-effort — don't block the board
				});
			}
		}));
	}

	/**
	 * Index completed tickets as knowledge nodes in the memory graph.
	 */
	private _wireMemory(): void {
		this._register(this.missionControlService.onDidChangeTicket(ticket => {
			if (ticket.status === TicketStatus.Complete) {
				const content = [
					`Type: ${ticket.type}`,
					`Title: ${ticket.title}`,
					ticket.description ? `Description: ${ticket.description}` : '',
					ticket.assignedAgent ? `Agent: ${ticket.assignedAgent}` : '',
					ticket.labels.length > 0 ? `Labels: ${ticket.labels.join(', ')}` : '',
				].filter(Boolean).join('\n');

				this.memoryService.addNode(
					MemoryNodeKind.Decision,
					`${ticket.type}-${ticket.id}: ${ticket.title}`,
					content,
					undefined,
					{
						ticketId: ticket.id,
						ticketType: ticket.type,
						completedAt: String(Date.now()),
					},
				);
			}
		}));
	}

	/**
	 * Update DAG node status based on ticket status changes.
	 */
	private _wireDagExplorer(): void {
		this._register(this.missionControlService.onDidChangeTicket(ticket => {
			const nodeId = `ticket-${ticket.id}`;

			if (ticket.status === TicketStatus.Running) {
				this.dagExplorerService.updateNodeStatus(nodeId, DagNodeStatus.Active);
			} else if (ticket.status === TicketStatus.Complete) {
				this.dagExplorerService.updateNodeStatus(nodeId, DagNodeStatus.Complete);
			} else if (ticket.status === TicketStatus.Failed) {
				this.dagExplorerService.updateNodeStatus(nodeId, DagNodeStatus.Error);
			}
		}));
	}

	/**
	 * Update title bar with active agent count from running tickets.
	 */
	private _wireTitleBar(): void {
		this._register(this.missionControlService.onDidChangeBoard(() => {
			const board = this.missionControlService.board;
			const runningAgents = new Set<string>();

			for (const column of board.columns) {
				for (const ticket of column.tickets) {
					if (ticket.status === TicketStatus.Running && ticket.assignedAgent) {
						runningAgents.add(ticket.assignedAgent);
					}
				}
			}

			this.titleBarStateService.updateActiveAgentCount(runningAgents.size);
		}));
	}
}

registerWorkbenchContribution2(IntegrationWiringContribution.ID, IntegrationWiringContribution, WorkbenchPhase.Eventually);
