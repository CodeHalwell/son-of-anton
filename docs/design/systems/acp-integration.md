# ACP Integration — Design Spec

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 1 (new files alongside core)

---

## Overview

The Agent Client Protocol (ACP) is an open standard for connecting AI agents to IDEs without custom per-agent integrations. Originated by Zed and adopted by JetBrains, ACP uses JSON-RPC 2.0 over stdio or HTTP to provide a uniform interface for agent lifecycle management, tool invocation, and result streaming.

Son of Anton implements ACP as a first-class client. This means any ACP-compatible agent — Gemini CLI, Codex CLI, Aider, or a custom agent — can be registered and orchestrated alongside Son of Anton's built-in agents.

---

## What ACP Is

ACP standardises five capabilities:

1. **Agent Discovery** — The IDE queries an agent for its name, description, supported capabilities, and tool definitions.
2. **Task Delegation** — The IDE sends a task (natural language prompt + structured context) to an agent.
3. **Streaming Results** — The agent streams partial results (text, code, tool calls) back to the IDE via JSON-RPC notifications.
4. **Tool Invocation** — The agent can request the IDE to execute tools (file read/write, terminal commands, search) through a callback mechanism.
5. **Lifecycle Management** — The IDE starts, monitors, and stops agent processes.

### Protocol Details

- **Wire format:** JSON-RPC 2.0
- **Transport options:** stdio (agent runs as a child process) or HTTP (agent runs as a service)
- **Encoding:** UTF-8
- **Message framing:** For stdio, Content-Length headers (LSP-style). For HTTP, standard HTTP request/response with streaming via Server-Sent Events.

### Key JSON-RPC Methods

| Method | Direction | Purpose |
|---|---|---|
| `agent/initialize` | IDE -> Agent | Exchange capabilities, negotiate protocol version |
| `agent/task` | IDE -> Agent | Send a task with context |
| `agent/cancel` | IDE -> Agent | Cancel a running task |
| `agent/shutdown` | IDE -> Agent | Graceful shutdown |
| `agent/result` | Agent -> IDE | Stream partial or final results |
| `agent/toolCall` | Agent -> IDE | Agent requests IDE to execute a tool |
| `agent/toolResult` | IDE -> Agent | IDE returns tool execution result |
| `agent/status` | Agent -> IDE | Agent reports status changes (thinking, working, done, error) |

---

## Son of Anton as ACP Client

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Son of Anton IDE                      │
│                                                          │
│  ┌────────────────┐    ┌──────────────────────────────┐  │
│  │  Orchestrator   │───>│     ACP Gateway Service       │  │
│  │  Agent          │    │                              │  │
│  │                │    │  ┌─────────┐  ┌───────────┐  │  │
│  │  (routes tasks  │    │  │ stdio   │  │ HTTP/SSE  │  │  │
│  │   to best agent)│    │  │ clients │  │ clients   │  │  │
│  └────────────────┘    │  └────┬────┘  └─────┬─────┘  │  │
│                        │       │              │        │  │
│                        └───────┼──────────────┼────────┘  │
│                                │              │           │
└────────────────────────────────┼──────────────┼───────────┘
                                 │              │
                    ┌────────────┘    ┌─────────┘
                    v                 v
             ┌──────────┐      ┌──────────┐
             │ Gemini   │      │ Custom   │
             │ CLI      │      │ Agent    │
             │ (stdio)  │      │ (HTTP)   │
             └──────────┘      └──────────┘
