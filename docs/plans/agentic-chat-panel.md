# Plan: World-Class Agentic Chat Panel

**Design:** docs/design/agentic-chat-panel.md
**Status:** Awaiting approval
**Tasks:** 28 tasks across 7 groups
**Tier:** Tier 1 (new files) + Tier 2 (extension.ts rewire, package.json, provider priority)

## Execution Order

### Group A: Foundation (Tasks 1-3)

**Task 1** - Chat protocol types
- Files: extensions/son-of-anton/src/chat/ChatProtocol.ts (new)
- Define ExtToWebviewMessage and WebviewToExtMessage discriminated unions, ChatMessage interface, TokenUsage, ToolCallState types
- Verification: TypeScript compiles

**Task 2** - Stream manager
- Files: extensions/son-of-anton/src/chat/StreamManager.ts (new)
- Manages active LLM stream, batches token deltas (16ms throttle), tracks streaming state, supports cancellation via AbortController
- Verification: TypeScript compiles

**Task 3** - Tool executor
- Files: extensions/son-of-anton/src/chat/ToolExecutor.ts (new)
- Routes MCP tool calls with auto-approve by default. Tracks tool call state. Reads sota.toolApproval setting for per-tool override.
- Verification: TypeScript compiles

CHECKPOINT A

### Group B: Extension Host Chat Service (Tasks 4-7)

**Task 4** - Chat service core
- Files: extensions/son-of-anton/src/chat/ChatService.ts (new)
- Central orchestrator: receives messages, routes to LlmClient, pipes through StreamManager, handles tool calls via ToolExecutor, maintains conversation history.
- Verification: TypeScript compiles

**Task 5** - Chat webview provider
- Files: extensions/son-of-anton/src/chat/ChatWebviewProvider.ts (new)
- Implements vscode.WebviewViewProvider for auxiliary bar. Resolves webview with React bundle, CSP with nonce, postMessage routing. retainContextWhenHidden: true.
- Verification: TypeScript compiles

**Task 6** - Fix LLM provider priority [Tier 2]
- Files: extensions/son-of-anton/src/llm/LlmClient.ts (modify)
- If ANTHROPIC_API_KEY set, prioritize AnthropicProvider first. Fixes 24s latency.
- Verification: TypeScript compiles

**Task 7** - AnthropicProvider streaming improvements
- Files: extensions/son-of-anton/src/llm/providers/AnthropicProvider.ts (modify)
- Prompt caching, rate limit handling, tool_use block streaming
- Verification: TypeScript compiles

CHECKPOINT B

### Group C: React Webview Scaffold (Tasks 8-12)

**Task 8** - Webview project scaffold
- Files: extensions/son-of-anton/webview-ui/ (package.json, tsconfig.json, vite.config.ts)
- React + TypeScript + Vite. Dependencies: react, react-dom, react-virtuoso, marked, shiki.
- Verification: npm install and npm run build succeed

**Task 9** - IPC client and shared types
- Files: webview-ui/src/protocol/types.ts, ipcClient.ts (new)
- Type-safe postMessage wrapper with discriminated union types
- Verification: TypeScript compiles

**Task 10** - Chat context and state management
- Files: webview-ui/src/context/ChatContext.tsx, useStreaming.ts (new)
- React context for messages, stream state, tool calls, model selection
- Verification: TypeScript compiles

**Task 11** - App root and entry point
- Files: webview-ui/src/App.tsx, index.tsx, index.html (new)
- React entry with ChatProvider wrapper
- Verification: npm run build produces working bundle

**Task 12** - Build integration [P]
- Files: extensions/son-of-anton/esbuild.mts (modify), package.json scripts
- Add build:webview script, wire into main build
- Verification: Single npm run build produces both bundles

CHECKPOINT C

### Group D: React Chat Components (Tasks 13-18)

**Task 13** - StreamingMarkdown component
- Incremental marked-based renderer with Shiki highlighting, memoized blocks

**Task 14** - ToolCallCard component
- Collapsible card: tool name, args, status, result, latency

**Task 15** - ChatRow component
- Discriminated union renderer for all message types

**Task 16** - InputArea component
- Textarea with Enter-to-send, slash commands, model selector, cancel

**Task 17** - ModelSelector component
- Dropdown for opus/sonnet/haiku with cost indicator

**Task 18** - ChatView container
- react-virtuoso with followOutput, welcome screen, scroll-to-bottom

CHECKPOINT D

### Group E: Wiring (Tasks 19-23)

**Task 19** - Package.json auxiliary bar registration [Tier 2]
**Task 20** - Extension.ts rewire [Tier 2]
**Task 21** - Wire AG-UI events to ChatService
**Task 22** - Wire MCP tool calls to chat
**Task 23** - Wire agent participants to new chat

CHECKPOINT E

### Group F: Cleanup (Tasks 24-26)

**Task 24** - Delete legacy chat surfaces
**Task 25** - Settings and configuration
**Task 26** - Son of Anton theme CSS

CHECKPOINT F

### Group G: Testing (Tasks 27-28)

**Task 27** - Unit tests for protocol and services
**Task 28** - Full compilation check

FINAL CHECKPOINT
