/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TicketType {
	Epic = 'epic',
	Story = 'story',
	Subtask = 'subtask',
	Bug = 'bug',
	Spike = 'spike'
}

export const enum TicketPriority {
	Critical = 'critical',
	High = 'high',
	Medium = 'medium',
	Low = 'low'
}

export const enum TicketStatus {
	Queued = 'queued',
	Running = 'running',
	Paused = 'paused',
	Review = 'review',
	Complete = 'complete',
	Failed = 'failed'
}

export const enum TicketCreator {
	User = 'user',
	Orchestrator = 'orchestrator',
	Agent = 'agent'
}

export interface ITicketComment {
	readonly id: string;
	readonly author: string;
	readonly authorRole: TicketCreator;
	readonly timestamp: number;
	readonly text: string;
}

export interface ITicketTraceEntry {
	readonly timestamp: number;
	readonly agentId: string;
	readonly modelUsed: string;
	readonly tokensIn: number;
	readonly tokensOut: number;
	readonly costUsd: number;
	readonly action: string;
	readonly detail: string;
}

export interface ITicketDiff {
	readonly filePath: string;
	readonly hunks: number;
	readonly additions: number;
	readonly deletions: number;
}

export interface IMissionControlTicket {
	readonly id: string;
	type: TicketType;
	status: TicketStatus;
	priority: TicketPriority;
	title: string;
	description: string;
	createdBy: TicketCreator;
	createdAt: number;
	updatedAt: number;
	assignedAgent: string | undefined;
	modelUsed: string | undefined;
	epicId: string | undefined;
	parentId: string | undefined;
	storyPoints: number | undefined;
	labels: string[];
	acceptanceCriteria: string[];
	blockedBy: string[];
	blocks: string[];
	comments: ITicketComment[];
	trace: ITicketTraceEntry[];
	diffs: ITicketDiff[];
	elapsedMs: number;
	totalCostUsd: number;
	totalTokensIn: number;
	totalTokensOut: number;
	rejectionHistory: Array<{ readonly reason: string; readonly timestamp: number; readonly reviewer: string }>;
}

export interface IMissionControlColumn {
	readonly status: TicketStatus;
	readonly label: string;
	readonly tickets: IMissionControlTicket[];
}

export interface IMissionControlBoard {
	readonly columns: IMissionControlColumn[];
	readonly epics: IMissionControlTicket[];
	readonly sessionId: string;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface ITicketFilter {
	type?: TicketType[];
	priority?: TicketPriority[];
	status?: TicketStatus[];
	labels?: string[];
	assignedAgent?: string;
	epicId?: string;
	searchText?: string;
}

// #region Type Guards

/**
 * Returns whether the given ticket is an epic.
 */
export function isEpic(ticket: IMissionControlTicket): boolean {
	return ticket.type === TicketType.Epic;
}

/**
 * Returns whether the given ticket is a story.
 */
export function isStory(ticket: IMissionControlTicket): boolean {
	return ticket.type === TicketType.Story;
}

/**
 * Returns whether the given ticket is a subtask.
 */
export function isSubtask(ticket: IMissionControlTicket): boolean {
	return ticket.type === TicketType.Subtask;
}

/**
 * Returns whether the given ticket is a bug.
 */
export function isBug(ticket: IMissionControlTicket): boolean {
	return ticket.type === TicketType.Bug;
}

/**
 * Returns whether the given ticket is a spike.
 */
export function isSpike(ticket: IMissionControlTicket): boolean {
	return ticket.type === TicketType.Spike;
}

/**
 * Returns whether the given ticket is blocked by at least one other ticket.
 */
export function isBlocked(ticket: IMissionControlTicket): boolean {
	return ticket.blockedBy.length > 0;
}

/**
 * Returns whether the given ticket is blocking at least one other ticket.
 */
export function isBlocking(ticket: IMissionControlTicket): boolean {
	return ticket.blocks.length > 0;
}

/**
 * Returns whether the given ticket has reached a terminal status (complete or failed).
 */
export function isTerminal(ticket: IMissionControlTicket): boolean {
	return ticket.status === TicketStatus.Complete || ticket.status === TicketStatus.Failed;
}

/**
 * Returns whether the given ticket is actively being worked on.
 */
export function isActive(ticket: IMissionControlTicket): boolean {
	return ticket.status === TicketStatus.Running;
}

/**
 * Returns whether the given ticket was created by the user.
 */
export function isUserCreated(ticket: IMissionControlTicket): boolean {
	return ticket.createdBy === TicketCreator.User;
}

/**
 * Returns whether the given ticket is assigned to an agent.
 */
export function isAssigned(ticket: IMissionControlTicket): boolean {
	return ticket.assignedAgent !== undefined;
}

/**
 * Returns whether the given ticket is critical priority.
 */
export function isCritical(ticket: IMissionControlTicket): boolean {
	return ticket.priority === TicketPriority.Critical;
}

// #endregion
