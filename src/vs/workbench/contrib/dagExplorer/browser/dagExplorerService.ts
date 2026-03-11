/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DagLayerKind, DagNodeStatus, IDagEdge, IDagGraph, IDagImpactResult, IDagNode, IDagViewState } from '../common/dagTypes.js';

// --- Service Interface --------------------------------------------------------

export const IDagExplorerService = createDecorator<IDagExplorerService>('soaDagExplorerService');

export interface IDagExplorerService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGraph: Event<DagLayerKind>;
	readonly onDidChangeSelection: Event<string | undefined>;

	// Graph management
	setGraph(layer: DagLayerKind, nodes: IDagNode[], edges: IDagEdge[]): void;
	getGraph(layer: DagLayerKind): IDagGraph | undefined;
	clearGraph(layer: DagLayerKind): void;

	// Node operations
	getNode(nodeId: string): IDagNode | undefined;
	updateNodeStatus(nodeId: string, status: DagNodeStatus): void;
	selectNode(nodeId: string | undefined): void;
	getSelectedNode(): IDagNode | undefined;

	// Impact analysis
	computeImpact(nodeId: string): IDagImpactResult;
	getDependents(nodeId: string): IDagNode[];
	getDependencies(nodeId: string): IDagNode[];

	// View state
	getViewState(): IDagViewState;
	setViewState(state: Partial<IDagViewState>): void;
}

// --- Implementation -----------------------------------------------------------

