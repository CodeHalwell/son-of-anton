# Son of Anton v2 — Architectural Overview

**Version:** 2.0
**Status:** Draft
**Date:** 2026-03-10

---

## Executive Summary

Son of Anton v1 delivered a functional multi-agent chat IDE on top of a VS Code fork. It has 15 specialist agents, an MCP gateway with 10 tools, a sessions workbench layer, and LLM provider abstraction. But it looks and feels like VS Code with a chat sidebar.

v2 transforms Son of Anton into a visually distinct, architecturally unique agentic development environment. The changes fall into three categories:

1. **Eight new UI surfaces** that make the product unrecognisable as a VS Code fork
2. **Three infrastructure systems** (ACP, hybrid memory, hybrid checkpoints) that make it genuinely powerful
3. **A visual identity** (dark + amber/gold, Geist typography, custom icons) that signals agency, trust, and control

---

## Design Principles

Every decision in v2 is evaluated against three questions from the UI spec:

1. **Does it signal agency?** — Autonomous processes are running, reviewable, and controllable
2. **Does it build trust?** — Cost, context usage, agent attribution, and checkpoint state are visible without hunting
3. **Is it distinctively Son of Anton?** — If a screenshot could pass for stock VS Code, it hasn't gone far enough

---

## Architecture Overview

### Dual Interface Modes

The most significant departure from VS Code. Son of Anton has two distinct modes:

```
┌─────────────────────────────────────────────────┐
│                 Son of Anton IDE                  │
│                                                   │
│  ┌──────────┐         ┌──────────────────────┐   │
│  │  Editor   │  ⌘⇧M   │   Mission Control    │   │
│  │  Mode     │ ←────→  │   Mode               │   │
│  │          │         │                      │   │
│  │ Near-black│         │ Spatial canvas       │   │
│  │ #0D0D0D  │         │ #111111              │   │
│  │ Code-first│         │ Task cards + DAG     │   │
│  │ Minimal   │         │ Full-width           │   │
│  └──────────┘         └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- **Editor Mode**: Focused coding. Near-black background, amber cursor glow, minimal gutter, custom activity bar
- **Mission Control Mode**: Spatial orchestration. Task cards, live DAG, agent attribution, terminal summaries

Toggle via `⌘⇧M` (macOS) / `Ctrl+Shift+M` (Windows/Linux). Built into the existing sessions workbench layer (`src/vs/sessions/`).

### The Eight Surfaces

Each surface has a dedicated design spec in `docs/design/surfaces/`.

| # | Surface | Priority | Spec |
|---|---------|----------|------|
| 1 | Mission Control | Critical | [mission-control.md](surfaces/mission-control.md) |
| 2 | DAG Explorer | Critical | [dag-explorer.md](surfaces/dag-explorer.md) |
| 3 | Visual Identity | Critical | [visual-identity.md](surfaces/visual-identity.md) |
| 4 | Title Bar | High | [title-bar.md](surfaces/title-bar.md) |
| 5 | Terminal Blocks | High | [terminal-blocks.md](surfaces/terminal-blocks.md) |
| 6 | Spec Renderer | Medium | [spec-renderer.md](surfaces/spec-renderer.md) |
| 7 | Welcome Screen | Medium | [welcome-screen.md](surfaces/welcome-screen.md) |
| 8 | Activity Bar | Medium | [activity-bar.md](surfaces/activity-bar.md) |

### Three Infrastructure Systems

| System | Spec |
|--------|------|
| ACP Integration | [systems/acp-integration.md](systems/acp-integration.md) |
| Hybrid Memory | [systems/memory-hybrid.md](systems/memory-hybrid.md) |
| Hybrid Checkpoints | [systems/checkpoints.md](systems/checkpoints.md) |

---

## Implementation Tiers

All changes follow Son of Anton's modification tier policy.

### Tier 1 — New files alongside core (target: 90% of v2)

- All 8 UI surfaces (new contributions in `src/vs/sessions/contrib/`)
- Visual identity (new theme files, new icon set)
- ACP client service (new service in `services/`)
- SQLite memory layer (new module in extension)
- Checkpoint service (new service)

### Tier 2 — Hooks into existing code (target: 10% of v2)

- Registering new activity bar icons in the sessions workbench
- Wiring Mission Control toggle into the keybinding system
- Adding custom title bar widgets to the sessions titlebar
- Terminal block rendering hooks in the terminal contribution

### Tier 3 — Direct core patches (target: 0%)

None. The sessions layer is specifically designed to avoid core patches.

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│                                                              │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐          │
│  │ Mission  │ │   DAG    │ │ Spec   │ │Terminal  │          │
│  │ Control  │ │ Explorer │ │Renderer│ │ Blocks   │          │
│  └────┬─────┘ └────┬─────┘ └───┬────┘ └────┬────┘          │
│       │             │           │            │               │
│  ┌────┴─────────────┴───────────┴────────────┴────┐         │
│  │            Sessions Workbench Layer             │         │
│  │         (src/vs/sessions/workbench.ts)          │         │
│  └────────────────────┬───────────────────────────┘         │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────────┐
│                  Service Layer                               │
│                        │                                     │
│  ┌─────────┐  ┌───────┴───────┐  ┌──────────┐              │
│  │   LLM   │  │  Agent Manager │  │   MCP    │              │
│  │ Providers│  │  (Orchestrator)│  │  Client  │              │
│  └────┬────┘  └───────┬───────┘  └────┬─────┘              │
│       │               │               │                      │
│  ┌────┴───────────────┴───────────────┴────┐                │
│  │          Extension Host (Node.js)        │                │
│  └────────────────────┬────────────────────┘                │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────────┐
│              Backend Layer (Docker / Local)                   │
│                        │                                     │
│  ┌────────┐  ┌────────┴────────┐  ┌──────────┐             │
│  │  MCP   │  │   Model Router  │  │Checkpoint │             │
│  │Gateway │  │   (port 3200)   │  │ Service   │             │
│  │(:3100) │  └─────────────────┘  └──────────┘             │
│  └───┬────┘                                                  │
│      │                                                       │
│  ┌───┴────────────────────────────────────┐                 │
│  │  FalkorDB │ Qdrant │ SQLite (local)    │                 │
│  └────────────────────────────────────────┘                 │
│                                                              │
│  ┌────────────────────────────────────────┐                 │
│  │  ACP Client → External Agents          │                 │
│  │  (Gemini CLI, Codex CLI, etc.)         │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Agent Task Lifecycle

```
User Intent
    │
    ▼
