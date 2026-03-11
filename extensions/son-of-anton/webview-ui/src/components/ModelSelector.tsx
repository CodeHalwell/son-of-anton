/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo, useCallback } from 'react';
import type { ModelId } from '../protocol/types';

interface ModelSelectorProps {
	currentModel: ModelId;
	provider: string;
	onSelect: (model: ModelId) => void;
}

const MODELS: { id: ModelId; label: string; description: string }[] = [
	{ id: 'opus', label: 'Opus', description: 'Complex reasoning' },
	{ id: 'sonnet', label: 'Sonnet', description: 'Balanced' },
	{ id: 'haiku', label: 'Haiku', description: 'Fast & light' },
];

/**
 * Model picker displayed in the chat header.
 * Shows current model + provider, click to cycle.
 */
export const ModelSelector = memo(function ModelSelector({ currentModel, provider, onSelect }: ModelSelectorProps) {
	const handleClick = useCallback(() => {
		const currentIndex = MODELS.findIndex(m => m.id === currentModel);
		const nextIndex = (currentIndex + 1) % MODELS.length;
		onSelect(MODELS[nextIndex].id);
	}, [currentModel, onSelect]);

	const current = MODELS.find(m => m.id === currentModel) ?? MODELS[1];

	return (
		<button
			className="model-selector"
			onClick={handleClick}
			title={`${current.label} (${current.description}) via ${provider}\nClick to cycle models`}
		>
			<span className="model-selector-name">{current.label}</span>
			<span className="model-selector-provider">{provider}</span>
		</button>
	);
});
