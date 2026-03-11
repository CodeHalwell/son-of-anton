/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SqliteMemoryStore — local-first hybrid memory store.
 *
 * Three complementary search strategies are combined into a single ranked
 * result list:
 *
 *   1. Keyword search  — FTS5 MATCH query on the documents virtual table.
 *      Precise, fast, handles exact symbol names and error messages well.
 *
 *   2. Vector search   — sqlite-vec KNN query on vec_nodes (if the native
 *      extension is available). Semantic/fuzzy retrieval.
 *      Gracefully disabled when sqlite-vec is not loadable.
 *
 *   3. Graph traversal — Recursive CTE on the edges table starting from
 *      nodes matched by keyword or vector search.
 *      Surfaces structurally related context (callers, dependencies, etc.).
 *
 * Results from all three sources are merged, deduplicated by node ID, and
 * ranked by a weighted composite score before being returned.
 *
 * NOTE: Requires better-sqlite3. Add to package.json:
 *   dependencies:    "better-sqlite3": "^9.4.3"
 *   devDependencies: "@types/better-sqlite3": "^7.6.8"
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3'; // requires better-sqlite3 in package.json
import { applyMigrations, buildVecTableDDL } from './schema';
import {
	MemoryBackend,
	MemoryEdgeKind,
	MemoryNodeKind,
	type IMemoryEdge,
	type IMemoryNode,
	type IMemoryQueryOptions,
	type IMemorySearchResult,
	type IMemoryStats,
} from './memoryTypes';

// ---------------------------------------------------------------------------
// Internal row shapes (what better-sqlite3 returns from SELECT)
// ---------------------------------------------------------------------------

interface NodeRow {
	id: string;
	kind: string;
	label: string;
	content: string;
	file_path: string | null;
	metadata: string;
	created_at: number;
	updated_at: number;
}

interface EdgeRow {
	id: string;
	kind: string;
	source_id: string;
	target_id: string;
	weight: number;
	metadata: string;
}

// ---------------------------------------------------------------------------
// Weighting constants for hybrid score
// ---------------------------------------------------------------------------

const WEIGHT_KEYWORD = 0.4;
const WEIGHT_VECTOR = 0.4;
const WEIGHT_GRAPH = 0.2;

/** Maximum graph traversal depth for the recursive CTE. */
const MAX_GRAPH_DEPTH = 3;

/** Embedding dimensionality used when sqlite-vec is available. */
const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a time-sortable pseudo-random ID.
 * Format: <timestamp_hex>-<random_hex>
 */
