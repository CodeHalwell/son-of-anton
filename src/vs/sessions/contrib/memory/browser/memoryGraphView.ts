/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/memoryBrowser.css';
import { $, append } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IMemoryNode, IMemoryEdge, MemoryNodeKind, MemoryEdgeKind } from '../common/memoryTypes.js';
import { IMemoryService } from './memoryService.js';

export const MEMORY_GRAPH_VIEW_ID = 'workbench.view.soaMemoryGraph';

/** Colour per node kind — matches the CSS badge colours. */
const NODE_KIND_COLOURS: Record<string, string> = {
	[MemoryNodeKind.File]: '#58A6FF',
	[MemoryNodeKind.Function]: '#7EE787',
	[MemoryNodeKind.Class]: '#D2A8FF',
	[MemoryNodeKind.Module]: '#F5A623',
	[MemoryNodeKind.Symbol]: '#79C0FF',
	[MemoryNodeKind.Concept]: '#FFA657',
	[MemoryNodeKind.Decision]: '#FF7B72',
	[MemoryNodeKind.Error]: '#F85149',
	[MemoryNodeKind.Pattern]: '#A5D6FF',
};

const NODE_RADIUS = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Position assigned during force layout. */
interface ILayoutNode {
	readonly node: IMemoryNode;
	x: number;
	y: number;
	vx: number;
	vy: number;
}

/**
 * Memory Graph View — a small force-directed SVG graph of memory nodes and
 * their relationships. Clicking a node shows its detail in a side panel.
 *
 * Uses inline SVG (no webview), following the same pattern as the DAG Explorer.
 */
export class MemoryGraphView extends ViewPane {

	static readonly ID = MEMORY_GRAPH_VIEW_ID;

	private rootContainer!: HTMLElement;
	private graphArea!: HTMLElement;
	private placeholderContainer!: HTMLElement;
	private detailPanel!: HTMLElement;
	private detailTitle!: HTMLElement;
	private detailBody!: HTMLElement;

	private svgElement: SVGSVGElement | undefined;
	private _layoutNodes: ILayoutNode[] = [];
	private _edges: IMemoryEdge[] = [];
	private _animationFrame: number | undefined;

	private readonly viewDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMemoryService private readonly memoryService: IMemoryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.rootContainer = append(container, $('div.soa-memory-graph'));

		// Graph area
		this.graphArea = append(this.rootContainer, $('div.soa-memory-graph-area'));

		// Placeholder
		this.placeholderContainer = append(this.graphArea, $('div.soa-memory-graph-placeholder'));

		const icon = append(this.placeholderContainer, $('div'));
		icon.textContent = '\u26A1';
		icon.style.fontSize = '48px';
		icon.style.opacity = '0.3';
		icon.style.marginBottom = '16px';

		const title = append(this.placeholderContainer, $('div'));
		title.textContent = localize('memoryGraph.placeholder.title', "Memory Graph");
		title.style.fontSize = '14px';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';

		const sub = append(this.placeholderContainer, $('div'));
		sub.textContent = localize('memoryGraph.placeholder.sub', "Add memory nodes to visualise relationships.");
		sub.style.fontSize = '12px';
		sub.style.lineHeight = '1.4';

		// Detail panel
		this._renderDetailPanel();

		// Wire service events
		this.viewDisposables.add(this.memoryService.onDidChangeMemory(() => {
			this._buildGraph();
		}));

