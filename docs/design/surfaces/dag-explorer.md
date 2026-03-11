# DAG Explorer — Design Specification

**Surface:** #2 of 8
**Priority:** Critical
**Status:** Draft
**Date:** 2026-03-10
**Modification Tier:** Tier 1 (new files alongside core)

---

## Overview

The DAG Explorer is an interactive dependency graph surface that visualises the structural relationships in a codebase. It renders three overlapping graph types — build dependencies, code structure, and agent tasks — on a single pannable, zoomable canvas. When an agent is about to modify code, the DAG Explorer highlights the blast radius in amber, giving the developer a spatial understanding of impact before any change lands.

This is the most visually distinctive surface in Son of Anton. No competing IDE offers a first-class, always-available dependency graph with live agent integration. It is the centrepiece of the product's visual identity.

### Design Principles

1. **Signal agency** — Running agent tasks animate on the graph. The developer sees what the system is doing, spatially.
2. **Build trust** — Impact analysis is visible before modification, not after. The blast radius is never hidden.
3. **Distinctively Son of Anton** — Dark canvas, amber highlights, force-directed layout. A screenshot of the DAG Explorer is immediately recognisable.

---

## 1. What It Renders

The DAG Explorer renders three graph types on a single canvas. The user can toggle each layer independently or view them composited.

### 1.1 Build/Dependency DAG

**Source:** Package manager manifests (package.json, Cargo.toml, pyproject.toml, go.mod, etc.) via the MCP `build_targets` and `build_order` tools.

**Nodes:** Packages, modules, workspaces, build targets.

**Edges:** `depends` relationships. Direction: dependant points to dependency.

**Use case:** "What must exist for this package to build?" and "What breaks if I remove this dependency?"

### 1.2 Code Structure DAG

**Source:** Tree-sitter AST via the indexer service, stored in FalkorDB (or SQLite graph tables in local-first mode). Queried via MCP `dependency_traversal` tool.

**Nodes:** Files, functions, classes, interfaces, type aliases.

**Edges:** `imports`, `calls`, `inherits`, `implements` relationships.

**Use case:** "What does this function call?" and "What files import this module?"

### 1.3 Task DAG

**Source:** Agent orchestrator via Mission Control service. Each agent task has an ID, dependencies on other tasks, and a status.

**Nodes:** Agent tasks (code generation, review, test writing, refactoring).

**Edges:** `blocks` relationships. Direction: blocking task points to blocked task.

**Use case:** "What must finish before the review agent can run?" and "Which tasks are parallelisable?"

### 1.4 Impact Radius Overlay

**Source:** MCP `impact_analysis` tool. Triggered when a user enters impact analysis mode or when an agent is about to modify a node.

**Behaviour:** Given a selected node, the overlay highlights:
- The selected node with a bright amber border and fill
- All direct dependents (depth 1) with amber borders and muted amber fill
- All transitive dependents (depth 2+) with amber borders at reduced opacity
- All connecting edges in amber

The overlay is composited on top of whichever graph layers are active.

---

## 2. Visual Language

### 2.1 Canvas

| Property | Value |
|----------|-------|
| Background | `#0A0A0A` |
| Grid dots (optional, toggle) | `#1A1A1A`, 20px spacing |
| Minimap background | `#0D0D0D` at 80% opacity |

### 2.2 Nodes

All nodes are rounded rectangles with an icon glyph and label.

| State | Background | Border | Text | Shadow |
|-------|-----------|--------|------|--------|
| Default | `#1A1A1A` | `#2A2A2A` 1px solid | `#CCCCCC` | none |
| Hover | `#1E1E1E` | `#3A3A3A` 1px solid | `#DDDDDD` | `0 0 8px rgba(245, 166, 35, 0.1)` |
| Selected | `#1A1A1A` | `#F5A623` 2px solid | `#FFFFFF` | `0 0 12px rgba(245, 166, 35, 0.25)` |
| Impact (direct) | `rgba(245, 166, 35, 0.08)` | `#F5A623` 2px solid | `#F5A623` | `0 0 12px rgba(245, 166, 35, 0.2)` |
| Impact (transitive) | `rgba(245, 166, 35, 0.04)` | `#F5A623` 1px solid | `#D4912A` | none |
| Orphaned | `#1A1A1A` at 40% opacity | `#2A2A2A` at 40% opacity | `#CCCCCC` at 40% opacity | none |
| Agent active | `#1A1A1A` | `#F5A623` 2px solid, pulsing | `#FFFFFF` | `0 0 16px rgba(245, 166, 35, 0.35)` |
| Agent complete | `#1A1A1A` | `#4CAF50` 2px solid | `#FFFFFF` | none |
| Agent failed | `#1A1A1A` | `#E53935` 2px solid | `#FFFFFF` | none |

