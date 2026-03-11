/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import type {
	ChatMessage,
	ExtToWebviewMessage,
	TokenUsage,
	ToolCallInfo,
	ModelId,
} from '../protocol/types';
import { postMessage, onMessage } from '../services/ipc-client';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ChatState {
	messages: ChatMessage[];
	isStreaming: boolean;
	activeStreamId: string | null;
	defaultModel: ModelId;
	provider: string;
	toolCalls: Map<string, ToolCallInfo>;
}

const initialState: ChatState = {
	messages: [],
	isStreaming: false,
	activeStreamId: null,
	defaultModel: 'sonnet',
	provider: 'resolving...',
	toolCalls: new Map(),
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ChatAction =
	| { type: 'STREAM_START'; messageId: string; model: string }
	| { type: 'STREAM_DELTA'; messageId: string; content: string }
	| { type: 'STREAM_END'; messageId: string; usage: TokenUsage; elapsedMs: number }
	| { type: 'STREAM_ERROR'; message: string }
	| { type: 'SESSION_RESTORE'; messages: ChatMessage[] }
	| { type: 'CONFIG_UPDATE'; defaultModel: ModelId; provider: string }
	| { type: 'ADD_USER_MESSAGE'; content: string }
	| { type: 'TOOL_CALL_START'; toolId: string; name: string; args: string }
	| { type: 'TOOL_CALL_RESULT'; toolId: string; result: string; isError: boolean; latencyMs: number }
	| { type: 'CLEAR_SESSION' };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case 'ADD_USER_MESSAGE': {
			const userMsg: ChatMessage = {
				id: crypto.randomUUID(),
				role: 'user',
				content: action.content,
				timestamp: Date.now(),
				status: 'complete',
			};
			return { ...state, messages: [...state.messages, userMsg] };
		}

		case 'STREAM_START': {
			const assistantMsg: ChatMessage = {
				id: action.messageId,
				role: 'assistant',
				content: '',
				timestamp: Date.now(),
				status: 'streaming',
				model: action.model,
			};
			return {
				...state,
				messages: [...state.messages, assistantMsg],
				isStreaming: true,
				activeStreamId: action.messageId,
			};
		}

		case 'STREAM_DELTA': {
			const messages = state.messages.map(m =>
				m.id === action.messageId
					? { ...m, content: m.content + action.content }
					: m
			);
			return { ...state, messages };
		}

		case 'STREAM_END': {
			const messages = state.messages.map(m =>
				m.id === action.messageId
					? { ...m, status: 'complete' as const, tokens: action.usage, elapsedMs: action.elapsedMs }
					: m
			);
			return { ...state, messages, isStreaming: false, activeStreamId: null };
		}

		case 'STREAM_ERROR': {
			const messages = state.activeStreamId
				? state.messages.map(m =>
					m.id === state.activeStreamId
						? { ...m, status: 'error' as const, content: m.content || action.message }
						: m
				)
				: state.messages;
			return { ...state, messages, isStreaming: false, activeStreamId: null };
		}

		case 'SESSION_RESTORE':
			return { ...state, messages: action.messages };

		case 'CONFIG_UPDATE':
			return { ...state, defaultModel: action.defaultModel, provider: action.provider };

		case 'TOOL_CALL_START': {
			const toolCalls = new Map(state.toolCalls);
			toolCalls.set(action.toolId, {
				toolId: action.toolId,
				name: action.name,
				args: action.args,
				status: 'running',
			});
			return { ...state, toolCalls };
		}

		case 'TOOL_CALL_RESULT': {
			const toolCalls = new Map(state.toolCalls);
			const existing = toolCalls.get(action.toolId);
			if (existing) {
				toolCalls.set(action.toolId, {
					...existing,
					status: action.isError ? 'error' : 'completed',
					result: action.result,
					isError: action.isError,
					latencyMs: action.latencyMs,
				});
			}
			return { ...state, toolCalls };
		}

		case 'CLEAR_SESSION':
			return { ...initialState, defaultModel: state.defaultModel, provider: state.provider };

		default:
			return state;
	}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ChatContextValue {
	state: ChatState;
	sendMessage: (content: string, model?: ModelId) => void;
	cancelStream: () => void;
	approveToolCall: (toolId: string) => void;
	denyToolCall: (toolId: string) => void;
	selectModel: (model: ModelId) => void;
	clearSession: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(chatReducer, initialState);

	// Listen to extension host messages
	useEffect(() => {
		return onMessage((msg: ExtToWebviewMessage) => {
			switch (msg.type) {
				case 'streamStart':
					dispatch({ type: 'STREAM_START', messageId: msg.messageId, model: msg.model });
					break;
				case 'streamDelta':
					dispatch({ type: 'STREAM_DELTA', messageId: msg.messageId, content: msg.content });
					break;
				case 'streamEnd':
					dispatch({ type: 'STREAM_END', messageId: msg.messageId, usage: msg.usage, elapsedMs: msg.elapsedMs });
					break;
				case 'error':
					dispatch({ type: 'STREAM_ERROR', message: msg.message });
					break;
				case 'sessionRestore':
					dispatch({ type: 'SESSION_RESTORE', messages: msg.messages });
					break;
				case 'configUpdate':
					dispatch({ type: 'CONFIG_UPDATE', defaultModel: msg.defaultModel, provider: msg.provider });
					break;
				case 'toolCallStart':
					dispatch({ type: 'TOOL_CALL_START', toolId: msg.toolId, name: msg.name, args: msg.args });
					break;
				case 'toolCallResult':
					dispatch({ type: 'TOOL_CALL_RESULT', toolId: msg.toolId, result: msg.result, isError: msg.isError, latencyMs: msg.latencyMs });
					break;
			}
		});
	}, []);

	// Signal ready on mount
	useEffect(() => {
		postMessage({ type: 'ready' });
	}, []);

	const sendMessage = useCallback((content: string, model?: ModelId) => {
		dispatch({ type: 'ADD_USER_MESSAGE', content });
		postMessage({ type: 'sendMessage', content, model });
	}, []);

	const cancelStream = useCallback(() => {
		postMessage({ type: 'cancelStream' });
	}, []);

	const approveToolCall = useCallback((toolId: string) => {
		postMessage({ type: 'approveToolCall', toolId });
	}, []);

	const denyToolCall = useCallback((toolId: string) => {
		postMessage({ type: 'denyToolCall', toolId });
	}, []);

	const selectModel = useCallback((model: ModelId) => {
		postMessage({ type: 'selectModel', model });
	}, []);

	const clearSession = useCallback(() => {
		dispatch({ type: 'CLEAR_SESSION' });
		postMessage({ type: 'clearSession' });
	}, []);

	const value: ChatContextValue = {
		state,
		sendMessage,
		cancelStream,
		approveToolCall,
		denyToolCall,
		selectModel,
		clearSession,
	};

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
	const ctx = useContext(ChatContext);
	if (!ctx) {
		throw new Error('useChat must be used within a ChatProvider');
	}
	return ctx;
}