export class DagExplorerService extends Disposable implements IDagExplorerService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGraph = this._register(new Emitter<DagLayerKind>());
	readonly onDidChangeGraph = this._onDidChangeGraph.event;

	private readonly _onDidChangeSelection = this._register(new Emitter<string | undefined>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	/** Graphs keyed by layer kind. */
	private readonly _graphs = new Map<DagLayerKind, IDagGraph>();

	/** Fast lookup from node id to node, spanning all layers. */
	private readonly _nodeIndex = new Map<string, IDagNode>();

	/** Forward adjacency list: source id -> target ids. */
	private readonly _forwardAdj = new Map<string, Set<string>>();

	/** Reverse adjacency list: target id -> source ids (dependents). */
	private readonly _reverseAdj = new Map<string, Set<string>>();

	/** Edge index: edge id -> edge, spanning all layers. */
	private readonly _edgeIndex = new Map<string, IDagEdge>();

	/** Currently selected node id. */
	private _selectedNodeId: string | undefined;

	/** Current view state. */
	private _viewState: IDagViewState = {
		zoom: 1,
		panX: 0,
		panY: 0,
		selectedNodeId: undefined,
		activeLayer: DagLayerKind.Dependency,
		showImpactOverlay: false,
	};

	// --- Graph management -----------------------------------------------------

	setGraph(layer: DagLayerKind, nodes: IDagNode[], edges: IDagEdge[]): void {
		// Remove any previous graph for this layer from indices.
		this._removeLayerFromIndices(layer);

		const graph: IDagGraph = { nodes: [...nodes], edges: [...edges], layerKind: layer };
		this._graphs.set(layer, graph);

		// Rebuild indices for the new graph.
		for (const node of nodes) {
			this._nodeIndex.set(node.id, node);
		}
		for (const edge of edges) {
			this._edgeIndex.set(edge.id, edge);
			this._addToAdjacency(edge.source, edge.target);
		}

		this._onDidChangeGraph.fire(layer);
	}

	getGraph(layer: DagLayerKind): IDagGraph | undefined {
		return this._graphs.get(layer);
	}

	clearGraph(layer: DagLayerKind): void {
		this._removeLayerFromIndices(layer);
		this._graphs.delete(layer);
		this._onDidChangeGraph.fire(layer);
	}

	// --- Node operations ------------------------------------------------------

	getNode(nodeId: string): IDagNode | undefined {
		return this._nodeIndex.get(nodeId);
	}

	updateNodeStatus(nodeId: string, status: DagNodeStatus): void {
		const node = this._nodeIndex.get(nodeId);
		if (!node) {
			return;
		}
		node.status = status;
		this._onDidChangeGraph.fire(node.kind);
	}

	selectNode(nodeId: string | undefined): void {
		if (this._selectedNodeId === nodeId) {
			return;
		}
		this._selectedNodeId = nodeId;
		this._viewState = { ...this._viewState, selectedNodeId: nodeId };
		this._onDidChangeSelection.fire(nodeId);
	}

	getSelectedNode(): IDagNode | undefined {
		if (this._selectedNodeId === undefined) {
			return undefined;
		}
		return this._nodeIndex.get(this._selectedNodeId);
	}

	// --- Impact analysis ------------------------------------------------------

	/**
	 * Compute the impact radius for a given node using BFS over reverse edges.
	 * Returns all transitively dependent nodes and the edges that connect them.
	 */
	computeImpact(nodeId: string): IDagImpactResult {
		const visited = new Set<string>();
		const impactedEdgeIds: string[] = [];
		const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
		let maxDepth = 0;

		visited.add(nodeId);

		while (queue.length > 0) {
			const current = queue.shift()!;
			const dependents = this._reverseAdj.get(current.id);
			if (!dependents) {
				continue;
			}

			for (const depId of dependents) {
				if (visited.has(depId)) {
					continue;
				}
				visited.add(depId);
				const nextDepth = current.depth + 1;
				if (nextDepth > maxDepth) {
					maxDepth = nextDepth;
				}
				queue.push({ id: depId, depth: nextDepth });

				// Collect the edge(s) connecting current -> dep (stored as dep -> current in forward adj).
				for (const edge of this._edgeIndex.values()) {
					if (edge.source === depId && edge.target === current.id) {
						impactedEdgeIds.push(edge.id);
					}
				}
			}
		}

		// The source node itself is not included in the impacted set.
		visited.delete(nodeId);

		return {
			sourceNodeId: nodeId,
			impactedNodeIds: [...visited],
			impactedEdgeIds,
			depth: maxDepth,
		};
	}

	/**
	 * Get all nodes that directly depend on the given node (reverse edges: target -> sources).
	 */
	getDependents(nodeId: string): IDagNode[] {
		const dependentIds = this._reverseAdj.get(nodeId);
		if (!dependentIds) {
			return [];
		}
		const result: IDagNode[] = [];
		for (const id of dependentIds) {
			const node = this._nodeIndex.get(id);
			if (node) {
				result.push(node);
			}
		}
		return result;
	}

	/**
	 * Get all nodes that the given node depends on (forward edges: source -> targets).
	 */
	getDependencies(nodeId: string): IDagNode[] {
		const dependencyIds = this._forwardAdj.get(nodeId);
		if (!dependencyIds) {
			return [];
		}
		const result: IDagNode[] = [];
		for (const id of dependencyIds) {
			const node = this._nodeIndex.get(id);
			if (node) {
				result.push(node);
			}
		}
		return result;
	}

	// --- View state -----------------------------------------------------------

	getViewState(): IDagViewState {
		return this._viewState;
	}

	setViewState(state: Partial<IDagViewState>): void {
		this._viewState = { ...this._viewState, ...state };
	}

	// --- Private helpers ------------------------------------------------------

	private _addToAdjacency(source: string, target: string): void {
		let forward = this._forwardAdj.get(source);
		if (!forward) {
			forward = new Set();
			this._forwardAdj.set(source, forward);
		}
		forward.add(target);

		let reverse = this._reverseAdj.get(target);
		if (!reverse) {
			reverse = new Set();
			this._reverseAdj.set(target, reverse);
		}
		reverse.add(source);
	}

	private _removeFromAdjacency(source: string, target: string): void {
		const forward = this._forwardAdj.get(source);
		if (forward) {
			forward.delete(target);
			if (forward.size === 0) {
				this._forwardAdj.delete(source);
			}
		}

		const reverse = this._reverseAdj.get(target);
		if (reverse) {
			reverse.delete(source);
			if (reverse.size === 0) {
				this._reverseAdj.delete(target);
			}
		}
	}

	/**
	 * Remove all nodes and edges belonging to the given layer from the shared indices.
	 */
	private _removeLayerFromIndices(layer: DagLayerKind): void {
		const existing = this._graphs.get(layer);
		if (!existing) {
			return;
		}

		for (const edge of existing.edges) {
			this._edgeIndex.delete(edge.id);
			this._removeFromAdjacency(edge.source, edge.target);
		}
		for (const node of existing.nodes) {
			this._nodeIndex.delete(node.id);
			if (this._selectedNodeId === node.id) {
				this._selectedNodeId = undefined;
			}
		}
	}
}
