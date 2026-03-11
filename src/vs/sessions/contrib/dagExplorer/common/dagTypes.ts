/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the DAG Explorer surface.
 *
 * The DAG Explorer visualises code as a three-layer dependency graph:
 *   Layer 0 — Modules (packages, directories)
 *   Layer 1 — Files (source files within modules)
 *   Layer 2 — Functions/Classes (symbols within files)
 *
 * Nodes can show impact analysis via BFS radius highlighting.
 */

export const enum DagNodeKind {
	Module = 'module',
	File = 'file',
	Function = 'function',
	Class = 'class',
	Interface = 'interface'
}

export const enum DagNodeStatus {
	Idle = 'idle',
	Active = 'active',
	Complete = 'complete',
	Error = 'error',
	Impacted = 'impacted'
}

export const enum DagEdgeKind {
	Imports = 'imports',
	Calls = 'calls',
	Extends = 'extends',
	Implements = 'implements',
	Contains = 'contains',
	DependsOn = 'dependsOn'
}

export const enum DagLayer {
	Module = 0,
	File = 1,
	Symbol = 2
}

export interface IDagNode {
	readonly id: string;
	readonly kind: DagNodeKind;
	readonly label: string;
	readonly filePath: string | undefined;
	readonly layer: DagLayer;
	status: DagNodeStatus;
	readonly metadata: Record<string, string>;
	/** Screen position for layout (set by the renderer). */
	x: number;
	y: number;
}

export interface IDagEdge {
	readonly id: string;
	readonly kind: DagEdgeKind;
	readonly sourceId: string;
	readonly targetId: string;
	readonly weight: number;
}

export interface IDagGraph {
	readonly nodes: IDagNode[];
	readonly edges: IDagEdge[];
}

/**
 * Result of a BFS impact analysis starting from a seed node.
 */
export interface IDagImpactResult {
	/** The node from which impact radiates. */
	readonly seedNodeId: string;
	/** All nodes within the impact radius, ordered by BFS depth. */
	readonly impactedNodeIds: string[];
	/** Maximum depth reached. */
	readonly maxDepth: number;
}

/**
 * Layout algorithm choice for the DAG renderer.
 */
export const enum DagLayoutAlgorithm {
	Dagre = 'dagre',
	ForceDirected = 'forceDirected'
}

// ---- Node colours matching the Son of Anton visual identity ----

export const DAG_NODE_STATUS_COLOURS: Record<DagNodeStatus, string> = {
	[DagNodeStatus.Idle]: '#3A3A3A',
	[DagNodeStatus.Active]: '#F5A623',
	[DagNodeStatus.Complete]: '#3FB950',
	[DagNodeStatus.Error]: '#F85149',
	[DagNodeStatus.Impacted]: '#B8860B'
};

export const DAG_NODE_KIND_COLOURS: Record<DagNodeKind, string> = {
	[DagNodeKind.Module]: '#58A6FF',
	[DagNodeKind.File]: '#8B949E',
	[DagNodeKind.Function]: '#F5A623',
	[DagNodeKind.Class]: '#D2A8FF',
	[DagNodeKind.Interface]: '#7EE787'
};
