/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SQLite schema definition and migration manager for the hybrid memory store.
 *
 * Tables:
 *   nodes          — Knowledge graph nodes (files, functions, concepts, decisions, etc.)
 *   edges          — Directed relationships between nodes
 *   documents      — FTS5 virtual table for full-text keyword search
 *   schema_version — Tracks applied migrations
 *
 * The sqlite-vec virtual table for vector search is created conditionally at
 * runtime depending on whether the native extension is loadable.
 *
 * NOTE: This file uses better-sqlite3. Add it to package.json dependencies:
 *   "better-sqlite3": "^9.4.3"
 *   "@types/better-sqlite3": "^7.6.8" (devDependencies)
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// DDL strings — all hardcoded constants, never derived from user input
// ---------------------------------------------------------------------------

const DDL_SCHEMA_VERSION = [
	'CREATE TABLE IF NOT EXISTS schema_version (',
	'	version    INTEGER NOT NULL,',
	'	applied_at INTEGER NOT NULL',
	')',
].join('\n');

const DDL_NODES = [
	'CREATE TABLE IF NOT EXISTS nodes (',
	'	id         TEXT    PRIMARY KEY,',
	'	kind       TEXT    NOT NULL,',
	'	label      TEXT    NOT NULL,',
	'	content    TEXT    NOT NULL,',
	'	file_path  TEXT,',
	"	metadata   TEXT    NOT NULL DEFAULT '{}',",
	'	created_at INTEGER NOT NULL,',
	'	updated_at INTEGER NOT NULL',
	')',
].join('\n');

const DDL_NODES_KIND_IDX =
	'CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes (kind)';

const DDL_NODES_FILE_IDX = [
	'CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes (file_path)',
	'WHERE file_path IS NOT NULL',
].join('\n');

const DDL_EDGES = [
	'CREATE TABLE IF NOT EXISTS edges (',
	'	id        TEXT PRIMARY KEY,',
	'	kind      TEXT NOT NULL,',
	'	source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,',
	'	target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,',
	'	weight    REAL NOT NULL DEFAULT 1.0,',
	"	metadata  TEXT NOT NULL DEFAULT '{}'",
	')',
].join('\n');

const DDL_EDGES_SOURCE_IDX =
	'CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_id)';

const DDL_EDGES_TARGET_IDX =
	'CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_id)';

/**
 * FTS5 virtual table for keyword search.
 * content= keeps the FTS index in sync with the nodes table.
 * content_rowid= maps FTS rowids back to the nodes primary-key rowid.
 * Triggers below keep the index current on INSERT / UPDATE / DELETE.
 */
const DDL_FTS = [
	'CREATE VIRTUAL TABLE IF NOT EXISTS documents USING fts5(',
	'	node_id,',
	'	label,',
	'	content,',
	"	content='nodes',",
	"	content_rowid='rowid'",
	')',
].join('\n');

const DDL_FTS_INSERT_TRIGGER = [
	'CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN',
	'	INSERT INTO documents (rowid, node_id, label, content)',
	'	VALUES (new.rowid, new.id, new.label, new.content);',
	'END',
].join('\n');

const DDL_FTS_UPDATE_BEFORE_TRIGGER = [
	'CREATE TRIGGER IF NOT EXISTS nodes_bu BEFORE UPDATE ON nodes BEGIN',
	"	INSERT INTO documents (documents, rowid, node_id, label, content)",
	"	VALUES ('delete', old.rowid, old.id, old.label, old.content);",
	'END',
].join('\n');

const DDL_FTS_UPDATE_AFTER_TRIGGER = [
	'CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN',
	'	INSERT INTO documents (rowid, node_id, label, content)',
	'	VALUES (new.rowid, new.id, new.label, new.content);',
	'END',
].join('\n');

