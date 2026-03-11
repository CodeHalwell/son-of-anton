/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAntonGenerationService = createDecorator<IAntonGenerationService>('soaAntonGenerationService');

export interface IGenerationRequest {
	readonly prompt: string;
	readonly systemPrompt?: string;
	readonly model?: string;
}

export interface IGenerationChunk {
	readonly text: string;
}

export interface IGenerationResult {
	readonly fullText: string;
	readonly model: string;
	readonly elapsedMs: number;
}

export interface IAntonGenerationService {
	readonly _serviceBrand: undefined;

	/**
	 * Generate a response using the configured LLM backend.
	 * Calls `onChunk` for each streamed piece of text.
	 * Returns the final result with metadata.
	 */
	generate(
		request: IGenerationRequest,
		onChunk: (chunk: IGenerationChunk) => void,
		token: CancellationToken,
	): Promise<IGenerationResult>;
}