		this._buildGraph();
	}

	// ---- Detail panel ----

	private _renderDetailPanel(): void {
		this.detailPanel = append(this.graphArea, $('div.soa-memory-graph-detail'));

		const closeBtn = append(this.detailPanel, $('button.soa-memory-graph-detail-close'));
		closeBtn.textContent = '\u2715';

		const onClose = (): void => { this.detailPanel.style.display = 'none'; };
		closeBtn.addEventListener('click', onClose);
		this.viewDisposables.add({ dispose: () => closeBtn.removeEventListener('click', onClose) });

		this.detailTitle = append(this.detailPanel, $('div.soa-memory-graph-detail-title'));
		this.detailBody = append(this.detailPanel, $('div'));
	}

	private _showNodeDetail(node: IMemoryNode): void {
		this.detailTitle.textContent = node.label;
		while (this.detailBody.firstChild) {
			this.detailBody.removeChild(this.detailBody.firstChild);
		}

		const rows: Array<[string, string]> = [
			[localize('memoryGraph.detail.kind', "Kind"), node.kind],
		];

		if (node.filePath) {
			rows.push([localize('memoryGraph.detail.file', "File"), node.filePath.split('/').pop() ?? node.filePath]);
		}

		const contentPreview = node.content.length > 80
			? node.content.substring(0, 80) + '...'
			: node.content;
		if (contentPreview) {
			rows.push([localize('memoryGraph.detail.content', "Content"), contentPreview]);
		}

		for (const [k, v] of Object.entries(node.metadata)) {
			rows.push([k, v]);
		}

		for (const [key, value] of rows) {
			const row = append(this.detailBody, $('div.soa-memory-graph-detail-row'));

			const keyEl = append(row, $('span.soa-memory-graph-detail-key'));
			keyEl.textContent = key;

			const valEl = append(row, $('span.soa-memory-graph-detail-val'));
			valEl.textContent = value;
		}

		this.detailPanel.style.display = 'block';
	}

	// ---- Graph building ----

	private _buildGraph(): void {
		const stats = this.memoryService.getStats();

		if (stats.totalNodes === 0) {
			this.placeholderContainer.style.display = 'flex';
			if (this.svgElement) {
				this.svgElement.style.display = 'none';
			}
			return;
		}

		this.placeholderContainer.style.display = 'none';

		// Collect all nodes via search (get all by empty keyword match with low minScore)
		const allResults = this.memoryService.search({
			query: '',
			maxResults: 200,
			minScore: 0,
			includeVector: false,
			includeKeyword: true,
			includeGraph: false,
			filterKinds: undefined,
		});

		// Build layout nodes — for the in-memory backend we also collect nodes
		// by traversing edges if the search returns nothing (search requires a
		// non-empty query for keyword matching).
		const nodeMap = new Map<string, IMemoryNode>();
		for (const r of allResults) {
			nodeMap.set(r.node.id, r.node);
		}

		// Gather all edges and discover nodes referenced by edges
		const allEdges: IMemoryEdge[] = [];
		for (const node of nodeMap.values()) {
			for (const edge of this.memoryService.getEdgesFrom(node.id)) {
				allEdges.push(edge);
				const target = this.memoryService.getNode(edge.targetId);
				if (target && !nodeMap.has(target.id)) {
					nodeMap.set(target.id, target);
				}
			}
			for (const edge of this.memoryService.getEdgesTo(node.id)) {
				allEdges.push(edge);
				const source = this.memoryService.getNode(edge.sourceId);
				if (source && !nodeMap.has(source.id)) {
					nodeMap.set(source.id, source);
				}
			}
		}

		// Deduplicate edges
		const edgeIds = new Set<string>();
		this._edges = [];
		for (const edge of allEdges) {
			if (!edgeIds.has(edge.id)) {
				edgeIds.add(edge.id);
				this._edges.push(edge);
			}
		}

		// Initialise layout positions (random circle)
		const cx = 300;
		const cy = 250;
		const radius = Math.min(200, 60 + nodeMap.size * 15);
		const nodes = Array.from(nodeMap.values());

		this._layoutNodes = nodes.map((node, i) => {
			const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
			return {
				node,
				x: cx + radius * Math.cos(angle),
				y: cy + radius * Math.sin(angle),
				vx: 0,
				vy: 0,
			};
		});

		this._runForceLayout();
		this._renderSvg();
	}

	// ---- Simple force-directed layout ----

	private _runForceLayout(): void {
		if (this._animationFrame !== undefined) {
			cancelAnimationFrame(this._animationFrame);
			this._animationFrame = undefined;
		}

		const nodeById = new Map<string, ILayoutNode>();
		for (const ln of this._layoutNodes) {
			nodeById.set(ln.node.id, ln);
		}

		const iterations = 80;
		const repulsion = 3000;
		const attraction = 0.005;
		const damping = 0.9;
		const idealLength = 120;

		for (let iter = 0; iter < iterations; iter++) {
			// Repulsion between all pairs
			for (let i = 0; i < this._layoutNodes.length; i++) {
				for (let j = i + 1; j < this._layoutNodes.length; j++) {
					const a = this._layoutNodes[i];
					const b = this._layoutNodes[j];
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
					const force = repulsion / (dist * dist);
					const fx = (dx / dist) * force;
					const fy = (dy / dist) * force;
					a.vx -= fx;
					a.vy -= fy;
					b.vx += fx;
					b.vy += fy;
				}
			}

			// Attraction along edges
			for (const edge of this._edges) {
				const src = nodeById.get(edge.sourceId);
				const tgt = nodeById.get(edge.targetId);
				if (!src || !tgt) {
					continue;
				}
				const dx = tgt.x - src.x;
				const dy = tgt.y - src.y;
				const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
				const force = attraction * (dist - idealLength);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				src.vx += fx;
				src.vy += fy;
				tgt.vx -= fx;
				tgt.vy -= fy;
			}

			// Apply velocity and damping
			for (const ln of this._layoutNodes) {
				ln.vx *= damping;
				ln.vy *= damping;
				ln.x += ln.vx;
				ln.y += ln.vy;
			}
		}

		// Normalise positions to fit in a reasonable bounding box
		let minX = Infinity, minY = Infinity;
		for (const ln of this._layoutNodes) {
			minX = Math.min(minX, ln.x);
			minY = Math.min(minY, ln.y);
		}
		const padding = 60;
		for (const ln of this._layoutNodes) {
			ln.x = ln.x - minX + padding;
			ln.y = ln.y - minY + padding;
		}
	}

	// ---- SVG rendering ----

	private _renderSvg(): void {
		if (this.svgElement) {
			this.svgElement.remove();
		}

		this.svgElement = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;

		// Calculate dimensions
		let maxX = 0;
		let maxY = 0;
		for (const ln of this._layoutNodes) {
			maxX = Math.max(maxX, ln.x + NODE_RADIUS + 60);
			maxY = Math.max(maxY, ln.y + NODE_RADIUS + 60);
		}
		this.svgElement.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
		this.svgElement.style.width = '100%';
		this.svgElement.style.minWidth = `${maxX}px`;
		this.svgElement.style.minHeight = `${maxY}px`;

		// Arrow marker
		const defs = document.createElementNS(SVG_NS, 'defs');
		const marker = document.createElementNS(SVG_NS, 'marker');
		marker.setAttribute('id', 'mem-arrowhead');
		marker.setAttribute('markerWidth', '8');
		marker.setAttribute('markerHeight', '6');
		marker.setAttribute('refX', '8');
		marker.setAttribute('refY', '3');
		marker.setAttribute('orient', 'auto');
		marker.setAttribute('markerUnits', 'strokeWidth');
		const polygon = document.createElementNS(SVG_NS, 'polygon');
		polygon.setAttribute('points', '0 0, 8 3, 0 6');
		polygon.setAttribute('fill', '#3A3A3A');
		marker.appendChild(polygon);
		defs.appendChild(marker);
		this.svgElement.appendChild(defs);

		const nodeById = new Map<string, ILayoutNode>();
		for (const ln of this._layoutNodes) {
			nodeById.set(ln.node.id, ln);
		}

		// Edges
		const edgeGroup = document.createElementNS(SVG_NS, 'g');
		for (const edge of this._edges) {
			const src = nodeById.get(edge.sourceId);
			const tgt = nodeById.get(edge.targetId);
			if (!src || !tgt) {
				continue;
			}

			// Shorten line so arrow sits on circle edge
			const dx = tgt.x - src.x;
			const dy = tgt.y - src.y;
			const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
			const nx = dx / dist;
			const ny = dy / dist;

			const x1 = src.x + nx * NODE_RADIUS;
			const y1 = src.y + ny * NODE_RADIUS;
			const x2 = tgt.x - nx * (NODE_RADIUS + 4);
			const y2 = tgt.y - ny * (NODE_RADIUS + 4);

			const line = document.createElementNS(SVG_NS, 'line');
			line.setAttribute('x1', String(x1));
			line.setAttribute('y1', String(y1));
			line.setAttribute('x2', String(x2));
			line.setAttribute('y2', String(y2));
			line.setAttribute('stroke', '#2A2A2A');
			line.setAttribute('stroke-width', '1');
			line.setAttribute('marker-end', 'url(#mem-arrowhead)');
			edgeGroup.appendChild(line);

			// Edge label at midpoint
			const mx = (x1 + x2) / 2;
			const my = (y1 + y2) / 2;
			const edgeLabel = document.createElementNS(SVG_NS, 'text');
			edgeLabel.setAttribute('x', String(mx));
			edgeLabel.setAttribute('y', String(my - 4));
			edgeLabel.setAttribute('text-anchor', 'middle');
			edgeLabel.setAttribute('fill', '#555555');
			edgeLabel.setAttribute('font-size', '9');
			edgeLabel.setAttribute('pointer-events', 'none');
			edgeLabel.textContent = this._edgeKindLabel(edge.kind);
			edgeGroup.appendChild(edgeLabel);
		}
		this.svgElement.appendChild(edgeGroup);

		// Nodes
		const nodeGroup = document.createElementNS(SVG_NS, 'g');
		for (const ln of this._layoutNodes) {
			const g = document.createElementNS(SVG_NS, 'g');
			g.style.cursor = 'pointer';

			const colour = NODE_KIND_COLOURS[ln.node.kind] ?? '#8B949E';

			// Outer circle
			const circle = document.createElementNS(SVG_NS, 'circle');
			circle.setAttribute('cx', String(ln.x));
			circle.setAttribute('cy', String(ln.y));
			circle.setAttribute('r', String(NODE_RADIUS));
			circle.setAttribute('fill', '#161616');
			circle.setAttribute('stroke', colour);
			circle.setAttribute('stroke-width', '2');
			g.appendChild(circle);

			// Label (truncated)
			const displayLabel = ln.node.label.length > 10
				? ln.node.label.substring(0, 8) + '\u2026'
				: ln.node.label;
			const label = document.createElementNS(SVG_NS, 'text');
			label.setAttribute('x', String(ln.x));
			label.setAttribute('y', String(ln.y - 2));
			label.setAttribute('text-anchor', 'middle');
			label.setAttribute('dominant-baseline', 'central');
			label.setAttribute('fill', '#E5E5E5');
			label.setAttribute('font-size', '10');
			label.setAttribute('pointer-events', 'none');
			label.textContent = displayLabel;
			g.appendChild(label);

			// Kind label below
			const kindLabel = document.createElementNS(SVG_NS, 'text');
			kindLabel.setAttribute('x', String(ln.x));
			kindLabel.setAttribute('y', String(ln.y + 12));
			kindLabel.setAttribute('text-anchor', 'middle');
			kindLabel.setAttribute('fill', colour);
			kindLabel.setAttribute('font-size', '8');
			kindLabel.setAttribute('pointer-events', 'none');
			kindLabel.textContent = ln.node.kind;
			g.appendChild(kindLabel);

			// Click handler
			const onClick = (): void => {
				this._showNodeDetail(ln.node);
			};
			g.addEventListener('click', onClick);
			this.viewDisposables.add({ dispose: () => g.removeEventListener('click', onClick) });

			nodeGroup.appendChild(g);
		}
		this.svgElement.appendChild(nodeGroup);

		this.graphArea.appendChild(this.svgElement);
	}

	private _edgeKindLabel(kind: MemoryEdgeKind): string {
		switch (kind) {
			case MemoryEdgeKind.Imports: return 'imports';
			case MemoryEdgeKind.Calls: return 'calls';
			case MemoryEdgeKind.Extends: return 'extends';
			case MemoryEdgeKind.Implements: return 'implements';
			case MemoryEdgeKind.DependsOn: return 'depends on';
			case MemoryEdgeKind.Contains: return 'contains';
			case MemoryEdgeKind.References: return 'references';
			case MemoryEdgeKind.RelatedTo: return 'related to';
			case MemoryEdgeKind.CausedBy: return 'caused by';
			default: return kind;
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (this.rootContainer) {
			this.rootContainer.style.height = `${height}px`;
			this.rootContainer.style.width = `${width}px`;
		}
	}

	override dispose(): void {
		if (this._animationFrame !== undefined) {
			cancelAnimationFrame(this._animationFrame);
		}
		super.dispose();
	}
}
