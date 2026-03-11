/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MemoryFactory — detects the best available memory backend and creates the
 * appropriate store instance.
 *
 * Backend selection hierarchy:
 *
 *   1. Docker (FalkorDB + Qdrant) — used when the Docker stack is running.
 *      Detected by attempting TCP connections to FalkorDB on port 6379 and
 *      Qdrant on port 6333.
 *
 *   2. SQLite (local-first) — always available as the fallback.
 *      Stores data at <workspacePath>/.son-of-anton/memory.db
 *
 * The factory is deliberately structured so the Docker backend can be
 * introduced later without changing any call-sites: just implement
 * DockerMemoryStore and return it from create() when detectDockerBackend()
 * returns true.
 *
 * Usage:
 *   const store = await MemoryFactory.create('/path/to/workspace');
 *   await store.initialize();
 *   // ... use store ...
 *   await store.close();
 */

import * as net from 'net';
import * as path from 'path';
import { SqliteMemoryStore } from './sqliteMemory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory inside the workspace root that holds all Son of Anton state. */
const SOA_DIR = '.son-of-anton';

/** SQLite database filename within SOA_DIR. */
const MEMORY_DB_FILENAME = 'memory.db';

/** Default host for the Docker services (localhost). */
const DOCKER_HOST = '127.0.0.1';

/** FalkorDB (Redis-compatible) default port. */
const FALKORDB_PORT = 6379;

/** Qdrant REST API default port. */
const QDRANT_PORT = 6333;

/** Milliseconds to wait before declaring a port unreachable. */
const PORT_PROBE_TIMEOUT_MS = 500;

// ---------------------------------------------------------------------------
// Port probe helper
// ---------------------------------------------------------------------------

/**
 * Probe a TCP port to test whether a service is listening.
 *
 * Resolves to `true` if a connection is established within the timeout,
 * `false` otherwise (connection refused, timeout, or any other error).
 *
 * @param host Hostname or IP address
 * @param port TCP port number
 * @param timeoutMs Maximum wait time in milliseconds
 */
function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
	return new Promise(resolve => {
		const socket = new net.Socket();
		let resolved = false;

		const finish = (result: boolean) => {
			if (!resolved) {
				resolved = true;
				socket.destroy();
				resolve(result);
			}
		};

		socket.setTimeout(timeoutMs);
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
		socket.once('timeout', () => finish(false));

		socket.connect(port, host);
	});
}

// ---------------------------------------------------------------------------
// MemoryFactory
// ---------------------------------------------------------------------------

export class MemoryFactory {
	/**
	 * Check whether the Docker-based memory backend is reachable.
	 *
	 * Probes both FalkorDB (port 6379) and Qdrant (port 6333) on localhost.
	 * Both must be up for the Docker backend to be considered available.
	 *
	 * @returns `true` when both services are reachable, `false` otherwise.
	 */
	static async detectDockerBackend(): Promise<boolean> {
		const [falkorOk, qdrantOk] = await Promise.all([
			probePort(DOCKER_HOST, FALKORDB_PORT, PORT_PROBE_TIMEOUT_MS),
			probePort(DOCKER_HOST, QDRANT_PORT, PORT_PROBE_TIMEOUT_MS),
		]);
		return falkorOk && qdrantOk;
	}

	/**
	 * Create and return the best available memory store for the given
	 * workspace path.
	 *
	 * The caller is responsible for:
	 *   - Calling `store.initialize()` before first use.
	 *   - Calling `store.close()` when the store is no longer needed.
	 *
	 * @param workspacePath Absolute path to the workspace root directory.
	 * @returns An uninitialised SqliteMemoryStore instance.
	 */
	static async create(workspacePath: string): Promise<SqliteMemoryStore> {
		// --- Docker backend (not yet implemented) ---
		// When the Docker stack is running we would construct a DockerMemoryStore
		// instead.  The detection call is made here so that:
		//   a) the detection logic is exercised and testable, and
		//   b) adding Docker support later only requires filling in this branch.
		const dockerAvailable = await MemoryFactory.detectDockerBackend();

		if (dockerAvailable) {
			// TODO: return new DockerMemoryStore(workspacePath) once implemented.
			// For now, fall through to SQLite even when Docker is detected.
			// This is intentional: the SQLite store is fully functional and
			// Docker support has not yet been built.
		}

		// --- SQLite backend (always available) ---
		const dbPath = path.join(workspacePath, SOA_DIR, MEMORY_DB_FILENAME);
		return new SqliteMemoryStore(dbPath);
	}
}
