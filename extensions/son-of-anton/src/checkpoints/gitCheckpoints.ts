/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Result of a git plumbing command.
 */
interface GitCommandResult {
	stdout: string;
	stderr: string;
}

/**
 * Represents a shadow checkpoint branch reference.
 * Lives at refs/checkpoints/<session-id>.
 */
export interface GitCheckpointRef {
	/** The full ref path, e.g. refs/checkpoints/session-abc/cp-123 */
	readonly ref: string;
	/** The commit SHA stored at this ref. */
	readonly commitSha: string;
	/** ISO timestamp of the commit. */
	readonly timestamp: string;
	/** The commit message. */
	readonly message: string;
	/** Files changed in this commit relative to parent. */
	readonly filesChanged: string[];
}

/**
 * Options for creating a git checkpoint.
 */
export interface GitCheckpointOptions {
	readonly sessionId: string;
	readonly checkpointId: string;
	readonly agentId: string;
	readonly action: string;
	/** Absolute path to the repository root. */
	readonly repoRoot: string;
}

/**
 * Uses git plumbing commands to create and restore shadow-branch checkpoints
 * without touching the user's working index.
 *
 * Strategy:
 * - A temporary index file (GIT_INDEX_FILE env var) is used for all staging
 *   operations so the user's real index is never altered.
 * - Checkpoints are stored as commits on shadow refs under refs/checkpoints/.
 * - Rollback uses git checkout-index to restore files from the checkpoint tree.
 */
export class GitCheckpointService {
	private readonly repoRoot: string;

	constructor(repoRoot: string) {
		this.repoRoot = repoRoot;
	}