Node dimensions:
- Default: 160px wide, 40px tall
- Collapsed cluster: 48px wide, 48px tall (circular)
- Minimum at zoom-out: 8px dot

### 2.3 Node Type Icons

Each node type has a distinct icon rendered inside the node rectangle, left-aligned before the label. Icons use Codicon or custom Son of Anton icon set.

| Node Type | Icon | Codicon Fallback |
|-----------|------|-----------------|
| File | Document outline | `codicon-file` |
| Function | Lambda/fn glyph | `codicon-symbol-method` |
| Class | Diamond | `codicon-symbol-class` |
| Package | Box/cube | `codicon-package` |
| Test | Flask/beaker | `codicon-beaker` |
| Agent task | Spark/bolt | `codicon-zap` |
| Build target | Gear | `codicon-gear` |

### 2.4 Edges

| State | Color | Width | Style |
|-------|-------|-------|-------|
| Default | `#3A3A3A` | 1px | solid |
| Hover (connected to hovered node) | `#5A5A5A` | 1.5px | solid |
| Selected (connected to selected node) | `#F5A623` | 2px | solid |
| Impact radius | `#F5A623` at 60% opacity | 2px | solid |
| Task dependency (blocking) | `#F5A623` | 2px | dashed |
| Calls | `#3A3A3A` | 1px | solid |
| Imports | `#3A3A3A` | 1px | solid |
| Inherits | `#3A3A3A` | 1px | dashed |

Edge direction is indicated by an arrowhead on the target end. Arrowhead size: 6px.

### 2.5 Status Overlays

Small badges rendered at the top-right corner of a node:

| Badge | Size | Visual |
|-------|------|--------|
| Agent running | 12px | Amber dot, pulsing animation (1s cycle) |
| Agent complete | 12px | Green check (`#4CAF50`) |
| Agent failed | 12px | Red cross (`#E53935`) |
| Modified (uncommitted) | 12px | Amber dot, static |

### 2.6 Layer Toggle Pills

Rendered in the top-left toolbar area of the canvas:

```
[Build DAG] [Code Structure] [Tasks] [Impact Mode]
```

Each pill is a toggle button:
- Inactive: `#1A1A1A` bg, `#666666` text, `#2A2A2A` border
- Active: `#1A1A1A` bg, `#F5A623` text, `#F5A623` border
- Impact Mode active: amber pulsing border on the pill

---

## 3. Interaction Model

### 3.1 Canvas Navigation

| Action | Input | Behaviour |
|--------|-------|-----------|
| Pan | Mouse drag on empty canvas / middle-click drag | Translate viewport |
| Zoom | Scroll wheel / pinch gesture | Scale around cursor position. Range: 10% to 400% |
| Fit to view | `F` key or toolbar button | Animate viewport to fit all visible nodes |
| Reset zoom | `0` key or toolbar button | Animate to 100% zoom, centered |
| Zoom to selection | `Z` key | Animate viewport to fit selected node and its immediate neighbourhood |

### 3.2 Node Interactions

