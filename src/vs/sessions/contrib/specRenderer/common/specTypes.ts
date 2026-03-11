/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the Spec Renderer surface.
 *
 * The Spec Renderer provides a structured rendering mode for requirements.md,
 * design.md, and tasks.md files — treating them as engineering objects rather
 * than plain markdown.
 */

export const enum SpecDocumentKind {
	Requirements = 'requirements',
	Design = 'design',
	Tasks = 'tasks'
}

export const enum EarsClauseKind {
	/** WHEN <trigger> THE SYSTEM SHALL <behaviour> */
	Event = 'event',
	/** WHILE <state> THE SYSTEM SHALL <behaviour> */
	State = 'state',
	/** WHERE <feature> THE SYSTEM SHALL <behaviour> */
	Feature = 'feature',
	/** IF <condition> THEN THE SYSTEM SHALL <behaviour> */
	Option = 'option',
	/** THE SYSTEM SHALL <behaviour> */
	Ubiquitous = 'ubiquitous'
}

export const enum ClauseStatus {
	Pending = 'pending',
	Satisfied = 'satisfied',
	Violated = 'violated',
	Untested = 'untested'
}

export interface IEarsClause {
	readonly id: string;
	readonly kind: EarsClauseKind;
	readonly rawText: string;
	readonly trigger: string | undefined;
	readonly condition: string | undefined;
	readonly behaviour: string;
	status: ClauseStatus;
	readonly linkedTestIds: string[];
}

export const enum TaskItemStatus {
	Todo = 'todo',
	InProgress = 'inProgress',
	Done = 'done',
	Skipped = 'skipped'
}

export interface ITaskItem {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	status: TaskItemStatus;
	readonly dependsOn: string[];
	readonly completedBy: string | undefined;
	readonly agentAttribution: string | undefined;
}

export interface ISpecDocument {
	readonly filePath: string;
	readonly kind: SpecDocumentKind;
	readonly title: string;
	readonly clauses: IEarsClause[];
	readonly tasks: ITaskItem[];
	readonly completionPercent: number;
	readonly lastParsedAt: number;
}

// ---- EARS keyword highlighting tokens ----

export const EARS_KEYWORDS = ['WHEN', 'WHILE', 'WHERE', 'IF', 'THEN', 'THE SYSTEM SHALL', 'SHALL'] as const;

// ---- Type guards ----

export function isRequirements(doc: ISpecDocument): boolean {
	return doc.kind === SpecDocumentKind.Requirements;
}

export function isDesign(doc: ISpecDocument): boolean {
	return doc.kind === SpecDocumentKind.Design;
}

export function isTasks(doc: ISpecDocument): boolean {
	return doc.kind === SpecDocumentKind.Tasks;
}

export function isClauseSatisfied(clause: IEarsClause): boolean {
	return clause.status === ClauseStatus.Satisfied;
}
