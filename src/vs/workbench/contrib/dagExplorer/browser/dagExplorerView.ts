/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dagExplorer.css';
import { $, append } from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { DagLayerKind, DagNodeStatus, IDagNode, IDagEdge } from '../common/dagTypes.js';
import { IDagExplorerService } from './dagExplorerService.js';

// --- Constants ---

export const DAG_EXPLORER_VIEW_ID = 'workbench.view.sessions.dagExplorer';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 52;
const NODE_PADDING_X = 50;
const NODE_PADDING_Y = 40;
const NODE_BORDER_RADIUS = 8;
const COLUMNS = 4;

const COLOR = {
	canvasBg: '#0A0A0A',
	gridLine: '#1A1A1A',
	nodeFill: '#141414',
	nodeStroke: '#2A2A2A',
	nodeStrokeHover: '#3A3A3A',
	edgeDefault: '#2A2A2A',
	edgeHighlight: '#F5A623',
	selectedBorder: '#F5A623',
	selectedGlow: 'rgba(245, 166, 35, 0.3)',
	impactFill: 'rgba(245, 166, 35, 0.15)',
	textPrimary: '#E8E8E8',
	textSecondary: '#888888',
	textMuted: '#555555',
	statusActive: '#4EC9B0',
	statusError: '#F44747',
	statusImpacted: '#F5A623',
	statusOrphaned: '#555555',
	gold: '#F5A623',
} as const;

const ORPHAN_OPACITY = 0.35;

// --- Helpers ---

interface IRenderedNode {
	readonly node: IDagNode;
	readonly x: number;
	readonly y: number;
}

function computeGridLayout(nodes: IDagNode[]): IRenderedNode[] {
	return nodes.map((node, index) => {
		const col = index % COLUMNS;
		const row = Math.floor(index / COLUMNS);
		return {
			node,
			x: col * (NODE_WIDTH + NODE_PADDING_X) + NODE_PADDING_X,
			y: row * (NODE_HEIGHT + NODE_PADDING_Y) + NODE_PADDING_Y + 10,
		};
	});
}

function nodeHasNoEdges(node: IDagNode, edges: IDagEdge[]): boolean {
	return !edges.some(e => e.source === node.id || e.target === node.id);
}

function getStatusColor(status: DagNodeStatus): string | undefined {
	switch (status) {
		case DagNodeStatus.Active: return COLOR.statusActive;
		case DagNodeStatus.Error: return COLOR.statusError;
		case DagNodeStatus.Impacted: return COLOR.statusImpacted;
		case DagNodeStatus.Orphaned: return COLOR.statusOrphaned;
		default: return undefined;
	}
}

function getStatusLabel(status: DagNodeStatus): string {
	switch (status) {
		case DagNodeStatus.Active: return localize('dag.status.active', "Active");
		case DagNodeStatus.Error: return localize('dag.status.error', "Error");
		case DagNodeStatus.Impacted: return localize('dag.status.impacted', "Impacted");
		case DagNodeStatus.Orphaned: return localize('dag.status.orphaned', "Orphaned");
		case DagNodeStatus.Idle: return localize('dag.status.idle', "Idle");
		default: return status;
	}
}

// --- SVG utilities ---

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string>): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		for (const [key, value] of Object.entries(attrs)) {
			el.setAttribute(key, value);
		}
	}
	return el;
}

// --- View ---

