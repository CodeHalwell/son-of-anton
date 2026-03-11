/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { IDagExplorerService } from './dagExplorerService.js';
import {
	IDagNode,
	IDagEdge,
	DagLayer,
	DAG_NODE_STATUS_COLOURS,
	DAG_NODE_KIND_COLOURS,
} from '../common/dagTypes.js';

export const DAG_EXPLORER_VIEW_ID = 'workbench.view.soaDagExplorer';

const CARD_BACKGROUND = '#161616';
const CARD_BORDER = '#2A2A2A';
const NODE_WIDTH = 140;
const NODE_HEIGHT = 40;
const LEVEL_GAP = 80;
const NODE_GAP = 20;

/**
 * DAG Explorer renders a dependency graph using inline SVG.
 * Supports 3-layer filtering, BFS impact analysis, and node click details.
 */
export class DagExplorerView extends ViewPane {

	static readonly ID = DAG_EXPLORER_VIEW_ID;

	private rootContainer!: HTMLElement;
	private toolbarContainer!: HTMLElement;
	private svgContainer!: HTMLElement;
	private detailPanel!: HTMLElement;
	private detailTitle!: HTMLElement;
	private detailBody!: HTMLElement;
	private placeholderContainer!: HTMLElement;
	private statsBar!: HTMLElement;
	private statNodes!: HTMLElement;
	private statEdges!: HTMLElement;
	private statLayer!: HTMLElement;

	private svgElement: SVGSVGElement | undefined;

	private _currentLayer: DagLayer = DagLayer.Module;
	private _impactMode = false;

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
		@IDagExplorerService private readonly dagExplorerService: IDagExplorerService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.rootContainer = append(container, $('div.soa-dag-explorer'));
		this.rootContainer.style.display = 'flex';
		this.rootContainer.style.flexDirection = 'column';
		this.rootContainer.style.height = '100%';
		this.rootContainer.style.overflow = 'hidden';
		this.rootContainer.style.background = '#0D0D0D';

