/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CheckpointKind, CheckpointTrigger, ICheckpoint, ICheckpointDiff } from '../common/checkpointTypes.js';

export const ICheckpointService = createDecorator<ICheckpointService>('soaCheckpointService');

export interface ICheckpointService {
	readonly _serviceBrand: undefined;

	/** Fires whenever a new checkpoint is created. */
	readonly onDidCreateCheckpoint: Event<ICheckpoint>;

	/**
	 * Create a new checkpoint that captures the current workspace state.
	 */
	createCheckpoint(trigger: CheckpointTrigger, label: string, agentId?: string, ticketId?: string): Promise<ICheckpoint>;

	/**
	 * Restore the workspace to the state captured by the given checkpoint.
	 */
	restoreCheckpoint(checkpointId: string): Promise<void>;

	/**
	 * Return a single checkpoint by id, or `undefined` if not found.
	 */
	getCheckpoint(checkpointId: string): ICheckpoint | undefined;

	/**
	 * Return all checkpoints ordered by creation time (oldest first).
	 */
	listCheckpoints(): ICheckpoint[];

	/**
	 * Compute a summary of changes between two checkpoints.
	 */
	diffCheckpoints(fromId: string, toId: string): Promise<ICheckpointDiff>;

	/**
	 * Delete a checkpoint and its associated data.
	 */
	deleteCheckpoint(checkpointId: string): void;
}

export class CheckpointService extends Disposable implements ICheckpointService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidCreateCheckpoint = this._register(new Emitter<ICheckpoint>());
	readonly onDidCreateCheckpoint: Event<ICheckpoint> = this._onDidCreateCheckpoint.event;

	/** In-memory store keyed by checkpoint id. */
	private readonly _checkpoints = new Map<string, ICheckpoint>();

	/** Monotonically increasing counter used to generate unique ids within the same millisecond. */
	private _counter = 0;

	async createCheckpoint(trigger: CheckpointTrigger, label: string, agentId?: string, ticketId?: string): Promise<ICheckpoint> {
		const id = this._generateId();

		// TODO: integrate git plumbing to create a tree object for tracked files
		// TODO: create a delta-based filesystem snapshot for untracked files
		// TODO: determine CheckpointKind based on workspace state (git available, untracked files, etc.)

		const lastCheckpointId = this._getMostRecentCheckpointId();

		const checkpoint: ICheckpoint = {
			id,
			kind: CheckpointKind.Hybrid,
			trigger,
			timestamp: Date.now(),
			label,
			agentId: agentId ?? undefined,
			ticketId: ticketId ?? undefined,
			gitRef: undefined,
			snapshotPath: undefined,
			filesChanged: [],
			parentCheckpointId: lastCheckpointId
		};

		this._checkpoints.set(id, checkpoint);
		this._onDidCreateCheckpoint.fire(checkpoint);

		return checkpoint;
	}

	async restoreCheckpoint(checkpointId: string): Promise<void> {
		const checkpoint = this._checkpoints.get(checkpointId);
		if (!checkpoint) {
			throw new Error(`Checkpoint not found: ${checkpointId}`);
		}

		// TODO: if checkpoint.gitRef is set, run `git read-tree` / `git checkout-index` to restore tracked files
		// TODO: if checkpoint.snapshotPath is set, apply the delta snapshot to restore untracked files
	}

	getCheckpoint(checkpointId: string): ICheckpoint | undefined {
		return this._checkpoints.get(checkpointId);
	}

	listCheckpoints(): ICheckpoint[] {
		return Array.from(this._checkpoints.values())
			.sort((a, b) => a.timestamp - b.timestamp);
	}

	async diffCheckpoints(fromId: string, toId: string): Promise<ICheckpointDiff> {
		const from = this._checkpoints.get(fromId);
		const to = this._checkpoints.get(toId);

		if (!from) {
			throw new Error(`Checkpoint not found: ${fromId}`);
		}
		if (!to) {
			throw new Error(`Checkpoint not found: ${toId}`);
		}

		// TODO: use git diff-tree when both checkpoints have gitRef values
		// TODO: compare filesystem snapshots for untracked file diffs

		return {
			fromId,
			toId,
			additions: 0,
			deletions: 0,
			filesChanged: []
		};
	}

	deleteCheckpoint(checkpointId: string): void {
		const existed = this._checkpoints.delete(checkpointId);
		if (!existed) {
			throw new Error(`Checkpoint not found: ${checkpointId}`);
		}

		// TODO: clean up git refs and snapshot files associated with the deleted checkpoint
	}

	private _generateId(): string {
		return `cp-${Date.now()}-${this._counter++}`;
	}

	private _getMostRecentCheckpointId(): string | undefined {
		let latest: ICheckpoint | undefined;
		for (const checkpoint of this._checkpoints.values()) {
			if (!latest || checkpoint.timestamp > latest.timestamp) {
				latest = checkpoint;
			}
		}
		return latest?.id;
	}
}
