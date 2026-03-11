/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService, FileOperationResult, FileOperationError } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IMissionControlTicket,
	IMissionControlBoard,
	IMissionControlColumn,
	TicketStatus,
	TicketType,
	TicketPriority,
	TicketCreator,
	ITicketFilter,
	ITicketComment,
	ITicketTraceEntry,
	ITicketDiff,
	isEpic,
	isBlocked,
} from '../common/missionControlTypes.js';

// --- Service Interface --------------------------------------------------------

export const IMissionControlService = createDecorator<IMissionControlService>('soaMissionControlService');

export interface IMissionControlService {
	readonly _serviceBrand: undefined;
	readonly board: IMissionControlBoard;
	readonly onDidChangeBoard: Event<void>;
	readonly onDidChangeTicket: Event<IMissionControlTicket>;

	// Board lifecycle
	initBoard(sessionId: string): Promise<void>;
	loadBoard(): Promise<void>;
	saveBoard(): Promise<void>;

	// Ticket CRUD
	createTicket(
		type: TicketType,
		title: string,
		description: string,
		creator: TicketCreator,
		options?: Partial<Pick<IMissionControlTicket, 'priority' | 'labels' | 'acceptanceCriteria' | 'epicId' | 'parentId' | 'storyPoints'>>
	): IMissionControlTicket;
	updateTicketStatus(ticketId: string, status: TicketStatus): void;
	updateTicket(ticketId: string, updates: Partial<Pick<IMissionControlTicket, 'title' | 'description' | 'priority' | 'labels' | 'assignedAgent' | 'acceptanceCriteria' | 'storyPoints'>>): void;
	deleteTicket(ticketId: string): void;
	getTicket(ticketId: string): IMissionControlTicket | undefined;

	// Agent operations (MCP tool backing)
	appendTrace(ticketId: string, entry: ITicketTraceEntry): void;
	reportDiff(ticketId: string, diff: ITicketDiff): void;
	addComment(ticketId: string, comment: Omit<ITicketComment, 'id' | 'timestamp'>): void;
	assignAgent(ticketId: string, agentId: string, model: string): void;

	// Query
	getFilteredTickets(filter: ITicketFilter): IMissionControlTicket[];
	getTicketsByEpic(epicId: string): IMissionControlTicket[];
	getBlockedTickets(): IMissionControlTicket[];

	// Dependencies
	addDependency(ticketId: string, blockedById: string): void;
	removeDependency(ticketId: string, blockedById: string): void;
}

// --- Board file path ---------------------------------------------------------

const BOARD_FOLDER = '.son-of-anton';
const BOARD_FILE = 'board.json';

// --- Ticket type prefixes ----------------------------------------------------

const TICKET_TYPE_PREFIX: Record<string, string> = {
	[TicketType.Epic]: 'EPIC',
	[TicketType.Story]: 'STORY',
	[TicketType.Subtask]: 'SUBTASK',
	[TicketType.Bug]: 'BUG',
	[TicketType.Spike]: 'SPIKE',
};

// --- Column definitions ------------------------------------------------------

const COLUMN_DEFINITIONS: ReadonlyArray<{ readonly status: TicketStatus; readonly label: string }> = [
	{ status: TicketStatus.Queued, label: 'Queued' },
	{ status: TicketStatus.Running, label: 'Running' },
	{ status: TicketStatus.Paused, label: 'Paused' },
	{ status: TicketStatus.Review, label: 'Review' },
	{ status: TicketStatus.Complete, label: 'Complete' },
	{ status: TicketStatus.Failed, label: 'Failed' },
];

// --- Implementation ----------------------------------------------------------

