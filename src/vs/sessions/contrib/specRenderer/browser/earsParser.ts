/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEarsClause, EarsClauseKind, ClauseStatus } from '../common/specTypes.js';

/**
 * Regular expressions for each EARS clause pattern.
 * Uses named capture groups for clarity.
 */

/** WHEN <trigger> THE SYSTEM SHALL <behaviour> */
const EVENT_PATTERN = /\bWHEN\s+(?<trigger>.+?)\s+THE\s+SYSTEM\s+SHALL\s+(?<behaviour>.+)/i;

/** WHILE <state> THE SYSTEM SHALL <behaviour> */
const STATE_PATTERN = /\bWHILE\s+(?<state>.+?)\s+THE\s+SYSTEM\s+SHALL\s+(?<behaviour>.+)/i;

/** WHERE <feature> THE SYSTEM SHALL <behaviour> */
const FEATURE_PATTERN = /\bWHERE\s+(?<feature>.+?)\s+THE\s+SYSTEM\s+SHALL\s+(?<behaviour>.+)/i;

/** IF <condition> THEN THE SYSTEM SHALL <behaviour> */
const OPTION_PATTERN = /\bIF\s+(?<condition>.+?)\s+THEN\s+THE\s+SYSTEM\s+SHALL\s+(?<behaviour>.+)/i;

/** THE SYSTEM SHALL <behaviour> — must not be preceded by a keyword that would match another pattern */
const UBIQUITOUS_PATTERN = /\bTHE\s+SYSTEM\s+SHALL\s+(?<behaviour>.+)/i;

interface ClauseMatch {
	kind: EarsClauseKind;
	trigger: string | undefined;
	condition: string | undefined;
	behaviour: string;
}

/**
 * Attempts to match a single line of text against all EARS patterns.
 * Returns the clause kind, trigger/condition, and behaviour if matched,
 * or `undefined` if the text does not match any EARS pattern.
 */
function matchClause(text: string): ClauseMatch | undefined {
	// Order matters: more specific patterns (with leading keywords) must be
	// tested before the ubiquitous pattern, which would otherwise match
	// any sentence containing "THE SYSTEM SHALL".

	const eventMatch = EVENT_PATTERN.exec(text);
	if (eventMatch?.groups) {
		return {
			kind: EarsClauseKind.Event,
			trigger: eventMatch.groups['trigger']!.trim(),
			condition: undefined,
			behaviour: eventMatch.groups['behaviour']!.trim(),
		};
	}

	const stateMatch = STATE_PATTERN.exec(text);
	if (stateMatch?.groups) {
		return {
			kind: EarsClauseKind.State,
			trigger: stateMatch.groups['state']!.trim(),
			condition: undefined,
			behaviour: stateMatch.groups['behaviour']!.trim(),
		};
	}

	const featureMatch = FEATURE_PATTERN.exec(text);
	if (featureMatch?.groups) {
		return {
			kind: EarsClauseKind.Feature,
			trigger: featureMatch.groups['feature']!.trim(),
			condition: undefined,
			behaviour: featureMatch.groups['behaviour']!.trim(),
		};
	}

	const optionMatch = OPTION_PATTERN.exec(text);
	if (optionMatch?.groups) {
		return {
			kind: EarsClauseKind.Option,
			trigger: undefined,
			condition: optionMatch.groups['condition']!.trim(),
			behaviour: optionMatch.groups['behaviour']!.trim(),
		};
	}

	const ubiquitousMatch = UBIQUITOUS_PATTERN.exec(text);
	if (ubiquitousMatch?.groups) {
		return {
			kind: EarsClauseKind.Ubiquitous,
			trigger: undefined,
			condition: undefined,
			behaviour: ubiquitousMatch.groups['behaviour']!.trim(),
		};
	}

	return undefined;
}

/**
 * Generate a deterministic clause ID from index and raw text.
 */
function generateClauseId(index: number, rawText: string): string {
	return `ears-${index}-${rawText.length}`;
}

/**
 * Parse EARS (Easy Approach to Requirements Syntax) clauses from markdown text.
 *
 * Scans each non-empty line for one of the five EARS patterns:
 * - **Event:** `WHEN <trigger> THE SYSTEM SHALL <behaviour>`
 * - **State:** `WHILE <state> THE SYSTEM SHALL <behaviour>`
 * - **Feature:** `WHERE <feature> THE SYSTEM SHALL <behaviour>`
 * - **Option:** `IF <condition> THEN THE SYSTEM SHALL <behaviour>`
 * - **Ubiquitous:** `THE SYSTEM SHALL <behaviour>`
 *
 * Lines that do not match any pattern are silently skipped.
 *
 * @param markdown — raw markdown text, typically from a requirements.md file
 * @returns an array of parsed EARS clauses
 */
export function parseEarsClauses(markdown: string): IEarsClause[] {
	const clauses: IEarsClause[] = [];
	const lines = markdown.split('\n');

	let clauseIndex = 0;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}

		// Strip leading markdown list markers (-, *, numbered) and blockquote markers (>)
		const stripped = line
			.replace(/^(?:>\s*)*/, '')       // blockquote markers
			.replace(/^(?:[-*]|\d+\.)\s+/, '') // list markers
			.trim();

		if (stripped.length === 0) {
			continue;
		}

		const result = matchClause(stripped);
		if (result) {
			clauses.push({
				id: generateClauseId(clauseIndex, stripped),
				kind: result.kind,
				rawText: stripped,
				trigger: result.trigger,
				condition: result.condition,
				behaviour: result.behaviour,
				status: ClauseStatus.Untested,
				linkedTestIds: [],
			});
			clauseIndex++;
		}
	}

	return clauses;
}
