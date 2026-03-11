# Design: World-Class Agentic Chat Panel

**Status:** Approved
**Tier:** Tier 1 (new files) + Tier 2 (hooks into existing modules)
**Author:** Claude
**Date:** 2026-03-11

## Summary

Replace Son of Anton's three fragmented chat surfaces (ChatPanel, AgentChatPanel, AntonChatView) with a single React-based webview chat panel in the auxiliary bar. Fix the 24s chat latency by defaulting to AnthropicProvider. Add streaming markdown rendering, tool call visualization with auto-approve, and typed IPC protocol.

## Goals

1. **Sub-second TTFT** — Switch default LLM provider from ClaudeCliProvider to AnthropicProvider
2. **Single chat surface** — One React webview panel in the auxiliary bar, replacing 3 fragmented UIs
3. **Streaming markdown** — Proper incremental rendering with syntax highlighting
4. **Tool call visibility** — Inline tool call cards with expand/collapse, auto-approve by default
5. **Typed IPC** — Discriminated union message protocol between extension host and webview
6. **AG-UI integration** — Preserve and improve the existing AG-UI event system
7. **MCP tool rendering** — Show MCP tool calls and results inline in chat

## Architecture

### Layer 1: React Webview (New)

```
extensions/son-of-anton/webview-ui/
  src/
    App.tsx              — Root with ChatProvider context
    components/
      ChatView.tsx       — Main chat container (always mounted)
      ChatRow.tsx        — Discriminated union message renderer
      ToolCallCard.tsx   — Tool call visualization with expand/collapse
      StreamingMarkdown.tsx — Incremental markdown with syntax highlighting
      InputArea.tsx      — Chat input with slash commands, @ mentions
      ModelSelector.tsx  — Model picker (opus/sonnet/haiku)
    context/
      ChatContext.tsx     — React context for chat state
      useStreaming.ts     — Hook for streaming message updates
    protocol/
      types.ts           — Shared IPC message types
      ipcClient.ts       — postMessage wrapper with type safety
  vite.config.ts         — Single-bundle output to dist/
  package.json           — React, react-virtuoso, marked, shiki
  tsconfig.json
```

### Layer 2: Extension Host Chat Service (Refactored)

```
extensions/son-of-anton/src/chat/
  ChatService.ts         — Central chat service (replaces ChatPanel + AgentChatPanel)
  ChatWebviewProvider.ts — WebviewViewProvider for auxiliary bar
  ChatProtocol.ts        — IPC message type definitions (shared with webview)
  StreamManager.ts       — Manages active LLM streams, batches updates
  ToolExecutor.ts        — Executes tool calls, manages approval state
```

### Layer 3: LLM Provider Fix

- Change provider priority: **Anthropic** (direct API) then Copilot then Claude CLI then others
- AnthropicProvider already exists — just needs to be prioritized when `ANTHROPIC_API_KEY` is set
- Keep full multi-provider fallback chain

### Layer 4: IPC Protocol

Typed discriminated union messages:

```typescript
// Extension to Webview
type ExtToWebviewMessage =
  | { type: 'streamStart'; threadId: string; model: string }
  | { type: 'streamDelta'; threadId: string; content: string }
  | { type: 'streamEnd'; threadId: string; usage: TokenUsage }
  | { type: 'toolCallStart'; threadId: string; toolId: string; name: string; args: unknown }
  | { type: 'toolCallResult'; threadId: string; toolId: string; result: string; isError: boolean }
  | { type: 'error'; threadId: string; message: string }
  | { type: 'sessionRestore'; messages: ChatMessage[] }

// Webview to Extension
type WebviewToExtMessage =
  | { type: 'sendMessage'; content: string; model?: ModelId }
  | { type: 'cancelStream' }
  | { type: 'approveToolCall'; toolId: string }
  | { type: 'denyToolCall'; toolId: string }
  | { type: 'slashCommand'; command: string; args: string }
```

### Layer 5: Streaming Markdown

Use `marked` for incremental parsing with memoized block rendering:
- Split markdown into blocks (paragraphs, code fences, lists)
- Memoize completed blocks — only re-render the latest (streaming) block
- Use Shiki (WASM) for syntax highlighting with VS Code theme colors
- Handle unterminated code blocks during streaming

### Layer 6: Tool Call Visualization

```
+-------------------------------------+
| wrench readFile                   v  |
| src/extension.ts                     |
| ------------------------------------ |
| check 462 lines read (23ms)         |
+-------------------------------------+
```

- Collapsible cards with tool name, arguments summary, result preview
- Auto-approve by default; configurable per-tool in `sota.toolApproval` setting
- Show latency and success/error status
- MCP tools rendered the same way as built-in tools

### Layer 7: Panel Registration

Register as a `WebviewViewProvider` in the auxiliary bar:
- View ID: `sota.chat`
- Container: new `sota-chat` view container in auxiliary bar
- Keybinding: `Cmd+L` (toggle chat panel)
- `retainContextWhenHidden: true` for state preservation

## Files to Delete

- `extensions/son-of-anton/src/chat/ChatPanel.ts` (legacy single-turn)
- `extensions/son-of-anton/src/agui/AgentChatPanel.ts` (replaced by new panel)
- `extensions/son-of-anton/src/agui/agentChatHtml.ts` (replaced by React webview)
- `src/vs/workbench/contrib/antonChat/` (entire directory — replaced)

## Files to Keep/Refactor

- `extensions/son-of-anton/src/agui/AgUiEventEmitter.ts` — keep, wire to new ChatService
- `extensions/son-of-anton/src/agui/AgUiRunStore.ts` — keep, wire to new ChatService
- `extensions/son-of-anton/src/agui/AgentViewProvider.ts` — keep (sidebar tree view)
- `extensions/son-of-anton/src/agui/types.ts` — keep, extend as needed
- `extensions/son-of-anton/src/llm/LlmClient.ts` — refactor provider priority
- `extensions/son-of-anton/src/agents/AgentParticipants.ts` — keep, wire to new service
- `extensions/son-of-anton/src/mcp/McpClient.ts` — keep, wire tool calls to chat

## Edge Cases

- No ANTHROPIC_API_KEY: fall back to Copilot or ClaudeCliProvider with warning
- MCP gateway down: tool calls fail gracefully with error card in chat
- Very long messages: react-virtuoso handles virtualization
- User scrolls up during streaming: disable auto-scroll, show "scroll to bottom" button
- Network disconnect during stream: show error, allow retry
- Multiple concurrent streams: only one active at a time, queue or reject

## Security

- Webview CSP with nonce for inline scripts
- No dynamic code execution or innerHTML for user content — use safe DOM APIs
- API keys stored in VS Code SecretStorage, never in settings.json
- Tool call results sanitized before rendering

## Testing Strategy

- Unit tests for ChatProtocol message serialization
- Unit tests for StreamManager batching logic
- Unit tests for ToolExecutor approval flow
- Integration test: send message then receive stream then render in webview
- Snapshot tests for ChatRow component variants