	/**
	 * Create a checkpoint by committing the current state of tracked files to a
	 * shadow ref without touching the user's staging area.
	 *
	 * @returns The SHA of the created commit, or undefined if git is unavailable.
	 */
	async createCheckpoint(opts: GitCheckpointOptions): Promise<GitCheckpointRef | undefined> {
		const tempIndexPath = path.join(os.tmpdir(), `sota-idx-${opts.checkpointId}`);

		try {
			// Copy the current HEAD tree into a temp index — leaves user's index untouched
			await this.git(['read-tree', 'HEAD'], { indexFile: tempIndexPath });

			// Stage all tracked modified files into the temp index
			await this.git(['add', '-u'], { indexFile: tempIndexPath });

			// Write the index as a tree object
			const treeResult = await this.git(['write-tree'], { indexFile: tempIndexPath });
			const treeSha = treeResult.stdout.trim();

			if (!treeSha) {
				return undefined;
			}

			// Resolve current HEAD commit to use as parent (may not exist on empty repo)
			let parentArgs: string[] = [];
			try {
				const headResult = await this.git(['rev-parse', 'HEAD']);
				const headSha = headResult.stdout.trim();
				if (headSha) {
					parentArgs = ['-p', headSha];
				}
			} catch {
				// Empty repo — no parent
			}

			// Create the commit object
			const message = `[checkpoint] ${opts.agentId}: ${opts.action}`;
			const commitResult = await this.git(
				['commit-tree', treeSha, ...parentArgs, '-m', message],
				{ indexFile: tempIndexPath }
			);
			const commitSha = commitResult.stdout.trim();

			if (!commitSha) {
				return undefined;
			}

			// Write the shadow ref
			const ref = this.buildRef(opts.sessionId, opts.checkpointId);
			await this.git(['update-ref', ref, commitSha]);

			// Collect changed files relative to parent
			const filesChanged = await this.getChangedFiles(commitSha, parentArgs.length > 0 ? parentArgs[1] : undefined);

			return {
				ref,
				commitSha,
				timestamp: new Date().toISOString(),
				message,
				filesChanged,
			};
		} finally {
			// Always clean up the temp index file
			try {
				fs.unlinkSync(tempIndexPath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * Restore the workspace to the state captured at a checkpoint ref.
	 * Uses git checkout-index to write files from the checkpoint tree.
	 */
	async rollback(ref: string): Promise<void> {
		// Resolve the commit SHA from the ref
		const refResult = await this.git(['rev-parse', ref]);
		const commitSha = refResult.stdout.trim();

		if (!commitSha) {
			throw new Error(`Cannot resolve ref: ${ref}`);
		}

		// Read the tree from the commit
		const treeResult = await this.git(['rev-parse', `${commitSha}^{tree}`]);
		const treeSha = treeResult.stdout.trim();

		if (!treeSha) {
			throw new Error(`Cannot resolve tree from commit: ${commitSha}`);
		}

		const tempIndexPath = path.join(os.tmpdir(), `sota-rollback-${Date.now()}`);

		try {
			// Build a temp index from the checkpoint tree
			await this.git(['read-tree', treeSha], { indexFile: tempIndexPath });

			// Checkout files from the temp index into the working directory
			// --force overwrites local modifications; -a checks out all files
			await this.git(['checkout-index', '--force', '-a'], { indexFile: tempIndexPath });
		} finally {
			try {
				fs.unlinkSync(tempIndexPath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * List all checkpoint refs for a given session.
	 */
	async listCheckpointRefs(sessionId: string): Promise<GitCheckpointRef[]> {
		const prefix = `refs/checkpoints/${sessionId}/`;

		let output: string;
		try {
			const result = await this.git(['for-each-ref', '--format=%(refname) %(objectname) %(creatordate:iso)', prefix]);
			output = result.stdout.trim();
		} catch {
			return [];
		}

		if (!output) {
			return [];
		}

		const refs: GitCheckpointRef[] = [];
		for (const line of output.split('\n')) {
			const parts = line.trim().split(' ');
			if (parts.length < 2) {
				continue;
			}

			const refName = parts[0];
			const commitSha = parts[1];

			try {
				const messageResult = await this.git(['log', '-1', '--format=%s', commitSha]);
				const filesChanged = await this.getChangedFiles(commitSha, undefined);

				refs.push({
					ref: refName,
					commitSha,
					timestamp: parts.slice(2).join(' ') || new Date().toISOString(),
					message: messageResult.stdout.trim(),
					filesChanged,
				});
			} catch {
				// Skip refs we cannot resolve
			}
		}

		return refs;
	}

	/**
	 * Delete a shadow checkpoint ref.
	 */
	async deleteRef(ref: string): Promise<void> {
		try {
			await this.git(['update-ref', '-d', ref]);
		} catch {
			// Ref may already be gone
		}
	}

	/**
	 * Delete all checkpoint refs for a session.
	 */
	async deleteSessionRefs(sessionId: string): Promise<void> {
		const refs = await this.listCheckpointRefs(sessionId);
		await Promise.all(refs.map(r => this.deleteRef(r.ref)));
	}

	/**
	 * Check whether the given path is inside a git repository.
	 */
	async isGitRepository(): Promise<boolean> {
		try {
			await this.git(['rev-parse', '--git-dir']);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Return the set of files tracked by git (i.e. in the index).
	 */
	async listTrackedFiles(): Promise<string[]> {
		try {
			const result = await this.git(['ls-files', '--cached', '--others', '--exclude-standard']);
			return result.stdout
				.split('\n')
				.map(l => l.trim())
				.filter(l => l.length > 0)
				.map(l => path.join(this.repoRoot, l));
		} catch {
			return [];
		}
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * Build the shadow ref path for a checkpoint.
	 */
	private buildRef(sessionId: string, checkpointId: string): string {
		return `refs/checkpoints/${sessionId}/${checkpointId}`;
	}

	/**
	 * Get files changed in commitSha relative to parentSha.
	 */
	private async getChangedFiles(commitSha: string, parentSha: string | undefined): Promise<string[]> {
		try {
			const args = parentSha
				? ['diff-tree', '--no-commit-id', '-r', '--name-only', parentSha, commitSha]
				: ['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', commitSha];

			const result = await this.git(args);
			return result.stdout
				.split('\n')
				.map(l => l.trim())
				.filter(l => l.length > 0);
		} catch {
			return [];
		}
	}

	/**
	 * Execute a git plumbing command via execFile (no shell involvement).
	 * Optionally injects GIT_INDEX_FILE for temp-index operations.
	 */
	private async git(
		args: string[],
		opts?: { indexFile?: string }
	): Promise<GitCommandResult> {
		const env: NodeJS.ProcessEnv = { ...process.env };

		if (opts?.indexFile) {
			env['GIT_INDEX_FILE'] = opts.indexFile;
		}

		const result = await execFileAsync('git', args, {
			cwd: this.repoRoot,
			env,
			maxBuffer: 10 * 1024 * 1024, // 10 MB — enough for large diffs
		});

		return {
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
		};
	}
}