┌──────────────┐
│ Mission       │ ── visualises task cards, status, cost
│ Control UI    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Orchestrator  │ ── decomposes into subtasks
│ Agent         │ ── routes to model (Opus for planning)
└──────┬───────┘
       │
       ├──────────────┐──────────────┐
       ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Code Gen   │ │ Review     │ │ Test Writer │
│ Agent      │ │ Agent      │ │ Agent       │
│ (Sonnet)   │ │ (Sonnet)   │ │ (Haiku)    │
└──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       │              │              │
       ▼              ▼              ▼
┌─────────────────────────────────────────┐
│            Checkpoint Service            │
│  (snapshot before + after each action)   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         DAG Explorer + Terminal Blocks    │
│  (impact analysis, block attribution)    │
└─────────────────────────────────────────┘
```

### Memory Retrieval Pipeline

```
Agent Query
    │
    ├──→ Vector Store (semantic similarity) ──→ anchor nodes
    │
    ├──→ Knowledge Graph (structural traversal) ──→ causal context
    │
    ├──→ Keyword Index (exact match) ──→ precise symbols
    │
    ▼
Context Synthesiser ──→ ranked, deduplicated context ──→ LLM prompt
```

**Local-first default:** SQLite FTS5 + sqlite-vec + graph tables. No Docker required.
**Docker upgrade:** FalkorDB + Qdrant for heavier workloads. Optional.

---

## Build Sequence

The UI spec prioritises by visual return. Adapted for v2:

### Phase A — Visual Foundation (makes it look like Son of Anton)
1. **Visual Identity** — color tokens, theme JSON, Geist font loading
2. **Title Bar** — custom wordmark, model indicator, cost ticker
3. **Activity Bar** — 7-item bar with custom icons
4. **Welcome Screen** — branded cold-start experience

### Phase B — Core Differentiators (makes it feel like nothing else)
5. **Mission Control** — task cards, spatial layout, mode toggle
6. **DAG Explorer** — graph renderer, impact analysis overlay
7. **Terminal Blocks** — semantic blocks with agent attribution

### Phase C — Refinement
8. **Spec Renderer** — EARS cards, task checklists, progress bars

### Phase D — Infrastructure
9. **ACP Integration** — external agent protocol support
10. **Hybrid Memory** — SQLite local-first + Docker optional
11. **Hybrid Checkpoints** — git-based + file-system snapshots

---

## Technology Choices for v2

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Graph rendering (DAG) | D3.js or @antv/g6 | Battle-tested, works in Electron webview |
| Task card layout | CSS Grid + custom web components | No framework dependency inside VS Code |
| Font | Geist (bundled) | Distinctive, open-source, technical aesthetic |
| Color system | CSS custom properties | Themeable, consistent, easy to maintain |
| SQLite (embedded) | better-sqlite3 or sql.js | Node-native or WASM, works in extension host |
| Vector extensions | sqlite-vec | WASM-compatible SQLite vector search |
| ACP transport | JSON-RPC 2.0 over stdio/HTTP | Matches Zed's ACP specification |
| Checkpoint storage | Local filesystem + git refs | Hybrid per user's preference |

---

## Cross-Cutting Concerns

### Transparency Budget

Every agent action must expose:
- **Model used** (visible in title bar and terminal blocks)
- **Token count** (input + output)
- **Cost estimate** (based on model pricing)
- **Context window usage** (percentage bar in title bar)
- **Checkpoint ID** (rollback target)
- **Elapsed time**

This is non-negotiable. The background research is clear: lack of transparency is the #1 developer complaint about agentic tools.

### Security Model

- Workspace trust inherited from VS Code
- Tool permissions (allow/ask/deny) per MCP tool
- Sandbox execution for agent-initiated commands
- Extension allowlist enforcement
- Prompt injection detection via context-sanitiser service

### Accessibility

- All custom surfaces must be keyboard-navigable
- ARIA roles for task cards, DAG nodes, terminal blocks
- High-contrast mode support (amber → white in HC themes)
- Screen reader announcements for agent status changes

---

## File Organisation

All v2 code lives in Tier 1 locations:

```
src/vs/sessions/
  contrib/
    missionControl/     ← Mission Control canvas
      browser/
        missionControlView.ts
        taskCard.ts
        missionControlService.ts
    dagExplorer/        ← DAG Explorer panel
      browser/
        dagExplorerView.ts
        dagRenderer.ts
        impactOverlay.ts
    terminalBlocks/     ← Terminal block attribution
      browser/
        blockRenderer.ts
        agentAttribution.ts
    specRenderer/       ← Spec document renderer
      browser/
        earsCardRenderer.ts
        taskChecklistRenderer.ts
        specEditorOverlay.ts
    welcome/            ← Custom welcome screen
      browser/
        welcomeView.ts (already exists — rewrite)
    theme/              ← Visual identity
      browser/
        sonOfAntonTheme.ts
        colorTokens.ts
        iconRegistry.ts

