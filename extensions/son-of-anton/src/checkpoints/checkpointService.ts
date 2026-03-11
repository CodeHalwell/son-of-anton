/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { GitCheckpointService, GitCheckpointRef } from './gitCheckpoints';
import { FsCheckpointService, CheckpointManifest } from './fsCheckpoints';

/** 24 hours in milliseconds — default max checkpoint age before auto-prune. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A unified checkpoint record that captures both git and filesystem state.
 * Mirrors the shape of ICheckpoint from checkpointTypes.ts, adapted for use
 * inside the extension where the const enum values are plain strings.
 */
export interface HybridCheckpoint {
	/** Unique checkpoint identifier, format: cp-<timestamp>-<agent>-<short-hash> */
	readonly id: string;
	readonly sessionId: string;
	readonly agentId: string;
	readonly action: string;
	readonly label: string;
	readonly timestamp: number;
	/** Shadow git ref for tracked files, e.g. refs/checkpoints/<session>/<id> */
	readonly gitRef: string | undefined;
	/** Absolute path to the .son-of-anton/checkpoints/<session>/<id> directory */
	readonly snapshotPath: string | undefined;
	/** All files captured by this checkpoint (union of git + fs sets). */
	readonly filesChanged: string[];
	readonly parentCheckpointId: string | undefined;
}

/**
 * Options for {@link HybridCheckpointService.create}.
 */
export interface CreateCheckpointOptions {
	readonly sessionId: string;
	readonly agentId: string;
	readonly action: string;
}

/**
 * Combines git-based and filesystem-based checkpointing into a single service.
 *
 * Routing strategy:
 * - Files tracked by git → {@link GitCheckpointService} (shadow refs)
 * - Remaining files (untracked, generated) → {@link FsCheckpointService} (delta gzip)
 *
 * Auto-prune: on every create call the service deletes checkpoints older than
 * {@link DEFAULT_MAX_AGE_MS} (24 h) in the background so callers are never blocked.
 */
export class HybridCheckpointService implements vscode.Disposable {
	private readonly gitService: GitCheckpointService;
	private readonly fsService: FsCheckpointService;
	private readonly workspaceRoot: string;
	private readonly outputChannel: vscode.OutputChannel;

	/** Maps sessionId -> checkpointId of the most recently created checkpoint. */
	private readonly lastCheckpointBySession = new Map<string, string>();

	constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
		this.workspaceRoot = workspaceRoot;
		this.outputChannel = outputChannel;
		this.gitService = new GitCheckpointService(workspaceRoot);
		this.fsService = new FsCheckpointService(workspaceRoot);
	}

	/**
	 * Create a hybrid checkpoint capturing all modified files.
	 *
	 * Tracked files are committed to a shadow git ref; untracked files are
	 * delta-compressed into .son-of-anton/checkpoints/.
	 *
	 * @returns The created checkpoint, or undefined if creation fails entirely.
	 */
	async create(opts: CreateCheckpointOptions): Promise<HybridCheckpoint | undefined> {
		const checkpointId = this.generateId(opts.agentId);
		const parentCheckpointId = this.lastCheckpointBySession.get(opts.sessionId);

		this.log(`Creating checkpoint ${checkpointId} for session ${opts.sessionId}`);

		let gitRef: GitCheckpointRef | undefined;
		let fsManifest: CheckpointManifest | undefined;
		const allFilesChanged: string[] = [];

		// --- Git checkpoint (tracked files) ---
		const isGitRepo = await this.gitService.isGitRepository();
		if (isGitRepo) {
			try {
				gitRef = await this.gitService.createCheckpoint({
					sessionId: opts.sessionId,
					checkpointId,
					agentId: opts.agentId,
					action: opts.action,
					repoRoot: this.workspaceRoot,
				});

				if (gitRef) {
					allFilesChanged.push(...gitRef.filesChanged);
					this.log(`Git checkpoint created at ${gitRef.ref}`);
				}
			} catch (err) {
				this.log(`Git checkpoint failed (non-fatal): ${this.errorMessage(err)}`);
			}
		}

		// --- Filesystem checkpoint (untracked / generated files) ---
		try {
			const trackedFiles = isGitRepo
				? new Set(await this.gitService.listTrackedFiles())
				: new Set<string>();

			// Collect all workspace files not covered by git
			const allWorkspaceFiles = await this.collectWorkspaceFiles();
			const untrackedFiles = allWorkspaceFiles.filter(f => !trackedFiles.has(f));

			if (untrackedFiles.length > 0) {
				fsManifest = await this.fsService.createCheckpoint({
					sessionId: opts.sessionId,
					checkpointId,
					agentId: opts.agentId,
					action: opts.action,
					filePaths: untrackedFiles,
					workspaceRoot: this.workspaceRoot,
					parentCheckpointId,
				});

				// Add FS-only files that are not already in the git list
				const gitFileSet = new Set(allFilesChanged);
				for (const entry of fsManifest.files) {
					if (!gitFileSet.has(entry.relativePath)) {
						allFilesChanged.push(entry.relativePath);
					}
				}

				this.log(`FS checkpoint stored ${fsManifest.files.length} delta file(s)`);
			}
		} catch (err) {
			this.log(`FS checkpoint failed (non-fatal): ${this.errorMessage(err)}`);
		}

		// If both strategies produced nothing, treat as a no-op
		if (!gitRef && !fsManifest) {
			this.log(`Checkpoint ${checkpointId} produced no output — skipping`);
			return undefined;
		}

		const checkpoint: HybridCheckpoint = {
			id: checkpointId,
			sessionId: opts.sessionId,
			agentId: opts.agentId,
			action: opts.action,
			label: `[checkpoint] ${opts.agentId}: ${opts.action}`,
			timestamp: Date.now(),
			gitRef: gitRef?.ref,
			snapshotPath: fsManifest
				? `${this.workspaceRoot}/.son-of-anton/checkpoints/${opts.sessionId}/${checkpointId}`
				: undefined,
			filesChanged: allFilesChanged,
			parentCheckpointId,
		};

		this.lastCheckpointBySession.set(opts.sessionId, checkpointId);

		// Auto-prune in the background — do not await so callers are never blocked
		this.pruneOldCheckpointsBackground(opts.sessionId);

		return checkpoint;
	}

	/**
	 * Roll back the workspace to the state captured by a checkpoint.
	 * Both git-tracked and filesystem files are restored.
	 */
	async rollback(checkpoint: HybridCheckpoint): Promise<void> {
		this.log(`Rolling back to checkpoint ${checkpoint.id}`);

		const errors: string[] = [];

		if (checkpoint.gitRef) {
			try {
				await this.gitService.rollback(checkpoint.gitRef);
				this.log(`Git rollback from ${checkpoint.gitRef} complete`);
			} catch (err) {
				const msg = this.errorMessage(err);
				errors.push(`Git rollback failed: ${msg}`);
				this.log(msg);
			}
		}

		if (checkpoint.snapshotPath) {
			try {
				await this.fsService.rollback(
					checkpoint.sessionId,
					checkpoint.id,
					this.workspaceRoot
				);
				this.log(`FS rollback from ${checkpoint.snapshotPath} complete`);
			} catch (err) {
				const msg = this.errorMessage(err);
				errors.push(`FS rollback failed: ${msg}`);
				this.log(msg);
			}
		}

		if (errors.length > 0) {
			throw new Error(`Checkpoint rollback encountered errors:\n${errors.join('\n')}`);
		}
	}

	/**
	 * List all checkpoints for a session, sorted newest-first.
	 * Merges the git ref list with the filesystem manifest list.
	 */
	async list(sessionId: string): Promise<HybridCheckpoint[]> {
		const fsManifests = this.fsService.listCheckpoints(sessionId);
		const fsById = new Map<string, CheckpointManifest>(
			fsManifests.map(m => [m.checkpointId, m])
		);

		let gitRefs: GitCheckpointRef[] = [];
		try {
			gitRefs = await this.gitService.listCheckpointRefs(sessionId);
		} catch {
			// Git not available — return FS-only checkpoints
		}

		const gitById = new Map<string, GitCheckpointRef>(
			gitRefs.map(r => [this.refCheckpointId(r.ref), r])
		);

		// Union of all checkpoint IDs seen in either store
		const allIds = new Set([...fsById.keys(), ...gitById.keys()]);

		const checkpoints: HybridCheckpoint[] = [];
		for (const id of allIds) {
			const gitRef = gitById.get(id);
			const fsManifest = fsById.get(id);

			const filesChanged: string[] = [];
			if (gitRef) {
				filesChanged.push(...gitRef.filesChanged);
			}
			if (fsManifest) {
				const gitSet = new Set(filesChanged);
				for (const entry of fsManifest.files) {
					if (!gitSet.has(entry.relativePath)) {
						filesChanged.push(entry.relativePath);
					}
				}
			}

			const agentId = fsManifest?.agentId ?? this.extractAgentFromId(id);
			const action = fsManifest?.action ?? gitRef?.message ?? '';
			const timestamp = fsManifest
				? new Date(fsManifest.createdAt).getTime()
				: gitRef
					? new Date(gitRef.timestamp).getTime()
					: 0;

			checkpoints.push({
				id,
				sessionId,
				agentId,
				action,
				label: `[checkpoint] ${agentId}: ${action}`,
				timestamp,
				gitRef: gitRef?.ref,
				snapshotPath: fsManifest
					? `${this.workspaceRoot}/.son-of-anton/checkpoints/${sessionId}/${id}`
					: undefined,
				filesChanged,
				parentCheckpointId: fsManifest?.parentCheckpointId,
			});
		}

		return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Prune checkpoints older than maxAgeMs across all sessions.
	 * Defaults to 24 hours.
	 */
	async prune(maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<void> {
		this.log(`Pruning checkpoints older than ${maxAgeMs}ms`);
		this.fsService.pruneOlderThan(maxAgeMs);
		// Git ref pruning is per-session; call deleteSessionRefs for full cleanup
		// when a session is explicitly closed. The git refs themselves are lightweight
		// and do not grow unboundedly in the short term.
	}

	dispose(): void {
		// Nothing to release — services are stateless after construction
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * Generate a checkpoint ID in the format: cp-<timestamp>-<agent>-<short-hash>
	 */
	private generateId(agentId: string): string {
		const timestamp = Date.now();
		const safeAgent = agentId.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 20);
		const hash = crypto.randomBytes(4).toString('hex');
		return `cp-${timestamp}-${safeAgent}-${hash}`;
	}

	/**
	 * Extract the checkpoint ID from a full git ref path.
	 * e.g. refs/checkpoints/session-abc/cp-123-agent-abcd → cp-123-agent-abcd
	 */
	private refCheckpointId(ref: string): string {
		const parts = ref.split('/');
		return parts[parts.length - 1] ?? ref;
	}

	/**
	 * Attempt to extract the agent segment from a checkpoint ID.
	 * Format: cp-<timestamp>-<agent>-<hash>
	 */
	private extractAgentFromId(id: string): string {
		const parts = id.split('-');
		// cp, timestamp, agent..., hash
		if (parts.length >= 4) {
			return parts.slice(2, parts.length - 1).join('-');
		}
		return 'unknown';
	}

	/**
	 * Collect all files under the workspace root, excluding .git and .son-of-anton.
	 */
	private async collectWorkspaceFiles(): Promise<string[]> {
		const pattern = new vscode.RelativePattern(
			this.workspaceRoot,
			'**/*'
		);

		const uris = await vscode.workspace.findFiles(
			pattern,
			'{.git/**,.son-of-anton/**,node_modules/**}'
		);

		return uris.map(u => u.fsPath);
	}

	/**
	 * Run checkpoint pruning in the background without blocking the caller.
	 */
	private pruneOldCheckpointsBackground(_sessionId: string): void {
		Promise.resolve()
			.then(() => this.prune(DEFAULT_MAX_AGE_MS))
			.catch(err => this.log(`Background prune error: ${this.errorMessage(err)}`));
	}

	private log(message: string): void {
		this.outputChannel.appendLine(`[HybridCheckpointService] ${message}`);
	}

	private errorMessage(err: unknown): string {
		return err instanceof Error ? err.message : String(err);
	}
}

/**
 * Register the HybridCheckpointService with VS Code and wire up the
 * sota.restoreCheckpoint command.
 *
 * Call this from extension.ts activate().
 */
export function registerCheckpointService(
	context: vscode.ExtensionContext,
	workspaceRoot: string
): HybridCheckpointService {
	const outputChannel = vscode.window.createOutputChannel('Son of Anton: Checkpoints');
	context.subscriptions.push(outputChannel);

	const service = new HybridCheckpointService(workspaceRoot, outputChannel);
	context.subscriptions.push(service);

	// sota.restoreCheckpoint — lets users pick a checkpoint and roll back
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.restoreCheckpoint', async (sessionId?: string) => {
			const resolvedSession = sessionId ?? deriveSessionId(context);

			let checkpoints: HybridCheckpoint[];
			try {
				checkpoints = await service.list(resolvedSession);
			} catch (err) {
				vscode.window.showErrorMessage(
					`Failed to list checkpoints: ${err instanceof Error ? err.message : String(err)}`
				);
				return;
			}

			if (checkpoints.length === 0) {
				vscode.window.showInformationMessage('No checkpoints found for this session.');
				return;
			}

			const pick = await vscode.window.showQuickPick(
				checkpoints.map(cp => ({
					label: cp.label,
					description: new Date(cp.timestamp).toLocaleString(),
					detail: `${cp.filesChanged.length} file(s) changed`,
					checkpoint: cp,
				})),
				{ placeHolder: 'Select a checkpoint to restore' }
			);

			if (!pick) {
				return;
			}

			const confirm = await vscode.window.showWarningMessage(
				`Restore checkpoint "${pick.checkpoint.label}"? This will overwrite local changes.`,
				{ modal: true },
				'Restore',
				'Cancel'
			);

			if (confirm !== 'Restore') {
				return;
			}

			try {
				await service.rollback(pick.checkpoint);
				vscode.window.showInformationMessage(
					`Checkpoint "${pick.checkpoint.label}" restored successfully.`
				);
			} catch (err) {
				vscode.window.showErrorMessage(
					`Rollback failed: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		})
	);

	return service;
}

/**
 * Derive a stable session ID for the current VS Code window.
 * Uses the workspace storage path as an opaque but stable identifier.
 */
function deriveSessionId(context: vscode.ExtensionContext): string {
	const storagePath = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
	return crypto.createHash('sha256').update(storagePath).digest('hex').slice(0, 16);
}
