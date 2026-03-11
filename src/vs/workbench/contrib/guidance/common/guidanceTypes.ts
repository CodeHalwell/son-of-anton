/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// --- Enumerations ---

export const enum GuidanceCategory {
	Workflow = 'workflow',
	Skill = 'skill',
	Reference = 'reference',
	Rule = 'rule',
	Agent = 'agent',
}

export const enum WorkflowPhase {
	Brainstorm = 'brainstorm',
	Spec = 'spec',
	Plan = 'plan',
	Execute = 'execute',
	Review = 'review',
	Test = 'test',
}

export const enum SeverityTier {
	Critical = 'critical',
	Important = 'important',
	Minor = 'minor',
}

// --- Interfaces ---

export interface IGuidanceItem {
	readonly id: string;
	readonly category: GuidanceCategory;
	readonly title: string;
	readonly description: string;
	readonly tags: readonly string[];
	readonly content: string;
}

export interface IWorkflowDefinition {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly phases: readonly IWorkflowPhaseDefinition[];
}

export interface IWorkflowPhaseDefinition {
	readonly phase: WorkflowPhase;
	readonly title: string;
	readonly description: string;
	readonly requiredInputs: readonly string[];
	readonly producedOutputs: readonly string[];
}

export interface ICodeReviewFinding {
	readonly severity: SeverityTier;
	readonly file: string;
	readonly line: number;
	readonly message: string;
	readonly suggestion?: string;
}

export interface IAgentRole {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly specialisation: string;
	readonly allowedTools: readonly string[];
}

// --- Built-in workflows ---

export const BUILT_IN_WORKFLOWS: readonly IWorkflowDefinition[] = [
	{
		id: 'feature-development',
		title: 'Feature Development',
		description: 'End-to-end feature development pipeline: brainstorm \u2192 spec \u2192 plan \u2192 execute \u2192 review',
		phases: [
			{
				phase: WorkflowPhase.Brainstorm,
				title: 'Brainstorm',
				description: 'Structured Q&A to produce an approved design document',
				requiredInputs: ['Feature request or idea'],
				producedOutputs: ['docs/design/<feature>.md'],
			},
			{
				phase: WorkflowPhase.Spec,
				title: 'Write Spec',
				description: 'Define acceptance criteria, interface contracts, and verification matrix',
				requiredInputs: ['Approved design doc'],
				producedOutputs: ['docs/specs/<feature>.md'],
			},
			{
				phase: WorkflowPhase.Plan,
				title: 'Write Plan',
				description: 'Break spec into 2-5 minute tasks with file paths and verification steps',
				requiredInputs: ['Approved spec'],
				producedOutputs: ['docs/plans/<feature>.md', 'docs/tasks/<feature>.md'],
			},
			{
				phase: WorkflowPhase.Execute,
				title: 'Execute Plan',
				description: 'Dispatch subagents per task with two-stage review',
				requiredInputs: ['Approved plan'],
				producedOutputs: ['Implemented code'],
			},
			{
				phase: WorkflowPhase.Review,
				title: 'Code Review',
				description: 'Five-concern review: correctness, quality, security, tests, integration',
				requiredInputs: ['Completed code'],
				producedOutputs: ['Review findings'],
			},
		],
	},
	{
		id: 'bug-fix',
		title: 'Bug Fix',
		description: 'Reproduce \u2192 diagnose \u2192 fix \u2192 verify pipeline',
		phases: [
			{
				phase: WorkflowPhase.Test,
				title: 'Reproduce',
				description: 'Write a failing test that demonstrates the bug',
				requiredInputs: ['Bug report'],
				producedOutputs: ['Failing test'],
			},
			{
				phase: WorkflowPhase.Execute,
				title: 'Fix',
				description: 'Implement the minimum fix to make the test pass',
				requiredInputs: ['Failing test'],
				producedOutputs: ['Fixed code'],
			},
			{
				phase: WorkflowPhase.Review,
				title: 'Verify',
				description: 'Run full test suite and review the fix',
				requiredInputs: ['Fixed code'],
				producedOutputs: ['Passing tests'],
			},
		],
	},
	{
		id: 'tdd-cycle',
		title: 'Test-Driven Development',
		description: 'Red \u2192 Green \u2192 Refactor cycle for implementation tasks',
		phases: [
			{
				phase: WorkflowPhase.Test,
				title: 'Red',
				description: 'Write a failing test for the desired behaviour',
				requiredInputs: ['Behaviour specification'],
				producedOutputs: ['Failing test'],
			},
			{
				phase: WorkflowPhase.Execute,
				title: 'Green',
				description: 'Write minimum code to make the test pass',
				requiredInputs: ['Failing test'],
				producedOutputs: ['Passing test'],
			},
			{
				phase: WorkflowPhase.Review,
				title: 'Refactor',
				description: 'Clean up while keeping tests green',
				requiredInputs: ['Passing test'],
				producedOutputs: ['Clean code'],
			},
		],
	},
];

