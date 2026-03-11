/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDagExplorerService } from '../../dagExplorer/browser/dagExplorerService.js';
import { DagNodeKind, DagNodeStatus, DagLayer } from '../../dagExplorer/common/dagTypes.js';
import { IAgUiMissionControlBridge, IAgUiRunEvent } from './aguiMissionControlBridge.js';

export const IAgUiDagBridge = createDecorator<IAgUiDagBridge>('soaAgUiDagBridge');

export interface IAgUiDagBridge {
	readonly _serviceBrand: undefined;

	/**
	 * Report that an AGUI agent modified a file. The bridge creates or
	 * highlights the corresponding DAG node and shows impact radius.
	 */
	reportFileModification(runId: string, filePath: string): void;
}

export class AgUiDagBridge extends Disposable implements IAgUiDagBridge {

	declare readonly _serviceBrand: undefined;

	/** Maps runId → set of file paths modified during that run. */
	private readonly _runModifiedFiles = new Map<string, Set<string>>();

	constructor(
		@IDagExplorerService private readonly dagExplorerService: IDagExplorerService,
		@IAgUiMissionControlBridge private readonly aguiBridge: IAgUiMissionControlBridge,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Listen for run lifecycle to manage impact highlighting
		this._register(this.aguiBridge.onDidReceiveRunEvent(event => {
			this._handleRunEvent(event);
		}));
	}

	reportFileModification(runId: string, filePath: string): void {
		let files = this._runModifiedFiles.get(runId);
		if (!files) {
			files = new Set();
			this._runModifiedFiles.set(runId, files);
		}
		files.add(filePath);

		// Find or create a DAG node for this file
		const existingNodes = this.dagExplorerService.getNodesAtLayer(DagLayer.File);
		let fileNode = existingNodes.find(n => n.filePath === filePath);

		if (!fileNode) {
			// Auto-create a file node in the DAG
			const fileName = filePath.split('/').pop() ?? filePath;
			fileNode = this.dagExplorerService.addNode(
				DagNodeKind.File,
				fileName,
				DagLayer.File,
				filePath,
				{ modifiedByRun: runId },
			);
		}

		// Mark active and show impact
		this.dagExplorerService.updateNodeStatus(fileNode.id, DagNodeStatus.Active);
		this.dagExplorerService.highlightImpact(fileNode.id, 2);

		this.logService.debug(`[AgUiDagBridge] File modified: ${filePath} by run ${runId}`);
	}

	private _handleRunEvent(event: IAgUiRunEvent): void {
		if (event.type === 'finished' || event.type === 'error') {
			// Clear impact highlighting and mark modified files as complete
			const files = this._runModifiedFiles.get(event.runId);
			if (files) {
				const allNodes = this.dagExplorerService.getNodesAtLayer(DagLayer.File);
				for (const node of allNodes) {
					if (node.filePath && files.has(node.filePath)) {
						const status = event.type === 'finished' ? DagNodeStatus.Complete : DagNodeStatus.Error;
						this.dagExplorerService.updateNodeStatus(node.id, status);
					}
				}
				this._runModifiedFiles.delete(event.runId);
			}

			this.dagExplorerService.clearImpactHighlight();
		}
	}
}
