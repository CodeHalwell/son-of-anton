/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the Hybrid Memory system.
 *
 * Memory retrieval pipeline:
 *   1. Vector store (semantic similarity) → anchor nodes
 *   2. Knowledge graph (structural traversal) → causal context
 *   3. Keyword index (exact match) → precise symbols
 *   4. Context synthesiser → ranked, deduplicated context → LLM prompt
 *
 * Local-first default: SQLite FTS5 + sqlite-vec + graph tables.
 * Docker upgrade: FalkorDB + Qdrant for heavier workloads.
 */

export const enum MemoryBackend {
	/** SQLite-based local memory (FTS5 + sqlite-vec + graph tables). */
	SQLite = 'sqlite',
	/** Docker-based memory (FalkorDB + Qdrant). */
	Docker = 'docker',
	/** Hybrid — uses SQLite locally, syncs to Docker when available. */
	Hybrid = 'hybrid'
}

export const enum MemoryNodeKind {
	File = 'file',
	Function = 'function',
	Class = 'class',
	Module = 'module',
	Symbol = 'symbol',
	Concept = 'concept',
	Decision = 'decision',
	Error = 'error',
	Pattern = 'pattern'
}

export const enum MemoryEdgeKind {
	Imports = 'imports',
	Calls = 'calls',
	Extends = 'extends',
	Implements = 'implements',
	DependsOn = 'dependsOn',
	Contains = 'contains',
	References = 'references',
	RelatedTo = 'relatedTo',
	CausedBy = 'causedBy'
}

export interface IMemoryNode {
	readonly id: string;
	readonly kind: MemoryNodeKind;
	readonly label: string;
	readonly filePath: string | undefined;
	readonly content: string;
	readonly embedding: Float32Array | undefined;
	readonly metadata: Record<string, string>;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface IMemoryEdge {
	readonly id: string;
	readonly kind: MemoryEdgeKind;
	readonly sourceId: string;
	readonly targetId: string;
	readonly weight: number;
	readonly metadata: Record<string, string>;
}

export interface IMemorySearchResult {
	readonly node: IMemoryNode;
	readonly score: number;
	readonly matchSource: 'vector' | 'keyword' | 'graph';
}

export interface IMemoryQueryOptions {
	readonly query: string;
	readonly maxResults: number;
	readonly minScore: number;
	readonly includeVector: boolean;
	readonly includeKeyword: boolean;
	readonly includeGraph: boolean;
	readonly filterKinds: MemoryNodeKind[] | undefined;
}

export interface IMemoryStats {
	readonly totalNodes: number;
	readonly totalEdges: number;
	readonly totalGraphs: number;
	readonly backendType: MemoryBackend;
	readonly lastIndexedAt: number;
}
