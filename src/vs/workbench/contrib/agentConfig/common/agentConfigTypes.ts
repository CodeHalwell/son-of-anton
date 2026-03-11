/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// --- Provider definitions ---

export const enum ProviderStatus {
	Connected = 'connected',
	Disconnected = 'disconnected',
	NotConfigured = 'not-configured',
}

export const enum ModelTier {
	Premium = 'premium',
	Standard = 'standard',
	Economy = 'economy',
	Local = 'local',
}

export interface IModelDefinition {
	readonly id: string;
	readonly label: string;
	readonly tier: ModelTier;
	readonly contextWindow: number;
	readonly supportsStreaming: boolean;
	readonly supportsToolUse: boolean;
}

export interface IProviderDefinition {
	readonly id: string;
	readonly label: string;
	readonly icon: string;
	readonly description: string;
	readonly models: readonly IModelDefinition[];
	readonly status: ProviderStatus;
	readonly requiresApiKey: boolean;
	readonly configuredKeyName?: string;
}

// --- Agent definitions ---

export const enum AgentRole {
	Orchestrator = 'orchestrator',
	CodeGenerator = 'code-generator',
	CodeReviewer = 'code-reviewer',
	TestWriter = 'test-writer',
	SecurityScanner = 'security-scanner',
	DocumentationWriter = 'documentation-writer',
	SpecAuthor = 'spec-author',
	Moderniser = 'moderniser',
	E2ETester = 'e2e-tester',
	BackendEngineer = 'backend-engineer',
	FrontendEngineer = 'frontend-engineer',
	DevOps = 'devops',
	Explorer = 'explorer',
	PrGenerator = 'pr-generator',
	PenTester = 'pen-tester',
}

export interface IAgentDefinition {
	readonly role: AgentRole;
	readonly label: string;
	readonly description: string;
	readonly icon: string;
	readonly defaultProviderId: string;
	readonly defaultModelId: string;
	readonly recommendedTier: ModelTier;
}

// --- Assignment (user-configurable mapping) ---

export interface IAgentProviderAssignment {
	readonly agentRole: AgentRole;
	readonly providerId: string;
	readonly modelId: string;
	readonly fallbackProviderId?: string;
	readonly fallbackModelId?: string;
	readonly enabled: boolean;
}

// --- Full configuration ---

export interface IAgentProviderConfig {
	readonly assignments: readonly IAgentProviderAssignment[];
	readonly globalFallbackProviderId: string;
	readonly globalFallbackModelId: string;
	readonly maxConcurrentAgents: number;
	readonly sessionBudgetUsd: number;
}

// --- Built-in provider catalogue ---

