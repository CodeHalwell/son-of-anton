/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IDagGraph,
	DagNodeStatus,
	DagLayer,
	DAG_NODE_STATUS_COLOURS,
	DAG_NODE_KIND_COLOURS,
} from '../common/dagTypes.js';

/**
 * Message types from the webview to the extension host.
 */
export interface DagWebviewToHostMessage {
	readonly type: 'nodeClick' | 'impactRequest' | 'layerChange' | 'ready';
	readonly nodeId?: string;
	readonly layer?: DagLayer;
}

/**
 * Message types from the extension host to the webview.
 */
export interface DagHostToWebviewMessage {
	readonly type: 'graphUpdate' | 'nodeStatusUpdate' | 'impactHighlight' | 'clearHighlight';
	readonly graph?: IDagGraph;
	readonly nodeId?: string;
	readonly status?: DagNodeStatus;
	readonly impactedNodeIds?: string[];
}

/**
 * Generates the DAG Explorer webview HTML.
 *
 * The webview renders a dependency graph using SVG with a dagre-inspired
 * hierarchical layout. It supports 3-layer filtering, node click interactions,
 * and impact radius highlighting.
 *
 * Uses safe DOM APIs exclusively — no innerHTML.
 *
 * @param nonce CSP nonce for inline scripts
 */
