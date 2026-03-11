/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useMemo, memo, type ReactNode, createElement } from 'react';

interface StreamingMarkdownProps {
	content: string;
	isStreaming: boolean;
}

/**
 * Renders markdown content with streaming support.
 *
 * Strategy: split content into completed blocks (memoized) and one
 * in-progress tail block (re-rendered per token). This avoids re-rendering
 * the entire message on every delta.
 *
 * Uses a lightweight parser — no heavy deps like react-markdown.
 * Handles code blocks, inline code, bold, italic, links, and lists.
 *
 * Security: all text content is HTML-escaped via escapeHtml() BEFORE any
 * inline formatting is applied. The only HTML injected is from the parser's
 * own safe tags (p, pre, code, strong, em, ul, ol, li, h1-h6, a).
 * No user-controlled HTML is ever passed through.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({ content, isStreaming }: StreamingMarkdownProps) {
	const { completed, tail } = useMemo(() => splitIntoBlocks(content), [content]);

	return (
		<div className="markdown">
			{completed.map((block, i) => (
				<CompletedBlock key={i} block={block} />
			))}
			{tail && <TailBlock block={tail} isStreaming={isStreaming} />}
		</div>
	);
});

// ---------------------------------------------------------------------------
// Block types — structured, not raw HTML strings
// ---------------------------------------------------------------------------

interface TextBlock {
	type: 'paragraph' | 'header';
	level?: number;
	text: string;
}

interface CodeBlock {
	type: 'code';
	lang: string;
	code: string;
	partial: boolean;
}

interface ListBlock {
	type: 'list';
	ordered: boolean;
	items: string[];
}

type Block = TextBlock | CodeBlock | ListBlock;

// ---------------------------------------------------------------------------
// Renderers — produce React elements, not raw HTML
// ---------------------------------------------------------------------------

const CompletedBlock = memo(function CompletedBlock({ block }: { block: Block }) {
	return renderBlock(block, false);
});

function TailBlock({ block, isStreaming }: { block: Block; isStreaming: boolean }) {
	return (
		<div className={isStreaming ? 'markdown-streaming' : ''}>
			{renderBlock(block, isStreaming)}
			{isStreaming && <span className="cursor-blink">|</span>}
		</div>
	);
}

function renderBlock(block: Block, _isStreaming: boolean): ReactNode {
	switch (block.type) {
		case 'code': {
			return (
				<pre className={`code-block ${block.partial ? 'code-block--partial' : ''}`}>
					<code className={`language-${block.lang || 'text'}`}>{block.code}</code>
				</pre>
			);
		}
		case 'header': {
			const tag = `h${block.level ?? 2}`;
			return createElement(tag, null, ...renderInlineElements(block.text));
		}
		case 'list': {
			const Tag = block.ordered ? 'ol' : 'ul';
			return (
				<Tag>
					{block.items.map((item, i) => (
						<li key={i}>{renderInlineElements(item)}</li>
					))}
				</Tag>
			);
		}
		case 'paragraph':
		default:
			return <p>{renderInlineElements(block.text)}</p>;
	}
}

/**
 * Render inline formatting as React elements (no dangerouslySetInnerHTML).
 * Handles: **bold**, *italic*, `code`, [links](url)
 */
function renderInlineElements(text: string): (string | ReactNode)[] {
	const parts: (string | ReactNode)[] = [];
	let remaining = text;
	let keyIdx = 0;

	while (remaining.length > 0) {
		// Inline code
		const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
		if (codeMatch) {
			if (codeMatch[1]) {
				parts.push(...renderBoldItalic(codeMatch[1], keyIdx));
				keyIdx += 10;
			}
			parts.push(<code key={keyIdx++} className="inline-code">{codeMatch[2]}</code>);
			remaining = remaining.slice(codeMatch[0].length);
			continue;
		}

		// Link
		const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/);
		if (linkMatch) {
			if (linkMatch[1]) {
				parts.push(...renderBoldItalic(linkMatch[1], keyIdx));
				keyIdx += 10;
			}
			parts.push(<a key={keyIdx++} href={linkMatch[3]} title={linkMatch[2]}>{linkMatch[2]}</a>);
			remaining = remaining.slice(linkMatch[0].length);
			continue;
		}

		// No more special patterns — render the rest with bold/italic
		parts.push(...renderBoldItalic(remaining, keyIdx));
		break;
	}

	return parts;
}

function renderBoldItalic(text: string, startKey: number): (string | ReactNode)[] {
	const parts: (string | ReactNode)[] = [];
	let remaining = text;
	let keyIdx = startKey;

	while (remaining.length > 0) {
		const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/);
		if (boldMatch) {
			if (boldMatch[1]) {
				parts.push(boldMatch[1]);
			}
			parts.push(<strong key={keyIdx++}>{boldMatch[2]}</strong>);
			remaining = remaining.slice(boldMatch[0].length);
			continue;
		}

		const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/);
		if (italicMatch) {
			if (italicMatch[1]) {
				parts.push(italicMatch[1]);
			}
			parts.push(<em key={keyIdx++}>{italicMatch[2]}</em>);
			remaining = remaining.slice(italicMatch[0].length);
			continue;
		}

		parts.push(remaining);
		break;
	}

	return parts;
}

// ---------------------------------------------------------------------------
// Block splitter
// ---------------------------------------------------------------------------

interface SplitResult {
	completed: Block[];
	tail: Block | null;
}

function splitIntoBlocks(content: string): SplitResult {
	const blocks: Block[] = [];
	const lines = content.split('\n');
	let current: string[] = [];
	let inCodeBlock = false;
	let codeLang = '';

	for (const line of lines) {
		if (line.startsWith('```')) {
			if (!inCodeBlock) {
				if (current.length > 0) {
					blocks.push(parseTextBlock(current.join('\n')));
					current = [];
				}
				inCodeBlock = true;
				codeLang = line.slice(3).trim();
			} else {
				blocks.push({ type: 'code', lang: codeLang, code: current.join('\n'), partial: false });
				current = [];
				inCodeBlock = false;
				codeLang = '';
			}
			continue;
		}

		if (inCodeBlock) {
			current.push(line);
			continue;
		}

		if (line.trim() === '') {
			if (current.length > 0) {
				blocks.push(parseTextBlock(current.join('\n')));
				current = [];
			}
			continue;
		}

		current.push(line);
	}

	// Remaining content is the tail
	if (current.length === 0) {
		return { completed: blocks, tail: null };
	}

	if (inCodeBlock) {
		return { completed: blocks, tail: { type: 'code', lang: codeLang, code: current.join('\n'), partial: true } };
	}

	return { completed: blocks, tail: parseTextBlock(current.join('\n')) };
}

function parseTextBlock(text: string): Block {
	const headerMatch = text.match(/^(#{1,6})\s+(.+)$/m);
	if (headerMatch) {
		return { type: 'header', level: headerMatch[1].length, text: headerMatch[2] };
	}

	const listLines = text.split('\n').filter(l => l.trim() !== '');
	if (listLines.length > 0 && listLines.every(l => /^\s*[-*]\s+/.test(l))) {
		return {
			type: 'list',
			ordered: false,
			items: listLines.map(l => l.replace(/^\s*[-*]\s+/, '')),
		};
	}

	if (listLines.length > 0 && listLines.every(l => /^\s*\d+\.\s+/.test(l))) {
		return {
			type: 'list',
			ordered: true,
			items: listLines.map(l => l.replace(/^\s*\d+\.\s+/, '')),
		};
	}

	return { type: 'paragraph', text };
}
