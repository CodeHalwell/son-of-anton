/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memo } from 'react';
import type { ChatMessage } from '../protocol/types';
import { StreamingMarkdown } from './StreamingMarkdown';
import { ToolCallCard } from './ToolCallCard';
import { useChat } from '../context/ChatContext';

interface ChatRowProps {
	message: ChatMessage;
}

/**
 * Renders a single chat message. Discriminated by role:
 * - user: simple text bubble
 * - assistant: streaming markdown + tool calls + metadata
 */
export const ChatRow = memo(function ChatRow({ message }: ChatRowProps) {
	const { state, approveToolCall, denyToolCall } = useChat();

	if (message.role === 'user') {
		return (
			<div className="chat-row chat-row--user">
				<div className="chat-row-content">{message.content}</div>
			</div>
		);
	}

	// Assistant message
	const isStreaming = message.status === 'streaming';

	// Collect tool calls associated with this message
	const toolCalls = message.toolCalls ?? [];
	const liveToolCalls = Array.from(state.toolCalls.values());

	return (
		<div className="chat-row chat-row--assistant">
			<div className="chat-row-header">
				<span className="chat-row-agent">Anton</span>
				{message.model && <span className="chat-row-model">{message.model}</span>}
			</div>

			{message.content && (
				<div className="chat-row-content">
					<StreamingMarkdown
						content={message.content}
						isStreaming={isStreaming}
					/>
				</div>
			)}

			{/* Static tool calls from message history */}
			{toolCalls.map(tc => (
				<ToolCallCard key={tc.toolId} tool={tc} />
			))}

			{/* Live tool calls during streaming */}
			{isStreaming && liveToolCalls.map(tc => (
				<ToolCallCard
					key={tc.toolId}
					tool={tc}
					onApprove={approveToolCall}
					onDeny={denyToolCall}
				/>
			))}

			{message.status === 'error' && !message.content && (
				<div className="chat-row-error">Something went wrong.</div>
			)}

			{message.status === 'complete' && message.tokens && (
				<div className="chat-row-meta">
					<span>{message.tokens.inputTokens} in / {message.tokens.outputTokens} out</span>
					{message.tokens.cachedTokens > 0 && (
						<span> ({message.tokens.cachedTokens} cached)</span>
					)}
					{message.elapsedMs !== undefined && (
						<span> · {(message.elapsedMs / 1000).toFixed(1)}s</span>
					)}
				</div>
			)}
		</div>
	);
});
