/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Indicates how the checkpoint captures state.
 *
 * - `Git` — uses git plumbing (tree / commit objects) for tracked files.
 * - `FileSystem` — uses delta-based filesystem snapshots for untracked files.
 * - `Hybrid` — combines both strategies.
 */
export const enum CheckpointKind {
	Git = 'git',
	FileSystem = 'fileSystem',
	Hybrid = 'hybrid'
}

/**
 * Describes what caused a checkpoint to be created.
 */
export const enum CheckpointTrigger {
	PreAgentAction = 'preAgentAction',
	PostAgentAction = 'postAgentAction',
	Manual = 'manual',
	AutoSave = 'autoSave'
}

/**
 * An immutable snapshot of workspace state at a point in time.
 */
export interface ICheckpoint {
	readonly id: string;
	readonly kind: CheckpointKind;
	readonly trigger: CheckpointTrigger;
	readonly timestamp: number;
	readonly label: string;
	readonly agentId: string | undefined;
	readonly ticketId: string | undefined;

	/** Git tree-ish reference when {@link kind} is `Git` or `Hybrid`. */
	readonly gitRef: string | undefined;

	/** Path to the delta snapshot when {@link kind} is `FileSystem` or `Hybrid`. */
	readonly snapshotPath: string | undefined;

	readonly filesChanged: readonly string[];
	readonly parentCheckpointId: string | undefined;
}

/**
 * A summary of changes between two checkpoints.
 */
export interface ICheckpointDiff {
	readonly fromId: string;
	readonly toId: string;
	readonly additions: number;
	readonly deletions: number;
	readonly filesChanged: readonly string[];
}
