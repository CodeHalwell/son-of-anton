/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IAntonGenerationService,
	IGenerationChunk,
	IGenerationRequest,
	IGenerationResult,
} from '../common/antonChatGeneration.js';

/**
 * Generation service that routes through the Electron main process via IPC
 * to spawn the Claude Code CLI. This uses the CLI's own OAuth credentials,
 * so no separate API key is needed.
 */
export class AntonChatBrowserGeneration extends Disposable implements IAntonGenerationService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async generate(
		request: IGenerationRequest,
		onChunk: (chunk: IGenerationChunk) => void,
		token: CancellationToken,
	): Promise<IGenerationResult> {
		if (token.isCancellationRequested) {
			throw new Error('Generation cancelled');
		}

		this.logService.debug('[AntonGeneration] Sending prompt to claude CLI via IPC');

		try {
			const result = await ipcRenderer.invoke(
				'vscode:soaGenerateCli',
				request.prompt,
				request.model,
			) as { text: string; model: string; elapsedMs: number };

			// Deliver the full text as a single chunk
			onChunk({ text: result.text });

			this.logService.debug(`[AntonGeneration] Complete in ${result.elapsedMs}ms, ${result.text.length} chars`);

			return {
				fullText: result.text,
				model: result.model,
				elapsedMs: result.elapsedMs,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logService.error('[AntonGeneration] CLI generation failed', message);
			throw new Error(
				message.includes('Failed to start claude CLI')
					? 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'
					: message
			);
		}
	}
}
