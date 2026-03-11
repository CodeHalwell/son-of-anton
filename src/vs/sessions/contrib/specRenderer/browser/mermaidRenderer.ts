/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';

/** CSS colour constants — matching the Son of Anton dark theme. */
const CARD_BACKGROUND = '#161616';
const CARD_BORDER = '#2A2A2A';
const MERMAID_HEADER_COLOUR = '#C8962A';
const CODE_TEXT_COLOUR = '#D4D4D4';
const CODE_BACKGROUND = '#1A1A1A';
const LINE_NUMBER_COLOUR = '#4A4A4A';

/**
 * Represents a detected Mermaid code block within markdown text.
 */
export interface IMermaidBlock {
	/** The raw Mermaid diagram source code (without the fence markers). */
	readonly source: string;
	/** The byte offset of the opening fence in the original markdown. */
	readonly startOffset: number;
	/** The byte offset after the closing fence in the original markdown. */
	readonly endOffset: number;
}

/**
 * Regular expression to detect fenced Mermaid code blocks in markdown.
 *
 * Matches:
 * ```mermaid
 * <content>
 * ```
 */
const MERMAID_FENCE_PATTERN = /```mermaid\s*\n(?<content>[\s\S]*?)```/g;

/**
 * Detect all ```mermaid code blocks in the given markdown text.
 *
 * @param markdown — raw markdown text
 * @returns an array of detected Mermaid blocks with their source and offsets
 */
export function detectMermaidBlocks(markdown: string): IMermaidBlock[] {
	const blocks: IMermaidBlock[] = [];
	const pattern = new RegExp(MERMAID_FENCE_PATTERN.source, MERMAID_FENCE_PATTERN.flags);

	let match: RegExpMatchArray | null;
	while ((match = pattern.exec(markdown)) !== null) {
		const content = match.groups?.['content'];
		if (content !== undefined && match.index !== undefined) {
			blocks.push({
				source: content.trim(),
				startOffset: match.index,
				endOffset: match.index + match[0].length,
			});
		}
	}

	return blocks;
}

/**
 * Render a Mermaid diagram block as a styled code card.
 *
 * For now, this renders the Mermaid source as a syntax-highlighted code card
 * with a "Mermaid Diagram" header. Actual SVG rendering via mermaid.js will
 * be added in a future iteration.
 *
 * @param container — the parent DOM element to append the card into
 * @param block — the Mermaid block to render
 * @returns the created card element
 */
export function renderMermaidCard(container: HTMLElement, block: IMermaidBlock): HTMLElement {
	const card = append(container, $('.spec-renderer-mermaid-card'));
	card.style.backgroundColor = CARD_BACKGROUND;
	card.style.border = `1px solid ${CARD_BORDER}`;
	card.style.borderRadius = '6px';
	card.style.overflow = 'hidden';

	// ---- Header bar ----
	const header = append(card, $('.spec-renderer-mermaid-header'));
	header.style.display = 'flex';
	header.style.alignItems = 'center';
	header.style.gap = '8px';
	header.style.padding = '8px 16px';
	header.style.borderBottom = `1px solid ${CARD_BORDER}`;
	header.style.backgroundColor = CODE_BACKGROUND;

	// Diagram icon
	const icon = append(header, $('span.spec-renderer-mermaid-icon'));
	icon.textContent = '\u25C7'; // white diamond — a graph/diagram motif
	icon.style.color = MERMAID_HEADER_COLOUR;
	icon.style.fontSize = '12px';

	// Title
	const title = append(header, $('span.spec-renderer-mermaid-title'));
	title.textContent = localize('specRenderer.mermaid.title', "Mermaid Diagram");
	title.style.fontSize = '11px';
	title.style.fontWeight = '600';
	title.style.color = MERMAID_HEADER_COLOUR;
	title.style.textTransform = 'uppercase';
	title.style.letterSpacing = '0.05em';

	// Future badge — indicates this will be rendered as SVG later
	const futureBadge = append(header, $('span.spec-renderer-mermaid-future-badge'));
	futureBadge.textContent = localize('specRenderer.mermaid.preview', "Source Preview");
	futureBadge.style.marginLeft = 'auto';
	futureBadge.style.fontSize = '9px';
	futureBadge.style.fontWeight = '500';
	futureBadge.style.padding = '1px 6px';
	futureBadge.style.borderRadius = '10px';
	futureBadge.style.backgroundColor = MERMAID_HEADER_COLOUR + '22';
	futureBadge.style.color = MERMAID_HEADER_COLOUR;

	// ---- Code body ----
	const codeContainer = append(card, $('.spec-renderer-mermaid-code'));
	codeContainer.style.padding = '12px 16px';
	codeContainer.style.overflow = 'auto';
	codeContainer.style.maxHeight = '300px';

	const lines = block.source.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const lineContainer = append(codeContainer, $('.spec-renderer-mermaid-line'));
		lineContainer.style.display = 'flex';
		lineContainer.style.alignItems = 'baseline';
		lineContainer.style.gap = '12px';
		lineContainer.style.lineHeight = '1.6';

		// Line number
		const lineNumber = append(lineContainer, $('span.spec-renderer-mermaid-line-number'));
		lineNumber.textContent = String(i + 1);
		lineNumber.style.color = LINE_NUMBER_COLOUR;
		lineNumber.style.fontSize = '11px';
		lineNumber.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
		lineNumber.style.minWidth = '24px';
		lineNumber.style.textAlign = 'right';
		lineNumber.style.flexShrink = '0';
		lineNumber.style.userSelect = 'none';

		// Line content
		const lineContent = append(lineContainer, $('span.spec-renderer-mermaid-line-content'));
		lineContent.textContent = lines[i];
		lineContent.style.color = CODE_TEXT_COLOUR;
		lineContent.style.fontSize = '12px';
		lineContent.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
		lineContent.style.whiteSpace = 'pre';
	}

	return card;
}

/**
 * Scan markdown text for Mermaid blocks and render each one as a styled card.
 *
 * @param container — the parent DOM element to append cards into
 * @param markdown — raw markdown text to scan for ```mermaid blocks
 * @returns the array of created card elements
 */
export function renderAllMermaidBlocks(container: HTMLElement, markdown: string): HTMLElement[] {
	const blocks = detectMermaidBlocks(markdown);
	const cards: HTMLElement[] = [];

	for (const block of blocks) {
		cards.push(renderMermaidCard(container, block));
	}

	return cards;
}