| Action | Input | Behaviour |
|--------|-------|-----------|
| Select node | Left-click | Highlight node + connected edges in amber. Open side panel with node details. |
| Multi-select | Shift+click | Add node to selection. Side panel shows intersection of selected nodes' dependents. |
| Inspect node | Click (opens side panel) | Side panel shows: dependents list, dependencies list, file path, line range, agent task history for this node. |
| Jump to source | Double-click node | Open the file at the node's line in Editor Mode. If the node is a function/class, jump to its definition. |
| Context menu | Right-click node | Menu items: "Run Impact Analysis", "Dispatch Agent Task...", "Jump to Source", "Collapse to Cluster", "Copy Path". |
| Dispatch agent task | Right-click > "Dispatch Agent Task..." | Opens a command palette filtered to agent tasks. The selected task is scoped to the right-clicked node's file/symbol. |
| Hover | Mouse enter node | Highlight node border. Show tooltip with: type, name, file path, direct dependent count. Highlight connected edges. |
| Drag node | Left-click + drag on node | Reposition node (pin its position). Other nodes reflow if force-directed layout is active. |

### 3.3 Impact Analysis Mode

Activated by:
- Pressing `i` on the keyboard
- Clicking the "Impact Mode" toggle pill
- Right-clicking a node and selecting "Run Impact Analysis"

Behaviour:
1. Canvas dims to 60% brightness (all non-impacted elements fade)
2. Selected node is highlighted with bright amber
3. System calls MCP `impact_analysis` tool with the node's symbol and file
4. Direct dependents render with `Impact (direct)` style
5. Transitive dependents render with `Impact (transitive)` style
6. All connecting edges render in amber
7. Side panel updates to show impact summary: direct count, transitive count, affected files list
8. A banner appears at the top of the canvas: "Impact Analysis: {symbol} -- {totalImpact} affected nodes"
9. Press `Escape` or `i` again to exit impact mode

### 3.4 Keyboard Navigation

| Key | Action |
|-----|--------|
| Arrow keys | Navigate to adjacent node (nearest in arrow direction) |
| Enter | Select focused node (equivalent to left-click) |
| Escape | Deselect all / exit impact mode / close side panel |
| `i` | Toggle impact analysis mode for selected node |
| `f` | Fit all nodes in viewport |
| `0` | Reset zoom to 100% |
| `z` | Zoom to selection |
| `/` or `Ctrl+F` | Focus search bar |
| `1` | Toggle Build DAG layer |
| `2` | Toggle Code Structure layer |
| `3` | Toggle Task layer |
| Tab | Cycle through nodes in document order |
| `c` | Collapse selected node's subtree into cluster |
| `x` | Expand selected cluster |

### 3.5 Search and Filter

**Search bar** — Positioned at the top of the canvas, collapses when not focused.

- Type-ahead search by node name
- Results highlighted on canvas (matching nodes get amber border, non-matching dim to 30%)
- Enter on a search result navigates the viewport to that node and selects it
- Supports glob patterns: `*.test.ts` matches all test file nodes

**Filter toggles** — In the toolbar, toggle visibility by node type:

```
[Files] [Functions] [Classes] [Packages] [Tests] [Tasks]
```

When a type is hidden, its nodes and connected edges are removed from the layout. Remaining nodes reflow to fill the space.

---

## 4. Integration with Mission Control

### 4.1 Agent Task Highlighting

When an agent task is running (reported by the orchestrator via the sessions service), the DAG Explorer reflects this in real time:

1. **Task starts:** The target node(s) of the task get the `Agent active` style (pulsing amber border). If the task targets a file, highlight the file node. If it targets a function, highlight the function node.
2. **Task completes:** The node transitions to `Agent complete` style (green border + check badge). The pulsing animation stops.
3. **Task fails:** The node transitions to `Agent failed` style (red border + cross badge).

### 4.2 Pre-Modification Impact Preview

Before an agent modifies a file, Mission Control can request an impact preview:

1. Mission Control calls `IDagExplorerService.getImpactRadius(nodeId)`
2. DAG Explorer enters impact analysis mode for that node automatically
3. The developer sees the blast radius before approving the agent action
4. If the developer rejects, the agent task is cancelled and the overlay clears

### 4.3 Task DAG Synchronisation

The Task DAG layer subscribes to the orchestrator's task state stream:

- New tasks appear as nodes with `blocks` edges to their dependencies
- Task status updates drive node style changes (pending, active, complete, failed)
- Completed task chains collapse after 30 seconds to reduce visual noise (configurable)

---

## 5. Rendering Technology

### 5.1 Recommended Library: @antv/G6 v5

**Primary recommendation:** @antv/G6 v5 (Canvas/WebGL renderer with dagre and force-directed layouts).