```

### Agent Registry

Users register external ACP agents through settings or the MCP Connections sidebar:

```jsonc
// settings.json
"sota.acp.agents": [
  {
    "id": "gemini-cli",
    "name": "Gemini CLI",
    "transport": "stdio",
    "command": "gemini",
    "args": ["--acp"],
    "capabilities": ["code-generation", "explanation"],
    "trust": "workspace"
  },
  {
    "id": "custom-review-agent",
    "name": "Internal Review Bot",
    "transport": "http",
    "endpoint": "http://localhost:8500/acp",
    "capabilities": ["code-review"],
    "trust": "workspace"
  }
]
```

Agents can also be discovered automatically. When an `.acp.json` manifest file exists in the workspace root or in `~/.config/acp/agents/`, Son of Anton reads it and offers to register the agent.

### Auto-Discovery Manifest (`.acp.json`)

```jsonc
{
  "agents": [
    {
      "id": "my-agent",
      "name": "My Custom Agent",
      "transport": "stdio",
      "command": "node",
      "args": ["./agent/index.js", "--acp"],
      "capabilities": ["code-generation", "refactoring"]
    }
  ]
}
```

---

## Integration with Mission Control

External ACP agents appear in Mission Control exactly like internal agents:

- Each ACP agent task gets a **task card** with the agent's name, status, and streaming output
- Task cards show an **external badge** (small plug icon) to distinguish ACP agents from built-in agents
- The **cost indicator** shows "External" instead of a dollar amount (since token usage is managed by the external agent)
- **Checkpoint integration** works normally — the checkpoint service captures state before and after any file modifications, regardless of which agent initiated them

### Task Card Fields for ACP Agents

| Field | Source |
|---|---|
| Agent name | `IAcpAgent.name` |
| Status | `agent/status` notifications (thinking / working / done / error) |
| Output stream | `agent/result` notifications, rendered as markdown |
| Duration | Tracked by ACP gateway from task start to completion |
| Files modified | Tracked by file watcher, attributed to the ACP agent session |
| Checkpoint ID | Assigned by checkpoint service on file modification |

---

## Integration with Orchestrator

The orchestrator agent can delegate subtasks to ACP agents based on capability matching:

1. Orchestrator receives a complex task from the user
2. Orchestrator decomposes the task into subtasks
3. For each subtask, orchestrator checks:
   - Does a built-in agent handle this? Use it.
   - Does a registered ACP agent declare the matching capability? Delegate to it.
   - No match? Handle with the default Sonnet-backed code generation agent.
4. Results from ACP agents flow back through the orchestrator for synthesis

### Capability Matching

Capabilities are free-form strings. The orchestrator maintains a mapping from task types to capability strings:

| Task Type | Capability String | Example Agent |
|---|---|---|
| Code generation | `code-generation` | Gemini CLI, Codex CLI |
| Code review | `code-review` | Internal Review Bot |
| Refactoring | `refactoring` | Built-in Refactor Agent |
| Explanation | `explanation` | Gemini CLI |
| Testing | `test-generation` | Built-in Test Agent |

When multiple agents declare the same capability, the orchestrator uses the priority order: built-in agents first, then ACP agents in registration order. Users can override priority via `sota.acp.agentPriority` setting.

---

## Security Model

### Sandbox Execution

ACP agents run with restricted permissions:

- **stdio agents** are spawned as child processes with:
  - Working directory set to the workspace root
  - Environment variables filtered (no access to `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, or other secrets unless explicitly allowed)
  - Process resource limits: 2GB memory, 60s CPU time per task (configurable)
  - No network access by default (configurable via `trust` setting)

- **HTTP agents** are accessed over the network:
  - Requests include a session token for authentication
  - Responses are validated against the ACP schema before processing
  - No automatic retry on 5xx errors (agent is responsible for its own reliability)

### Trust Levels

| Trust Level | File Read | File Write | Terminal | Network | Description |
|---|---|---|---|---|---|
| `restricted` | Workspace only | None | None | None | Read-only, sandboxed |
| `workspace` | Workspace only | Workspace only | Allowed | Agent's own | Standard workspace trust |
| `full` | Any | Any | Allowed | Any | Requires explicit user confirmation |

Trust is set per agent in the registry. Defaults to `restricted` for auto-discovered agents, `workspace` for manually registered agents.

### Tool Permissions

When an ACP agent sends an `agent/toolCall` request, the ACP gateway checks:

1. Is the requested tool in the agent's allowed tool set?
2. Does the tool operation match the agent's trust level?
3. If the operation is destructive (file delete, terminal command), prompt the user for confirmation (unless `sota.acp.autoApprove` is enabled for that agent)

---

## Interfaces

### IAcpAgent

```typescript
interface IAcpAgent {
	readonly id: string;
	readonly name: string;
	readonly transport: 'stdio' | 'http';

	// For stdio transport
	readonly command?: string;
	readonly args?: string[];
	readonly env?: Record<string, string>;

	// For HTTP transport
	readonly endpoint?: string;
	readonly authToken?: string;

	readonly capabilities: string[];
	readonly trust: 'restricted' | 'workspace' | 'full';
	readonly maxConcurrentTasks: number;
}
```

### IAcpClient

```typescript
interface IAcpClient extends IDisposable {
	readonly agentId: string;
	readonly status: AcpClientStatus;

	connect(): Promise<void>;
	disconnect(): Promise<void>;

	initialize(): Promise<AcpInitializeResult>;
	sendTask(task: IAcpTask): Promise<IAcpTaskHandle>;
	cancelTask(taskId: string): Promise<void>;

	onDidReceiveResult: Event<IAcpResult>;
	onDidReceiveToolCall: Event<IAcpToolCall>;
	onDidChangeStatus: Event<AcpClientStatus>;
}

type AcpClientStatus = 'disconnected' | 'connecting' | 'ready' | 'busy' | 'error';
```

### IAcpTask

```typescript
interface IAcpTask {
	readonly id: string;
	readonly prompt: string;
	readonly context: IAcpContext;
	readonly parentTaskId?: string; // For orchestrator delegation
}

interface IAcpContext {
	readonly workspacePath: string;
	readonly activeFilePath?: string;
	readonly selection?: { startLine: number; endLine: number };
	readonly relevantFiles?: string[];
	readonly metadata?: Record<string, unknown>;
}
```

