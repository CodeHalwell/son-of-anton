/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Metadata for a single file entry inside a checkpoint snapshot.
 */
interface SnapshotFileEntry {
	/** Path relative to the workspace root. */
	readonly relativePath: string;
	/** Gzip-compressed file stored as <relativePath>.gz inside the snapshot dir. */
	readonly storedName: string;
	/** SHA-256 content hash of the original (uncompressed) file. */
	readonly contentHash: string;
	/** Original file size in bytes. */
	readonly originalSizeBytes: number;
	/** Compressed file size in bytes. */
	readonly compressedSizeBytes: number;
	/** File mtime at the time the checkpoint was created. */
	readonly mtimeMs: number;
}

/**
 * The JSON manifest written alongside each checkpoint's stored files.
 */
export interface CheckpointManifest {
	readonly checkpointId: string;
	readonly sessionId: string;
	readonly createdAt: string;
	readonly agentId: string;
	readonly action: string;
	readonly parentCheckpointId: string | undefined;
	readonly files: SnapshotFileEntry[];
	/** Total uncompressed bytes across all files. */
	readonly totalOriginalBytes: number;
	/** Total compressed bytes stored on disk. */
	readonly totalCompressedBytes: number;
}

/**
 * Options passed to {@link FsCheckpointService.createCheckpoint}.
 */
export interface FsCheckpointOptions {
	readonly sessionId: string;
	readonly checkpointId: string;
	readonly agentId: string;
	readonly action: string;
	/** Absolute paths to the files that should be captured. */
	readonly filePaths: string[];
	/** Absolute workspace root (used to compute relative paths for the manifest). */
	readonly workspaceRoot: string;
	/** ID of the previous checkpoint in this session, used for delta tracking. */
	readonly parentCheckpointId: string | undefined;
}

/**
 * Stores delta-based filesystem checkpoints for files that are not tracked by
 * git (e.g. untracked files, generated artefacts, binary assets).
 *
 * Layout on disk:
 * ```
 * .son-of-anton/
 *   checkpoints/
 *     <sessionId>/
 *       <checkpointId>/
 *         manifest.json
 *         <encoded-relative-path>.gz   (one per changed file)
 * ```
 *
 * Only files that have changed since the previous checkpoint are stored.
 * Content hashes (SHA-256) are used to detect changes.
 */
export class FsCheckpointService {
	private readonly sotaDir: string;

	constructor(workspaceRoot: string) {
		this.sotaDir = path.join(workspaceRoot, '.son-of-anton', 'checkpoints');
	}

	/**
	 * Capture a snapshot of the given files.
	 * Only files that changed since the parent checkpoint are stored (delta).
	 *
	 * @returns The manifest written to disk.
	 */
	async createCheckpoint(opts: FsCheckpointOptions): Promise<CheckpointManifest> {
		const snapshotDir = this.checkpointDir(opts.sessionId, opts.checkpointId);
		fs.mkdirSync(snapshotDir, { recursive: true });

		// Load the parent manifest to determine which files are already captured
		const parentManifest = opts.parentCheckpointId
			? await this.loadManifest(opts.sessionId, opts.parentCheckpointId)
			: undefined;

		const parentIndex = this.buildParentIndex(parentManifest);

		const entries: SnapshotFileEntry[] = [];
		let totalOriginalBytes = 0;
		let totalCompressedBytes = 0;

		for (const absolutePath of opts.filePaths) {
			let stat: fs.Stats;
			try {
				stat = fs.statSync(absolutePath);
			} catch {
				// File was deleted or is inaccessible — skip
				continue;
			}

			if (!stat.isFile()) {
				continue;
			}

			const original = fs.readFileSync(absolutePath);
			const contentHash = this.sha256(original);
			const relativePath = path.relative(opts.workspaceRoot, absolutePath);

			// Skip if content hash matches parent — file has not changed
			if (parentIndex.get(relativePath) === contentHash) {
				continue;
			}

			const compressed = await gzip(original);
			const storedName = this.encodeStoredName(relativePath);
			const storedPath = path.join(snapshotDir, storedName);

			fs.writeFileSync(storedPath, compressed);

			entries.push({
				relativePath,
				storedName,
				contentHash,
				originalSizeBytes: original.byteLength,
				compressedSizeBytes: compressed.byteLength,
				mtimeMs: stat.mtimeMs,
			});

			totalOriginalBytes += original.byteLength;
			totalCompressedBytes += compressed.byteLength;
		}

		const manifest: CheckpointManifest = {
			checkpointId: opts.checkpointId,
			sessionId: opts.sessionId,
			createdAt: new Date().toISOString(),
			agentId: opts.agentId,
			action: opts.action,
			parentCheckpointId: opts.parentCheckpointId,
			files: entries,
			totalOriginalBytes,
			totalCompressedBytes,
		};

		fs.writeFileSync(
			path.join(snapshotDir, 'manifest.json'),
			JSON.stringify(manifest, null, '\t'),
			'utf-8'
		);

		return manifest;
	}