// --- Built-in rules ---

export const BUILT_IN_RULES: readonly IGuidanceItem[] = [
	{
		id: 'rule-tier-classification',
		category: GuidanceCategory.Rule,
		title: 'Modification Tier Policy',
		description: 'Classify all changes by merge conflict risk: Tier 1 (new files), Tier 2 (hooks into existing), Tier 3 (core patches)',
		tags: ['merge', 'pr', 'review', 'risk'],
		content: 'Tier 1 (75%): New files in services/, extensions/, src/vs/sessions/. Zero conflict risk.\nTier 2 (20%): Adding imports, registrations, menu items to existing modules. Human review required.\nTier 3 (<5%): Direct patches to existing VS Code files. Senior review + written justification required.',
	},
	{
		id: 'rule-no-innerhtml',
		category: GuidanceCategory.Rule,
		title: 'No innerHTML',
		description: 'Never use innerHTML or outerHTML \u2014 use safe DOM methods (textContent, createElement, append)',
		tags: ['security', 'xss', 'dom'],
		content: 'All DOM content must be set using safe methods: textContent, createElement, appendChild, append. The codebase has a PreToolUse hook that blocks innerHTML usage.',
	},
	{
		id: 'rule-disposables',
		category: GuidanceCategory.Rule,
		title: 'Disposable Management',
		description: 'Register disposables immediately after creation using DisposableStore, MutableDisposable, or DisposableMap',
		tags: ['lifecycle', 'memory', 'leak'],
		content: 'Every disposable must be registered immediately. Use DisposableStore for groups, MutableDisposable for replaceable resources, DisposableMap for keyed resources. Never register to containing class from repeated methods \u2014 return IDisposable from the method instead.',
	},
	{
		id: 'rule-localization',
		category: GuidanceCategory.Rule,
		title: 'Localization Required',
		description: 'All user-facing strings must use nls.localize() \u2014 no hardcoded strings in the UI',
		tags: ['i18n', 'strings', 'nls'],
		content: 'Import { localize } from vs/nls.js. Use single quotes for internal strings, double quotes for user-facing localized strings. Never use string concatenation \u2014 use {0} placeholders.',
	},
	{
		id: 'rule-no-telemetry',
		category: GuidanceCategory.Rule,
		title: 'No Telemetry',
		description: 'No network calls to Microsoft domains, no telemetry without explicit opt-in',
		tags: ['privacy', 'telemetry', 'network'],
		content: 'Son of Anton removes all MS telemetry. No direct network calls to Microsoft domains. All telemetry endpoints must be removed or redirected. Respect user privacy.',
	},
	{
		id: 'rule-layer-boundaries',
		category: GuidanceCategory.Rule,
		title: 'Layer Boundaries',
		description: 'Respect VS Code layering: base \u2192 platform \u2192 editor \u2192 workbench \u2192 sessions',
		tags: ['architecture', 'imports', 'layers'],
		content: 'base has no dependencies. platform depends on base. editor depends on base + platform. workbench depends on all above. sessions sits alongside workbench \u2014 may import from it but NOT vice versa. Run npm run valid-layers-check to verify.',
	},
	{
		id: 'rule-code-review-tiers',
		category: GuidanceCategory.Rule,
		title: 'Code Review Severity',
		description: 'Three severity tiers: Critical (must fix), Important (should fix), Minor (nice to have)',
		tags: ['review', 'quality', 'severity'],
		content: 'Critical: correctness bugs, security vulnerabilities, data integrity risks. Important: missing tests, design problems, performance issues, pattern inconsistency. Minor: naming, style, docstrings.',
	},
	{
		id: 'rule-conventional-commits',
		category: GuidanceCategory.Rule,
		title: 'Conventional Commits',
		description: 'All commits follow type(scope): description format',
		tags: ['git', 'commits', 'conventions'],
		content: 'Format: type(scope): short description. Types: feat, fix, chore, docs, refactor, test, perf, build, ci. Max 72 chars subject. Imperative mood. Body explains WHY not WHAT.',
	},
];

// --- Built-in agent roles ---

