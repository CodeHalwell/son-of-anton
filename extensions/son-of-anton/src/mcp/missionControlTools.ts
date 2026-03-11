/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP tool definitions for Mission Control board interaction.
 *
 * Seven tools are registered here:
 *   - mission_control_update_status   (any agent)
 *   - mission_control_append_trace    (any agent)
 *   - mission_control_report_diff     (any agent)
 *   - mission_control_comment         (any agent)
 *   - mission_control_create_ticket   (orchestrator only)
 *   - mission_control_move_ticket     (orchestrator only)
 *   - mission_control_assign          (orchestrator only)
 *
 * The orchestrator agent id is identified by the well-known constant
 * ORCHESTRATOR_AGENT_ID. Any agent that presents this id in the agentId
 * parameter of a restricted tool call is granted elevated access. All
 * other callers receive a permission-denied error.
 */

/** Well-known agent id that identifies the orchestrator. */
const ORCHESTRATOR_AGENT_ID = 'orchestrator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The result shape returned by every tool handler. */
export interface MissionControlToolResult {
	success: boolean;
	error?: string;
	data?: unknown;
}

/** Registration descriptor for a single Mission Control MCP tool. */
export interface MissionControlToolRegistration {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: (params: Record<string, unknown>, agentId: string) => Promise<MissionControlToolResult>;
}

// ---------------------------------------------------------------------------
// Valid enum values — kept as plain arrays so they can be referenced both at
// runtime (for validation) and in the JSON schema (for documentation).
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['queued', 'running', 'paused', 'review', 'complete', 'failed'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

const VALID_TRACE_KINDS = ['prompt', 'completion', 'tool_call', 'decision', 'error'] as const;
type ValidTraceKind = typeof VALID_TRACE_KINDS[number];

const VALID_TICKET_TYPES = ['epic', 'story', 'subtask', 'bug', 'spike'] as const;
type ValidTicketType = typeof VALID_TICKET_TYPES[number];

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
type ValidPriority = typeof VALID_PRIORITIES[number];

const VALID_CREATOR_ROLES = ['user', 'orchestrator', 'agent'] as const;
type ValidCreatorRole = typeof VALID_CREATOR_ROLES[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a permission-denied error result for orchestrator-only tools when
 * the caller is not the orchestrator.
 */
function permissionDenied(toolName: string, agentId: string): MissionControlToolResult {
	return {
		success: false,
		error: `Permission denied: '${toolName}' is restricted to the orchestrator agent. Caller agent id was '${agentId}'.`,
	};
}

/**
 * Asserts that a value is a non-empty string. Returns the string on success or
 * throws a descriptive Error that callers can catch and surface as a tool error.
 */
function requireString(params: Record<string, unknown>, key: string): string {
	const value = params[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`Missing or empty required parameter '${key}'.`);
	}
	return value;
}

/**
 * Reads an optional string from params. Returns undefined when absent or not a
 * string so callers can apply a default.
 */
function optionalString(params: Record<string, unknown>, key: string): string | undefined {
	const value = params[key];
	return typeof value === 'string' ? value : undefined;
}

/**
 * Reads an optional number from params.
 */
function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
	const value = params[key];
	return typeof value === 'number' ? value : undefined;
}

/**
 * Reads an optional string array from params.
 */
function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
	const value = params[key];
	if (!Array.isArray(value)) {
		return undefined;
	}
	if (!value.every(item => typeof item === 'string')) {
		throw new Error(`Parameter '${key}' must be an array of strings.`);
	}
	return value as string[];
}

/**
 * Validates that a string value is a member of an allowed set.
 */
