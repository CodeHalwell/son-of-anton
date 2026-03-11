/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	ITerminalBlock,
	ITerminalBlockMetadata,
	TerminalBlockKind,
	SOA_OSC_PREFIX,
	SOA_OSC_SUFFIX
} from '../common/terminalBlockTypes.js';

// --- Service Interface --------------------------------------------------------

export const ITerminalBlockService = createDecorator<ITerminalBlockService>('soaTerminalBlockService');

export interface ITerminalBlockService {
	readonly _serviceBrand: undefined;
	readonly onDidAddBlock: Event<ITerminalBlock>;
	readonly onDidUpdateBlock: Event<ITerminalBlock>;

	// Block management
	createBlock(terminalId: string, kind: TerminalBlockKind, command: string, metadata?: Partial<ITerminalBlockMetadata>): ITerminalBlock;
	completeBlock(blockId: string, output: string, exitCode: number): void;
	getBlock(blockId: string): ITerminalBlock | undefined;
	getBlocksForTerminal(terminalId: string): ITerminalBlock[];
	getAllBlocks(): ITerminalBlock[];

	// Agent attribution
	attachAgentMetadata(blockId: string, metadata: Partial<ITerminalBlockMetadata>): void;

	// Checkpoint integration
	markCheckpoint(terminalId: string, checkpointId: string): ITerminalBlock;

	// OSC parsing
	parseOscMetadata(data: string): ITerminalBlockMetadata | undefined;
}

// --- Mutable block record used internally ------------------------------------

interface MutableTerminalBlock {
	readonly id: string;
	readonly kind: TerminalBlockKind;
	readonly command: string;
	output: string;
	exitCode: number | undefined;
	readonly startedAt: number;
	endedAt: number | undefined;
	readonly workingDirectory: string;
	metadata: ITerminalBlockMetadata;
}

// --- Implementation -----------------------------------------------------------

