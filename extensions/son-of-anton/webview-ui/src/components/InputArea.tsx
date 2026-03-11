/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useCallback, useEffect, memo } from 'react';

interface InputAreaProps {
	isStreaming: boolean;
	onSubmit: (content: string) => void;
	onCancel: () => void;
}

/**
 * Chat input textarea with auto-resize, Enter to submit, Shift+Enter for newline.
 */
export const InputArea = memo(function InputArea({ isStreaming, onSubmit, onCancel }: InputAreaProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea to content
	const autoResize = useCallback(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = 'auto';
			el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
		}
	}, []);

	const handleSubmit = useCallback(() => {
		const value = textareaRef.current?.value.trim();
		if (!value || isStreaming) {
			return;
		}
		onSubmit(value);
		if (textareaRef.current) {
			textareaRef.current.value = '';
			textareaRef.current.style.height = 'auto';
		}
	}, [onSubmit, isStreaming]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
		// Escape to cancel streaming
		if (e.key === 'Escape' && isStreaming) {
			onCancel();
		}
	}, [handleSubmit, isStreaming, onCancel]);

	// Focus on mount
	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	// Re-focus after streaming ends
	useEffect(() => {
		if (!isStreaming) {
			textareaRef.current?.focus();
		}
	}, [isStreaming]);

	return (
		<div className="input-area">
			<textarea
				ref={textareaRef}
				className="input-textarea"
				placeholder={isStreaming ? 'Anton is thinking...' : 'Ask Anton... (Enter to send, Shift+Enter for newline)'}
				onKeyDown={handleKeyDown}
				onInput={autoResize}
				rows={1}
				disabled={isStreaming}
			/>
			<div className="input-actions">
				{isStreaming ? (
					<button className="input-button input-button--cancel" onClick={onCancel}>
						Stop
					</button>
				) : (
					<button className="input-button input-button--send" onClick={handleSubmit}>
						Send
					</button>
				)}
			</div>
		</div>
	);
});