function requireEnum<T extends string>(value: string, allowed: readonly T[], paramName: string): T {
	if (!(allowed as readonly string[]).includes(value)) {
		throw new Error(`Invalid value '${value}' for '${paramName}'. Allowed values: ${allowed.join(', ')}.`);
	}
	return value as T;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * mission_control_update_status
 *
 * Any assigned agent can advance its own ticket through the workflow.
 * Permitted transitions: Queued→Running→Review→Complete/Failed.
 */
const updateStatusTool: MissionControlToolRegistration = {
	name: 'mission_control_update_status',
	description: 'Update the status of a Mission Control ticket. Any agent may update its own ticket. Permitted statuses: queued, running, paused, review, complete, failed.',
	inputSchema: {
		type: 'object',
		required: ['ticketId', 'agentId', 'status'],
		properties: {
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket to update.',
			},
			agentId: {
				type: 'string',
				description: 'The id of the calling agent. Must match the ticket\'s assignedAgent unless the caller is the orchestrator.',
			},
			status: {
				type: 'string',
				enum: VALID_STATUSES,
				description: 'The new status for the ticket.',
			},
			reason: {
				type: 'string',
				description: 'Optional human-readable reason for the status change (used when status is paused or failed).',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		try {
			const ticketId = requireString(params, 'ticketId');
			const callerAgentId = requireString(params, 'agentId');
			const rawStatus = requireString(params, 'status');
			const status = requireEnum(rawStatus, VALID_STATUSES, 'status');
			const reason = optionalString(params, 'reason');

			if (callerAgentId !== agentId) {
				return {
					success: false,
					error: `agentId mismatch: params.agentId ('${callerAgentId}') does not match the authenticated caller ('${agentId}').`,
				};
			}

			return {
				success: true,
				data: {
					ticketId,
					agentId: callerAgentId,
					status,
					reason,
					updatedAt: Date.now(),
				},
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_append_trace
 *
 * Any agent can append a structured trace entry to its own ticket. Trace
 * entries record model interactions and decisions for audit and cost tracking.
 */
const appendTraceTool: MissionControlToolRegistration = {
	name: 'mission_control_append_trace',
	description: 'Append a trace entry to a Mission Control ticket. Use this after each LLM call or significant decision. Kinds: prompt, completion, tool_call, decision, error.',
	inputSchema: {
		type: 'object',
		required: ['ticketId', 'agentId', 'kind', 'modelUsed', 'tokensIn', 'tokensOut', 'costUsd', 'action', 'detail'],
		properties: {
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket.',
			},
			agentId: {
				type: 'string',
				description: 'The id of the calling agent.',
			},
			kind: {
				type: 'string',
				enum: VALID_TRACE_KINDS,
				description: 'The kind of trace entry.',
			},
			modelUsed: {
				type: 'string',
				description: 'The model identifier used for this interaction (e.g. claude-opus-4-5).',
			},
			tokensIn: {
				type: 'number',
				description: 'Number of input tokens consumed.',
				minimum: 0,
			},
			tokensOut: {
				type: 'number',
				description: 'Number of output tokens produced.',
				minimum: 0,
			},
			costUsd: {
				type: 'number',
				description: 'Estimated cost in USD for this interaction.',
				minimum: 0,
			},
			action: {
				type: 'string',
				description: 'Short label describing what was done (e.g. "read file", "generate patch").',
			},
			detail: {
				type: 'string',
				description: 'Full detail text — the prompt, completion, or decision rationale.',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		try {
			const ticketId = requireString(params, 'ticketId');
			const callerAgentId = requireString(params, 'agentId');
			const rawKind = requireString(params, 'kind');
			const kind = requireEnum(rawKind, VALID_TRACE_KINDS, 'kind') as ValidTraceKind;
			const modelUsed = requireString(params, 'modelUsed');
			const action = requireString(params, 'action');
			const detail = requireString(params, 'detail');

			if (callerAgentId !== agentId) {
				return {
					success: false,
					error: `agentId mismatch: params.agentId ('${callerAgentId}') does not match the authenticated caller ('${agentId}').`,
				};
			}

			const tokensIn = optionalNumber(params, 'tokensIn') ?? 0;
			const tokensOut = optionalNumber(params, 'tokensOut') ?? 0;
			const costUsd = optionalNumber(params, 'costUsd') ?? 0;

			if (tokensIn < 0 || tokensOut < 0 || costUsd < 0) {
				return {
					success: false,
					error: 'tokensIn, tokensOut, and costUsd must be non-negative numbers.',
				};
			}

			const entry = {
				timestamp: Date.now(),
				agentId: callerAgentId,
				modelUsed,
				tokensIn,
				tokensOut,
				costUsd,
				action,
				detail,
				kind,
			};

			return {
				success: true,
				data: { ticketId, entry },
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_report_diff
 *
 * Any agent can attach file diff statistics to its own ticket. This gives
 * the Mission Control board a concise view of what changed without embedding
 * full patch content.
 */
const reportDiffTool: MissionControlToolRegistration = {
	name: 'mission_control_report_diff',
	description: 'Report file diff statistics to a Mission Control ticket. Attach one diff entry per changed file.',
	inputSchema: {
		type: 'object',
		required: ['ticketId', 'agentId', 'diffs'],
		properties: {
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket.',
			},
			agentId: {
				type: 'string',
				description: 'The id of the calling agent.',
			},
			diffs: {
				type: 'array',
				description: 'One entry per changed file.',
				items: {
					type: 'object',
					required: ['filePath', 'hunks', 'additions', 'deletions'],
					properties: {
						filePath: {
							type: 'string',
							description: 'Workspace-relative or absolute path to the file.',
						},
						hunks: {
							type: 'number',
							description: 'Number of diff hunks.',
							minimum: 0,
						},
						additions: {
							type: 'number',
							description: 'Number of added lines.',
							minimum: 0,
						},
						deletions: {
							type: 'number',
							description: 'Number of deleted lines.',
							minimum: 0,
						},
					},
					additionalProperties: false,
				},
				minItems: 1,
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		try {
			const ticketId = requireString(params, 'ticketId');
			const callerAgentId = requireString(params, 'agentId');

			if (callerAgentId !== agentId) {
				return {
					success: false,
					error: `agentId mismatch: params.agentId ('${callerAgentId}') does not match the authenticated caller ('${agentId}').`,
				};
			}

			const rawDiffs = params['diffs'];
			if (!Array.isArray(rawDiffs) || rawDiffs.length === 0) {
				return {
					success: false,
					error: 'diffs must be a non-empty array.',
				};
			}

			const diffs: Array<{ filePath: string; hunks: number; additions: number; deletions: number }> = [];

			for (let i = 0; i < rawDiffs.length; i++) {
				const item = rawDiffs[i];
				if (typeof item !== 'object' || item === null) {
					return { success: false, error: `diffs[${i}] is not an object.` };
				}

				const entry = item as Record<string, unknown>;
				const filePath = typeof entry['filePath'] === 'string' && entry['filePath'].trim() !== ''
					? entry['filePath']
					: null;

				if (!filePath) {
					return { success: false, error: `diffs[${i}].filePath is missing or empty.` };
				}

				const hunks = typeof entry['hunks'] === 'number' && entry['hunks'] >= 0 ? entry['hunks'] : null;
				const additions = typeof entry['additions'] === 'number' && entry['additions'] >= 0 ? entry['additions'] : null;
				const deletions = typeof entry['deletions'] === 'number' && entry['deletions'] >= 0 ? entry['deletions'] : null;

				if (hunks === null) {
					return { success: false, error: `diffs[${i}].hunks must be a non-negative number.` };
				}
				if (additions === null) {
					return { success: false, error: `diffs[${i}].additions must be a non-negative number.` };
				}
				if (deletions === null) {
					return { success: false, error: `diffs[${i}].deletions must be a non-negative number.` };
				}

				diffs.push({ filePath, hunks, additions, deletions });
			}

			return {
				success: true,
				data: {
					ticketId,
					agentId: callerAgentId,
					diffs,
					reportedAt: Date.now(),
				},
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_comment
 *
 * Any agent can leave a comment on any ticket. Comments are attributed with
 * the caller's agent id and a timestamp.
 */
const commentTool: MissionControlToolRegistration = {
	name: 'mission_control_comment',
	description: 'Add a comment to a Mission Control ticket. Comments are attributed to the calling agent and timestamped.',
	inputSchema: {
		type: 'object',
		required: ['ticketId', 'agentId', 'text'],
		properties: {
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket to comment on.',
			},
			agentId: {
				type: 'string',
				description: 'The id of the calling agent. Used as the comment author.',
			},
			authorRole: {
				type: 'string',
				enum: VALID_CREATOR_ROLES,
				description: 'Role of the commenter. Defaults to \'agent\'.',
			},
			text: {
				type: 'string',
				description: 'The comment text. Markdown is supported.',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		try {
			const ticketId = requireString(params, 'ticketId');
			const callerAgentId = requireString(params, 'agentId');
			const text = requireString(params, 'text');

			if (callerAgentId !== agentId) {
				return {
					success: false,
					error: `agentId mismatch: params.agentId ('${callerAgentId}') does not match the authenticated caller ('${agentId}').`,
				};
			}

			const rawRole = optionalString(params, 'authorRole') ?? 'agent';
			const authorRole = requireEnum(rawRole, VALID_CREATOR_ROLES, 'authorRole') as ValidCreatorRole;

			const comment = {
				id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				author: callerAgentId,
				authorRole,
				timestamp: Date.now(),
				text,
			};

			return {
				success: true,
				data: { ticketId, comment },
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_create_ticket
 *
 * Orchestrator-only. Creates a new ticket (story, subtask, bug, spike, or
 * epic) on the board. Returns the new ticket id on success.
 */
const createTicketTool: MissionControlToolRegistration = {
	name: 'mission_control_create_ticket',
	description: 'Create a new Mission Control ticket. Orchestrator only. Returns the generated ticket id.',
	inputSchema: {
		type: 'object',
		required: ['agentId', 'type', 'priority', 'title', 'description'],
		properties: {
			agentId: {
				type: 'string',
				description: 'Must be the orchestrator agent id.',
			},
			type: {
				type: 'string',
				enum: VALID_TICKET_TYPES,
				description: 'The type of ticket to create.',
			},
			priority: {
				type: 'string',
				enum: VALID_PRIORITIES,
				description: 'The priority of the ticket.',
			},
			title: {
				type: 'string',
				description: 'Short title for the ticket.',
			},
			description: {
				type: 'string',
				description: 'Full description of the work to be done.',
			},
			epicId: {
				type: 'string',
				description: 'Optional id of the parent epic.',
			},
			parentId: {
				type: 'string',
				description: 'Optional id of the parent story (for subtasks).',
			},
			storyPoints: {
				type: 'number',
				description: 'Optional story point estimate.',
				minimum: 0,
			},
			labels: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional list of label strings.',
			},
			acceptanceCriteria: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional list of acceptance criteria statements.',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		if (agentId !== ORCHESTRATOR_AGENT_ID) {
			return permissionDenied('mission_control_create_ticket', agentId);
		}

		try {
			const callerAgentId = requireString(params, 'agentId');
			if (callerAgentId !== ORCHESTRATOR_AGENT_ID) {
				return permissionDenied('mission_control_create_ticket', callerAgentId);
			}

			const rawType = requireString(params, 'type');
			const type = requireEnum(rawType, VALID_TICKET_TYPES, 'type') as ValidTicketType;

			const rawPriority = requireString(params, 'priority');
			const priority = requireEnum(rawPriority, VALID_PRIORITIES, 'priority') as ValidPriority;

			const title = requireString(params, 'title');
			const description = requireString(params, 'description');
			const epicId = optionalString(params, 'epicId');
			const parentId = optionalString(params, 'parentId');
			const storyPoints = optionalNumber(params, 'storyPoints');
			const labels = optionalStringArray(params, 'labels') ?? [];
			const acceptanceCriteria = optionalStringArray(params, 'acceptanceCriteria') ?? [];

			const now = Date.now();
			const ticketId = `ticket-${now}-${Math.random().toString(36).slice(2, 8)}`;

			const ticket = {
				id: ticketId,
				type,
				status: 'queued' as const,
				priority,
				title,
				description,
				createdBy: 'orchestrator' as const,
				createdAt: now,
				updatedAt: now,
				assignedAgent: undefined,
				modelUsed: undefined,
				epicId,
				parentId,
				storyPoints,
				labels,
				acceptanceCriteria,
				blockedBy: [],
				blocks: [],
				comments: [],
				trace: [],
				diffs: [],
				elapsedMs: 0,
				totalCostUsd: 0,
				totalTokensIn: 0,
				totalTokensOut: 0,
				rejectionHistory: [],
			};

			return {
				success: true,
				data: { ticket },
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_move_ticket
 *
 * Orchestrator-only. Moves a ticket to a different column by changing its
 * status. Useful for manual overrides and un-blocking stuck tickets.
 */
const moveTicketTool: MissionControlToolRegistration = {
	name: 'mission_control_move_ticket',
	description: 'Move a Mission Control ticket to a different board column (status). Orchestrator only.',
	inputSchema: {
		type: 'object',
		required: ['agentId', 'ticketId', 'targetStatus'],
		properties: {
			agentId: {
				type: 'string',
				description: 'Must be the orchestrator agent id.',
			},
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket to move.',
			},
			targetStatus: {
				type: 'string',
				enum: VALID_STATUSES,
				description: 'The column (status) to move the ticket into.',
			},
			reason: {
				type: 'string',
				description: 'Optional reason for the move (recorded in ticket comments).',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		if (agentId !== ORCHESTRATOR_AGENT_ID) {
			return permissionDenied('mission_control_move_ticket', agentId);
		}

		try {
			const callerAgentId = requireString(params, 'agentId');
			if (callerAgentId !== ORCHESTRATOR_AGENT_ID) {
				return permissionDenied('mission_control_move_ticket', callerAgentId);
			}

			const ticketId = requireString(params, 'ticketId');
			const rawTargetStatus = requireString(params, 'targetStatus');
			const targetStatus = requireEnum(rawTargetStatus, VALID_STATUSES, 'targetStatus') as ValidStatus;
			const reason = optionalString(params, 'reason');

			return {
				success: true,
				data: {
					ticketId,
					targetStatus,
					reason,
					movedAt: Date.now(),
					movedBy: callerAgentId,
				},
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

/**
 * mission_control_assign
 *
 * Orchestrator-only. Assigns or re-assigns a ticket to an agent. Optionally
 * records which model the assigned agent should use.
 */
const assignTool: MissionControlToolRegistration = {
	name: 'mission_control_assign',
	description: 'Assign a Mission Control ticket to an agent. Orchestrator only. Pass an empty string for assignedAgent to un-assign the ticket.',
	inputSchema: {
		type: 'object',
		required: ['agentId', 'ticketId', 'assignedAgent'],
		properties: {
			agentId: {
				type: 'string',
				description: 'Must be the orchestrator agent id.',
			},
			ticketId: {
				type: 'string',
				description: 'The unique id of the ticket to assign.',
			},
			assignedAgent: {
				type: 'string',
				description: 'The agent id to assign to the ticket. Pass an empty string to un-assign.',
			},
			modelUsed: {
				type: 'string',
				description: 'Optional model the assigned agent should use (e.g. claude-sonnet-4-5).',
			},
		},
		additionalProperties: false,
	},
	handler: async (params, agentId): Promise<MissionControlToolResult> => {
		if (agentId !== ORCHESTRATOR_AGENT_ID) {
			return permissionDenied('mission_control_assign', agentId);
		}

		try {
			const callerAgentId = requireString(params, 'agentId');
			if (callerAgentId !== ORCHESTRATOR_AGENT_ID) {
				return permissionDenied('mission_control_assign', callerAgentId);
			}

			const ticketId = requireString(params, 'ticketId');

			// assignedAgent may be an empty string (un-assign), so we cannot use requireString.
			const rawAssignedAgent = params['assignedAgent'];
			if (typeof rawAssignedAgent !== 'string') {
				return {
					success: false,
					error: 'assignedAgent must be a string (pass an empty string to un-assign).',
				};
			}
			const assignedAgent: string | undefined = rawAssignedAgent.trim() === '' ? undefined : rawAssignedAgent;

			const modelUsed = optionalString(params, 'modelUsed');

			return {
				success: true,
				data: {
					ticketId,
					assignedAgent,
					modelUsed,
					assignedAt: Date.now(),
					assignedBy: callerAgentId,
				},
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All Mission Control tools in registration order. */
const MISSION_CONTROL_TOOLS: MissionControlToolRegistration[] = [
	updateStatusTool,
	appendTraceTool,
	reportDiffTool,
	commentTool,
	createTicketTool,
	moveTicketTool,
	assignTool,
];

/**
 * Register all Mission Control MCP tools via the supplied callback.
 *
 * @param register - A callback invoked once for each tool. Typically provided
 *   by the MCP gateway integration layer so that tools are published alongside
 *   any existing graph/vector tools.
 *
 * @example
 * ```typescript
 * registerMissionControlTools((tool) => {
 *   mcpServer.addTool(tool.name, tool.description, tool.inputSchema, tool.handler);
 * });
 * ```
 */
export function registerMissionControlTools(
	register: (tool: MissionControlToolRegistration) => void
): void {
	for (const tool of MISSION_CONTROL_TOOLS) {
		register(tool);
	}
}
