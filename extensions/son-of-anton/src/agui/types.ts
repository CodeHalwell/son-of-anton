/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AG-UI Protocol types for Son of Anton.
 *
 * Implements the Agent-User Interaction Protocol event types for real-time,
 * structured communication between agent backends and the IDE frontend.
 *
 * @see https://docs.ag-ui.com/concepts/events
 */

// ---------------------------------------------------------------------------
// Event Type Enum
// ---------------------------------------------------------------------------

export enum AgUiEventType {
	// Lifecycle
	RunStarted = 'RUN_STARTED',
	RunFinished = 'RUN_FINISHED',
	RunError = 'RUN_ERROR',
	StepStarted = 'STEP_STARTED',
	StepFinished = 'STEP_FINISHED',

	// Text Messages
	TextMessageStart = 'TEXT_MESSAGE_START',
	TextMessageContent = 'TEXT_MESSAGE_CONTENT',
	TextMessageEnd = 'TEXT_MESSAGE_END',

	// Tool Calls
	ToolCallStart = 'TOOL_CALL_START',
	ToolCallArgs = 'TOOL_CALL_ARGS',
	ToolCallEnd = 'TOOL_CALL_END',
	ToolCallResult = 'TOOL_CALL_RESULT',

	// State
	StateSnapshot = 'STATE_SNAPSHOT',
	StateDelta = 'STATE_DELTA',

	// Activity
	ActivitySnapshot = 'ACTIVITY_SNAPSHOT',
	ActivityDelta = 'ACTIVITY_DELTA',

	// Reasoning
	ReasoningStart = 'REASONING_START',
	ReasoningContent = 'REASONING_CONTENT',
	ReasoningEnd = 'REASONING_END',

	// Custom
	Custom = 'CUSTOM',
}

// ---------------------------------------------------------------------------
// Base Event
// ---------------------------------------------------------------------------

export interface AgUiBaseEvent {
	type: AgUiEventType;
	timestamp: number;
}

// ---------------------------------------------------------------------------
// Lifecycle Events
// ---------------------------------------------------------------------------

export interface RunStartedEvent extends AgUiBaseEvent {
	type: AgUiEventType.RunStarted;
	threadId: string;
	runId: string;
	agentName: string;
	model: string;
}

export interface RunFinishedEvent extends AgUiBaseEvent {
	type: AgUiEventType.RunFinished;
	threadId: string;
	runId: string;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	elapsedMs: number;
}

export interface RunErrorEvent extends AgUiBaseEvent {
	type: AgUiEventType.RunError;
	threadId: string;
	runId: string;
	message: string;
	code?: string;
}

export interface StepStartedEvent extends AgUiBaseEvent {
	type: AgUiEventType.StepStarted;
	runId: string;
	stepName: string;
}

export interface StepFinishedEvent extends AgUiBaseEvent {
	type: AgUiEventType.StepFinished;
	runId: string;
	stepName: string;
}

// ---------------------------------------------------------------------------
// Text Message Events
// ---------------------------------------------------------------------------

export interface TextMessageStartEvent extends AgUiBaseEvent {
	type: AgUiEventType.TextMessageStart;
	messageId: string;
	role: 'assistant' | 'user';
}

export interface TextMessageContentEvent extends AgUiBaseEvent {
	type: AgUiEventType.TextMessageContent;
	messageId: string;
	delta: string;
}

export interface TextMessageEndEvent extends AgUiBaseEvent {
	type: AgUiEventType.TextMessageEnd;
	messageId: string;
}

// ---------------------------------------------------------------------------
// Tool Call Events
// ---------------------------------------------------------------------------

export interface ToolCallStartEvent extends AgUiBaseEvent {
	type: AgUiEventType.ToolCallStart;
	toolCallId: string;
	toolCallName: string;
	parentMessageId?: string;
}

export interface ToolCallArgsEvent extends AgUiBaseEvent {
	type: AgUiEventType.ToolCallArgs;
	toolCallId: string;
	delta: string;
}

export interface ToolCallEndEvent extends AgUiBaseEvent {
	type: AgUiEventType.ToolCallEnd;
	toolCallId: string;
}

export interface ToolCallResultEvent extends AgUiBaseEvent {
	type: AgUiEventType.ToolCallResult;
	toolCallId: string;
	content: string;
	isError?: boolean;
}

// ---------------------------------------------------------------------------
// State Events
// ---------------------------------------------------------------------------