export class DagExplorerView extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private svgContainer: HTMLElement | undefined;
	private detailPanel: HTMLElement | undefined;
	private toolbarContainer: HTMLElement | undefined;
	private placeholderContainer: HTMLElement | undefined;
	private legendContainer: HTMLElement | undefined;

	private selectedNodeId: string | undefined;
	private activeLayer: DagLayerKind = DagLayerKind.Dependency;
	private impactNodeIds: Set<string> = new Set();

	private readonly renderDisposables = this._register(new DisposableStore());

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

		this.bodyContainer = append(container, $('div.dag-explorer-body'));

		// Toolbar
		this.toolbarContainer = append(this.bodyContainer, $('div.dag-toolbar'));
		this.renderToolbar();

		// Main content area (SVG + detail panel side by side)
		const contentArea = append(this.bodyContainer, $('div'));
		contentArea.style.display = 'flex';
		contentArea.style.flex = '1';
		contentArea.style.overflow = 'hidden';

		// Placeholder (shown when no data)
		this.placeholderContainer = append(contentArea, $('div.dag-placeholder'));
		this.renderPlaceholder();

		// SVG container
		this.svgContainer = append(contentArea, $('div.dag-svg-container'));

		// Detail panel
		this.detailPanel = append(contentArea, $('div.dag-detail-panel'));
		this.detailPanel.style.display = 'none';

		// Legend bar
		this.legendContainer = append(this.bodyContainer, $('div.dag-legend'));
		this.renderLegend();

		// Listen for changes
		this.renderDisposables.add(this.dagExplorerService.onDidChangeGraph(() => this.renderGraph()));
		this.renderDisposables.add(this.dagExplorerService.onDidChangeSelection(nodeId => {
			this.selectedNodeId = nodeId;
			this.renderGraph();
			if (nodeId) {
				const node = this.dagExplorerService.getNode(nodeId);
				if (node) {
					this.showNodeDetails(node);
				}
			} else if (this.detailPanel) {
				this.detailPanel.style.display = 'none';
			}
		}));

		this.renderGraph();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.bodyContainer) {
			this.bodyContainer.style.height = `${height}px`;
			this.bodyContainer.style.width = `${width}px`;
		}
	}

	// --- Placeholder ---

	private renderPlaceholder(): void {
		if (!this.placeholderContainer) {
			return;
		}

		// Icon
		const iconBox = append(this.placeholderContainer, $('div.dag-placeholder-icon'));
		const iconSvg = svgEl('svg', { width: '32', height: '32', viewBox: '0 0 24 24', fill: 'none' });
		const path = svgEl('path', {
			d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
			stroke: COLOR.textMuted,
			'stroke-width': '1.5',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
		});
		iconSvg.appendChild(path);
		iconBox.appendChild(iconSvg);

		// Title
		const title = append(this.placeholderContainer, $('h3.dag-placeholder-title'));
		title.textContent = localize('dag.placeholder.title', "No Graph Data");

		// Description
		const desc = append(this.placeholderContainer, $('p.dag-placeholder-desc'));
		desc.textContent = localize('dag.placeholder.desc', "The code graph will appear here once the indexer has analysed your workspace. Switch between Dependency, Task, and Impact layers using the toolbar above.");

		// Hints
		const hints = append(this.placeholderContainer, $('div.dag-placeholder-hints'));

		const hintItems = [
			localize('dag.hint.dependency', "Dependency layer shows module imports and file relationships"),
			localize('dag.hint.task', "Task layer visualises agent task decomposition and dependencies"),
			localize('dag.hint.impact', "Impact layer highlights files affected by a change"),
		];

		for (const text of hintItems) {
			const hint = append(hints, $('div.dag-placeholder-hint'));
			append(hint, $('div.dag-placeholder-hint-dot'));
			const label = append(hint, $('span'));
			label.textContent = text;
		}
	}

	// --- Toolbar ---

	private renderToolbar(): void {
		if (!this.toolbarContainer) {
			return;
		}
		this.toolbarContainer.textContent = '';

		// Label
		const label = append(this.toolbarContainer, $('span.dag-toolbar-label'));
		label.textContent = localize('dag.toolbar.layer', "Layer");

		// Layer buttons
		const layers: { kind: DagLayerKind; label: string }[] = [
			{ kind: DagLayerKind.Dependency, label: localize('dag.layer.dependency', "Dependency") },
			{ kind: DagLayerKind.Task, label: localize('dag.layer.task', "Task") },
			{ kind: DagLayerKind.Impact, label: localize('dag.layer.impact', "Impact") },
		];

		for (const layer of layers) {
			const button = append(this.toolbarContainer, $('button.dag-toolbar-button'));
			button.textContent = layer.label;
			button.classList.toggle('dag-toolbar-button-active', layer.kind === this.activeLayer);

			const onClick = () => {
				this.activeLayer = layer.kind;
				this.dagExplorerService.setViewState({ activeLayer: layer.kind });
				this.renderToolbar();
				this.renderGraph();
			};
			button.addEventListener('click', onClick);
			this.renderDisposables.add({ dispose: () => button.removeEventListener('click', onClick) });
		}

		// Separator
		append(this.toolbarContainer, $('div.dag-toolbar-separator'));

		// Stats
		const stats = append(this.toolbarContainer, $('div.dag-toolbar-stats'));
		const graphData = this.dagExplorerService.getGraph(this.activeLayer);
		if (graphData) {
			const nodesStat = append(stats, $('div.dag-toolbar-stat'));
			const nodesLabel = append(nodesStat, $('span'));
			nodesLabel.textContent = localize('dag.stat.nodes', "Nodes");
			const nodesValue = append(nodesStat, $('span.dag-toolbar-stat-value'));
			nodesValue.textContent = String(graphData.nodes.length);

			const edgesStat = append(stats, $('div.dag-toolbar-stat'));
			const edgesLabel = append(edgesStat, $('span'));
			edgesLabel.textContent = localize('dag.stat.edges', "Edges");
			const edgesValue = append(edgesStat, $('span.dag-toolbar-stat-value'));
			edgesValue.textContent = String(graphData.edges.length);
		}
	}

	// --- Legend ---

	private renderLegend(): void {
		if (!this.legendContainer) {
			return;
		}

		const items: { label: string; color: string }[] = [
			{ label: localize('dag.legend.active', "Active"), color: COLOR.statusActive },
			{ label: localize('dag.legend.error', "Error"), color: COLOR.statusError },
			{ label: localize('dag.legend.impacted', "Impacted"), color: COLOR.statusImpacted },
			{ label: localize('dag.legend.orphaned', "Orphaned"), color: COLOR.statusOrphaned },
		];

		for (const item of items) {
			const el = append(this.legendContainer, $('div.dag-legend-item'));
			const swatch = append(el, $('div.dag-legend-swatch'));
			swatch.style.backgroundColor = item.color;
			const label = append(el, $('span'));
			label.textContent = item.label;
		}

		// Edge legend
		const edgeLegend = append(this.legendContainer, $('div.dag-legend-item'));
		const edgeLine = append(edgeLegend, $('div.dag-legend-line'));
		edgeLine.style.backgroundColor = COLOR.edgeHighlight;
		const edgeLabel = append(edgeLegend, $('span'));
		edgeLabel.textContent = localize('dag.legend.selected', "Selected edge");
	}

	// --- Graph rendering ---

	private renderGraph(): void {
		if (!this.svgContainer || !this.placeholderContainer || !this.detailPanel) {
			return;
		}

		const graphData = this.dagExplorerService.getGraph(this.activeLayer);

		if (!graphData || graphData.nodes.length === 0) {
			this.svgContainer.style.display = 'none';
			this.detailPanel.style.display = 'none';
			this.placeholderContainer.style.display = '';
			this.renderToolbar();
			return;
		}

		this.placeholderContainer.style.display = 'none';
		this.svgContainer.style.display = '';
		this.svgContainer.textContent = '';
		this.renderToolbar();

		const nodes = graphData.nodes;
		const edges = graphData.edges;
		const layout = computeGridLayout(nodes);

		// SVG dimensions
		const maxCol = Math.min(nodes.length, COLUMNS);
		const maxRow = Math.ceil(nodes.length / COLUMNS);
		const svgWidth = Math.max(maxCol * (NODE_WIDTH + NODE_PADDING_X) + NODE_PADDING_X, 600);
		const svgHeight = Math.max(maxRow * (NODE_HEIGHT + NODE_PADDING_Y) + NODE_PADDING_Y + 20, 400);

		const svg = svgEl('svg', {
			width: String(svgWidth),
			height: String(svgHeight),
			class: 'dag-graph-svg',
		});

		// --- Defs (filters, markers, patterns) ---
		const defs = svgEl('defs');

		// Glow filter for selected nodes
		const glowFilter = svgEl('filter', { id: 'dag-glow', x: '-25%', y: '-25%', width: '150%', height: '150%' });
		const feFlood = svgEl('feFlood', { 'flood-color': COLOR.selectedGlow, result: 'glowColor' });
		glowFilter.appendChild(feFlood);
		const feComposite = svgEl('feComposite', { in: 'glowColor', in2: 'SourceGraphic', operator: 'in', result: 'coloredGlow' });
		glowFilter.appendChild(feComposite);
		const feGaussian = svgEl('feGaussianBlur', { in: 'coloredGlow', stdDeviation: '4', result: 'blur' });
		glowFilter.appendChild(feGaussian);
		const feMerge = svgEl('feMerge');
		const feMergeNode1 = svgEl('feMergeNode', { in: 'blur' });
		feMerge.appendChild(feMergeNode1);
		const feMergeNode2 = svgEl('feMergeNode', { in: 'SourceGraphic' });
		feMerge.appendChild(feMergeNode2);
		glowFilter.appendChild(feMerge);
		defs.appendChild(glowFilter);

		// Drop shadow for nodes
		const shadowFilter = svgEl('filter', { id: 'dag-shadow', x: '-10%', y: '-10%', width: '120%', height: '130%' });
		const feShadowOffset = svgEl('feOffset', { in: 'SourceAlpha', dx: '0', dy: '2', result: 'offsetAlpha' });
		shadowFilter.appendChild(feShadowOffset);
		const feShadowBlur = svgEl('feGaussianBlur', { in: 'offsetAlpha', stdDeviation: '3', result: 'blurAlpha' });
		shadowFilter.appendChild(feShadowBlur);
		const feShadowFlood = svgEl('feFlood', { 'flood-color': 'rgba(0,0,0,0.4)', result: 'shadowColor' });
		shadowFilter.appendChild(feShadowFlood);
		const feShadowComposite = svgEl('feComposite', { in: 'shadowColor', in2: 'blurAlpha', operator: 'in', result: 'shadow' });
		shadowFilter.appendChild(feShadowComposite);
		const feShadowMerge = svgEl('feMerge');
		feShadowMerge.appendChild(svgEl('feMergeNode', { in: 'shadow' }));
		feShadowMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
		shadowFilter.appendChild(feShadowMerge);
		defs.appendChild(shadowFilter);

		// Arrow marker for edges
		const marker = svgEl('marker', {
			id: 'dag-arrow',
			viewBox: '0 0 10 10',
			refX: '8',
			refY: '5',
			markerWidth: '6',
			markerHeight: '6',
			orient: 'auto-start-reverse',
		});
		const arrowPath = svgEl('path', {
			d: 'M 0 0 L 10 5 L 0 10 z',
			fill: COLOR.edgeDefault,
			class: 'dag-edge-arrow',
		});
		marker.appendChild(arrowPath);
		defs.appendChild(marker);

		// Highlighted arrow marker
		const markerHl = svgEl('marker', {
			id: 'dag-arrow-hl',
			viewBox: '0 0 10 10',
			refX: '8',
			refY: '5',
			markerWidth: '6',
			markerHeight: '6',
			orient: 'auto-start-reverse',
		});
		const arrowPathHl = svgEl('path', {
			d: 'M 0 0 L 10 5 L 0 10 z',
			fill: COLOR.edgeHighlight,
			class: 'dag-edge-arrow',
		});
		markerHl.appendChild(arrowPathHl);
		defs.appendChild(markerHl);

		// Grid pattern
		const gridSize = 20;
		const gridPattern = svgEl('pattern', {
			id: 'dag-grid',
			width: String(gridSize),
			height: String(gridSize),
			patternUnits: 'userSpaceOnUse',
		});
		const gridPath = svgEl('path', {
			d: `M ${gridSize} 0 L 0 0 0 ${gridSize}`,
			fill: 'none',
			stroke: COLOR.gridLine,
			'stroke-width': '0.5',
		});
		gridPattern.appendChild(gridPath);
		defs.appendChild(gridPattern);

		svg.appendChild(defs);

		// Grid background
		const gridBg = svgEl('rect', {
			width: String(svgWidth),
			height: String(svgHeight),
			fill: `url(#dag-grid)`,
		});
		svg.appendChild(gridBg);

		// Build node position lookup
		const nodePositions = new Map<string, IRenderedNode>();
		for (const item of layout) {
			nodePositions.set(item.node.id, item);
		}

		// --- Render edges ---
		for (const edge of edges) {
			const sourcePos = nodePositions.get(edge.source);
			const targetPos = nodePositions.get(edge.target);
			if (!sourcePos || !targetPos) {
				continue;
			}

			const isHighlighted = edge.highlighted ||
				(this.selectedNodeId !== undefined &&
					(edge.source === this.selectedNodeId || edge.target === this.selectedNodeId));

			// Use curved paths for a more professional look
			const x1 = sourcePos.x + NODE_WIDTH / 2;
			const y1 = sourcePos.y + NODE_HEIGHT;
			const x2 = targetPos.x + NODE_WIDTH / 2;
			const y2 = targetPos.y;

			const midY = (y1 + y2) / 2;
			const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

			const path = svgEl('path', {
				d: pathD,
				fill: 'none',
				stroke: isHighlighted ? COLOR.edgeHighlight : COLOR.edgeDefault,
				'stroke-width': isHighlighted ? '2' : '1',
				'marker-end': isHighlighted ? 'url(#dag-arrow-hl)' : 'url(#dag-arrow)',
				class: 'dag-edge',
			});

			svg.appendChild(path);
		}

		// --- Render nodes ---
		for (const item of layout) {
			const group = svgEl('g', { class: 'dag-node-group' });

			const orphaned = item.node.status === DagNodeStatus.Orphaned || nodeHasNoEdges(item.node, edges);
			if (orphaned) {
				group.setAttribute('opacity', String(ORPHAN_OPACITY));
			}

			const isSelected = item.node.id === this.selectedNodeId;
			const isImpacted = this.impactNodeIds.has(item.node.id);

			// Node rectangle
			const rect = svgEl('rect', {
				x: String(item.x),
				y: String(item.y),
				width: String(NODE_WIDTH),
				height: String(NODE_HEIGHT),
				rx: String(NODE_BORDER_RADIUS),
				ry: String(NODE_BORDER_RADIUS),
				class: 'dag-node-rect',
				fill: isImpacted && this.activeLayer === DagLayerKind.Impact ? COLOR.impactFill : COLOR.nodeFill,
				stroke: isSelected ? COLOR.selectedBorder : COLOR.nodeStroke,
				'stroke-width': isSelected ? '2' : '1',
			});

			if (isSelected) {
				rect.setAttribute('filter', 'url(#dag-glow)');
			} else {
				rect.setAttribute('filter', 'url(#dag-shadow)');
			}

			group.appendChild(rect);

			// Node label (truncated)
			const labelText = item.node.label.length > 20 ? item.node.label.substring(0, 18) + '\u2026' : item.node.label;
			const text = svgEl('text', {
				x: String(item.x + 12),
				y: String(item.y + NODE_HEIGHT / 2 - 2),
				'text-anchor': 'start',
				'dominant-baseline': 'middle',
				class: 'dag-node-label',
				fill: isSelected ? COLOR.gold : COLOR.textPrimary,
				'font-size': '12',
				'font-weight': isSelected ? '600' : '500',
			});
			text.textContent = labelText;
			group.appendChild(text);

			// Sublabel (file path or kind)
			if (item.node.filePath || item.node.kind) {
				const sublabelText = item.node.filePath
					? item.node.filePath.split('/').pop() ?? ''
					: item.node.kind;
				const truncatedSub = sublabelText.length > 24 ? sublabelText.substring(0, 22) + '\u2026' : sublabelText;

				const sublabel = svgEl('text', {
					x: String(item.x + 12),
					y: String(item.y + NODE_HEIGHT / 2 + 12),
					'text-anchor': 'start',
					'dominant-baseline': 'middle',
					class: 'dag-node-sublabel',
					fill: COLOR.textMuted,
					'font-size': '10',
				});
				sublabel.textContent = truncatedSub;
				group.appendChild(sublabel);
			}

			// Status indicator (top-right)
			if (item.node.status !== DagNodeStatus.Idle) {
				const statusColor = getStatusColor(item.node.status);
				if (statusColor) {
					const indicator = svgEl('circle', {
						cx: String(item.x + NODE_WIDTH - 12),
						cy: String(item.y + 12),
						r: '4',
						class: 'dag-node-status',
						fill: statusColor,
					});

					// Add a subtle ring around the status dot
					const ring = svgEl('circle', {
						cx: String(item.x + NODE_WIDTH - 12),
						cy: String(item.y + 12),
						r: '6',
						fill: 'none',
						stroke: statusColor,
						'stroke-width': '1',
						opacity: '0.3',
					});
					group.appendChild(ring);
					group.appendChild(indicator);
				}
			}

			// Click handler
			const onNodeClick = () => {
				this.dagExplorerService.selectNode(item.node.id);
				this.updateImpactOverlay(item.node);
				this.renderGraph();
				this.showNodeDetails(item.node);
			};
			group.addEventListener('click', onNodeClick);
			this.renderDisposables.add({ dispose: () => group.removeEventListener('click', onNodeClick) });

			svg.appendChild(group);
		}

		this.svgContainer.appendChild(svg);
	}

	// --- Impact overlay ---

	private updateImpactOverlay(selectedNode: IDagNode): void {
		this.impactNodeIds.clear();
		if (this.activeLayer !== DagLayerKind.Impact) {
			return;
		}
		const impact = this.dagExplorerService.computeImpact(selectedNode.id);
		this.impactNodeIds = new Set(impact.impactedNodeIds);
	}

	// --- Detail panel ---

	private showNodeDetails(node: IDagNode): void {
		if (!this.detailPanel) {
			return;
		}

		this.detailPanel.style.display = '';
		this.detailPanel.textContent = '';

		// Header bar
		const headerBar = append(this.detailPanel, $('div.dag-detail-header-bar'));
		const headerTitle = append(headerBar, $('div.dag-detail-header'));
		headerTitle.textContent = node.label;

		const closeBtn = append(headerBar, $('button.dag-detail-close'));
		closeBtn.textContent = '\u2715';
		closeBtn.title = localize('dag.detail.close', "Close");
		const onClose = () => {
			this.dagExplorerService.selectNode(undefined);
			this.impactNodeIds.clear();
			this.detailPanel!.style.display = 'none';
			this.renderGraph();
		};
		closeBtn.addEventListener('click', onClose);
		this.renderDisposables.add({ dispose: () => closeBtn.removeEventListener('click', onClose) });

		// Properties section
		const propsSection = append(this.detailPanel, $('div.dag-detail-section'));
		const propsSectionTitle = append(propsSection, $('div.dag-detail-section-title'));
		propsSectionTitle.textContent = localize('dag.detail.properties', "Properties");

		// Status
		const statusRow = append(propsSection, $('div.dag-detail-row'));
		const statusLabel = append(statusRow, $('span.dag-detail-label'));
		statusLabel.textContent = localize('dag.detail.status', "Status");
		const statusBadge = append(statusRow, $('span.dag-detail-status-badge'));
		const statusColor = getStatusColor(node.status);
		if (statusColor) {
			const statusDot = append(statusBadge, $('span.dag-detail-status-dot'));
			statusDot.style.backgroundColor = statusColor;
		}
		const statusText = append(statusBadge, $('span'));
		statusText.textContent = getStatusLabel(node.status);

		// ID
		this.addDetailRow(propsSection, localize('dag.detail.id', "ID"), node.id);

		// Layer
		this.addDetailRow(propsSection, localize('dag.detail.layer', "Layer"), node.kind);

		// File path
		if (node.filePath) {
			this.addDetailRow(propsSection, localize('dag.detail.file', "File"), node.filePath);
		}

		// Module
		if (node.moduleId) {
			this.addDetailRow(propsSection, localize('dag.detail.module', "Module"), node.moduleId);
		}

		// Metadata section
		const metadataKeys = Object.keys(node.metadata);
		if (metadataKeys.length > 0) {
			const metaSection = append(this.detailPanel, $('div.dag-detail-section'));
			const metaSectionTitle = append(metaSection, $('div.dag-detail-section-title'));
			metaSectionTitle.textContent = localize('dag.detail.metadata', "Metadata");

			const metaGrid = append(metaSection, $('div.dag-detail-meta-grid'));
			for (const key of metadataKeys) {
				const keyEl = append(metaGrid, $('span.dag-detail-meta-key'));
				keyEl.textContent = key;
				const valueEl = append(metaGrid, $('span.dag-detail-meta-value'));
				valueEl.textContent = String(node.metadata[key]);
			}
		}

		// Dependencies section
		const deps = this.dagExplorerService.getDependencies(node.id);
		if (deps.length > 0) {
			const depsSection = append(this.detailPanel, $('div.dag-detail-section'));
			const depsSectionTitle = append(depsSection, $('div.dag-detail-section-title'));
			depsSectionTitle.textContent = localize('dag.detail.dependencies', "Dependencies ({0})", deps.length);

			const depList = append(depsSection, $('div.dag-detail-dep-list'));
			for (const dep of deps) {
				const depItem = append(depList, $('div.dag-detail-dep-item'));
				const arrow = append(depItem, $('span.dag-detail-dep-arrow'));
				arrow.textContent = '\u2192';
				const depName = append(depItem, $('span'));
				depName.textContent = dep.label;

				const onDepClick = () => {
					this.dagExplorerService.selectNode(dep.id);
					this.renderGraph();
					this.showNodeDetails(dep);
				};
				depItem.addEventListener('click', onDepClick);
				this.renderDisposables.add({ dispose: () => depItem.removeEventListener('click', onDepClick) });
			}
		}

		// Dependents section
		const dependents = this.dagExplorerService.getDependents(node.id);
		if (dependents.length > 0) {
			const dependentsSection = append(this.detailPanel, $('div.dag-detail-section'));
			const dependentsSectionTitle = append(dependentsSection, $('div.dag-detail-section-title'));
			dependentsSectionTitle.textContent = localize('dag.detail.dependents', "Dependents ({0})", dependents.length);

			const depList = append(dependentsSection, $('div.dag-detail-dep-list'));
			for (const dep of dependents) {
				const depItem = append(depList, $('div.dag-detail-dep-item'));
				const arrow = append(depItem, $('span.dag-detail-dep-arrow'));
				arrow.textContent = '\u2190';
				const depName = append(depItem, $('span'));
				depName.textContent = dep.label;

				const onDepClick = () => {
					this.dagExplorerService.selectNode(dep.id);
					this.renderGraph();
					this.showNodeDetails(dep);
				};
				depItem.addEventListener('click', onDepClick);
				this.renderDisposables.add({ dispose: () => depItem.removeEventListener('click', onDepClick) });
			}
		}
	}

	private addDetailRow(parent: HTMLElement, label: string, value: string): void {
		const row = append(parent, $('div.dag-detail-row'));
		const labelEl = append(row, $('span.dag-detail-label'));
		labelEl.textContent = label;
		const valueEl = append(row, $('span.dag-detail-value'));
		valueEl.textContent = value;
		valueEl.title = value;
	}
}
