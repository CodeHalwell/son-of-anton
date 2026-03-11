# Son of Anton Completion — Implementation Plan

All changes are **Tier 1** (new files alongside core, zero merge conflict risk).

## Group 1: LLM Provider Abstraction (extension-only)

### Task 1.1: Create LlmProvider interface and types
- **Create** `extensions/son-of-anton/src/llm/types.ts`
- Extract `LlmMessage`, `LlmRequestOptions`, `LlmStreamEvent` etc. from `LlmClient.ts` into shared types
- Add `LlmProvider` interface: `name`, `isAvailable()`, `streamRequest()`
- Add `ProviderType` union: `'auto' | 'copilot' | 'anthropic' | 'model-router' | 'mock'`
- **Verify**: TypeScript compiles

### Task 1.2: Create MockProvider
- **Create** `extensions/son-of-anton/src/llm/providers/MockProvider.ts`
- Implements `LlmProvider`
- `isAvailable()` always returns true
- `streamRequest()` yields tokens with a helpful mock response that includes:
  - Acknowledgement of the user's message
  - Setup instructions for real providers (Copilot, Anthropic API, model-router)
  - Configuration setting names
- **Verify**: TypeScript compiles

### Task 1.3: Create AnthropicProvider
- **Create** `extensions/son-of-anton/src/llm/providers/AnthropicProvider.ts`
- Extract existing Anthropic API logic from `LlmClient.ts` into this provider
- Update model IDs to current versions (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001)
- `isAvailable()` checks for `sota.apiKey` config or `ANTHROPIC_API_KEY` env var
- **Verify**: TypeScript compiles

### Task 1.4: Create CopilotProvider
- **Create** `extensions/son-of-anton/src/llm/providers/CopilotProvider.ts`
- Uses `vscode.lm.selectChatModels()` to discover available models
- Maps `ModelId` to appropriate Copilot/Claude/Codex model
- Translates `LlmRequestOptions` to `vscode.LanguageModelChatMessage` format
- Translates streaming response back to `LlmStreamEvent`
- `isAvailable()` returns true if any chat models are discovered
- **Verify**: TypeScript compiles

### Task 1.5: Create ModelRouterProvider
- **Create** `extensions/son-of-anton/src/llm/providers/ModelRouterProvider.ts`
- HTTP client calling model-router service at configurable URL (default localhost:3200)
- Translates between `LlmRequestOptions` and model-router's request format
- Supports streaming via SSE parsing (same pattern as current Anthropic code)
- `isAvailable()` pings `/health` endpoint
- **Verify**: TypeScript compiles

### Task 1.6: Refactor LlmClient to use providers
- **Edit** `extensions/son-of-anton/src/llm/LlmClient.ts`
- Import all providers and the `LlmProvider` interface
- Add provider selection logic: read `sota.provider` setting
- `auto` mode: try providers in order (Copilot → ModelRouter → Anthropic → Mock)
- Cache the active provider after first successful availability check
- Keep existing `streamRequest()` and `request()` signatures unchanged
- Keep token tracking and cost estimation
- **Verify**: TypeScript compiles, all existing call sites unchanged

### Task 1.7: Update configuration schema
- **Edit** `extensions/son-of-anton/package.json` contributes.configuration
- Add `sota.provider` enum setting (auto/copilot/anthropic/model-router/mock)
- Add `sota.modelRouterUrl` string setting
- Add `sota.mcpGatewayUrl` string setting
- **Verify**: JSON valid

## Group 2: MCP Client Implementation (extension-only)

### Task 2.1: Implement real McpClient [P]
- **Edit** `extensions/son-of-anton/src/mcp/McpClient.ts`
- Add SSE connection to MCP gateway (`/sse` endpoint)
- Implement `connect()`: establish EventSource to gateway URL
- Implement `callTool()`: POST JSON-RPC to `/messages?sessionId=X`
- Implement `listTools()`: call `tools/list` via JSON-RPC
- Add reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
- Add `dispose()` method to close SSE connection
- Graceful degradation: if gateway unreachable, return structured error (not placeholder)
- Read gateway URL from `sota.mcpGatewayUrl` config setting
- **Verify**: TypeScript compiles

### Task 2.2: Wire McpClient lifecycle into extension.ts
- **Edit** `extensions/son-of-anton/src/extension.ts`
- Call `mcpClient.connect()` after construction (non-blocking, logs warning on failure)
- Add `mcpClient.dispose()` to the deactivation disposable
- **Verify**: TypeScript compiles

## Group 3: Extension Build & Launch

### Task 3.1: Build the extension [P]
- Run `cd extensions/son-of-anton && npx tsx esbuild.mts`
- Fix any build errors
- Verify `dist/extension.js` is created
- **Verify**: File exists and is non-empty

### Task 3.2: Verify IDE launches
- Run `./scripts/code.sh` or equivalent launch script
- Check for extension activation errors in Developer Tools console
- **Verify**: IDE window opens without crashes

## Group 4: Docker Services & Integration

### Task 4.1: Start Docker services [P]
- Run `docker compose up -d`
- Check `docker compose ps` for health status
- Verify key services: falkordb (6379), qdrant (6333), mcp-gateway (3100), model-router (3200)
- **Verify**: All services healthy or at least starting

### Task 4.2: Verify MCP gateway connectivity
- `curl http://localhost:3100/health` — should return JSON with backend status
- If FalkorDB/Qdrant not healthy, check logs
- **Verify**: Health endpoint responds

### Task 4.3: Verify model-router connectivity
- `curl http://localhost:3200/health` — should return healthy status
- **Verify**: Health endpoint responds

## Task Dependencies

```
1.1 → 1.2, 1.3, 1.4, 1.5 (all providers depend on types)
1.2, 1.3, 1.4, 1.5 → 1.6 (refactor needs all providers)
1.6 → 1.7 (config schema matches provider implementation)
2.1 → 2.2 (wire-up needs implementation)
1.6 + 2.2 → 3.1 (build needs all source changes)
3.1 → 3.2 (launch needs built extension)
4.1 → 4.2, 4.3 (connectivity needs running services)
```

[P] = can run in parallel with other [P] tasks in the same group

## Total: 13 tasks across 4 groups
