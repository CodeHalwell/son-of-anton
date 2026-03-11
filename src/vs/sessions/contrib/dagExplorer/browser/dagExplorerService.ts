/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IDagNode,
	IDagEdge,
	IDagGraph,
	IDagImpactResult,
	DagNodeKind,
	DagNodeStatus,
	DagEdgeKind,
	DagLayer,
} from '../common/dagTypes.js';

// --- Service Interface --------------------------------------------------------

export const IDagExplorerService = createDecorator<IDagExplorerService>('soaDagExplorerService');

export interface IDagExplorerService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGraph: Event<void>;
	readonly onDidChangeNodeStatus: Event<IDagNode>;

	// Graph state
	readonly graph: IDagGraph;

	// Node CRUD
	addNode(kind: DagNodeKind, label: string, layer: DagLayer, filePath?: string, metadata?: Record<string, string>): IDagNode;
	getNode(nodeId: string): IDagNode | undefined;
	removeNode(nodeId: string): void;
	updateNodeStatus(nodeId: string, status: DagNodeStatus): void;

	// Edge CRUD
	addEdge(kind: DagEdgeKind, sourceId: string, targetId: string, weight?: number): IDagEdge;
	getEdgesFrom(nodeId: string): IDagEdge[];
	getEdgesTo(nodeId: string): IDagEdge[];
	removeEdge(edgeId: string): void;

	// Layer filtering
	getNodesAtLayer(layer: DagLayer): IDagNode[];

	// Impact analysis
	computeImpact(seedNodeId: string, maxDepth?: number): IDagImpactResult;
	highlightImpact(seedNodeId: string, maxDepth?: number): void;
	clearImpactHighlight(): void;

	// Bulk operations
	setGraph(graph: IDagGraph): void;
	clear(): void;
}

// --- Implementation -----------------------------------------------------------