**Rationale:**
- Built-in dagre layout (ideal for dependency graphs)
- Force-directed layout for organic exploration
- Canvas renderer handles 5000+ nodes at 60fps with virtual viewport
- Built-in minimap, tooltip, and zoom plugins
- TypeScript-first API
- Active maintenance, MIT licensed

**Alternative:** D3.js + d3-dag for layout, with a custom Canvas2D or WebGL renderer. Use if G6 proves too opinionated about styling or if bundle size is a concern.

**Rejected:**
- Cytoscape.js: Heavier bundle, less performant above 2000 nodes
- React Flow: React dependency is unwelcome inside the VS Code webview context
- vis.js: Abandoned maintenance

### 5.2 Webview Architecture

The DAG Explorer renders inside a VS Code webview panel (`vscode.WebviewPanel`), following the pattern used by other sessions contributions.

```
┌─────────────────────────────────────────────────────┐
│  dagExplorerView.ts (ViewPane contribution)         │
│    creates webview panel                            │
│    ├── dagWebview.html (shell: loads JS bundle)     │
│    │     ├── dagRenderer.ts (G6 instance)           │
│    │     ├── impactOverlay.ts (overlay logic)        │
│    │     └── dagSearch.ts (search/filter UI)         │
│    │                                                 │
│    │   postMessage() ←→ onDidReceiveMessage          │
│    │                                                 │
│  dagService.ts (runs in extension host)             │
│    ├── MCP client calls (dependencyTraversal, etc.) │
│    ├── SQLite fallback queries                      │
│    └── Graph data caching + invalidation            │
└─────────────────────────────────────────────────────┘
```

Communication between the webview and the extension host uses `postMessage` / `onDidReceiveMessage`, following VS Code's webview API.

### 5.3 Layout Algorithms

| Graph Type | Layout | Configuration |
|------------|--------|---------------|
| Build/Dependency DAG | Dagre (top-to-bottom) | `rankdir: 'TB'`, `nodesep: 40`, `ranksep: 60` |
| Code Structure DAG | Dagre (left-to-right) | `rankdir: 'LR'`, `nodesep: 30`, `ranksep: 50` |
| Task DAG | Dagre (left-to-right) | `rankdir: 'LR'`, `nodesep: 50`, `ranksep: 80` |
| Combined/exploration | Force-directed (d3-force) | `chargeStrength: -300`, `linkDistance: 80`, `alphaDecay: 0.02` |

The user can switch between dagre and force-directed layout via a toolbar toggle.

---

## 6. Data Contracts

### 6.1 Core Interfaces