export class TerminalBlockService extends Disposable implements ITerminalBlockService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddBlock = this._store.add(new Emitter<ITerminalBlock>());
	readonly onDidAddBlock = this._onDidAddBlock.event;

	private readonly _onDidUpdateBlock = this._store.add(new Emitter<ITerminalBlock>());
	readonly onDidUpdateBlock = this._onDidUpdateBlock.event;

	/** blockId -> block */
	private readonly _blocksById = new Map<string, MutableTerminalBlock>();

	/** terminalId -> ordered list of block IDs */
	private readonly _blocksByTerminal = new Map<string, string[]>();

	/** Monotonically increasing counter for block IDs. */
	private _nextBlockId = 1;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	// -- Block management ------------------------------------------------------

	createBlock(terminalId: string, kind: TerminalBlockKind, command: string, metadata?: Partial<ITerminalBlockMetadata>): ITerminalBlock {
		const id = `soa-block-${this._nextBlockId++}`;

		const block: MutableTerminalBlock = {
			id,
			kind,
			command,
			output: '',
			exitCode: undefined,
			startedAt: Date.now(),
			endedAt: undefined,
			workingDirectory: '',
			metadata: this._buildMetadata(metadata),
		};

		this._blocksById.set(id, block);

		let terminalBlocks = this._blocksByTerminal.get(terminalId);
		if (!terminalBlocks) {
			terminalBlocks = [];
			this._blocksByTerminal.set(terminalId, terminalBlocks);
		}
		terminalBlocks.push(id);

		this._logService.debug(`[TerminalBlockService] Created block ${id} (kind=${kind}) for terminal ${terminalId}`);
		this._onDidAddBlock.fire(block);

		return block;
	}

	completeBlock(blockId: string, output: string, exitCode: number): void {
		const block = this._blocksById.get(blockId);
		if (!block) {
			this._logService.warn(`[TerminalBlockService] completeBlock: unknown block ${blockId}`);
			return;
		}

		block.output = output;
		block.exitCode = exitCode;
		block.endedAt = Date.now();

		this._logService.debug(`[TerminalBlockService] Completed block ${blockId} (exitCode=${exitCode})`);
		this._onDidUpdateBlock.fire(block);
	}

	getBlock(blockId: string): ITerminalBlock | undefined {
		return this._blocksById.get(blockId);
	}

	getBlocksForTerminal(terminalId: string): ITerminalBlock[] {
		const ids = this._blocksByTerminal.get(terminalId);
		if (!ids) {
			return [];
		}

		const result: ITerminalBlock[] = [];
		for (const id of ids) {
			const block = this._blocksById.get(id);
			if (block) {
				result.push(block);
			}
		}
		return result;
	}

	getAllBlocks(): ITerminalBlock[] {
		return Array.from(this._blocksById.values());
	}

	// -- Agent attribution -----------------------------------------------------

	attachAgentMetadata(blockId: string, metadata: Partial<ITerminalBlockMetadata>): void {
		const block = this._blocksById.get(blockId);
		if (!block) {
			this._logService.warn(`[TerminalBlockService] attachAgentMetadata: unknown block ${blockId}`);
			return;
		}

		block.metadata = this._mergeMetadata(block.metadata, metadata);
		this._onDidUpdateBlock.fire(block);
	}

	// -- Checkpoint integration ------------------------------------------------

	markCheckpoint(terminalId: string, checkpointId: string): ITerminalBlock {
		return this.createBlock(terminalId, TerminalBlockKind.Checkpoint, '', {
			checkpointId,
		});
	}

	// -- OSC parsing -----------------------------------------------------------

	parseOscMetadata(data: string): ITerminalBlockMetadata | undefined {
		const prefixIdx = data.indexOf(SOA_OSC_PREFIX);
		if (prefixIdx === -1) {
			return undefined;
		}

		const jsonStart = prefixIdx + SOA_OSC_PREFIX.length;
		const suffixIdx = data.indexOf(SOA_OSC_SUFFIX, jsonStart);
		if (suffixIdx === -1) {
			this._logService.warn('[TerminalBlockService] parseOscMetadata: found prefix but no suffix');
			return undefined;
		}

		const jsonStr = data.substring(jsonStart, suffixIdx);

		try {
			const parsed: Record<string, unknown> = JSON.parse(jsonStr);
			return this._buildMetadata({
				agentId: typeof parsed['agentId'] === 'string' ? parsed['agentId'] : undefined,
				agentName: typeof parsed['agentName'] === 'string' ? parsed['agentName'] : undefined,
				modelUsed: typeof parsed['modelUsed'] === 'string' ? parsed['modelUsed'] : undefined,
				costUsd: typeof parsed['costUsd'] === 'number' ? parsed['costUsd'] : undefined,
				tokensIn: typeof parsed['tokensIn'] === 'number' ? parsed['tokensIn'] : undefined,
				tokensOut: typeof parsed['tokensOut'] === 'number' ? parsed['tokensOut'] : undefined,
				checkpointId: typeof parsed['checkpointId'] === 'string' ? parsed['checkpointId'] : undefined,
				buildResult: typeof parsed['buildResult'] === 'string' ? parsed['buildResult'] as ITerminalBlockMetadata['buildResult'] : undefined,
			});
		} catch (err) {
			this._logService.warn('[TerminalBlockService] parseOscMetadata: failed to parse JSON', jsonStr);
			return undefined;
		}
	}

	// -- Private helpers -------------------------------------------------------

	private _buildMetadata(partial?: Partial<ITerminalBlockMetadata>): ITerminalBlockMetadata {
		return {
			agentId: partial?.agentId ?? undefined,
			agentName: partial?.agentName ?? undefined,
			modelUsed: partial?.modelUsed ?? undefined,
			costUsd: partial?.costUsd ?? undefined,
			tokensIn: partial?.tokensIn ?? undefined,
			tokensOut: partial?.tokensOut ?? undefined,
			checkpointId: partial?.checkpointId ?? undefined,
			buildResult: partial?.buildResult ?? undefined,
		};
	}

	private _mergeMetadata(existing: ITerminalBlockMetadata, partial: Partial<ITerminalBlockMetadata>): ITerminalBlockMetadata {
		return {
			agentId: partial.agentId ?? existing.agentId,
			agentName: partial.agentName ?? existing.agentName,
			modelUsed: partial.modelUsed ?? existing.modelUsed,
			costUsd: partial.costUsd ?? existing.costUsd,
			tokensIn: partial.tokensIn ?? existing.tokensIn,
			tokensOut: partial.tokensOut ?? existing.tokensOut,
			checkpointId: partial.checkpointId ?? existing.checkpointId,
			buildResult: partial.buildResult ?? existing.buildResult,
		};
	}
}
