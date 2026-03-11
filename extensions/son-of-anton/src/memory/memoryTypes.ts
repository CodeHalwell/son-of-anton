/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local mirror of the canonical memory types defined in
 * src/vs/sessions/contrib/memory/common/memoryTypes.ts
 *
 * The extension cannot import directly from the VS Code source tree at compile
 * time (it is outside the extension's tsconfig rootDir). These definitions must
 * be kept in sync — update src/vs/sessions/contrib/memory/common/memoryTypes.ts
 * and mirror any breaking changes here.
 */

export const enum MemoryBackend {
	SQLite = 'sqlite',
	Docker = 'docker',
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