```typescript
// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * A node in the DAG Explorer graph.
 */
export interface IDagNode {
	/** Unique identifier. For code nodes: `file:line` or symbol ID from the graph DB. */
	readonly id: string;

	/** Display name. File basename, function name, class name, package name, or task title. */
	readonly name: string;

	/** Node type, determines icon and filtering behaviour. */
	readonly type: DagNodeType;

	/** Absolute file path. Undefined for package nodes and external dependencies. */
	readonly filePath?: string;

	/** Line number of the definition. Undefined for file-level and package nodes. */
	readonly line?: number;

	/** End line number of the definition. */
	readonly endLine?: number;

	/** Language identifier (typescript, python, rust, etc.). */
	readonly language?: string;

	/** Additional metadata. Extensible per node type. */
	readonly metadata: IDagNodeMetadata;
}

export const enum DagNodeType {
	File = 'file',
	Function = 'function',
	Class = 'class',
	Package = 'package',
	Test = 'test',
	BuildTarget = 'buildTarget',
	AgentTask = 'agentTask',
}

export interface IDagNodeMetadata {
	/** Number of direct dependents (inbound edges). Computed at query time. */
	readonly dependentCount?: number;

	/** Number of direct dependencies (outbound edges). Computed at query time. */
	readonly dependencyCount?: number;

	/** For agent task nodes: current task status. */
	readonly taskStatus?: DagTaskStatus;

	/** For agent task nodes: the agent that owns this task. */
	readonly agentName?: string;

	/** For agent task nodes: model used (opus, sonnet, haiku). */
	readonly modelId?: string;

	/** Whether this file has uncommitted changes. */
	readonly isModified?: boolean;

	/** Export count for file nodes. */
	readonly exportCount?: number;

	/** Whether this node has no inbound or outbound edges. */
	readonly isOrphaned?: boolean;
}

export const enum DagTaskStatus {
	Pending = 'pending',
	Running = 'running',
	Complete = 'complete',
	Failed = 'failed',
	Cancelled = 'cancelled',
}

/**
 * An edge in the DAG Explorer graph.
 */
export interface IDagEdge {
	/** Source node ID (the dependant / caller / importer). */
	readonly source: string;

	/** Target node ID (the dependency / callee / imported module). */
	readonly target: string;

	/** Relationship type. Determines visual style. */
	readonly type: DagEdgeType;

	/** Optional weight for layout algorithms. Higher weight = shorter edge. */
	readonly weight?: number;
}

export const enum DagEdgeType {
	Imports = 'imports',
	Calls = 'calls',
	Depends = 'depends',
	Inherits = 'inherits',
	Implements = 'implements',
	Blocks = 'blocks',
	References = 'references',
}

/**
 * A complete graph payload sent to the webview renderer.
 */
export interface IDagGraph {
	readonly nodes: readonly IDagNode[];
	readonly edges: readonly IDagEdge[];
	readonly metadata: IDagGraphMetadata;
}

export interface IDagGraphMetadata {
	/** Which layers are represented in this graph. */
	readonly layers: readonly DagLayerType[];

	/** Total node count before any filtering (for display in the toolbar). */
	readonly totalNodeCount: number;

	/** Total edge count before any filtering. */
	readonly totalEdgeCount: number;

	/** Timestamp when the graph was last computed. */
	readonly computedAt: number;

	/** Whether this graph came from SQLite (local) or FalkorDB (Docker). */
	readonly dataSource: 'sqlite' | 'falkordb';
}

export const enum DagLayerType {
	BuildDependency = 'buildDependency',
	CodeStructure = 'codeStructure',
	Task = 'task',
}
```

### 6.2 Impact Analysis Types

```typescript
/**
 * Result of an impact analysis query.
 */
export interface IDagImpactResult {
	/** The node that was analysed. */
	readonly targetNodeId: string;

	/** Symbol name that was analysed. */
	readonly symbol: string;

	/** Node IDs of direct dependents (depth 1). */
	readonly directDependentIds: readonly string[];

	/** Node IDs of transitive dependents (depth 2+). */
	readonly transitiveDependentIds: readonly string[];

	/** Total number of affected nodes. */
	readonly totalImpact: number;

	/** Distinct files affected. */
	readonly affectedFiles: readonly string[];
}
```

### 6.3 Service Interface

```typescript
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

/**
 * Service identifier for dependency injection.
 */
export const IDagExplorerService = createDecorator<IDagExplorerService>('dagExplorerService');

export interface IDagExplorerService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Fetch the full graph for the active layers.
	 * @param layers Which layers to include.
	 * @param rootNodeId Optional root node to scope the query (limits depth).
	 * @param depth Maximum traversal depth from root. Default 3, max 5.
	 */
	getGraph(layers: readonly DagLayerType[], rootNodeId?: string, depth?: number): Promise<IDagGraph>;

	/**
	 * Run impact analysis for a given node.
	 */
	getImpactRadius(nodeId: string): Promise<IDagImpactResult>;

	/**
	 * Get detailed information for a single node.
	 * Returns the node with fully populated metadata, plus its immediate
	 * dependents and dependencies as separate arrays.
	 */
	getNodeDetails(nodeId: string): Promise<IDagNodeDetails>;

	/**
	 * Search nodes by name pattern.
	 * @param query Search string or glob pattern.
	 * @param types Optional filter by node types.
	 * @param maxResults Maximum results. Default 50.
	 */
	searchNodes(query: string, types?: readonly DagNodeType[], maxResults?: number): Promise<readonly IDagNode[]>;

	/**
	 * Fired when the underlying graph data changes (file saved, index updated, task status changed).
	 * The webview listens to this to request incremental updates.
	 */
	readonly onGraphUpdated: Event<IDagGraphUpdateEvent>;
}

export interface IDagNodeDetails {
	readonly node: IDagNode;
	readonly dependents: readonly IDagNode[];
	readonly dependencies: readonly IDagNode[];
}

export interface IDagGraphUpdateEvent {
	/** Which layers were affected. */
	readonly layers: readonly DagLayerType[];

	/** Node IDs that were added, removed, or modified. Empty means full refresh. */
	readonly affectedNodeIds: readonly string[];

	/** The type of update. */
	readonly type: 'incremental' | 'full';
}
```