### IAcpTaskHandle

```typescript
interface IAcpTaskHandle extends IDisposable {
	readonly taskId: string;
	readonly agentId: string;
	readonly status: AcpTaskStatus;

	onDidChangeStatus: Event<AcpTaskStatus>;
	onDidReceivePartialResult: Event<string>;
	onDidComplete: Event<IAcpResult>;

	cancel(): Promise<void>;
}

type AcpTaskStatus = 'queued' | 'thinking' | 'working' | 'done' | 'error' | 'cancelled';
```

### IAcpAgentRegistry

```typescript
interface IAcpAgentRegistry {
	readonly registeredAgents: ReadonlyArray<IAcpAgent>;

	registerAgent(agent: IAcpAgent): IDisposable;
	unregisterAgent(agentId: string): void;
	getAgent(agentId: string): IAcpAgent | undefined;

	discoverAgents(): Promise<IAcpAgent[]>;
	getAgentsByCapability(capability: string): IAcpAgent[];

	onDidChangeAgents: Event<void>;
}
```

### IAcpResult

```typescript
interface IAcpResult {
	readonly taskId: string;
	readonly status: 'success' | 'error' | 'partial';
	readonly content: string; // Markdown-formatted output
	readonly filesModified?: string[];
	readonly error?: { code: number; message: string };
	readonly metadata?: Record<string, unknown>;
}
```

---

## File Locations

| Path | Purpose |
|---|---|
| `extensions/son-of-anton/src/acp/acpAgent.ts` | `IAcpAgent` interface and defaults |
| `extensions/son-of-anton/src/acp/acpClient.ts` | `IAcpClient` implementation (stdio + HTTP) |
| `extensions/son-of-anton/src/acp/acpStdioClient.ts` | Stdio transport implementation |
| `extensions/son-of-anton/src/acp/acpHttpClient.ts` | HTTP/SSE transport implementation |
| `extensions/son-of-anton/src/acp/acpRegistry.ts` | `IAcpAgentRegistry` implementation |
| `extensions/son-of-anton/src/acp/acpToolHandler.ts` | Handles `agent/toolCall` requests from ACP agents |
| `extensions/son-of-anton/src/acp/acpDiscovery.ts` | Auto-discovery of `.acp.json` manifests |
| `services/acp-gateway/` | Standalone ACP gateway service (Dockerfile, package.json, src/) |
| `services/acp-gateway/src/index.ts` | Gateway entry point |
| `services/acp-gateway/src/sandbox.ts` | Process sandboxing and resource limits |
| `services/acp-gateway/src/auth.ts` | Session token management for HTTP agents |

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `sota.acp.enabled` | boolean | `true` | Enable ACP agent support |
| `sota.acp.agents` | IAcpAgent[] | `[]` | Manually registered ACP agents |
| `sota.acp.autoDiscover` | boolean | `true` | Auto-discover agents from `.acp.json` files |
| `sota.acp.agentPriority` | string[] | `[]` | Agent IDs in priority order for capability matching |
| `sota.acp.autoApprove` | string[] | `[]` | Agent IDs that skip destructive action confirmation |
| `sota.acp.defaultTrust` | string | `'restricted'` | Default trust level for auto-discovered agents |
| `sota.acp.taskTimeout` | number | `300000` | Task timeout in milliseconds (default: 5 minutes) |
| `sota.acp.maxConcurrentTasks` | number | `3` | Maximum concurrent tasks across all ACP agents |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Agent process crashes (stdio) | Mark task as error, show notification, offer retry |
| Agent HTTP endpoint unreachable | 3 retries with exponential backoff (1s, 2s, 4s), then mark as error |
| Agent exceeds task timeout | Send `agent/cancel`, wait 5s, force kill process |
| Agent sends malformed JSON-RPC | Log warning, skip message, continue listening |
| Agent requests disallowed tool | Return error response with permission details, do not execute |
| Agent exceeds memory limit | Kill process, mark task as error, suggest increasing limit |

---

## Testing Strategy

| Test Type | What | How |
|---|---|---|
| Unit | ACP client message parsing | Mock stdio/HTTP transport, verify JSON-RPC serialisation |
| Unit | Agent registry CRUD | In-memory registry, verify add/remove/discover |
| Unit | Tool permission checks | Mock tool calls against each trust level |
| Integration | Stdio agent lifecycle | Spawn a test agent (Node.js script), run a task, verify result |
| Integration | HTTP agent lifecycle | Start a test HTTP server, register as agent, run a task |
| Integration | Orchestrator delegation | Register a mock ACP agent with `code-review` capability, verify orchestrator routes to it |