const DDL_FTS_DELETE_TRIGGER = [
	'CREATE TRIGGER IF NOT EXISTS nodes_bd BEFORE DELETE ON nodes BEGIN',
	"	INSERT INTO documents (documents, rowid, node_id, label, content)",
	"	VALUES ('delete', old.rowid, old.id, old.label, old.content);",
	'END',
].join('\n');

// ---------------------------------------------------------------------------
// Vector search DDL (created conditionally when sqlite-vec is available)
// ---------------------------------------------------------------------------

/**
 * Build the DDL for the sqlite-vec virtual table.
 * Called only when the sqlite-vec extension has been successfully loaded.
 *
 * @param dimensions Number of dimensions in the embedding vectors.
 */
export function buildVecTableDDL(dimensions: number): string {
	return [
		'CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(',
		'	node_id   TEXT,',
		`	embedding float[${dimensions}]`,
		')',
	].join('\n');
}

// ---------------------------------------------------------------------------
// Migration types
// ---------------------------------------------------------------------------

interface Migration {
	/** Sequential version number. */
	readonly version: number;
	/** Human-readable description. */
	readonly description: string;
	/**
	 * Function that receives the db and applies this migration.
	 * Wrapped in a transaction by applyMigrations().
	 */
	readonly apply: (db: Database.Database) => void;
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * Ordered list of schema migrations.
 * Append new migrations here; never modify existing entries.
 */
export const MIGRATIONS: readonly Migration[] = [
	{
		version: 1,
		description: 'Initial schema: nodes, edges, FTS5 documents table',
		apply(db: Database.Database): void {
			runDdl(db, DDL_SCHEMA_VERSION);
			runDdl(db, DDL_NODES);
			runDdl(db, DDL_NODES_KIND_IDX);
			runDdl(db, DDL_NODES_FILE_IDX);
			runDdl(db, DDL_EDGES);
			runDdl(db, DDL_EDGES_SOURCE_IDX);
			runDdl(db, DDL_EDGES_TARGET_IDX);
			runDdl(db, DDL_FTS);
			runDdl(db, DDL_FTS_INSERT_TRIGGER);
			runDdl(db, DDL_FTS_UPDATE_BEFORE_TRIGGER);
			runDdl(db, DDL_FTS_UPDATE_AFTER_TRIGGER);
			runDdl(db, DDL_FTS_DELETE_TRIGGER);
		},
	},
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Execute a single DDL statement via a prepared statement.
 * All DDL strings in this module are hardcoded constants — not user input.
 */
function runDdl(db: Database.Database, ddl: string): void {
	db.prepare(ddl).run();
}

// ---------------------------------------------------------------------------
// Public migration API
// ---------------------------------------------------------------------------

/**
 * Apply any unapplied migrations to the given database connection.
 * Each migration is wrapped in a transaction; if any statement fails the
 * transaction is rolled back and the error is re-thrown.
 *
 * @param db Open better-sqlite3 database instance.
 */
export function applyMigrations(db: Database.Database): void {
	// Bootstrap: ensure version table exists before querying it.
	runDdl(db, DDL_SCHEMA_VERSION);

	const versionRow = db
		.prepare('SELECT MAX(version) AS v FROM schema_version')
		.get() as { v: number | null };
	const currentVersion = versionRow.v ?? 0;

	const pending = MIGRATIONS.filter(m => m.version > currentVersion);

	for (const migration of pending) {
		const applyOne = db.transaction(() => {
			migration.apply(db);
			db.prepare(
				'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
			).run(migration.version, Date.now());
		});
		applyOne();
	}
}

/**
 * Return the current schema version recorded in the database.
 * Returns 0 if the schema_version table does not yet exist.
 *
 * @param db Open better-sqlite3 database instance.
 */
export function getSchemaVersion(db: Database.Database): number {
	try {
		const row = db
			.prepare('SELECT MAX(version) AS v FROM schema_version')
			.get() as { v: number | null };
		return row.v ?? 0;
	} catch {
		return 0;
	}
}