export class DagExplorerService extends Disposable implements IDagExplorerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGraph = this._register(new Emitter<void>());
	readonly onDidChangeGraph: Event<void> = this._onDidChangeGraph.event;

	private readonly _onDidChangeNodeStatus = this._register(new Emitter<IDagNode>());
	readonly onDidChangeNodeStatus: Event<IDagNode> = this._onDidChangeNodeStatus.event;

	private readonly _nodes = new Map<string, IDagNode>();
	private readonly _edges = new Map<string, IDagEdge>();
	private _nodeCounter = 0;
	private _edgeCounter = 0;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	get graph(): IDagGraph {
		return {
			nodes: Array.from(this._nodes.values()),
			edges: Array.from(this._edges.values()),
		};
	}

	// -- Node CRUD --------------------------------------------------------------

	addNode(kind: DagNodeKind, label: string, layer: DagLayer, filePath?: string, metadata?: Record<string, string>): IDagNode {
		const node: IDagNode = {
			id: `dag-node-${++this._nodeCounter}`,
			kind,
			label,
			filePath: filePath ?? undefined,
			layer,
			status: DagNodeStatus.Idle,
			metadata: metadata ?? {},
			x: 0,
			y: 0,
		};

		this._nodes.set(node.id, node);
		this._onDidChangeGraph.fire();
		this.logService.debug(`[DagExplorer] Added node ${node.id}: ${label}`);
		return node;
	}

	getNode(nodeId: string): IDagNode | undefined {
		return this._nodes.get(nodeId);
	}

	removeNode(nodeId: string): void {
		if (!this._nodes.delete(nodeId)) {
			return;
		}

		// Remove connected edges
		for (const [edgeId, edge] of this._edges) {
			if (edge.sourceId === nodeId || edge.targetId === nodeId) {
				this._edges.delete(edgeId);
			}
		}

		this._onDidChangeGraph.fire();
	}

	updateNodeStatus(nodeId: string, status: DagNodeStatus): void {
		const node = this._nodes.get(nodeId);
		if (!node) {
			return;
		}

		if (node.status === status) {
			return;
		}

		node.status = status;
		this._onDidChangeNodeStatus.fire(node);
		this._onDidChangeGraph.fire();
	}

	// -- Edge CRUD --------------------------------------------------------------

	addEdge(kind: DagEdgeKind, sourceId: string, targetId: string, weight?: number): IDagEdge {
		const edge: IDagEdge = {
			id: `dag-edge-${++this._edgeCounter}`,
			kind,
			sourceId,
			targetId,
			weight: weight ?? 1.0,
		};

		this._edges.set(edge.id, edge);
		this._onDidChangeGraph.fire();
		return edge;
	}

	getEdgesFrom(nodeId: string): IDagEdge[] {
		const result: IDagEdge[] = [];
		for (const edge of this._edges.values()) {
			if (edge.sourceId === nodeId) {
				result.push(edge);
			}
		}
		return result;
	}

	getEdgesTo(nodeId: string): IDagEdge[] {
		const result: IDagEdge[] = [];
		for (const edge of this._edges.values()) {
			if (edge.targetId === nodeId) {
				result.push(edge);
			}
		}
		return result;
	}

	removeEdge(edgeId: string): void {
		if (this._edges.delete(edgeId)) {
			this._onDidChangeGraph.fire();
		}
	}

	// -- Layer filtering --------------------------------------------------------

	getNodesAtLayer(layer: DagLayer): IDagNode[] {
		const result: IDagNode[] = [];
		for (const node of this._nodes.values()) {
			if (node.layer === layer) {
				result.push(node);
			}
		}
		return result;
	}

	// -- Impact analysis --------------------------------------------------------

	/**
	 * BFS impact analysis from a seed node. Returns all nodes reachable
	 * within `maxDepth` hops following edge directions (forward propagation).
	 */
	computeImpact(seedNodeId: string, maxDepth: number = 3): IDagImpactResult {
		const visited = new Set<string>();
		const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: seedNodeId, depth: 0 }];
		const impacted: string[] = [];
		let actualMaxDepth = 0;

		// Build adjacency list for forward edges
		const adjacency = new Map<string, string[]>();
		for (const edge of this._edges.values()) {
			const existing = adjacency.get(edge.sourceId) ?? [];
			existing.push(edge.targetId);
			adjacency.set(edge.sourceId, existing);
		}

		while (queue.length > 0) {
			const current = queue.shift()!;

			if (visited.has(current.nodeId)) {
				continue;
			}
			visited.add(current.nodeId);

			if (current.nodeId !== seedNodeId) {
				impacted.push(current.nodeId);
			}

			actualMaxDepth = Math.max(actualMaxDepth, current.depth);

			if (current.depth < maxDepth) {
				const neighbours = adjacency.get(current.nodeId) ?? [];
				for (const neighbour of neighbours) {
					if (!visited.has(neighbour)) {
						queue.push({ nodeId: neighbour, depth: current.depth + 1 });
					}
				}
			}
		}

		return {
			seedNodeId,
			impactedNodeIds: impacted,
			maxDepth: actualMaxDepth,
		};
	}

	/**
	 * Highlight all nodes within impact radius of a seed node.
	 */
	highlightImpact(seedNodeId: string, maxDepth: number = 3): void {
		this.clearImpactHighlight();

		const result = this.computeImpact(seedNodeId, maxDepth);
		for (const nodeId of result.impactedNodeIds) {
			const node = this._nodes.get(nodeId);
			if (node && node.status === DagNodeStatus.Idle) {
				node.status = DagNodeStatus.Impacted;
				this._onDidChangeNodeStatus.fire(node);
			}
		}

		this._onDidChangeGraph.fire();
	}

	/**
	 * Clear all impact highlighting, resetting impacted nodes to idle.
	 */
	clearImpactHighlight(): void {
		for (const node of this._nodes.values()) {
			if (node.status === DagNodeStatus.Impacted) {
				node.status = DagNodeStatus.Idle;
				this._onDidChangeNodeStatus.fire(node);
			}
		}
		this._onDidChangeGraph.fire();
	}

	// -- Bulk operations --------------------------------------------------------

	setGraph(graph: IDagGraph): void {
		this._nodes.clear();
		this._edges.clear();

		for (const node of graph.nodes) {
			this._nodes.set(node.id, node);
		}
		for (const edge of graph.edges) {
			this._edges.set(edge.id, edge);
		}

		this._onDidChangeGraph.fire();
		this.logService.info(`[DagExplorer] Graph loaded: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
	}

	clear(): void {
		this._nodes.clear();
		this._edges.clear();
		this._onDidChangeGraph.fire();
	}
}