function generateId(): string {
	const ts = Date.now().toString(16).padStart(12, '0');
	const rand = Math.random().toString(16).slice(2).padStart(8, '0');
	return `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToNode(row: NodeRow): IMemoryNode {
	let metadata: Record<string, string> = {};
	try {
		metadata = JSON.parse(row.metadata) as Record<string, string>;
	} catch {
		// Treat malformed metadata as empty — non-fatal.
	}

	return {
		id: row.id,
		kind: row.kind as MemoryNodeKind,
		label: row.label,
		content: row.content,
		filePath: row.file_path ?? undefined,
		embedding: undefined, // embeddings are stored in vec_nodes, not nodes
		metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function rowToEdge(row: EdgeRow): IMemoryEdge {
	let metadata: Record<string, string> = {};
	try {
		metadata = JSON.parse(row.metadata) as Record<string, string>;
	} catch {
		// Treat malformed metadata as empty — non-fatal.
	}

	return {
		id: row.id,
		kind: row.kind as MemoryEdgeKind,
		sourceId: row.source_id,
		targetId: row.target_id,
		weight: row.weight,
		metadata,
	};
}

// ---------------------------------------------------------------------------
// SqliteMemoryStore
// ---------------------------------------------------------------------------

/**
 * Local-first hybrid memory store backed by SQLite.
 *
 * Call {@link initialize} before any other method.
 * Call {@link close} when the store is no longer needed.
 */
export class SqliteMemoryStore {
	private db: Database.Database | undefined;
	private vecAvailable = false;
	private readonly dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	/**
	 * Open the database, apply pending migrations, and optionally load
	 * the sqlite-vec extension for vector search.
	 */
	async initialize(): Promise<void> {
		// Ensure the parent directory exists
		const dir = path.dirname(this.dbPath);
		fs.mkdirSync(dir, { recursive: true });

		this.db = new Database(this.dbPath);

		// WAL mode for better read/write concurrency
		this.db.pragma('journal_mode = WAL');
		// Enforce foreign key constraints (required for CASCADE to work)
		this.db.pragma('foreign_keys = ON');

		// Apply schema migrations
		applyMigrations(this.db);

		// Attempt to load sqlite-vec for vector search (optional)
		this.vecAvailable = this.tryLoadSqliteVec();
	}

	/** Close the underlying database connection. */
	async close(): Promise<void> {
		this.db?.close();
		this.db = undefined;
	}

	// -------------------------------------------------------------------------
	// Node CRUD
	// -------------------------------------------------------------------------

	/**
	 * Insert a new node into the store.
	 *
	 * @param kind     Node kind (file, function, class, etc.)
	 * @param label    Short human-readable label (e.g. function name)
	 * @param content  Full content / docstring / source text
	 * @param filePath Workspace-relative path if the node maps to a file
	 * @param metadata Arbitrary key-value metadata
	 * @returns        The newly created node
	 */
	async addNode(
		kind: MemoryNodeKind,
		label: string,
		content: string,
		filePath?: string,
		metadata?: Record<string, string>,
	): Promise<IMemoryNode> {
		const db = this.requireDb();
		const now = Date.now();
		const id = generateId();
		const metaJson = JSON.stringify(metadata ?? {});

		db.prepare(
			'INSERT INTO nodes (id, kind, label, content, file_path, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		).run(id, kind, label, content, filePath ?? null, metaJson, now, now);

		return {
			id,
			kind,
			label,
			content,
			filePath,
			embedding: undefined,
			metadata: metadata ?? {},
			createdAt: now,
			updatedAt: now,
		};
	}

	/**
	 * Retrieve a single node by its ID.
	 * Returns `undefined` if no node with that ID exists.
	 */
	async getNode(nodeId: string): Promise<IMemoryNode | undefined> {
		const db = this.requireDb();
		const row = db
			.prepare('SELECT * FROM nodes WHERE id = ?')
			.get(nodeId) as NodeRow | undefined;
		return row ? rowToNode(row) : undefined;
	}

	/**
	 * Update mutable fields on an existing node.
	 * Automatically bumps `updated_at` to the current timestamp.
	 *
	 * @param nodeId  ID of the node to update
	 * @param updates Partial set of fields to change
	 */
	async updateNode(
		nodeId: string,
		updates: Partial<Pick<IMemoryNode, 'label' | 'content' | 'filePath' | 'metadata'>>,
	): Promise<void> {
		const db = this.requireDb();
		const now = Date.now();

		const setClauses: string[] = ['updated_at = ?'];
		const values: unknown[] = [now];

		if (updates.label !== undefined) {
			setClauses.push('label = ?');
			values.push(updates.label);
		}
		if (updates.content !== undefined) {
			setClauses.push('content = ?');
			values.push(updates.content);
		}
		if (updates.filePath !== undefined) {
			setClauses.push('file_path = ?');
			values.push(updates.filePath);
		}
		if (updates.metadata !== undefined) {
			setClauses.push('metadata = ?');
			values.push(JSON.stringify(updates.metadata));
		}

		values.push(nodeId);

		db.prepare(
			`UPDATE nodes SET ${setClauses.join(', ')} WHERE id = ?`
		).run(...values);
	}

	/**
	 * Delete a node and all its incident edges (via ON DELETE CASCADE).
	 *
	 * @param nodeId ID of the node to remove
	 */
	async deleteNode(nodeId: string): Promise<void> {
		const db = this.requireDb();
		db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
	}

	// -------------------------------------------------------------------------
	// Edge CRUD
	// -------------------------------------------------------------------------

	/**
	 * Create a directed edge between two existing nodes.
	 *
	 * @param kind     Relationship type (calls, imports, dependsOn, etc.)
	 * @param sourceId ID of the source node
	 * @param targetId ID of the target node
	 * @param weight   Edge strength, defaults to 1.0
	 * @param metadata Arbitrary key-value metadata
	 * @returns        The newly created edge
	 */
	async addEdge(
		kind: MemoryEdgeKind,
		sourceId: string,
		targetId: string,
		weight = 1.0,
		metadata?: Record<string, string>,
	): Promise<IMemoryEdge> {
		const db = this.requireDb();
		const id = generateId();
		const metaJson = JSON.stringify(metadata ?? {});

		db.prepare(
			'INSERT INTO edges (id, kind, source_id, target_id, weight, metadata) VALUES (?, ?, ?, ?, ?, ?)'
		).run(id, kind, sourceId, targetId, weight, metaJson);

		return {
			id,
			kind,
			sourceId,
			targetId,
			weight,
			metadata: metadata ?? {},
		};
	}

	/**
	 * Return all edges whose source is the given node.
	 *
	 * @param nodeId Source node ID
	 */
	async getEdgesFrom(nodeId: string): Promise<IMemoryEdge[]> {
		const db = this.requireDb();
		const rows = db
			.prepare('SELECT * FROM edges WHERE source_id = ?')
			.all(nodeId) as EdgeRow[];
		return rows.map(rowToEdge);
	}

	/**
	 * Return all edges whose target is the given node.
	 *
	 * @param nodeId Target node ID
	 */
	async getEdgesTo(nodeId: string): Promise<IMemoryEdge[]> {
		const db = this.requireDb();
		const rows = db
			.prepare('SELECT * FROM edges WHERE target_id = ?')
			.all(nodeId) as EdgeRow[];
		return rows.map(rowToEdge);
	}

	/**
	 * Delete an edge by its ID.
	 *
	 * @param edgeId ID of the edge to remove
	 */
	async deleteEdge(edgeId: string): Promise<void> {
		const db = this.requireDb();
		db.prepare('DELETE FROM edges WHERE id = ?').run(edgeId);
	}

	// -------------------------------------------------------------------------
	// Hybrid search
	// -------------------------------------------------------------------------

	/**
	 * Execute a hybrid search combining keyword (FTS5), vector (sqlite-vec),
	 * and graph traversal strategies.
	 *
	 * Each strategy that is enabled and returns results contributes a
	 * normalised score. The three scores are combined with fixed weights:
	 *   keyword: 0.4 · vector: 0.4 · graph: 0.2
	 *
	 * @param options Query parameters (see IMemoryQueryOptions)
	 * @returns       Deduplicated, ranked results up to maxResults entries
	 */
	async search(options: IMemoryQueryOptions): Promise<IMemorySearchResult[]> {
		const db = this.requireDb();

		// Accumulate partial scores per node ID
		const scores = new Map<string, { keyword: number; vector: number; graph: number }>();

		const ensureEntry = (id: string) => {
			if (!scores.has(id)) {
				scores.set(id, { keyword: 0, vector: 0, graph: 0 });
			}
			return scores.get(id)!;
		};

		// --- 1. Keyword search via FTS5 ---
		if (options.includeKeyword && options.query.trim().length > 0) {
			const keywordRows = this.keywordSearch(db, options.query, options.filterKinds);
			for (const { nodeId, score } of keywordRows) {
				ensureEntry(nodeId).keyword = score;
			}
		}

		// --- 2. Vector search via sqlite-vec ---
		if (options.includeVector && this.vecAvailable) {
			// Vector search requires a query embedding. The caller is expected to
			// have stored embeddings via storeEmbedding(). We skip silently when
			// no embeddings exist rather than throwing.
			const vectorRows = this.vectorSearch(db, options.query, options.filterKinds);
			for (const { nodeId, score } of vectorRows) {
				ensureEntry(nodeId).vector = score;
			}
		}

		// --- 3. Graph traversal from keyword/vector anchors ---
		if (options.includeGraph) {
			const anchorIds = [...scores.keys()];
			if (anchorIds.length > 0) {
				const graphRows = this.graphTraversal(db, anchorIds, options.filterKinds);
				for (const { nodeId, score } of graphRows) {
					ensureEntry(nodeId).graph = score;
				}
			}
		}

		if (scores.size === 0) {
			return [];
		}

		// Normalise each dimension across all candidates
		const allKeyword = [...scores.values()].map(s => s.keyword);
		const allVector = [...scores.values()].map(s => s.vector);
		const allGraph = [...scores.values()].map(s => s.graph);

		const maxKeyword = Math.max(...allKeyword, 1);
		const maxVector = Math.max(...allVector, 1);
		const maxGraph = Math.max(...allGraph, 1);

		// Compute composite score and determine primary match source
		const ranked: Array<{ nodeId: string; composite: number; source: IMemorySearchResult['matchSource'] }> = [];

		for (const [nodeId, s] of scores) {
			const normKeyword = s.keyword / maxKeyword;
			const normVector = s.vector / maxVector;
			const normGraph = s.graph / maxGraph;

			const composite =
				WEIGHT_KEYWORD * normKeyword +
				WEIGHT_VECTOR * normVector +
				WEIGHT_GRAPH * normGraph;

			if (composite < options.minScore) {
				continue;
			}

			// Attribute the result to whichever source contributed most
			let source: IMemorySearchResult['matchSource'] = 'keyword';
			if (normVector >= normKeyword && normVector >= normGraph) {
				source = 'vector';
			} else if (normGraph >= normKeyword && normGraph >= normVector) {
				source = 'graph';
			}

			ranked.push({ nodeId, composite, source });
		}

		ranked.sort((a, b) => b.composite - a.composite);
		const top = ranked.slice(0, options.maxResults);

		// Bulk-fetch nodes in a single query
		if (top.length === 0) {
			return [];
		}

		const placeholders = top.map(() => '?').join(', ');
		const nodeRows = db
			.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`)
			.all(...top.map(r => r.nodeId)) as NodeRow[];

		const nodeMap = new Map<string, IMemoryNode>(
			nodeRows.map(row => [row.id, rowToNode(row)])
		);

		const results: IMemorySearchResult[] = [];
		for (const { nodeId, composite, source } of top) {
			const node = nodeMap.get(nodeId);
			if (node) {
				results.push({ node, score: composite, matchSource: source });
			}
		}

		return results;
	}

	// -------------------------------------------------------------------------
	// Vector embedding storage (used by callers that compute embeddings)
	// -------------------------------------------------------------------------

	/**
	 * Store or replace the embedding for a node in the vec_nodes table.
	 * No-op when sqlite-vec is not available.
	 *
	 * @param nodeId    ID of the node to associate the embedding with
	 * @param embedding Float32Array of EMBEDDING_DIMENSIONS values
	 */
	async storeEmbedding(nodeId: string, embedding: Float32Array): Promise<void> {
		if (!this.vecAvailable) {
			return;
		}
		const db = this.requireDb();
		// sqlite-vec stores vectors as binary blobs
		const blob = Buffer.from(embedding.buffer);
		db.prepare(
			'INSERT OR REPLACE INTO vec_nodes (node_id, embedding) VALUES (?, ?)'
		).run(nodeId, blob);
	}

	// -------------------------------------------------------------------------
	// Stats
	// -------------------------------------------------------------------------

	/**
	 * Return aggregate statistics about the store.
	 */
	async getStats(): Promise<IMemoryStats> {
		const db = this.requireDb();

		const nodeRow = db
			.prepare('SELECT COUNT(*) AS n FROM nodes')
			.get() as { n: number };
		const edgeRow = db
			.prepare('SELECT COUNT(*) AS n FROM edges')
			.get() as { n: number };

		// "totalGraphs" is not directly applicable to SQLite (there's one logical
		// graph per database); report 1 when there are nodes, 0 otherwise.
		const totalGraphs = nodeRow.n > 0 ? 1 : 0;

		const lastRow = db
			.prepare('SELECT MAX(updated_at) AS t FROM nodes')
			.get() as { t: number | null };

		return {
			totalNodes: nodeRow.n,
			totalEdges: edgeRow.n,
			totalGraphs,
			backendType: MemoryBackend.SQLite,
			lastIndexedAt: lastRow.t ?? 0,
		};
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/** Throw if the database is not initialised. */
	private requireDb(): Database.Database {
		if (!this.db) {
			throw new Error('SqliteMemoryStore: call initialize() before using the store');
		}
		return this.db;
	}

	/**
	 * Attempt to load the sqlite-vec native extension.
	 * Returns true on success, false if the extension is not installed.
	 * In either case, the store remains fully functional — only vector
	 * search is disabled when the extension is absent.
	 */
	private tryLoadSqliteVec(): boolean {
		const db = this.requireDb();
		try {
			// sqlite-vec ships a loadable extension; the path varies by platform.
			// When installed via npm (node-sqlite-vec), it exposes a getLoadablePath().
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const sqliteVec = require('sqlite-vec') as { getLoadablePath?: () => string };
			if (typeof sqliteVec.getLoadablePath === 'function') {
				db.loadExtension(sqliteVec.getLoadablePath());
			}
			// Create the virtual table if it does not already exist
			db.prepare(buildVecTableDDL(EMBEDDING_DIMENSIONS)).run();
			return true;
		} catch {
			// sqlite-vec not installed or failed to load — vector search disabled
			return false;
		}
	}

	/**
	 * Full-text keyword search using FTS5.
	 *
	 * bm25() is negative in SQLite FTS5 (more negative = better match),
	 * so we negate it to get a positive score.
	 */
	private keywordSearch(
		db: Database.Database,
		query: string,
		filterKinds: MemoryNodeKind[] | undefined,
	): Array<{ nodeId: string; score: number }> {
		try {
			// FTS5 MATCH requires the query to be properly quoted when it
			// contains special characters. We do a simple prefix-quote wrap.
			const ftsQuery = sanitiseFtsQuery(query);

			let sql = [
				'SELECT d.node_id, -bm25(documents) AS score',
				'FROM documents d',
				'JOIN nodes n ON n.id = d.node_id',
				'WHERE documents MATCH ?',
			].join(' ');

			const params: unknown[] = [ftsQuery];

			if (filterKinds && filterKinds.length > 0) {
				const ph = filterKinds.map(() => '?').join(', ');
				sql += ` AND n.kind IN (${ph})`;
				params.push(...filterKinds);
			}

			sql += ' ORDER BY score DESC LIMIT 50';

			const rows = db.prepare(sql).all(...params) as Array<{ node_id: string; score: number }>;
			return rows.map(r => ({ nodeId: r.node_id, score: r.score }));
		} catch {
			// FTS query parse error — return empty rather than crashing
			return [];
		}
	}

	/**
	 * Vector KNN search using sqlite-vec.
	 * Returns an empty array when sqlite-vec is not available or there
	 * are no stored embeddings matching the filter.
	 *
	 * In a real implementation the caller would pass a pre-computed query
	 * embedding. Here we return empty results because we do not have an
	 * embedding model inside the store itself — the caller must call
	 * storeEmbedding() and manage embeddings externally.
	 */
	private vectorSearch(
		_db: Database.Database,
		_query: string,
		_filterKinds: MemoryNodeKind[] | undefined,
	): Array<{ nodeId: string; score: number }> {
		// TODO: Accept a Float32Array queryEmbedding parameter and run:
		//   SELECT v.node_id, vec_distance_cosine(v.embedding, ?) AS dist
		//   FROM vec_nodes v
		//   JOIN nodes n ON n.id = v.node_id
		//   WHERE n.kind IN (...)
		//   ORDER BY dist ASC LIMIT 50
		// Then convert dist to a score: score = 1 - dist (for cosine distance).
		return [];
	}

	/**
	 * Graph traversal via recursive CTE.
	 *
	 * Starting from anchor node IDs (found by keyword/vector search), walks
	 * the edges table up to MAX_GRAPH_DEPTH hops.  Each hop attenuates the
	 * score by the edge weight, rewarding shorter, stronger paths.
	 */
	private graphTraversal(
		db: Database.Database,
		anchorIds: string[],
		filterKinds: MemoryNodeKind[] | undefined,
	): Array<{ nodeId: string; score: number }> {
		if (anchorIds.length === 0) {
			return [];
		}

		const anchorPlaceholders = anchorIds.map(() => '?').join(', ');

		// Recursive CTE: walk outbound edges from the anchor set.
		// accumulated_weight decays with each hop to rank closer nodes higher.
		let sql = [
			'WITH RECURSIVE traversal(node_id, depth, accumulated_weight) AS (',
			// Base case: the anchor nodes themselves (weight = 1.0, depth = 0)
			`  SELECT id, 0, 1.0 FROM nodes WHERE id IN (${anchorPlaceholders})`,
			'  UNION ALL',
			// Recursive case: follow outbound edges
			'  SELECT e.target_id, t.depth + 1, t.accumulated_weight * e.weight',
			'  FROM edges e',
			'  JOIN traversal t ON t.node_id = e.source_id',
			`  WHERE t.depth < ${MAX_GRAPH_DEPTH}`,
			')',
			// Select the best (highest) accumulated weight per node
			'SELECT t.node_id, MAX(t.accumulated_weight) AS score',
			'FROM traversal t',
			'JOIN nodes n ON n.id = t.node_id',
		].join('\n');

		const params: unknown[] = [...anchorIds];

		if (filterKinds && filterKinds.length > 0) {
			const ph = filterKinds.map(() => '?').join(', ');
			sql += `\nWHERE n.kind IN (${ph})`;
			params.push(...filterKinds);
		}

		sql += '\nGROUP BY t.node_id ORDER BY score DESC LIMIT 50';

		const rows = db.prepare(sql).all(...params) as Array<{ node_id: string; score: number }>;
		return rows.map(r => ({ nodeId: r.node_id, score: r.score }));
	}
}

// ---------------------------------------------------------------------------
// FTS5 query sanitiser
// ---------------------------------------------------------------------------

/**
 * Sanitise a free-text query for use as an FTS5 MATCH argument.
 *
 * FTS5 MATCH syntax is strict: unbalanced quotes, leading operators, and
 * certain special characters cause parse errors.  We strip known problem
 * characters and wrap individual tokens with quotes so the query is always
 * valid, trading some precision for robustness.
 */
function sanitiseFtsQuery(query: string): string {
	// Remove characters with special FTS5 meaning other than word characters,
	// spaces, and hyphens (hyphens are safe inside quoted tokens).
	const cleaned = query.replace(/["'`*^:(){}[\]|&]/g, ' ').trim();

	if (cleaned.length === 0) {
		return '""';
	}

	// Split on whitespace, wrap each token in double-quotes, join with AND
	const tokens = cleaned
		.split(/\s+/)
		.filter(t => t.length > 0)
		.map(t => `"${t}"`);

	return tokens.join(' AND ');
}