export function getDagExplorerHtml(nonce: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<style nonce="${nonce}">
		* { margin: 0; padding: 0; box-sizing: border-box; }

		body {
			background: #0D0D0D;
			color: #E5E5E5;
			font-family: var(--vscode-font-family, 'Geist', system-ui, sans-serif);
			font-size: 12px;
			overflow: hidden;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}

		.toolbar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			border-bottom: 1px solid #2A2A2A;
			flex-shrink: 0;
			background: #111111;
		}

		.toolbar-label {
			font-size: 11px;
			color: #8B949E;
			margin-right: 4px;
		}

		.layer-btn {
			padding: 4px 10px;
			border: 1px solid #2A2A2A;
			border-radius: 4px;
			background: transparent;
			color: #8B949E;
			font-size: 11px;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.layer-btn:hover { border-color: #3A3A3A; color: #E5E5E5; }
		.layer-btn.active { border-color: #F5A623; color: #F5A623; background: rgba(245, 166, 35, 0.08); }

		.toolbar-separator { width: 1px; height: 20px; background: #2A2A2A; margin: 0 4px; }

		.impact-btn {
			padding: 4px 10px;
			border: 1px solid #2A2A2A;
			border-radius: 4px;
			background: transparent;
			color: #8B949E;
			font-size: 11px;
			cursor: pointer;
		}

		.impact-btn:hover { border-color: #B8860B; color: #B8860B; }
		.impact-btn.active { border-color: #B8860B; color: #B8860B; background: rgba(184, 134, 11, 0.08); }

		.graph-container {
			flex: 1;
			overflow: auto;
			position: relative;
		}

		svg.dag-svg {
			width: 100%;
			height: 100%;
			min-width: 600px;
			min-height: 400px;
		}

		.dag-node { cursor: pointer; transition: opacity 0.2s ease; }
		.dag-node:hover .node-rect { stroke-width: 2; }
		.node-rect { rx: 6; ry: 6; stroke-width: 1; transition: fill 0.2s ease, stroke 0.2s ease; }
		.node-label { font-size: 11px; fill: #E5E5E5; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
		.node-kind-badge { font-size: 9px; fill: #8B949E; text-anchor: middle; pointer-events: none; }
		.dag-edge { stroke: #2A2A2A; stroke-width: 1; fill: none; marker-end: url(#arrowhead); transition: stroke 0.2s ease; }
		.dag-edge.highlighted { stroke: #B8860B; stroke-width: 1.5; }

		.detail-panel {
			position: absolute;
			top: 12px;
			right: 12px;
			width: 240px;
			background: #161616;
			border: 1px solid #2A2A2A;
			border-radius: 8px;
			padding: 12px;
			display: none;
			z-index: 10;
		}

		.detail-panel.visible { display: block; }
		.detail-title { font-size: 13px; font-weight: 600; color: #E5E5E5; margin-bottom: 8px; }
		.detail-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
		.detail-key { color: #8B949E; }
		.detail-value { color: #E5E5E5; }
		.detail-close { position: absolute; top: 8px; right: 8px; background: none; border: none; color: #8B949E; cursor: pointer; font-size: 14px; }

		.placeholder {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: #8B949E;
			text-align: center;
			padding: 48px;
		}

		.placeholder-icon { font-size: 48px; opacity: 0.3; margin-bottom: 16px; }
		.placeholder-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
		.placeholder-sub { font-size: 12px; line-height: 1.4; }

		.stats-bar {
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 6px 12px;
			border-top: 1px solid #2A2A2A;
			background: #111111;
			font-size: 11px;
			color: #8B949E;
			flex-shrink: 0;
		}

		.stats-bar .stat-value { color: #F5A623; font-weight: 500; }
	</style>
</head>
<body>
	<div class="toolbar">
		<span class="toolbar-label">Layer:</span>
		<button class="layer-btn active" data-layer="0">Modules</button>
		<button class="layer-btn" data-layer="1">Files</button>
		<button class="layer-btn" data-layer="2">Symbols</button>
		<div class="toolbar-separator"></div>
		<button class="impact-btn" id="impactToggle">Impact Radius</button>
	</div>

	<div class="graph-container" id="graphContainer">
		<div class="placeholder" id="placeholder">
			<div class="placeholder-icon">\u26A1</div>
			<div class="placeholder-title">DAG Explorer</div>
			<div class="placeholder-sub">Start an agent session to populate the dependency graph.</div>
		</div>
		<svg class="dag-svg" id="dagSvg" style="display:none;">
			<defs>
				<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
					<polygon points="0 0, 8 3, 0 6" fill="#3A3A3A" />
				</marker>
			</defs>
			<g id="edgeGroup"></g>
			<g id="nodeGroup"></g>
		</svg>
		<div class="detail-panel" id="detailPanel">
			<button class="detail-close" id="detailClose">\u2715</button>
			<div class="detail-title" id="detailTitle"></div>
			<div id="detailBody"></div>
		</div>
	</div>

	<div class="stats-bar" id="statsBar">
		<span>Nodes: <span class="stat-value" id="statNodes">0</span></span>
		<span>Edges: <span class="stat-value" id="statEdges">0</span></span>
		<span>Layer: <span class="stat-value" id="statLayer">Modules</span></span>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();

		let currentGraph = { nodes: [], edges: [] };
		let currentLayer = 0;
		let impactMode = false;
		let selectedNodeId = null;
		const layerNames = ['Modules', 'Files', 'Symbols'];
		const statusColours = ${JSON.stringify(DAG_NODE_STATUS_COLOURS)};
		const kindColours = ${JSON.stringify(DAG_NODE_KIND_COLOURS)};

		const svg = document.getElementById('dagSvg');
		const nodeGroup = document.getElementById('nodeGroup');
		const edgeGroup = document.getElementById('edgeGroup');
		const placeholder = document.getElementById('placeholder');
		const detailPanel = document.getElementById('detailPanel');
		const detailTitle = document.getElementById('detailTitle');
		const detailBody = document.getElementById('detailBody');

		document.querySelectorAll('.layer-btn').forEach(function(btn) {
			btn.addEventListener('click', function() {
				currentLayer = parseInt(btn.dataset.layer);
				document.querySelectorAll('.layer-btn').forEach(function(b) { b.classList.remove('active'); });
				btn.classList.add('active');
				document.getElementById('statLayer').textContent = layerNames[currentLayer];
				vscode.postMessage({ type: 'layerChange', layer: currentLayer });
				renderGraph();
			});
		});

		document.getElementById('impactToggle').addEventListener('click', function() {
			impactMode = !impactMode;
			this.classList.toggle('active', impactMode);
			if (!impactMode) {
				vscode.postMessage({ type: 'impactRequest', nodeId: null });
			}
		});

		document.getElementById('detailClose').addEventListener('click', function() {
			detailPanel.classList.remove('visible');
			selectedNodeId = null;
		});

		function layoutGraph(nodes, edges) {
			if (nodes.length === 0) return;
			var nodeMap = new Map(nodes.map(function(n) { return [n.id, n]; }));
			var inDegree = new Map();
			var children = new Map();
			nodes.forEach(function(n) { inDegree.set(n.id, 0); children.set(n.id, []); });
			edges.forEach(function(e) {
				if (nodeMap.has(e.sourceId) && nodeMap.has(e.targetId)) {
					inDegree.set(e.targetId, (inDegree.get(e.targetId) || 0) + 1);
					children.get(e.sourceId).push(e.targetId);
				}
			});
			var levels = [];
			var assigned = new Set();
			var frontier = nodes.filter(function(n) { return inDegree.get(n.id) === 0; }).map(function(n) { return n.id; });
			while (frontier.length > 0) {
				levels.push(frontier.slice());
				frontier.forEach(function(id) { assigned.add(id); });
				var next = [];
				frontier.forEach(function(id) {
					(children.get(id) || []).forEach(function(child) {
						if (!assigned.has(child)) {
							inDegree.set(child, inDegree.get(child) - 1);
							if (inDegree.get(child) === 0) next.push(child);
						}
					});
				});
				frontier = next;
			}
			var remaining = nodes.filter(function(n) { return !assigned.has(n.id); });
			if (remaining.length > 0) levels.push(remaining.map(function(n) { return n.id; }));
			var nw = 140, nh = 40, lg = 80, ng = 20;
			for (var y = 0; y < levels.length; y++) {
				var level = levels[y];
				var tw = level.length * nw + (level.length - 1) * ng;
				var sx = Math.max(40, (600 - tw) / 2);
				for (var x = 0; x < level.length; x++) {
					var node = nodeMap.get(level[x]);
					if (node) { node.x = sx + x * (nw + ng); node.y = 60 + y * (nh + lg); }
				}
			}
		}

		function renderGraph() {
			var layerNodes = currentGraph.nodes.filter(function(n) { return n.layer === currentLayer; });
			var nodeIds = new Set(layerNodes.map(function(n) { return n.id; }));
			var layerEdges = currentGraph.edges.filter(function(e) { return nodeIds.has(e.sourceId) && nodeIds.has(e.targetId); });
			layoutGraph(layerNodes, layerEdges);
			document.getElementById('statNodes').textContent = String(layerNodes.length);
			document.getElementById('statEdges').textContent = String(layerEdges.length);
			if (layerNodes.length === 0) {
				svg.style.display = 'none';
				placeholder.style.display = 'flex';
				return;
			}
			svg.style.display = 'block';
			placeholder.style.display = 'none';
			while (edgeGroup.firstChild) edgeGroup.removeChild(edgeGroup.firstChild);
			while (nodeGroup.firstChild) nodeGroup.removeChild(nodeGroup.firstChild);
			var nw = 140, nh = 40;
			var maxX = 0, maxY = 0;
			layerNodes.forEach(function(n) {
				maxX = Math.max(maxX, n.x + nw + 40);
				maxY = Math.max(maxY, n.y + nh + 40);
			});
			svg.setAttribute('viewBox', '0 0 ' + maxX + ' ' + maxY);
			svg.style.minWidth = maxX + 'px';
			svg.style.minHeight = maxY + 'px';
			var nodeMap = new Map(layerNodes.map(function(n) { return [n.id, n]; }));
			layerEdges.forEach(function(edge) {
				var src = nodeMap.get(edge.sourceId);
				var tgt = nodeMap.get(edge.targetId);
				if (!src || !tgt) return;
				var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', String(src.x + nw / 2));
				line.setAttribute('y1', String(src.y + nh));
				line.setAttribute('x2', String(tgt.x + nw / 2));
				line.setAttribute('y2', String(tgt.y));
				line.classList.add('dag-edge');
				edgeGroup.appendChild(line);
			});
			layerNodes.forEach(function(node) {
				var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
				g.classList.add('dag-node');
				g.dataset.nodeId = node.id;
				var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				rect.setAttribute('x', String(node.x));
				rect.setAttribute('y', String(node.y));
				rect.setAttribute('width', String(nw));
				rect.setAttribute('height', String(nh));
				rect.setAttribute('fill', '#161616');
				rect.setAttribute('stroke', statusColours[node.status] || '#3A3A3A');
				rect.classList.add('node-rect');
				g.appendChild(rect);
				var indicator = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				indicator.setAttribute('x', String(node.x));
				indicator.setAttribute('y', String(node.y));
				indicator.setAttribute('width', '4');
				indicator.setAttribute('height', String(nh));
				indicator.setAttribute('fill', kindColours[node.kind] || '#8B949E');
				indicator.setAttribute('rx', '2');
				g.appendChild(indicator);
				var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				label.setAttribute('x', String(node.x + nw / 2 + 2));
				label.setAttribute('y', String(node.y + nh / 2 - 2));
				label.classList.add('node-label');
				var dl = node.label.length > 18 ? node.label.substring(0, 16) + '\\u2026' : node.label;
				label.textContent = dl;
				g.appendChild(label);
				var badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				badge.setAttribute('x', String(node.x + nw / 2 + 2));
				badge.setAttribute('y', String(node.y + nh / 2 + 12));
				badge.classList.add('node-kind-badge');
				badge.textContent = node.kind;
				g.appendChild(badge);
				g.addEventListener('click', function() {
					selectedNodeId = node.id;
					showNodeDetail(node);
					if (impactMode) vscode.postMessage({ type: 'impactRequest', nodeId: node.id });
					vscode.postMessage({ type: 'nodeClick', nodeId: node.id });
				});
				nodeGroup.appendChild(g);
			});
		}

		function showNodeDetail(node) {
			detailTitle.textContent = node.label;
			while (detailBody.firstChild) detailBody.removeChild(detailBody.firstChild);
			var rows = [['Kind', node.kind], ['Status', node.status], ['Layer', layerNames[node.layer]]];
			if (node.filePath) rows.push(['File', node.filePath.split('/').pop()]);
			Object.keys(node.metadata || {}).forEach(function(k) { rows.push([k, node.metadata[k]]); });
			rows.forEach(function(pair) {
				var row = document.createElement('div');
				row.classList.add('detail-row');
				var key = document.createElement('span');
				key.classList.add('detail-key');
				key.textContent = pair[0];
				var val = document.createElement('span');
				val.classList.add('detail-value');
				val.textContent = pair[1];
				row.appendChild(key);
				row.appendChild(val);
				detailBody.appendChild(row);
			});
			detailPanel.classList.add('visible');
		}

		function highlightImpact(impactedIds) {
			var idSet = new Set(impactedIds);
			document.querySelectorAll('.dag-node').forEach(function(g) {
				if (idSet.has(g.dataset.nodeId)) {
					g.querySelector('.node-rect').setAttribute('stroke', '${DAG_NODE_STATUS_COLOURS[DagNodeStatus.Impacted]}');
					g.querySelector('.node-rect').setAttribute('stroke-width', '2');
				}
			});
		}

		window.addEventListener('message', function(event) {
			var msg = event.data;
			switch (msg.type) {
				case 'graphUpdate':
					currentGraph = msg.graph || { nodes: [], edges: [] };
					renderGraph();
					break;
				case 'nodeStatusUpdate':
					if (msg.nodeId && msg.status !== undefined) {
						var node = currentGraph.nodes.find(function(n) { return n.id === msg.nodeId; });
						if (node) { node.status = msg.status; renderGraph(); }
					}
					break;
				case 'impactHighlight':
					if (msg.impactedNodeIds) highlightImpact(msg.impactedNodeIds);
					break;
				case 'clearHighlight':
					renderGraph();
					break;
			}
		});

		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}