### 6.4 Webview Message Protocol

Messages between the extension host (`dagService.ts`) and the webview (`dagRenderer.ts`):

```typescript
/**
 * Messages from extension host TO webview.
 */
export type DagHostToWebviewMessage =
	| { type: 'setGraph'; graph: IDagGraph }
	| { type: 'updateNodes'; nodes: readonly IDagNode[]; removedIds: readonly string[] }
	| { type: 'updateEdges'; edges: readonly IDagEdge[]; removedIds: readonly string[] }
	| { type: 'setImpactOverlay'; result: IDagImpactResult | null }
	| { type: 'setTaskStatus'; nodeId: string; status: DagTaskStatus }
	| { type: 'highlightNodes'; nodeIds: readonly string[] }
	| { type: 'searchResults'; nodes: readonly IDagNode[] }
	| { type: 'setActiveLayers'; layers: readonly DagLayerType[] };

/**
 * Messages from webview TO extension host.
 */
export type DagWebviewToHostMessage =
	| { type: 'requestGraph'; layers: readonly DagLayerType[]; rootNodeId?: string; depth?: number }
	| { type: 'requestImpact'; nodeId: string }
	| { type: 'requestNodeDetails'; nodeId: string }
	| { type: 'search'; query: string; types?: readonly DagNodeType[] }
	| { type: 'jumpToSource'; filePath: string; line?: number }
	| { type: 'dispatchAgentTask'; nodeId: string; taskType: string }
	| { type: 'toggleLayer'; layer: DagLayerType }
	| { type: 'ready' };
```

---

## 7. File Locations

All files are Tier 1 — new files in `src/vs/sessions/contrib/`.

```
src/vs/sessions/contrib/dagExplorer/
  browser/
    dagExplorer.contribution.ts   -- Registers ViewPane, commands, keybindings, menus
    dagExplorerView.ts            -- ViewPane subclass, creates webview panel
    dagRenderer.ts                -- G6/D3 wrapper, layout engine, canvas rendering
    dagService.ts                 -- IDagExplorerService implementation, MCP client calls, caching
    impactOverlay.ts              -- Impact radius visualisation logic and animation
    dagSearch.ts                  -- Search bar and filter toggle controller
    dagWebview.html               -- Webview HTML shell (loads bundled JS/CSS)
    dagWebview.css                -- Canvas styles, node styles, toolbar styles
    dagTypes.ts                   -- All TypeScript interfaces and enums from section 6
    dagCommands.ts                -- Command definitions (impact mode, jump to source, etc.)
    dagKeyboard.ts                -- Keyboard navigation handler (arrow keys, Tab cycling)
  common/
    dagExplorerServiceInterface.ts -- IDagExplorerService interface + createDecorator (shared)
  test/
    browser/
      dagService.test.ts          -- Unit tests for data fetching and caching
      dagRenderer.test.ts         -- Unit tests for layout computation
      impactOverlay.test.ts       -- Unit tests for impact result processing
      dagSearch.test.ts           -- Unit tests for search/filter logic
```

### Contribution Registration

`dagExplorer.contribution.ts` registers:

- A `ViewPaneContainer` in the sessions activity bar with the DAG Explorer icon
- The `dagExplorer.view` ViewPane inside that container
- Commands: `dagExplorer.toggleImpactMode`, `dagExplorer.jumpToSource`, `dagExplorer.fitToView`, `dagExplorer.resetZoom`, `dagExplorer.toggleBuildLayer`, `dagExplorer.toggleCodeLayer`, `dagExplorer.toggleTaskLayer`, `dagExplorer.search`, `dagExplorer.dispatchTask`
- Keybindings as defined in section 3.4 (scoped to `dagExplorerFocused` context key)
- Menu contributions for the node right-click context menu

