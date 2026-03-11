# Son of Anton — IDE Completion Design

## Goal

Complete the Son of Anton IDE implementation so it can be built, launched, and used interactively. The IDE must support multiple LLM providers (Anthropic API, GitHub Copilot, Claude Code CLI, OpenAI Codex) and work in mock mode when no keys are configured.

## Current State

- **Extension source**: 60+ TypeScript files, all present in `extensions/son-of-anton/src/`
- **Extension build**: esbuild config exists (`esbuild.mts`), `dist/` directory missing — never compiled
- **LlmClient**: Hardcoded to direct Anthropic API calls. Outdated model IDs (claude-3-opus-20240229). No mock mode.
- **McpClient**: 49-line stub. Returns placeholder responses. Blocks all graph-based agent features.
- **ModelRouter (extension)**: Complete A/B testing framework (480 lines). Not wired into LlmClient.
- **MCP Gateway service**: Full implementation with 18 tools (graph queries, vector search, memory, specs, build DAG). Uses SSE transport on port 3100.
- **Model Router service**: Express server on port 3200. Supports Anthropic + OpenAI format providers with fallback routing, A/B splits, metrics.
- **Docker Compose**: 17 services defined with health checks. Not verified as running.
- **10 chat participants** registered in package.json (orchestrator + 9 specialists)
- **Agent types registered**: Only 9 in AgentParticipants.ts — DesignAgent, RequirementsAgent, TaskDecompositionAgent, SpecPipelineManager, PenTestCoordinatorAgent exist as files but aren't registered as chat participants

## Architecture

### Multi-Provider LLM Architecture

Refactor LlmClient to use a provider abstraction. Each provider implements a common interface.

```
LlmClient (orchestrator)
  ├── AnthropicProvider     — Direct Anthropic API (existing, refactored)
  ├── ModelRouterProvider   — Routes through model-router service (port 3200)
  ├── CopilotProvider       — Uses VS Code Copilot Chat API (vscode.lm)
  ├── MockProvider          — Returns demo responses for testing
  └── (future: OllamaProvider, etc.)
```

**Provider selection logic:**
1. Check `sota.provider` setting (user choice)
2. If `auto` (default): try Copilot API first (free with subscription), fall back to model-router service, fall back to direct Anthropic, fall back to mock
3. Mock mode always available as last resort — shows setup instructions in responses

**CopilotProvider** uses VS Code's built-in `vscode.lm.selectChatModels()` API. This lets users leverage their existing GitHub Copilot, Claude Code, or Codex subscriptions without additional API keys. The VS Code LM API is the primary integration point for subscription-based models.

**ModelRouterProvider** calls the model-router service which already supports Anthropic and OpenAI format providers with fallback routing.

### McpClient Implementation

Replace the stub with a real SSE client connecting to the MCP gateway on port 3100.

```
McpClient
  ├── connect()          — Establish SSE connection to /sse endpoint
  ├── callTool()         — Send JSON-RPC via POST /messages?sessionId=X
  ├── listTools()        — Call tools/list via the MCP protocol
  ├── reconnect()        — Auto-reconnect on connection loss
  └── dispose()          — Clean up SSE connection
```

Uses the `@modelcontextprotocol/sdk` client library (already a dependency of the MCP gateway — add to extension devDeps or use raw fetch since extension runs in Node).

**Fallback**: If MCP gateway is unreachable, McpClient returns structured error responses (not placeholder stubs) so agents can gracefully degrade.

### Extension Build Pipeline

The extension uses esbuild via `extensions/son-of-anton/esbuild.mts` which imports from `extensions/esbuild-extension-common.mts`. Build command: `npx tsx esbuild.mts` from the extension directory. This compiles all TypeScript into `dist/extension.js`.

### Configuration Schema Changes

Add to `package.json` contributes.configuration:
- `sota.provider`: `auto | copilot | anthropic | model-router | mock` (default: `auto`)
- `sota.modelRouterUrl`: URL for model-router service (default: `http://localhost:3200`)
- `sota.mcpGatewayUrl`: URL for MCP gateway (default: `http://localhost:3100`)

### Model ID Updates

Update the model ID mapping to current versions:
- `opus` → `claude-opus-4-6`
- `sonnet` → `claude-sonnet-4-6`
- `haiku` → `claude-haiku-4-5-20251001`

### What's NOT In Scope

- Building new services (they already exist)
- Creating new agents (all needed agents exist as source files)
- Modifying VS Code core (all changes are Tier 1 — new files or extension-only)
- Setting up CI/CD
- Database schema or indexer changes

## Component Design

### 1. LlmProvider Interface

```typescript
interface LlmProvider {
  readonly name: string;
  readonly isAvailable: () => Promise<boolean>;
  streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent>;
}
```

### 2. MockProvider

Returns helpful demo responses that include:
- A brief mock response to the user's query
- Instructions on how to configure a real provider
- Available provider options (Copilot subscription, Anthropic API key, model-router service)

### 3. CopilotProvider

Uses `vscode.lm.selectChatModels()` to discover available models from Copilot/Claude Code/Codex subscriptions. Maps requests to the VS Code LM API format. Translates streaming responses back to `LlmStreamEvent`.

### 4. McpClient (Real)

SSE connection lifecycle:
1. On extension activate: attempt connection to MCP gateway
2. If unavailable: log warning, agents degrade gracefully
3. On connection: call `tools/list` to cache available tools
4. On tool call: POST to `/messages?sessionId=X` with JSON-RPC payload
5. On disconnect: attempt reconnect with exponential backoff (max 30s)

## Testing Strategy

- **Manual smoke test**: Launch IDE via `./scripts/code.sh`, open chat, send message to @anton
- **Mock mode**: Verify responses appear without any API key
- **Copilot mode**: If Copilot extension is installed, verify model discovery
- **MCP connectivity**: Start Docker services, verify tool calls return real data
- **Extension compilation**: `npm run compile-check-ts-native` must pass

## Launch Sequence

1. Build the extension: `cd extensions/son-of-anton && npx tsx esbuild.mts`
2. Optionally start Docker services: `docker compose up -d`
3. Launch IDE: `./scripts/code.sh`
4. Open chat panel (Cmd+Shift+P → "Anton: Open Chat" or via sidebar)
5. Type `@anton hello` to test