export const BUILT_IN_PROVIDERS: readonly IProviderDefinition[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		icon: 'sparkle',
		description: 'Anthropic Claude via Claude Code CLI — best for orchestration and complex reasoning',
		requiresApiKey: false,
		status: ProviderStatus.Connected,
		models: [
			{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6', tier: ModelTier.Premium, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: ModelTier.Standard, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: ModelTier.Economy, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
		],
	},
	{
		id: 'gemini-cli',
		label: 'Gemini CLI',
		icon: 'globe',
		description: 'Google Gemini via Gemini CLI — 1M context for large-scale analysis and research',
		requiresApiKey: false,
		status: ProviderStatus.Connected,
		models: [
			{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: ModelTier.Premium, contextWindow: 1000000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: ModelTier.Standard, contextWindow: 1000000, supportsStreaming: true, supportsToolUse: true },
		],
	},
	{
		id: 'github-copilot',
		label: 'GitHub Copilot',
		icon: 'github',
		description: 'GitHub Copilot via VS Code integration — PR creation, inline completions, code review',
		requiresApiKey: false,
		status: ProviderStatus.Connected,
		models: [
			{ id: 'copilot-claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (via Copilot)', tier: ModelTier.Standard, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'copilot-gpt-4o', label: 'GPT-4o (via Copilot)', tier: ModelTier.Standard, contextWindow: 128000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'copilot-gemini-2.5-pro', label: 'Gemini 2.5 Pro (via Copilot)', tier: ModelTier.Premium, contextWindow: 1000000, supportsStreaming: true, supportsToolUse: true },
		],
	},
	{
		id: 'openai-codex',
		label: 'OpenAI Codex',
		icon: 'beaker',
		description: 'OpenAI Codex CLI — sandbox execution, test iteration, prototyping',
		requiresApiKey: false,
		status: ProviderStatus.Connected,
		models: [
			{ id: 'codex-mini', label: 'Codex Mini', tier: ModelTier.Standard, contextWindow: 192000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'o3', label: 'o3', tier: ModelTier.Premium, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
			{ id: 'o4-mini', label: 'o4-mini', tier: ModelTier.Economy, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
		],
	},
	{
		id: 'ollama',
		label: 'Ollama (Local)',
		icon: 'server',
		description: 'Local models via Ollama — free, private, no network dependency',
		requiresApiKey: false,
		status: ProviderStatus.Disconnected,
		models: [
			{ id: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B', tier: ModelTier.Local, contextWindow: 32768, supportsStreaming: true, supportsToolUse: true },
			{ id: 'codellama:34b', label: 'Code LLaMA 34B', tier: ModelTier.Local, contextWindow: 16384, supportsStreaming: true, supportsToolUse: false },
			{ id: 'deepseek-coder-v2:16b', label: 'DeepSeek Coder v2 16B', tier: ModelTier.Local, contextWindow: 128000, supportsStreaming: true, supportsToolUse: true },
		],
	},
	{
		id: 'lm-studio',
		label: 'LM Studio (Local)',
		icon: 'desktop-download',
		description: 'Local models via LM Studio — GUI-managed local inference',
		requiresApiKey: false,
		status: ProviderStatus.Disconnected,
		models: [
			{ id: 'lm-studio-default', label: 'Active Model', tier: ModelTier.Local, contextWindow: 32768, supportsStreaming: true, supportsToolUse: false },
		],
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		icon: 'cloud',
		description: 'Multi-provider proxy — route to any model from one API key',
		requiresApiKey: true,
		configuredKeyName: 'OPENROUTER_API_KEY',
		status: ProviderStatus.NotConfigured,
		models: [
			{ id: 'openrouter/auto', label: 'Auto (best available)', tier: ModelTier.Standard, contextWindow: 200000, supportsStreaming: true, supportsToolUse: true },
		],
	},
];

// --- Built-in agent catalogue ---

export const BUILT_IN_AGENTS: readonly IAgentDefinition[] = [
	{ role: AgentRole.Orchestrator, label: 'Orchestrator', description: 'Decomposes requests into subtasks and delegates to specialists', icon: 'organization', defaultProviderId: 'claude-code', defaultModelId: 'claude-opus-4-6', recommendedTier: ModelTier.Premium },
	{ role: AgentRole.CodeGenerator, label: 'Code Generator', description: 'Multi-file code generation using graph-based context routing', icon: 'code', defaultProviderId: 'claude-code', defaultModelId: 'claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.CodeReviewer, label: 'Code Reviewer', description: 'Validates code via reflexion pattern — syntax, types, tests, security', icon: 'checklist', defaultProviderId: 'gemini-cli', defaultModelId: 'gemini-2.5-pro', recommendedTier: ModelTier.Premium },
	{ role: AgentRole.TestWriter, label: 'Test Writer', description: 'Generates tests, runs in sandbox, self-corrects on failure', icon: 'beaker', defaultProviderId: 'openai-codex', defaultModelId: 'codex-mini', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.SecurityScanner, label: 'Security Scanner', description: 'SAST/DAST scanning, SARIF interpretation, severity classification', icon: 'shield', defaultProviderId: 'claude-code', defaultModelId: 'claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.DocumentationWriter, label: 'Documentation Writer', description: 'JSDoc/docstrings, READMEs, changelogs', icon: 'book', defaultProviderId: 'claude-code', defaultModelId: 'claude-haiku-4-5', recommendedTier: ModelTier.Economy },
	{ role: AgentRole.SpecAuthor, label: 'Spec Author', description: 'Requirements (EARS), design docs, task breakdowns', icon: 'note', defaultProviderId: 'claude-code', defaultModelId: 'claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.Moderniser, label: 'Moderniser', description: 'Six-phase legacy code modernisation pipeline', icon: 'wrench', defaultProviderId: 'gemini-cli', defaultModelId: 'gemini-2.5-pro', recommendedTier: ModelTier.Premium },
	{ role: AgentRole.E2ETester, label: 'E2E Tester', description: 'Playwright-based browser tests via accessibility tree', icon: 'browser', defaultProviderId: 'openai-codex', defaultModelId: 'codex-mini', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.BackendEngineer, label: 'Backend Engineer', description: 'API design, database schemas, server-side implementation', icon: 'server-process', defaultProviderId: 'github-copilot', defaultModelId: 'copilot-claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.FrontendEngineer, label: 'Frontend Engineer', description: 'UI components, styling, client-side logic', icon: 'window', defaultProviderId: 'github-copilot', defaultModelId: 'copilot-claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.DevOps, label: 'DevOps', description: 'CI/CD pipelines, Docker, infrastructure-as-code', icon: 'cloud-upload', defaultProviderId: 'claude-code', defaultModelId: 'claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.Explorer, label: 'Explorer', description: 'Codebase exploration, quick completions, summaries', icon: 'search', defaultProviderId: 'claude-code', defaultModelId: 'claude-haiku-4-5', recommendedTier: ModelTier.Economy },
	{ role: AgentRole.PrGenerator, label: 'PR Generator', description: 'Feature branches, descriptive PRs, reviewer assignment', icon: 'git-pull-request', defaultProviderId: 'github-copilot', defaultModelId: 'copilot-claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
	{ role: AgentRole.PenTester, label: 'Penetration Tester', description: 'MAPTA-structured security testing against OWASP Top 10', icon: 'lock', defaultProviderId: 'claude-code', defaultModelId: 'claude-sonnet-4-6', recommendedTier: ModelTier.Standard },
];

// --- Default configuration ---

export function createDefaultConfig(): IAgentProviderConfig {
	return {
		assignments: BUILT_IN_AGENTS.map(agent => ({
			agentRole: agent.role,
			providerId: agent.defaultProviderId,
			modelId: agent.defaultModelId,
			enabled: true,
		})),
		globalFallbackProviderId: 'claude-code',
		globalFallbackModelId: 'claude-sonnet-4-6',
		maxConcurrentAgents: 5,
		sessionBudgetUsd: 10.00,
	};
}
