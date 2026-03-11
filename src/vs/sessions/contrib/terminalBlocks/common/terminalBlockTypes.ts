/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for the Terminal Blocks surface.
 *
 * Terminal Blocks reimagine the terminal as a semantic, block-based interface
 * with agent attribution. Each command execution becomes a discrete block with
 * metadata about who ran it and why.
 */

export const enum TerminalBlockKind {
	/** Manual command entered by the user. */
	Manual = 'manual',
	/** Command originated by an agent. */
	AgentOriginated = 'agentOriginated',
	/** Build or test output. */
	BuildTest = 'buildTest',
	/** Checkpoint marker — snapshot taken at this point. */
	Checkpoint = 'checkpoint',
	/** System message (e.g., session start, agent connect). */
	System = 'system'
}

export const enum BuildTestResult {
	Pass = 'pass',
	Fail = 'fail',
	Partial = 'partial'
}

export interface ITerminalBlockMetadata {
	/** The agent that originated this command, if any. */
	readonly agentId: string | undefined;
	/** Display name of the agent. */
	readonly agentName: string | undefined;
	/** LLM model used for this operation. */
	readonly modelUsed: string | undefined;
	/** Token cost for the operation (USD). */
	readonly costUsd: number | undefined;
	/** Tokens consumed (input). */
	readonly tokensIn: number | undefined;
	/** Tokens produced (output). */
	readonly tokensOut: number | undefined;
	/** Checkpoint snapshot ID, if a checkpoint was created. */
	readonly checkpointId: string | undefined;
	/** Build/test result, if this is a build/test block. */
	readonly buildResult: BuildTestResult | undefined;
}

export interface ITerminalBlock {
	readonly id: string;
	readonly kind: TerminalBlockKind;
	readonly command: string;
	readonly output: string;
	readonly exitCode: number | undefined;
	readonly startedAt: number;
	readonly endedAt: number | undefined;
	readonly workingDirectory: string;
	readonly metadata: ITerminalBlockMetadata;
}

/**
 * Border colours per block kind, matching the design spec.
 */
export const BLOCK_BORDER_COLORS: Record<TerminalBlockKind, string> = {
	[TerminalBlockKind.Manual]: '#3A3A3A',
	[TerminalBlockKind.AgentOriginated]: '#F5A623',
	[TerminalBlockKind.BuildTest]: '#2A5A2A',  // green for pass, overridden to #5A2A2A for fail
	[TerminalBlockKind.Checkpoint]: '#B8860B',
	[TerminalBlockKind.System]: '#2A2A2A'
};

/**
 * OSC escape sequence prefix for terminal block metadata.
 * Agents embed metadata in OSC sequences that the block renderer intercepts.
 *
 * Format: ESC ] 1337 ; SonOfAnton=<json> ST
 */
export const SOA_OSC_PREFIX = '\x1b]1337;SonOfAnton=';
export const SOA_OSC_SUFFIX = '\x07';

// ---- Type guards ----

export function isAgentBlock(block: ITerminalBlock): boolean {
	return block.kind === TerminalBlockKind.AgentOriginated;
}

export function isCheckpointBlock(block: ITerminalBlock): boolean {
	return block.kind === TerminalBlockKind.Checkpoint;
}

export function isBuildFailure(block: ITerminalBlock): boolean {
	return block.kind === TerminalBlockKind.BuildTest && block.metadata.buildResult === BuildTestResult.Fail;
}
