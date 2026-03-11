/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useEffect, useCallback } from 'react';
import { useChat } from '../context/ChatContext';
import { ChatRow } from './ChatRow';
import { InputArea } from './InputArea';
import { ModelSelector } from './ModelSelector';

/**
 * Main chat view — header, scrolling message list, and input area.
 * Auto-scrolls during streaming unless the user has scrolled up.
 */
export function ChatView() {
	const { state, sendMessage, cancelStream, selectModel, clearSession } = useChat();
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const userScrolledRef = useRef(false);

	// Track whether user has scrolled away from bottom
	const handleScroll = useCallback(() => {
		const el = messagesContainerRef.current;
		if (!el) {
			return;
		}
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		userScrolledRef.current = !atBottom;
	}, []);

	// Auto-scroll to bottom on new messages / streaming, unless user scrolled up
	useEffect(() => {
		if (!userScrolledRef.current) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [state.messages, state.messages[state.messages.length - 1]?.content]);

	// Reset scroll lock when streaming ends
	useEffect(() => {
		if (!state.isStreaming) {
			userScrolledRef.current = false;
		}
	}, [state.isStreaming]);

	const handleSubmit = useCallback((content: string) => {
		sendMessage(content);
		userScrolledRef.current = false;
	}, [sendMessage]);

	return (
		<div className="chat-view">
			{/* Header */}
			<div className="chat-header">
				<span className="chat-title">Anton</span>
				<ModelSelector
					currentModel={state.defaultModel}
					provider={state.provider}
					onSelect={selectModel}
				/>
				<div className="chat-header-spacer" />
				<button className="chat-clear" onClick={clearSession} title="Clear session">
					Clear
				</button>
			</div>

			{/* Message List */}
			<div
				className="chat-messages"
				ref={messagesContainerRef}
				onScroll={handleScroll}
			>
				{state.messages.length === 0 && (
					<div className="chat-empty">
						<div className="chat-empty-icon">⚡</div>
						<p className="chat-empty-title">Ask Anton anything</p>
						<p className="chat-empty-hint">
							Code questions, refactoring, debugging, test generation —
							Anton has access to your codebase via MCP tools.
						</p>
					</div>
				)}

				{state.messages.map(msg => (
					<ChatRow key={msg.id} message={msg} />
				))}

				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<InputArea
				isStreaming={state.isStreaming}
				onSubmit={handleSubmit}
				onCancel={cancelStream}
			/>
		</div>
	);
}