export class MissionControlService extends Disposable implements IMissionControlService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeBoard = this._register(new Emitter<void>());
	readonly onDidChangeBoard: Event<void> = this._onDidChangeBoard.event;

	private readonly _onDidChangeTicket = this._register(new Emitter<IMissionControlTicket>());
	readonly onDidChangeTicket: Event<IMissionControlTicket> = this._onDidChangeTicket.event;

	private _board: IMissionControlBoard;
	private readonly _ticketIndex = new Map<string, IMissionControlTicket>();
	private readonly _typeCounters = new Map<string, number>();

	get board(): IMissionControlBoard {
		return this._board;
	}

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._board = this.createEmptyBoard('');
	}

	// --- Board lifecycle ------------------------------------------------------

	async initBoard(sessionId: string): Promise<void> {
		this._board = this.createEmptyBoard(sessionId);
		this._ticketIndex.clear();
		this._typeCounters.clear();
		this._onDidChangeBoard.fire();
		this.logService.info('[MissionControl] Board initialised for session:', sessionId);
	}

	async loadBoard(): Promise<void> {
		const boardUri = this.getBoardFileUri();
		if (!boardUri) {
			this.logService.warn('[MissionControl] No workspace folder found; cannot load board.');
			return;
		}

		try {
			const fileContent = await this.fileService.readFile(boardUri);
			const raw = JSON.parse(fileContent.value.toString()) as SerializedBoard;
			this.deserializeBoard(raw);
			this.logService.info('[MissionControl] Board loaded from', boardUri.toString());
			this._onDidChangeBoard.fire();
		} catch (error) {
			if ((error as FileOperationError).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				this.logService.info('[MissionControl] No board file found; starting with empty board.');
			} else {
				this.logService.error('[MissionControl] Failed to load board:', error);
			}
		}
	}

	async saveBoard(): Promise<void> {
		const boardUri = this.getBoardFileUri();
		if (!boardUri) {
			this.logService.warn('[MissionControl] No workspace folder found; cannot save board.');
			return;
		}

		try {
			const serialized = this.serializeBoard();
			const content = JSON.stringify(serialized, undefined, '\t');
			await this.fileService.writeFile(boardUri, VSBuffer.fromString(content));
			this.logService.info('[MissionControl] Board saved to', boardUri.toString());
		} catch (error) {
			this.logService.error('[MissionControl] Failed to save board:', error);
		}
	}

	// --- Ticket CRUD ----------------------------------------------------------

	createTicket(
		type: TicketType,
		title: string,
		description: string,
		creator: TicketCreator,
		options?: Partial<Pick<IMissionControlTicket, 'priority' | 'labels' | 'acceptanceCriteria' | 'epicId' | 'parentId' | 'storyPoints'>>
	): IMissionControlTicket {
		const id = this.generateTicketId(type);
		const now = Date.now();

		const ticket: IMissionControlTicket = {
			id,
			type,
			status: TicketStatus.Queued,
			priority: options?.priority ?? TicketPriority.Medium,
			title,
			description,
			createdBy: creator,
			createdAt: now,
			updatedAt: now,
			assignedAgent: undefined,
			modelUsed: undefined,
			epicId: options?.epicId,
			parentId: options?.parentId,
			storyPoints: options?.storyPoints,
			labels: options?.labels ? [...options.labels] : [],
			acceptanceCriteria: options?.acceptanceCriteria ? [...options.acceptanceCriteria] : [],
			blockedBy: [],
			blocks: [],
			comments: [],
			trace: [],
			diffs: [],
			elapsedMs: 0,
			totalCostUsd: 0,
			totalTokensIn: 0,
			totalTokensOut: 0,
			rejectionHistory: [],
		};

		this._ticketIndex.set(id, ticket);

		if (isEpic(ticket)) {
			(this._board.epics as IMissionControlTicket[]).push(ticket);
		}

		const column = this.getColumn(TicketStatus.Queued);
		if (column) {
			(column.tickets as IMissionControlTicket[]).push(ticket);
		}

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeBoard.fire();
		this.logService.info('[MissionControl] Created ticket', id, title);

		return ticket;
	}

	updateTicketStatus(ticketId: string, status: TicketStatus): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		const oldStatus = ticket.status;
		if (oldStatus === status) {
			return;
		}

		// Remove from old column
		const oldColumn = this.getColumn(oldStatus);
		if (oldColumn) {
			const idx = (oldColumn.tickets as IMissionControlTicket[]).indexOf(ticket);
			if (idx !== -1) {
				(oldColumn.tickets as IMissionControlTicket[]).splice(idx, 1);
			}
		}

		// Update status and add to new column
		ticket.status = status;
		ticket.updatedAt = Date.now();

		const newColumn = this.getColumn(status);
		if (newColumn) {
			(newColumn.tickets as IMissionControlTicket[]).push(ticket);
		}

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeBoard.fire();
		this.logService.info('[MissionControl] Ticket', ticketId, 'status changed:', oldStatus, '->', status);
	}

	updateTicket(ticketId: string, updates: Partial<Pick<IMissionControlTicket, 'title' | 'description' | 'priority' | 'labels' | 'assignedAgent' | 'acceptanceCriteria' | 'storyPoints'>>): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		if (updates.title !== undefined) {
			ticket.title = updates.title;
		}
		if (updates.description !== undefined) {
			ticket.description = updates.description;
		}
		if (updates.priority !== undefined) {
			ticket.priority = updates.priority;
		}
		if (updates.labels !== undefined) {
			ticket.labels = [...updates.labels];
		}
		if (updates.assignedAgent !== undefined) {
			ticket.assignedAgent = updates.assignedAgent;
		}
		if (updates.acceptanceCriteria !== undefined) {
			ticket.acceptanceCriteria = [...updates.acceptanceCriteria];
		}
		if (updates.storyPoints !== undefined) {
			ticket.storyPoints = updates.storyPoints;
		}

		ticket.updatedAt = Date.now();
		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeBoard.fire();
	}

	deleteTicket(ticketId: string): void {
		const ticket = this._ticketIndex.get(ticketId);
		if (!ticket) {
			this.logService.warn('[MissionControl] Cannot delete unknown ticket:', ticketId);
			return;
		}

		// Remove from column
		const column = this.getColumn(ticket.status);
		if (column) {
			const idx = (column.tickets as IMissionControlTicket[]).indexOf(ticket);
			if (idx !== -1) {
				(column.tickets as IMissionControlTicket[]).splice(idx, 1);
			}
		}

		// Remove from epics list if it is an epic
		if (isEpic(ticket)) {
			const epicIdx = (this._board.epics as IMissionControlTicket[]).indexOf(ticket);
			if (epicIdx !== -1) {
				(this._board.epics as IMissionControlTicket[]).splice(epicIdx, 1);
			}
		}

		// Clean up dependency references on other tickets
		for (const blockedById of ticket.blockedBy) {
			const blocker = this._ticketIndex.get(blockedById);
			if (blocker) {
				const blockIdx = blocker.blocks.indexOf(ticketId);
				if (blockIdx !== -1) {
					blocker.blocks.splice(blockIdx, 1);
				}
			}
		}
		for (const blocksId of ticket.blocks) {
			const blocked = this._ticketIndex.get(blocksId);
			if (blocked) {
				const depIdx = blocked.blockedBy.indexOf(ticketId);
				if (depIdx !== -1) {
					blocked.blockedBy.splice(depIdx, 1);
				}
			}
		}

		this._ticketIndex.delete(ticketId);
		this.touchBoard();
		this._onDidChangeBoard.fire();
		this.logService.info('[MissionControl] Deleted ticket', ticketId);
	}

	getTicket(ticketId: string): IMissionControlTicket | undefined {
		return this._ticketIndex.get(ticketId);
	}

	// --- Agent operations -----------------------------------------------------

	appendTrace(ticketId: string, entry: ITicketTraceEntry): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		ticket.trace.push(entry);
		ticket.totalTokensIn += entry.tokensIn;
		ticket.totalTokensOut += entry.tokensOut;
		ticket.totalCostUsd += entry.costUsd;
		ticket.updatedAt = Date.now();

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
	}

	reportDiff(ticketId: string, diff: ITicketDiff): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		ticket.diffs.push(diff);
		ticket.updatedAt = Date.now();

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
	}

	addComment(ticketId: string, comment: Omit<ITicketComment, 'id' | 'timestamp'>): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		const fullComment: ITicketComment = {
			id: generateUuid(),
			timestamp: Date.now(),
			author: comment.author,
			authorRole: comment.authorRole,
			text: comment.text,
		};

		ticket.comments.push(fullComment);
		ticket.updatedAt = Date.now();

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
	}

	assignAgent(ticketId: string, agentId: string, model: string): void {
		const ticket = this.requireTicket(ticketId);
		if (!ticket) {
			return;
		}

		ticket.assignedAgent = agentId;
		ticket.modelUsed = model;
		ticket.updatedAt = Date.now();

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeBoard.fire();
		this.logService.info('[MissionControl] Assigned agent', agentId, 'to ticket', ticketId);
	}

	// --- Query ----------------------------------------------------------------

	getFilteredTickets(filter: ITicketFilter): IMissionControlTicket[] {
		const allTickets = Array.from(this._ticketIndex.values());
		return allTickets.filter(ticket => this.matchesFilter(ticket, filter));
	}

	getTicketsByEpic(epicId: string): IMissionControlTicket[] {
		const result: IMissionControlTicket[] = [];
		for (const ticket of this._ticketIndex.values()) {
			if (ticket.epicId === epicId) {
				result.push(ticket);
			}
		}
		return result;
	}

	getBlockedTickets(): IMissionControlTicket[] {
		const result: IMissionControlTicket[] = [];
		for (const ticket of this._ticketIndex.values()) {
			if (isBlocked(ticket)) {
				result.push(ticket);
			}
		}
		return result;
	}

	// --- Dependencies ---------------------------------------------------------

	addDependency(ticketId: string, blockedById: string): void {
		const ticket = this.requireTicket(ticketId);
		const blocker = this.requireTicket(blockedById);
		if (!ticket || !blocker) {
			return;
		}

		if (ticketId === blockedById) {
			this.logService.warn('[MissionControl] Cannot add self-dependency on ticket:', ticketId);
			return;
		}

		if (!ticket.blockedBy.includes(blockedById)) {
			ticket.blockedBy.push(blockedById);
			ticket.updatedAt = Date.now();
		}

		if (!blocker.blocks.includes(ticketId)) {
			blocker.blocks.push(ticketId);
			blocker.updatedAt = Date.now();
		}

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeTicket.fire(blocker);
		this._onDidChangeBoard.fire();
	}

	removeDependency(ticketId: string, blockedById: string): void {
		const ticket = this.requireTicket(ticketId);
		const blocker = this.requireTicket(blockedById);
		if (!ticket || !blocker) {
			return;
		}

		const depIdx = ticket.blockedBy.indexOf(blockedById);
		if (depIdx !== -1) {
			ticket.blockedBy.splice(depIdx, 1);
			ticket.updatedAt = Date.now();
		}

		const blockIdx = blocker.blocks.indexOf(ticketId);
		if (blockIdx !== -1) {
			blocker.blocks.splice(blockIdx, 1);
			blocker.updatedAt = Date.now();
		}

		this.touchBoard();
		this._onDidChangeTicket.fire(ticket);
		this._onDidChangeTicket.fire(blocker);
		this._onDidChangeBoard.fire();
	}

	// --- Private helpers ------------------------------------------------------

	private createEmptyBoard(sessionId: string): IMissionControlBoard {
		const now = Date.now();
		const columns: IMissionControlColumn[] = COLUMN_DEFINITIONS.map(def => ({
			status: def.status,
			label: def.label,
			tickets: [],
		}));

		return {
			columns,
			epics: [],
			sessionId,
			createdAt: now,
			updatedAt: now,
		};
	}

	private getColumn(status: TicketStatus): IMissionControlColumn | undefined {
		return this._board.columns.find(col => col.status === status);
	}

	private generateTicketId(type: TicketType): string {
		const prefix = TICKET_TYPE_PREFIX[type] ?? 'TICKET';
		const current = this._typeCounters.get(prefix) ?? 0;
		const next = current + 1;
		this._typeCounters.set(prefix, next);
		return `${prefix}-${next}`;
	}

	private requireTicket(ticketId: string): IMissionControlTicket | undefined {
		const ticket = this._ticketIndex.get(ticketId);
		if (!ticket) {
			this.logService.warn('[MissionControl] Ticket not found:', ticketId);
		}
		return ticket;
	}

	private touchBoard(): void {
		(this._board as { updatedAt: number }).updatedAt = Date.now();
	}

	private matchesFilter(ticket: IMissionControlTicket, filter: ITicketFilter): boolean {
		if (filter.type && filter.type.length > 0 && !filter.type.includes(ticket.type)) {
			return false;
		}
		if (filter.priority && filter.priority.length > 0 && !filter.priority.includes(ticket.priority)) {
			return false;
		}
		if (filter.status && filter.status.length > 0 && !filter.status.includes(ticket.status)) {
			return false;
		}
		if (filter.labels && filter.labels.length > 0) {
			const hasMatchingLabel = filter.labels.some(label => ticket.labels.includes(label));
			if (!hasMatchingLabel) {
				return false;
			}
		}
		if (filter.assignedAgent !== undefined && ticket.assignedAgent !== filter.assignedAgent) {
			return false;
		}
		if (filter.epicId !== undefined && ticket.epicId !== filter.epicId) {
			return false;
		}
		if (filter.searchText !== undefined && filter.searchText.length > 0) {
			const lowerSearch = filter.searchText.toLowerCase();
			const matchesTitle = ticket.title.toLowerCase().includes(lowerSearch);
			const matchesDescription = ticket.description.toLowerCase().includes(lowerSearch);
			const matchesId = ticket.id.toLowerCase().includes(lowerSearch);
			if (!matchesTitle && !matchesDescription && !matchesId) {
				return false;
			}
		}
		return true;
	}

	private getBoardFileUri(): URI | undefined {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}
		return joinPath(folders[0].uri, BOARD_FOLDER, BOARD_FILE);
	}

	// --- Serialization --------------------------------------------------------

	private serializeBoard(): SerializedBoard {
		const allTickets: IMissionControlTicket[] = Array.from(this._ticketIndex.values());
		const counters: Record<string, number> = {};
		for (const [prefix, count] of this._typeCounters) {
			counters[prefix] = count;
		}

		return {
			sessionId: this._board.sessionId,
			createdAt: this._board.createdAt,
			updatedAt: this._board.updatedAt,
			tickets: allTickets,
			counters,
		};
	}

	private deserializeBoard(raw: SerializedBoard): void {
		this._ticketIndex.clear();
		this._typeCounters.clear();

		const board = this.createEmptyBoard(raw.sessionId);
		(board as { createdAt: number }).createdAt = raw.createdAt;
		(board as { updatedAt: number }).updatedAt = raw.updatedAt;

		// Restore counters
		if (raw.counters) {
			for (const [prefix, count] of Object.entries(raw.counters)) {
				this._typeCounters.set(prefix, count);
			}
		}

		// Rebuild ticket index and columns
		for (const ticketData of raw.tickets) {
			const ticket: IMissionControlTicket = {
				...ticketData,
				labels: [...(ticketData.labels ?? [])],
				acceptanceCriteria: [...(ticketData.acceptanceCriteria ?? [])],
				blockedBy: [...(ticketData.blockedBy ?? [])],
				blocks: [...(ticketData.blocks ?? [])],
				comments: [...(ticketData.comments ?? [])],
				trace: [...(ticketData.trace ?? [])],
				diffs: [...(ticketData.diffs ?? [])],
				rejectionHistory: [...(ticketData.rejectionHistory ?? [])],
			};

			this._ticketIndex.set(ticket.id, ticket);

			// Place in correct column
			const column = board.columns.find(col => col.status === ticket.status);
			if (column) {
				(column.tickets as IMissionControlTicket[]).push(ticket);
			}

			// Track epics
			if (isEpic(ticket)) {
				(board.epics as IMissionControlTicket[]).push(ticket);
			}

			// Recalculate counters from ticket IDs if counters were not stored
			if (!raw.counters) {
				const match = ticket.id.match(/^([A-Z]+)-(\d+)$/);
				if (match) {
					const prefix = match[1];
					const num = parseInt(match[2], 10);
					const currentMax = this._typeCounters.get(prefix) ?? 0;
					if (num > currentMax) {
						this._typeCounters.set(prefix, num);
					}
				}
			}
		}

		this._board = board;
	}
}

// --- Serialization types (private) -------------------------------------------

interface SerializedBoard {
	readonly sessionId: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly tickets: IMissionControlTicket[];
	readonly counters?: Record<string, number>;
}
