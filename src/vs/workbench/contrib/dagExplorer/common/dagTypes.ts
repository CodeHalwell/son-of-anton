/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the DAG Explorer surface.
 *
 * The DAG Explorer renders three graph layers:
 *   1. Build/dependency DAG — packages, modules, build targets
 *   2. Task DAG — orchestrator task decomposition and ordering
 *   3. Impact radius overlay — blast radius when an agent modifies a node
 */

export const enum DagLayerKind {
	Dependency = 'dependency',
	Task = 'task',
	Impact = 'impact'
}

export const enum DagNodeStatus {
	Idle = 'idle',
	Active = 'active',
	Complete = 'complete',
	Impacted = 'impacted',
	Orphaned = 'orphaned',
	Error = 'error'
}

export interface IDagNode {
	readonly id: string;
	readonly label: string;
	readonly kind: DagLayerKind;
	readonly filePath: string | undefined;
	readonly moduleId: string | undefined;
	status: DagNodeStatus;
	readonly metadata: Record<string, string>;
}

export interface IDagEdge {
	readonly id: string;
	readonly source: string;
	readonly target: string;
	readonly kind: DagLayerKind;
	readonly label: string | undefined;
	highlighted: boolean;
}

export interface IDagGraph {
	readonly nodes: IDagNode[];
	readonly edges: IDagEdge[];
	readonly layerKind: DagLayerKind;
}

export interface IDagImpactResult {
	readonly sourceNodeId: string;
	readonly impactedNodeIds: readonly string[];
	readonly impactedEdgeIds: readonly string[];
	readonly depth: number;
}

export interface IDagViewState {
	readonly zoom: number;
	readonly panX: number;
	readonly panY: number;
	readonly selectedNodeId: string | undefined;
	readonly activeLayer: DagLayerKind;
	readonly showImpactOverlay: boolean;
}

/**
 * Message protocol for communication between the DAG webview and the extension host.
 */
export const enum DagMessageType {
	Ready = 'ready',
	SetGraph = 'setGraph',
	NodeSelected = 'nodeSelected',
	NodeContextMenu = 'nodeContextMenu',
	ImpactRequest = 'impactRequest',
	ImpactResult = 'impactResult',
	ViewStateChanged = 'viewStateChanged',
	DispatchAgentTask = 'dispatchAgentTask'
}

export interface IDagMessage {
	readonly type: DagMessageType;
	readonly payload: IDagGraph | IDagImpactResult | IDagViewState | IDagNode | string;
}

// ---- Type guards ----

export function isDagNode(value: unknown): value is IDagNode {
	return typeof value === 'object' && value !== null && 'id' in value && 'kind' in value && 'status' in value;
}

export function isOrphaned(node: IDagNode): boolean {
	return node.status === DagNodeStatus.Orphaned;
}

export function isImpacted(node: IDagNode): boolean {
	return node.status === DagNodeStatus.Impacted;
}