---

## 8. Performance

### 8.1 Rendering Budget

| Metric | Target |
|--------|--------|
| Time to first meaningful paint (graph visible) | < 500ms for graphs under 500 nodes |
| Frame rate during pan/zoom | 60fps |
| Maximum interactive node count | 5000 nodes without clustering |
| Maximum rendered node count (with clustering) | 50,000 logical nodes |
| Impact analysis overlay render | < 200ms |
| Search result highlight | < 100ms |

### 8.2 Virtual Viewport

Only nodes within the visible viewport (plus a 200px buffer) are rendered to the canvas. Nodes outside the viewport are tracked in the layout model but not drawn. As the user pans, entering nodes are drawn and exiting nodes are removed.

G6 v5 supports this natively via its `enableOptimize` configuration. If using D3, implement a custom quadtree-based culling pass.

### 8.3 Node Clustering

For large graphs (> 500 nodes in a single view), automatic clustering is applied:

1. **Directory clustering:** All file/function/class nodes within the same directory collapse into a single cluster node showing the directory name and child count.
2. **Package clustering:** All internal nodes of an external package collapse into a single package node.
3. **Manual clustering:** User can select a node and press `c` to collapse its subtree.

Cluster nodes display:
- Directory/package name
- Child node count badge
- Aggregate edge count (sum of all edges from children to nodes outside the cluster)

Double-click a cluster to expand it. Press `x` to expand the selected cluster.

### 8.4 Incremental Updates

When `onGraphUpdated` fires with `type: 'incremental'`:

1. Only the affected nodes and their connected edges are re-fetched
2. The webview receives `updateNodes` and `updateEdges` messages (not a full `setGraph`)
3. The layout engine performs a localised re-layout around the changed nodes (G6's `layout.execute` with `animate: true`)
4. Non-affected nodes remain in their current positions

Full re-layout only occurs when:
- The active layer set changes
- More than 20% of nodes are affected in a single update
- The user explicitly requests it (fit-to-view)

### 8.5 Data Caching

`dagService.ts` maintains an in-memory cache:

| Cache | Key | TTL | Invalidation |
|-------|-----|-----|--------------|
| Graph data | `${layers.join(',')}:${rootNodeId}:${depth}` | 60 seconds | File save event, index update event |
| Impact results | `${nodeId}` | 30 seconds | File save event on any file in the impact set |
| Node details | `${nodeId}` | 60 seconds | File save event on the node's file |
| Search results | `${query}:${types.join(',')}` | 10 seconds | Any graph update event |

On cache invalidation, the service fires `onGraphUpdated` so the webview can request fresh data.

### 8.6 Lazy Data Fetching

The initial graph load uses `depth: 1` from the workspace root to show only top-level modules/packages. As the user navigates deeper (expanding clusters, selecting nodes), the service fetches additional depth on demand:

1. User selects a node or expands a cluster
2. `dagService.getGraph(layers, nodeId, depth: 2)` is called
3. New nodes/edges are merged into the existing graph
4. The webview receives an `updateNodes`/`updateEdges` message

This ensures the initial load is fast regardless of codebase size.

---

## 9. Accessibility

### 9.1 ARIA Roles

- Canvas container: `role="application"` with `aria-label="DAG Explorer dependency graph"`
- Each node: `role="treeitem"` with `aria-label="{type}: {name}"` and `aria-selected`
- Edge connections: Not individually focusable, but announced when a node is selected ("3 dependencies, 5 dependents")
- Toolbar: `role="toolbar"` with `aria-label="Graph controls"`
- Search bar: `role="searchbox"` with `aria-label="Search nodes"`

### 9.2 Screen Reader Announcements

- On node selection: "{type} {name}, {dependentCount} dependents, {dependencyCount} dependencies"
- On impact mode enter: "Impact analysis for {name}: {totalImpact} affected nodes across {affectedFileCount} files"
- On impact mode exit: "Impact analysis ended"
- On agent status change: "Agent task {status} on {name}"

### 9.3 High Contrast Mode

When VS Code's high contrast theme is active:

| Element | Standard | High Contrast |
|---------|----------|---------------|
| Amber highlights (`#F5A623`) | Amber | White (`#FFFFFF`) |
| Canvas background | `#0A0A0A` | `#000000` |
| Node border (default) | `#2A2A2A` | `#FFFFFF` 1px solid |
| Edge (default) | `#3A3A3A` | `#CCCCCC` |
| Impact fill | `rgba(245, 166, 35, 0.08)` | `rgba(255, 255, 255, 0.15)` |

### 9.4 Keyboard-Only Operation

All interactions described in section 3 are achievable via keyboard alone. The Tab key cycles through nodes in document order (top-to-bottom, left-to-right based on layout position). Arrow keys provide spatial navigation to the nearest node in the pressed direction.

---

## 10. Data Source Routing

The DAG Explorer works in two modes depending on the user's infrastructure setup:

### 10.1 Local-First Mode (SQLite — Default)

No Docker required. The indexer writes graph data to SQLite tables:

- `dag_nodes` (id TEXT PK, name TEXT, type TEXT, file_path TEXT, line INTEGER, metadata JSON)
- `dag_edges` (source TEXT, target TEXT, type TEXT, weight REAL)
- Indexes on `dag_nodes.type`, `dag_nodes.name`, `dag_edges.source`, `dag_edges.target`

`dagService.ts` detects whether FalkorDB is available. If not, it queries SQLite directly using the same interface. The `dataSource` field in `IDagGraphMetadata` indicates which backend served the data.

### 10.2 Docker Mode (FalkorDB)

When the Docker Compose stack is running, `dagService.ts` routes queries through the MCP client:

- `dependency_traversal` for Code Structure DAG
- `impact_analysis` for Impact Radius Overlay
- `build_targets` and `build_order` for Build/Dependency DAG
- Task DAG data comes from the orchestrator service, not the graph DB

The MCP client is the same one used by agents, ensuring consistent data.

### 10.3 Detection Logic

```typescript
async function resolveDataSource(): Promise<'sqlite' | 'falkordb'> {
	try {
		// Attempt to reach FalkorDB via the MCP gateway health endpoint
		const response = await fetch('http://localhost:3100/health', { signal: AbortSignal.timeout(2000) });
		if (response.ok) {
			return 'falkordb';
		}
	} catch {
		// FalkorDB not available — fall back to SQLite
	}
	return 'sqlite';
}
```

---

## 11. Security Considerations

- The webview runs with `enableScripts: true` but no `localResourceRoots` beyond the extension's own directory
- No external network calls from the webview — all data flows through the extension host
- Node file paths are workspace-relative in the webview; absolute paths are resolved only in the extension host
- The "Dispatch Agent Task" action requires the same workspace trust level as running any agent task
- Impact analysis results are read-only; the DAG Explorer never modifies files

---

## 12. Future Extensions

These are not in scope for the initial implementation but inform the architecture:

1. **Diff overlay** — Show which nodes changed between two git refs. Requires git integration in `dagService.ts`.
2. **Custom graph queries** — Power-user Cypher query bar that renders arbitrary FalkorDB query results on the canvas.
3. **Collaborative cursors** — Multiple developers' selected nodes visible on the same graph (requires ACP or Live Share integration).
4. **AI-suggested focus** — The orchestrator suggests which subgraph is relevant to the current task and auto-zooms to it.
5. **Export** — Export the current view as SVG or PNG for documentation.

---

## 13. Open Questions

1. **G6 v5 bundle size** — Needs measurement. If the webview bundle exceeds 500KB gzipped, consider a slimmer D3-only approach.
2. **SQLite graph query performance** — Recursive CTEs for transitive dependency traversal may be slow on large codebases. Benchmark with 10,000+ node graphs and consider pre-computing transitive closures.
3. **Task DAG data source** — The orchestrator service does not yet expose a streaming task state API. This needs to be designed in coordination with the Mission Control spec.
4. **Webview persistence** — Should the graph state (viewport position, expanded clusters, pinned nodes) persist across VS Code restarts? If so, use `webview.state` or a workspace-scoped memento.