	/**
	 * Restore all files from a checkpoint back to the workspace.
	 * Walks the checkpoint chain (following parentCheckpointId) so that files
	 * not changed in a delta checkpoint are recovered from an ancestor.
	 */
	async rollback(sessionId: string, checkpointId: string, workspaceRoot: string): Promise<void> {
		// Collect the full chain of manifests from this checkpoint back to root
		const chain = await this.buildManifestChain(sessionId, checkpointId);

		// Build a resolution map: relativePath -> { snapshotDir, storedName }
		// Earlier (more recent) manifests win over later (older) ones.
		const resolutionMap = new Map<string, { dir: string; storedName: string }>();

		for (const manifest of chain) {
			const dir = this.checkpointDir(sessionId, manifest.checkpointId);
			for (const entry of manifest.files) {
				if (!resolutionMap.has(entry.relativePath)) {
					resolutionMap.set(entry.relativePath, { dir, storedName: entry.storedName });
				}
			}
		}

		// Restore all resolved files
		for (const [relativePath, { dir, storedName }] of resolutionMap) {
			const storedPath = path.join(dir, storedName);
			const targetPath = path.join(workspaceRoot, relativePath);

			const compressed = fs.readFileSync(storedPath);
			const original = await gunzip(compressed);

			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.writeFileSync(targetPath, original);
		}
	}

	/**
	 * Load the manifest for a specific checkpoint.
	 */
	async loadManifest(sessionId: string, checkpointId: string): Promise<CheckpointManifest | undefined> {
		const manifestPath = path.join(this.checkpointDir(sessionId, checkpointId), 'manifest.json');
		try {
			const raw = fs.readFileSync(manifestPath, 'utf-8');
			return JSON.parse(raw) as CheckpointManifest;
		} catch {
			return undefined;
		}
	}

	/**
	 * List all checkpoints for a session, sorted newest-first.
	 */
	listCheckpoints(sessionId: string): CheckpointManifest[] {
		const sessionDir = path.join(this.sotaDir, sessionId);

		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(sessionDir, { withFileTypes: true });
		} catch {
			return [];
		}

		const manifests: CheckpointManifest[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const manifestPath = path.join(sessionDir, entry.name, 'manifest.json');
			try {
				const raw = fs.readFileSync(manifestPath, 'utf-8');
				manifests.push(JSON.parse(raw) as CheckpointManifest);
			} catch {
				// Corrupt or incomplete checkpoint — skip
			}
		}

		return manifests.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
	}

	/**
	 * Delete a specific checkpoint directory.
	 */
	deleteCheckpoint(sessionId: string, checkpointId: string): void {
		const dir = this.checkpointDir(sessionId, checkpointId);
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// Ignore if already gone
		}
	}

	/**
	 * Delete all checkpoints for a session.
	 */
	deleteSession(sessionId: string): void {
		const sessionDir = path.join(this.sotaDir, sessionId);
		try {
			fs.rmSync(sessionDir, { recursive: true, force: true });
		} catch {
			// Ignore if already gone
		}
	}

	/**
	 * Prune checkpoints older than maxAgeMs across all sessions.
	 */
	pruneOlderThan(maxAgeMs: number): void {
		const cutoff = Date.now() - maxAgeMs;

		let sessionEntries: fs.Dirent[];
		try {
			sessionEntries = fs.readdirSync(this.sotaDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const sessionEntry of sessionEntries) {
			if (!sessionEntry.isDirectory()) {
				continue;
			}

			const sessionDir = path.join(this.sotaDir, sessionEntry.name);
			let cpEntries: fs.Dirent[];
			try {
				cpEntries = fs.readdirSync(sessionDir, { withFileTypes: true });
			} catch {
				continue;
			}

			for (const cpEntry of cpEntries) {
				if (!cpEntry.isDirectory()) {
					continue;
				}

				const manifestPath = path.join(sessionDir, cpEntry.name, 'manifest.json');
				try {
					const raw = fs.readFileSync(manifestPath, 'utf-8');
					const manifest = JSON.parse(raw) as CheckpointManifest;
					const age = new Date(manifest.createdAt).getTime();
					if (age < cutoff) {
						fs.rmSync(path.join(sessionDir, cpEntry.name), { recursive: true, force: true });
					}
				} catch {
					// Cannot parse — delete to avoid orphaned data
					try {
						fs.rmSync(path.join(sessionDir, cpEntry.name), { recursive: true, force: true });
					} catch {
						// Ignore
					}
				}
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private checkpointDir(sessionId: string, checkpointId: string): string {
		return path.join(this.sotaDir, sessionId, checkpointId);
	}

	/**
	 * Build a lookup of relativePath -> contentHash from a parent manifest.
	 */
	private buildParentIndex(manifest: CheckpointManifest | undefined): Map<string, string> {
		const index = new Map<string, string>();
		if (!manifest) {
			return index;
		}
		for (const entry of manifest.files) {
			index.set(entry.relativePath, entry.contentHash);
		}
		return index;
	}

	/**
	 * Walk the parentCheckpointId chain and return manifests oldest-last.
	 * The first element is the requested checkpoint; last is the root.
	 */
	private async buildManifestChain(sessionId: string, checkpointId: string): Promise<CheckpointManifest[]> {
		const chain: CheckpointManifest[] = [];
		let current: string | undefined = checkpointId;

		while (current) {
			const manifest = await this.loadManifest(sessionId, current);
			if (!manifest) {
				break;
			}
			chain.push(manifest);
			current = manifest.parentCheckpointId;
		}

		return chain;
	}

	/**
	 * SHA-256 hash of a buffer, returned as hex.
	 */
	private sha256(buf: Buffer): string {
		return crypto.createHash('sha256').update(buf).digest('hex');
	}

	/**
	 * Convert a relative file path to a safe filename for storage.
	 * Replaces path separators and colons with underscores and appends .gz.
	 */
	private encodeStoredName(relativePath: string): string {
		const safe = relativePath.replace(/[/\\:*?"<>|]/g, '_');
		return `${safe}.gz`;
	}
}