export const BUILT_IN_AGENT_ROLES: readonly IAgentRole[] = [
	{ id: 'typescript-engineer', label: 'TypeScript Engineer', description: 'VS Code codebase patterns, DI, contributions', specialisation: 'TypeScript, VS Code API, Extension Development', allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
	{ id: 'frontend-engineer', label: 'Frontend Engineer', description: 'SoA UI with VS Code DOM APIs and design tokens', specialisation: 'ViewPane, EditorPane, CSS, SoA Tokens', allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
	{ id: 'backend-engineer', label: 'Backend Engineer', description: 'Services, Docker Compose, FalkorDB, Qdrant', specialisation: 'TypeScript/Node.js, Docker, gRPC, Redis', allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
	{ id: 'code-reviewer', label: 'Code Reviewer', description: 'Five-concern review with severity tiers', specialisation: 'Correctness, Quality, Security, Tests, Integration', allowedTools: ['Read', 'Glob', 'Grep'] },
	{ id: 'security-scanner', label: 'Security Scanner', description: 'XSS, injection, credential exposure, OWASP', specialisation: 'Security Analysis, Vulnerability Detection', allowedTools: ['Read', 'Glob', 'Grep'] },
	{ id: 'test-writer', label: 'Test Writer', description: 'VS Code test patterns, describe/test blocks', specialisation: 'Mocha, assert.deepStrictEqual, scripts/test.sh', allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
	{ id: 'task-executor', label: 'Task Executor', description: 'Executes single plan tasks precisely', specialisation: 'Plan Execution, Verification', allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] },
	{ id: 'task-reviewer', label: 'Task Reviewer', description: 'Two-stage review: spec compliance + code quality', specialisation: 'Spec Validation, Quality Gates', allowedTools: ['Read', 'Glob', 'Grep'] },
];

// --- Built-in skills ---

export const BUILT_IN_SKILLS: readonly IGuidanceItem[] = [
	{ id: 'skill-brainstorm', category: GuidanceCategory.Skill, title: 'Brainstorm', description: 'Structured Q&A \u2192 approved design document', tags: ['design', 'planning', 'requirements'], content: 'Transform vague requests into precise design documents through structured questioning. Questions cover scope, users, data, integration, constraints, edge cases, success criteria.' },
	{ id: 'skill-write-plan', category: GuidanceCategory.Skill, title: 'Write Plan', description: 'Design doc \u2192 implementation plan with 2-5 min tasks', tags: ['planning', 'tasks', 'execution'], content: 'Break approved designs into granular tasks. Each task has file paths, description, expected output, verification step. Interface-first ordering. Human checkpoints every 3 tasks.' },
	{ id: 'skill-execute-plan', category: GuidanceCategory.Skill, title: 'Execute Plan', description: 'Dispatch subagents per task with two-stage review', tags: ['execution', 'agents', 'automation'], content: 'Execute plans by dispatching fresh subagents per task. Two-stage review: spec compliance then code quality. Max 2 retries before escalating.' },
	{ id: 'skill-sdd', category: GuidanceCategory.Skill, title: 'Spec-Driven Development', description: 'Specifications as primary artefact with verification matrix', tags: ['specs', 'verification', 'contracts'], content: 'Specs define what done looks like. Complexity detection scales ceremony. Requirements have acceptance criteria. Verification matrix tracks test status.' },
	{ id: 'skill-tdd', category: GuidanceCategory.Skill, title: 'Test-Driven Development', description: 'Red \u2192 Green \u2192 Refactor cycle', tags: ['testing', 'tdd', 'red-green-refactor'], content: 'Write failing test first. Write minimum code to pass. Refactor while keeping tests green. Repeat.' },
	{ id: 'skill-code-review', category: GuidanceCategory.Skill, title: 'Code Review', description: 'Five-concern review with three severity tiers', tags: ['review', 'quality', 'security'], content: 'Review order: correctness \u2192 quality \u2192 security \u2192 tests \u2192 integration. Severity: Critical (must fix), Important (should fix), Minor (nice to have).' },
	{ id: 'skill-git-workflow', category: GuidanceCategory.Skill, title: 'Git Workflow', description: 'Branch naming, conventional commits, safe rebase', tags: ['git', 'branches', 'commits'], content: 'feat/fix/chore/docs/refactor/test branches. Conventional commits. Squash WIP. Never force-push shared branches.' },
	{ id: 'skill-adr', category: GuidanceCategory.Skill, title: 'Architecture Decision Records', description: 'MADR format for significant decisions', tags: ['architecture', 'decisions', 'documentation'], content: 'Write ADRs for significant, contested, non-obvious decisions. MADR format: context, decision, alternatives, consequences. Files in docs/decisions/.' },
	{ id: 'skill-change-history', category: GuidanceCategory.Skill, title: 'Change History', description: 'Structured JSON log of medium-to-large changes', tags: ['history', 'tracking', 'changes'], content: 'Log changes to .history/changes.json. Schema: id, timestamp, type, scope, summary, detail, files_changed, breaking, tier.' },
	{ id: 'skill-tier-classification', category: GuidanceCategory.Skill, title: 'Tier Classification', description: 'Classify modifications by merge conflict risk', tags: ['tiers', 'merge', 'risk'], content: 'Tier 1: new files (75%). Tier 2: hooks into existing (20%). Tier 3: core patches (<5%). Every PR states its tier.' },
];