export interface StateSnapshotEvent extends AgUiBaseEvent {
	type: AgUiEventType.StateSnapshot;
	snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent extends AgUiBaseEvent {
	type: AgUiEventType.StateDelta;
	delta: JsonPatchOp[];
}

export interface JsonPatchOp {
	op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
	path: string;
	value?: unknown;
	from?: string;
}

// ---------------------------------------------------------------------------
// Activity Events
// ---------------------------------------------------------------------------

export type ActivityType = 'planning' | 'searching' | 'reading' | 'writing' | 'testing' | 'reviewing' | 'mcp_call' | 'thinking';

export interface ActivitySnapshotEvent extends AgUiBaseEvent {
	type: AgUiEventType.ActivitySnapshot;
	messageId: string;
	activityType: ActivityType;
	content: string;
}

export interface ActivityDeltaEvent extends AgUiBaseEvent {
	type: AgUiEventType.ActivityDelta;
	messageId: string;
	activityType: ActivityType;
	patch: JsonPatchOp[];
}

// ---------------------------------------------------------------------------
// Reasoning Events
// ---------------------------------------------------------------------------

export interface ReasoningStartEvent extends AgUiBaseEvent {
	type: AgUiEventType.ReasoningStart;
	messageId: string;
}

export interface ReasoningContentEvent extends AgUiBaseEvent {
	type: AgUiEventType.ReasoningContent;
	messageId: string;
	delta: string;
}

export interface ReasoningEndEvent extends AgUiBaseEvent {
	type: AgUiEventType.ReasoningEnd;
	messageId: string;
}

// ---------------------------------------------------------------------------
// Custom Events
// ---------------------------------------------------------------------------

export interface CustomEvent extends AgUiBaseEvent {
	type: AgUiEventType.Custom;
	name: string;
	value: unknown;
}

// ---------------------------------------------------------------------------
// Union Type
// ---------------------------------------------------------------------------

export type AgUiEvent =
	| RunStartedEvent
	| RunFinishedEvent
	| RunErrorEvent
	| StepStartedEvent
	| StepFinishedEvent
	| TextMessageStartEvent
	| TextMessageContentEvent
	| TextMessageEndEvent
	| ToolCallStartEvent
	| ToolCallArgsEvent
	| ToolCallEndEvent
	| ToolCallResultEvent
	| StateSnapshotEvent
	| StateDeltaEvent
	| ActivitySnapshotEvent
	| ActivityDeltaEvent
	| ReasoningStartEvent
	| ReasoningContentEvent
	| ReasoningEndEvent
	| CustomEvent;

// ---------------------------------------------------------------------------
// Agent Run State (for the Agent View sidebar)
// ---------------------------------------------------------------------------

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export interface AgentRunInfo {
	runId: string;
	threadId: string;
	agentName: string;
	model: string;
	status: AgentRunStatus;
	startedAt: number;
	finishedAt?: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	currentStep?: string;
	currentToolCall?: string;
	events: AgUiEvent[];
}

// ---------------------------------------------------------------------------
// Tool Definition (frontend-defined tools for human-in-the-loop)
// ---------------------------------------------------------------------------

export interface AgUiToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, {
			type: string;
			description?: string;
			enum?: string[];
		}>;
		required?: string[];
	};
}

// ---------------------------------------------------------------------------
// User Selection Card (for interactive prompts)
// ---------------------------------------------------------------------------

export interface SelectionOption {
	label: string;
	description?: string;
	value: string;
}

export interface UserSelectionRequest {
	requestId: string;
	title: string;
	description?: string;
	options: SelectionOption[];
	multiSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Agent Run Input
// ---------------------------------------------------------------------------

export interface AgentRunInput {
	prompt: string;
	agentName?: string;
	model?: string;
	threadId?: string;
	tools?: AgUiToolDefinition[];
	systemPrompt?: string;
	attachments?: FileAttachment[];
}

export interface FileAttachment {
	uri: string;
	name: string;
	content?: string;
}

// ---------------------------------------------------------------------------
// Run Store Interface
// ---------------------------------------------------------------------------

import type * as vscode from 'vscode';

export interface RunStore {
	/** Get info for a specific run. */
	getRun(runId: string): AgentRunInfo | undefined;

	/** Get the currently active run id, if any. */
	getActiveRunId(): string | undefined;

	/** Subscribe to AG-UI events for a given run. Returns a disposable. */
	onRunEvent(runId: string, listener: (event: AgUiEvent) => void): vscode.Disposable;

	/** Subscribe to run info changes (status, tokens, cost). Returns a disposable. */
	onRunInfoChanged(runId: string, listener: (info: AgentRunInfo) => void): vscode.Disposable;

	/** Submit a new agent run. Returns the runId. */
	submitRun(input: AgentRunInput): Promise<string>;

	/** Cancel a run. */
	cancelRun(runId: string): void;
}
