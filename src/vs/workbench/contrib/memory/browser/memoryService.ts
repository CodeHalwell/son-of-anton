/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	IMemoryNode,
	IMemoryEdge,
	IMemorySearchResult,
	IMemoryQueryOptions,
	IMemoryStats,
	MemoryBackend,
	MemoryNodeKind,
	MemoryEdgeKind
} from '../common/memoryTypes.js';

// --- Service Interface --------------------------------------------------------

export const IMemoryService = createDecorator<IMemoryService>('soaMemoryService');

export interface IMemoryService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeMemory: Event<void>;
	readonly backend: MemoryBackend;

	// Node operations
	addNode(kind: MemoryNodeKind, label: string, content: string, filePath?: string, metadata?: Record<string, string>): IMemoryNode;
	getNode(nodeId: string): IMemoryNode | undefined;
	updateNode(nodeId: string, updates: Partial<Pick<IMemoryNode, 'content' | 'metadata'>>): void;
	deleteNode(nodeId: string): void;

	// Edge operations
	addEdge(kind: MemoryEdgeKind, sourceId: string, targetId: string, weight?: number, metadata?: Record<string, string>): IMemoryEdge;
	getEdgesFrom(nodeId: string): IMemoryEdge[];
	getEdgesTo(nodeId: string): IMemoryEdge[];
	deleteEdge(edgeId: string): void;

	// Search
	search(options: IMemoryQueryOptions): IMemorySearchResult[];

	// Stats
	getStats(): IMemoryStats;

	// Lifecycle
	initialize(): Promise<void>;
	dispose(): void;
}

// --- Implementation -----------------------------------------------------------

export class MemoryService extends Disposable implements IMemoryService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeMemory = this._store.add(new Emitter<void>());
	readonly onDidChangeMemory = this._onDidChangeMemory.event;

	readonly backend = MemoryBackend.SQLite;

	private readonly _nodes = new Map<string, IMemoryNode>();
	private readonly _edges = new Map<string, IMemoryEdge>();
	private _nodeCounter = 0;
	private _edgeCounter = 0;
	private _lastIndexedAt = 0;

	// -- Node operations -------------------------------------------------------

	addNode(kind: MemoryNodeKind, label: string, content: string, filePath?: string, metadata?: Record<string, string>): IMemoryNode {
		const now = Date.now();
		const node: IMemoryNode = {
			id: `mem-node-${++this._nodeCounter}`,
			kind,
			label,
			content,
			filePath: filePath ?? undefined,
			embedding: undefined, // TODO: compute embeddings via vector backend
			metadata: metadata ?? {},
			createdAt: now,
			updatedAt: now,
		};

		this._nodes.set(node.id, node);
		this._lastIndexedAt = now;
		this._onDidChangeMemory.fire();
		return node;
	}

	getNode(nodeId: string): IMemoryNode | undefined {
		return this._nodes.get(nodeId);
	}

	updateNode(nodeId: string, updates: Partial<Pick<IMemoryNode, 'content' | 'metadata'>>): void {
		const existing = this._nodes.get(nodeId);
		if (!existing) {
			return;
		}

		const now = Date.now();
		const updated: IMemoryNode = {
			...existing,
			content: updates.content ?? existing.content,
			metadata: updates.metadata ? { ...existing.metadata, ...updates.metadata } : existing.metadata,
			updatedAt: now,
		};

		this._nodes.set(nodeId, updated);
		this._lastIndexedAt = now;
		this._onDidChangeMemory.fire();
	}

	deleteNode(nodeId: string): void {
		if (!this._nodes.delete(nodeId)) {
			return;
		}

		// Remove all edges connected to this node
		for (const [edgeId, edge] of this._edges) {
			if (edge.sourceId === nodeId || edge.targetId === nodeId) {
				this._edges.delete(edgeId);
			}
		}

		this._lastIndexedAt = Date.now();
		this._onDidChangeMemory.fire();
	}

	// -- Edge operations -------------------------------------------------------

	addEdge(kind: MemoryEdgeKind, sourceId: string, targetId: string, weight?: number, metadata?: Record<string, string>): IMemoryEdge {
		const edge: IMemoryEdge = {
			id: `mem-edge-${++this._edgeCounter}`,
			kind,
			sourceId,
			targetId,
			weight: weight ?? 1.0,
			metadata: metadata ?? {},
		};

		this._edges.set(edge.id, edge);
		this._lastIndexedAt = Date.now();
		this._onDidChangeMemory.fire();
		return edge;
	}

	getEdgesFrom(nodeId: string): IMemoryEdge[] {
		const results: IMemoryEdge[] = [];
		for (const edge of this._edges.values()) {
			if (edge.sourceId === nodeId) {
				results.push(edge);
			}
		}
		return results;
	}

	getEdgesTo(nodeId: string): IMemoryEdge[] {
		const results: IMemoryEdge[] = [];
		for (const edge of this._edges.values()) {
			if (edge.targetId === nodeId) {
				results.push(edge);
			}
		}
		return results;
	}

	deleteEdge(edgeId: string): void {
		if (this._edges.delete(edgeId)) {
			this._lastIndexedAt = Date.now();
			this._onDidChangeMemory.fire();
		}
	}

	// -- Search ----------------------------------------------------------------

	/**
	 * Search nodes using case-insensitive keyword matching on label and content.
	 *
	 * TODO: Add vector similarity search via Qdrant/sqlite-vec backend.
	 * TODO: Add graph traversal search via FalkorDB/SQLite graph tables.
	 */
	search(options: IMemoryQueryOptions): IMemorySearchResult[] {
		const queryLower = options.query.toLowerCase();
		const results: IMemorySearchResult[] = [];

		if (!options.includeKeyword) {
			// Only keyword search is implemented in the in-memory backend
			return results;
		}

		for (const node of this._nodes.values()) {
			// Apply kind filter
			if (options.filterKinds && !options.filterKinds.includes(node.kind)) {
				continue;
			}

			const labelLower = node.label.toLowerCase();
			const contentLower = node.content.toLowerCase();

			// Score based on match quality: exact label match > label contains > content contains
			let score = 0;
			if (labelLower === queryLower) {
				score = 1.0;
			} else if (labelLower.includes(queryLower)) {
				score = 0.8;
			} else if (contentLower.includes(queryLower)) {
				score = 0.5;
			}

			if (score >= options.minScore) {
				results.push({
					node,
					score,
					matchSource: 'keyword',
				});
			}
		}

		// Sort by score descending, then limit
		results.sort((a, b) => b.score - a.score);
		return results.slice(0, options.maxResults);
	}

	// -- Stats -----------------------------------------------------------------

	getStats(): IMemoryStats {
		return {
			totalNodes: this._nodes.size,
			totalEdges: this._edges.size,
			totalGraphs: 1, // Single in-memory graph
			backendType: this.backend,
			lastIndexedAt: this._lastIndexedAt,
		};
	}

	// -- Lifecycle -------------------------------------------------------------

	/**
	 * Initialise the memory backend.
	 *
	 * TODO: For SQLite backend, open or create the database file.
	 * TODO: For Docker backend, connect to FalkorDB and Qdrant containers.
	 */
	async initialize(): Promise<void> {
		// In-memory backend requires no async initialisation
	}
}