extensions/son-of-anton/
  src/
    memory/             ← SQLite hybrid memory
      sqliteMemory.ts
      migrationManager.ts
    checkpoints/        ← Hybrid checkpoint service
      checkpointService.ts
      gitCheckpoints.ts
      fsCheckpoints.ts
    acp/                ← ACP client
      acpClient.ts
      agentRegistry.ts

services/
  acp-gateway/          ← ACP server (new)
  checkpoint-service/   ← Checkpoint backend (enhance existing)
```

---

## Detailed Specs

Each surface and system has its own detailed spec:

### Surfaces
- [Mission Control](surfaces/mission-control.md)
- [DAG Explorer](surfaces/dag-explorer.md)
- [Visual Identity](surfaces/visual-identity.md)
- [Title Bar](surfaces/title-bar.md)
- [Terminal Blocks](surfaces/terminal-blocks.md)
- [Spec Renderer](surfaces/spec-renderer.md)
- [Welcome Screen](surfaces/welcome-screen.md)
- [Activity Bar](surfaces/activity-bar.md)

### Systems
- [ACP Integration](systems/acp-integration.md)
- [Hybrid Memory](systems/memory-hybrid.md)
- [Hybrid Checkpoints](systems/checkpoints.md)

---

*This overview is the architectural spine. Each linked spec contains component design, data contracts, interaction models, and implementation guidance.*