		this._renderToolbar();
		this._renderGraphArea();
		this._renderDetailPanel();
		this._renderStatsBar();
		this._wireServiceEvents();
		this._renderGraph();
	}

	// ---- Toolbar ----

	private _renderToolbar(): void {
		this.toolbarContainer = append(this.rootContainer, $('div.soa-dag-toolbar'));
		this.toolbarContainer.style.display = 'flex';
		this.toolbarContainer.style.alignItems = 'center';
		this.toolbarContainer.style.gap = '8px';
		this.toolbarContainer.style.padding = '8px 12px';
		this.toolbarContainer.style.borderBottom = `1px solid ${CARD_BORDER}`;
		this.toolbarContainer.style.flexShrink = '0';
		this.toolbarContainer.style.background = '#111111';

		const label = append(this.toolbarContainer, $('span'));
		label.textContent = localize('dagExplorer.layer', "Layer:");
		label.style.fontSize = '11px';
		label.style.color = '#8B949E';

		const layerNames = [
			localize('dagExplorer.modules', "Modules"),
			localize('dagExplorer.files', "Files"),
			localize('dagExplorer.symbols', "Symbols"),
		];

		for (let i = 0; i < layerNames.length; i++) {
			const btn = append(this.toolbarContainer, $('button.soa-dag-layer-btn'));
			btn.textContent = layerNames[i];
			btn.style.padding = '4px 10px';
			btn.style.border = `1px solid ${CARD_BORDER}`;
			btn.style.borderRadius = '4px';
			btn.style.background = 'transparent';
			btn.style.color = '#8B949E';
			btn.style.fontSize = '11px';
			btn.style.cursor = 'pointer';
			btn.dataset.layer = String(i);

			if (i === this._currentLayer) {
				btn.style.borderColor = '#F5A623';
				btn.style.color = '#F5A623';
			}

			this.viewDisposables.add({ dispose: () => btn.removeEventListener('click', onClick) });
			const onClick = (): void => {
				this._currentLayer = i as DagLayer;
				this._updateToolbarActive();
				this._renderGraph();
			};
			btn.addEventListener('click', onClick);
		}

		// Separator
		const sep = append(this.toolbarContainer, $('div'));
		sep.style.width = '1px';
		sep.style.height = '20px';
		sep.style.background = CARD_BORDER;
		sep.style.margin = '0 4px';

		// Impact toggle
		const impactBtn = append(this.toolbarContainer, $('button.soa-dag-impact-btn'));
		impactBtn.textContent = localize('dagExplorer.impact', "Impact Radius");
		impactBtn.style.padding = '4px 10px';
		impactBtn.style.border = `1px solid ${CARD_BORDER}`;
		impactBtn.style.borderRadius = '4px';
		impactBtn.style.background = 'transparent';
		impactBtn.style.color = '#8B949E';
		impactBtn.style.fontSize = '11px';
		impactBtn.style.cursor = 'pointer';

		const onImpactClick = (): void => {
			this._impactMode = !this._impactMode;
			impactBtn.style.borderColor = this._impactMode ? '#B8860B' : CARD_BORDER;
			impactBtn.style.color = this._impactMode ? '#B8860B' : '#8B949E';
			if (!this._impactMode) {
				this.dagExplorerService.clearImpactHighlight();
			}
		};
		impactBtn.addEventListener('click', onImpactClick);
		this.viewDisposables.add({ dispose: () => impactBtn.removeEventListener('click', onImpactClick) });
	}

	private _updateToolbarActive(): void {
		const buttons = this.toolbarContainer.querySelectorAll('.soa-dag-layer-btn');
		for (const el of buttons) {
			const btn = el as HTMLElement;
			const isActive = btn.dataset.layer === String(this._currentLayer);
			btn.style.borderColor = isActive ? '#F5A623' : CARD_BORDER;
			btn.style.color = isActive ? '#F5A623' : '#8B949E';
		}
	}

	// ---- Graph area ----

	private _renderGraphArea(): void {
		this.svgContainer = append(this.rootContainer, $('div.soa-dag-graph'));
		this.svgContainer.style.flex = '1';
		this.svgContainer.style.overflow = 'auto';
		this.svgContainer.style.position = 'relative';

		// Placeholder
		this.placeholderContainer = append(this.svgContainer, $('div.soa-dag-placeholder'));
		this.placeholderContainer.style.display = 'flex';
		this.placeholderContainer.style.flexDirection = 'column';
		this.placeholderContainer.style.alignItems = 'center';
		this.placeholderContainer.style.justifyContent = 'center';
		this.placeholderContainer.style.height = '100%';
		this.placeholderContainer.style.color = '#8B949E';
		this.placeholderContainer.style.textAlign = 'center';
		this.placeholderContainer.style.padding = '48px';

		const icon = append(this.placeholderContainer, $('div'));
		icon.textContent = '\u26A1';
		icon.style.fontSize = '48px';
		icon.style.opacity = '0.3';
		icon.style.marginBottom = '16px';

		const title = append(this.placeholderContainer, $('div'));
		title.textContent = localize('dagExplorer.placeholder.title', "DAG Explorer");
		title.style.fontSize = '14px';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';

		const sub = append(this.placeholderContainer, $('div'));
		sub.textContent = localize('dagExplorer.placeholder.sub', "Start an agent session to populate the dependency graph.");
		sub.style.fontSize = '12px';
		sub.style.lineHeight = '1.4';
	}

	// ---- Detail panel ----

	private _renderDetailPanel(): void {
		this.detailPanel = append(this.svgContainer, $('div.soa-dag-detail'));
		this.detailPanel.style.position = 'absolute';
		this.detailPanel.style.top = '12px';
		this.detailPanel.style.right = '12px';
		this.detailPanel.style.width = '240px';
		this.detailPanel.style.background = CARD_BACKGROUND;
		this.detailPanel.style.border = `1px solid ${CARD_BORDER}`;
		this.detailPanel.style.borderRadius = '8px';
		this.detailPanel.style.padding = '12px';
		this.detailPanel.style.display = 'none';
		this.detailPanel.style.zIndex = '10';

		const closeBtn = append(this.detailPanel, $('button'));
		closeBtn.textContent = '\u2715';
		closeBtn.style.position = 'absolute';
		closeBtn.style.top = '8px';
		closeBtn.style.right = '8px';
		closeBtn.style.background = 'none';
		closeBtn.style.border = 'none';
		closeBtn.style.color = '#8B949E';
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.fontSize = '14px';

		const onClose = (): void => { this.detailPanel.style.display = 'none'; };
		closeBtn.addEventListener('click', onClose);
		this.viewDisposables.add({ dispose: () => closeBtn.removeEventListener('click', onClose) });

		this.detailTitle = append(this.detailPanel, $('div'));
		this.detailTitle.style.fontSize = '13px';
		this.detailTitle.style.fontWeight = '600';
		this.detailTitle.style.color = '#E5E5E5';
		this.detailTitle.style.marginBottom = '8px';

		this.detailBody = append(this.detailPanel, $('div'));
	}

	private _showNodeDetail(node: IDagNode): void {
		this.detailTitle.textContent = node.label;
		while (this.detailBody.firstChild) {
			this.detailBody.removeChild(this.detailBody.firstChild);
		}

		const layerNames = ['Modules', 'Files', 'Symbols'];
		const rows: Array<[string, string]> = [
			['Kind', node.kind],
			['Status', node.status],
			['Layer', layerNames[node.layer]],
		];

		if (node.filePath) {
			rows.push(['File', node.filePath.split('/').pop() ?? node.filePath]);
		}

		for (const [k, v] of Object.entries(node.metadata)) {
			rows.push([k, v]);
		}

		for (const [key, value] of rows) {
			const row = append(this.detailBody, $('div'));
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';
			row.style.fontSize = '11px';
			row.style.padding = '3px 0';

			const keyEl = append(row, $('span'));
			keyEl.textContent = key;
			keyEl.style.color = '#8B949E';

			const valEl = append(row, $('span'));
			valEl.textContent = value;
			valEl.style.color = '#E5E5E5';
		}

		this.detailPanel.style.display = 'block';
	}

	// ---- Stats bar ----

	private _renderStatsBar(): void {
		this.statsBar = append(this.rootContainer, $('div.soa-dag-stats'));
		this.statsBar.style.display = 'flex';
		this.statsBar.style.alignItems = 'center';
		this.statsBar.style.gap = '16px';
		this.statsBar.style.padding = '6px 12px';
		this.statsBar.style.borderTop = `1px solid ${CARD_BORDER}`;
		this.statsBar.style.background = '#111111';
		this.statsBar.style.fontSize = '11px';
		this.statsBar.style.color = '#8B949E';
		this.statsBar.style.flexShrink = '0';

		const nodesSpan = append(this.statsBar, $('span'));
		nodesSpan.textContent = 'Nodes: ';
		this.statNodes = append(nodesSpan, $('span'));
		this.statNodes.textContent = '0';
		this.statNodes.style.color = '#F5A623';
		this.statNodes.style.fontWeight = '500';

		const edgesSpan = append(this.statsBar, $('span'));
		edgesSpan.textContent = 'Edges: ';
		this.statEdges = append(edgesSpan, $('span'));
		this.statEdges.textContent = '0';
		this.statEdges.style.color = '#F5A623';
		this.statEdges.style.fontWeight = '500';

		const layerSpan = append(this.statsBar, $('span'));
		layerSpan.textContent = 'Layer: ';
		this.statLayer = append(layerSpan, $('span'));
		this.statLayer.textContent = 'Modules';
		this.statLayer.style.color = '#F5A623';
		this.statLayer.style.fontWeight = '500';
	}

	// ---- SVG rendering ----

	private _renderGraph(): void {
		const graph = this.dagExplorerService.graph;
		const layerNodes = graph.nodes.filter(n => n.layer === this._currentLayer);
		const nodeIds = new Set(layerNodes.map(n => n.id));
		const layerEdges = graph.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

		const layerNames = ['Modules', 'Files', 'Symbols'];
		this.statNodes.textContent = String(layerNodes.length);
		this.statEdges.textContent = String(layerEdges.length);
		this.statLayer.textContent = layerNames[this._currentLayer];

		if (layerNodes.length === 0) {
			this.placeholderContainer.style.display = 'flex';
			if (this.svgElement) {
				this.svgElement.style.display = 'none';
			}
			return;
		}

		this.placeholderContainer.style.display = 'none';
		this._layoutNodes(layerNodes, layerEdges);
		this._renderSvg(layerNodes, layerEdges);
	}

	private _layoutNodes(nodes: IDagNode[], edges: IDagEdge[]): void {
		const nodeMap = new Map(nodes.map(n => [n.id, n]));
		const inDegree = new Map<string, number>();
		const children = new Map<string, string[]>();

		for (const n of nodes) {
			inDegree.set(n.id, 0);
			children.set(n.id, []);
		}
		for (const e of edges) {
			if (nodeMap.has(e.sourceId) && nodeMap.has(e.targetId)) {
				inDegree.set(e.targetId, (inDegree.get(e.targetId) ?? 0) + 1);
				children.get(e.sourceId)!.push(e.targetId);
			}
		}

		// Topological sort
		const levels: string[][] = [];
		const assigned = new Set<string>();
		let frontier = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);

		while (frontier.length > 0) {
			levels.push([...frontier]);
			for (const id of frontier) {
				assigned.add(id);
			}
			const next: string[] = [];
			for (const id of frontier) {
				for (const child of (children.get(id) ?? [])) {
					if (!assigned.has(child)) {
						inDegree.set(child, (inDegree.get(child) ?? 1) - 1);
						if (inDegree.get(child) === 0) {
							next.push(child);
						}
					}
				}
			}
			frontier = next;
		}

		// Handle cycles
		const remaining = nodes.filter(n => !assigned.has(n.id));
		if (remaining.length > 0) {
			levels.push(remaining.map(n => n.id));
		}

		for (let y = 0; y < levels.length; y++) {
			const level = levels[y];
			const totalWidth = level.length * NODE_WIDTH + (level.length - 1) * NODE_GAP;
			const startX = Math.max(40, (600 - totalWidth) / 2);

			for (let x = 0; x < level.length; x++) {
				const node = nodeMap.get(level[x]);
				if (node) {
					node.x = startX + x * (NODE_WIDTH + NODE_GAP);
					node.y = 60 + y * (NODE_HEIGHT + LEVEL_GAP);
				}
			}
		}
	}

	private _renderSvg(nodes: IDagNode[], edges: IDagEdge[]): void {
		// Remove old SVG
		if (this.svgElement) {
			this.svgElement.remove();
		}

		const ns = 'http://www.w3.org/2000/svg';
		this.svgElement = document.createElementNS(ns, 'svg') as SVGSVGElement;

		// Calculate dimensions
		let maxX = 0;
		let maxY = 0;
		for (const n of nodes) {
			maxX = Math.max(maxX, n.x + NODE_WIDTH + 40);
			maxY = Math.max(maxY, n.y + NODE_HEIGHT + 40);
		}
		this.svgElement.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
		this.svgElement.style.width = '100%';
		this.svgElement.style.minWidth = `${maxX}px`;
		this.svgElement.style.minHeight = `${maxY}px`;

		// Arrow marker
		const defs = document.createElementNS(ns, 'defs');
		const marker = document.createElementNS(ns, 'marker');
		marker.setAttribute('id', 'arrowhead');
		marker.setAttribute('markerWidth', '8');
		marker.setAttribute('markerHeight', '6');
		marker.setAttribute('refX', '8');
		marker.setAttribute('refY', '3');
		marker.setAttribute('orient', 'auto');
		marker.setAttribute('markerUnits', 'strokeWidth');
		const polygon = document.createElementNS(ns, 'polygon');
		polygon.setAttribute('points', '0 0, 8 3, 0 6');
		polygon.setAttribute('fill', '#3A3A3A');
		marker.appendChild(polygon);
		defs.appendChild(marker);
		this.svgElement.appendChild(defs);

		// Edge group
		const edgeGroup = document.createElementNS(ns, 'g');
		const nodeMap = new Map(nodes.map(n => [n.id, n]));

		for (const edge of edges) {
			const src = nodeMap.get(edge.sourceId);
			const tgt = nodeMap.get(edge.targetId);
			if (!src || !tgt) {
				continue;
			}

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(src.x + NODE_WIDTH / 2));
			line.setAttribute('y1', String(src.y + NODE_HEIGHT));
			line.setAttribute('x2', String(tgt.x + NODE_WIDTH / 2));
			line.setAttribute('y2', String(tgt.y));
			line.setAttribute('stroke', '#2A2A2A');
			line.setAttribute('stroke-width', '1');
			line.setAttribute('marker-end', 'url(#arrowhead)');
			edgeGroup.appendChild(line);
		}
		this.svgElement.appendChild(edgeGroup);

		// Node group
		const nodeGroup = document.createElementNS(ns, 'g');
		for (const node of nodes) {
			const g = document.createElementNS(ns, 'g');
			g.style.cursor = 'pointer';

			// Background rect
			const rect = document.createElementNS(ns, 'rect');
			rect.setAttribute('x', String(node.x));
			rect.setAttribute('y', String(node.y));
			rect.setAttribute('width', String(NODE_WIDTH));
			rect.setAttribute('height', String(NODE_HEIGHT));
			rect.setAttribute('fill', CARD_BACKGROUND);
			rect.setAttribute('stroke', DAG_NODE_STATUS_COLOURS[node.status] ?? '#3A3A3A');
			rect.setAttribute('stroke-width', '1');
			rect.setAttribute('rx', '6');
			rect.setAttribute('ry', '6');
			g.appendChild(rect);

			// Kind indicator (left bar)
			const indicator = document.createElementNS(ns, 'rect');
			indicator.setAttribute('x', String(node.x));
			indicator.setAttribute('y', String(node.y));
			indicator.setAttribute('width', '4');
			indicator.setAttribute('height', String(NODE_HEIGHT));
			indicator.setAttribute('fill', DAG_NODE_KIND_COLOURS[node.kind] ?? '#8B949E');
			indicator.setAttribute('rx', '2');
			g.appendChild(indicator);

			// Label
			const label = document.createElementNS(ns, 'text');
			label.setAttribute('x', String(node.x + NODE_WIDTH / 2 + 2));
			label.setAttribute('y', String(node.y + NODE_HEIGHT / 2 - 2));
			label.setAttribute('text-anchor', 'middle');
			label.setAttribute('dominant-baseline', 'central');
			label.setAttribute('fill', '#E5E5E5');
			label.setAttribute('font-size', '11');
			label.setAttribute('pointer-events', 'none');
			const displayLabel = node.label.length > 18 ? node.label.substring(0, 16) + '\u2026' : node.label;
			label.textContent = displayLabel;
			g.appendChild(label);

			// Kind badge
			const badge = document.createElementNS(ns, 'text');
			badge.setAttribute('x', String(node.x + NODE_WIDTH / 2 + 2));
			badge.setAttribute('y', String(node.y + NODE_HEIGHT / 2 + 12));
			badge.setAttribute('text-anchor', 'middle');
			badge.setAttribute('fill', '#8B949E');
			badge.setAttribute('font-size', '9');
			badge.setAttribute('pointer-events', 'none');
			badge.textContent = node.kind;
			g.appendChild(badge);

			// Click handler
			const onClick = (): void => {
				this._showNodeDetail(node);
				if (this._impactMode) {
					this.dagExplorerService.highlightImpact(node.id);
				}
			};
			g.addEventListener('click', onClick);
			this.viewDisposables.add({ dispose: () => g.removeEventListener('click', onClick) });

			nodeGroup.appendChild(g);
		}
		this.svgElement.appendChild(nodeGroup);

		this.svgContainer.appendChild(this.svgElement);
	}

	// ---- Service events ----

	private _wireServiceEvents(): void {
		this.viewDisposables.add(this.dagExplorerService.onDidChangeGraph(() => {
			this._renderGraph();
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (this.rootContainer) {
			this.rootContainer.style.height = `${height}px`;
			this.rootContainer.style.width = `${width}px`;
		}
	}
}
