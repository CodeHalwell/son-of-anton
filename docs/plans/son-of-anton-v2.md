# Plan: Son of Anton v2

## Design Reference
Based on: `docs/design/son-of-anton-v2-overview.md` and 11 detailed specs in `docs/design/surfaces/` and `docs/design/systems/`

## Overview
Transform Son of Anton from a VS Code fork with a chat sidebar into a visually distinct, architecturally unique agentic IDE. 4 phases, 45 tasks, 8 checkpoints.

## Phase A — Visual Foundation (Tasks 1-14)

Makes it look like Son of Anton. After this phase, screenshots are unrecognisable as VS Code.

---

### Task 1: Create Son of Anton color token stylesheet [P]
**Files:** `src/vs/sessions/contrib/theme/browser/colorTokens.css`
**Description:** Create the shared CSS custom property stylesheet with all 30 color tokens from the visual identity spec (`--soa-bg-primary`, `--soa-gold-primary`, etc.). This file is imported by all session contributions.
**Expected output:** CSS file with `:root` block defining all tokens from `docs/design/surfaces/visual-identity.md` Section 1.
**Verification:** File exists, valid CSS, all 30 tokens defined.

---

### Task 2: Create Son of Anton dark theme JSON [P]
**Files:** `extensions/son-of-anton/themes/son-of-anton-dark.json`, `extensions/son-of-anton/package.json`
**Description:** Create the VS Code theme file with all workbench color overrides (200+ keys) and token color customizations for syntax highlighting. Register it in the extension's `package.json` under `contributes.themes`. Eliminate all VS Code blue.
**Expected output:** Complete theme JSON per visual identity spec Section 2. Extension package.json updated with theme contribution.
**Verification:** Load theme in IDE, verify no `#007ACC` blue anywhere. Run: `grep -r "007ACC" extensions/son-of-anton/themes/` returns nothing.

---

### Task 3: Bundle Geist fonts [P]
**Files:** `resources/fonts/geist/GeistVF.woff2`, `resources/fonts/geist/GeistMonoVF.woff2`, `src/vs/sessions/contrib/theme/browser/fonts.css`
**Description:** Download Geist and Geist Mono variable font files (woff2 format, SIL licence) from the Vercel Geist repository. Create `fonts.css` with `@font-face` declarations. Wire into sessions workbench stylesheet loading.
**Expected output:** Font files in resources/fonts/geist/, CSS with @font-face for Geist (weights 400-600) and Geist Mono.
**Verification:** Open IDE, inspect sessions workbench — font-family should resolve to Geist.

---

### Task 4: Register theme color contributions for sessions layer
**Files:** `src/vs/sessions/common/theme.ts`
**Description:** Register all Son of Anton color tokens as VS Code theme color contributions using `registerColor()`. This makes them available to the theme JSON and to CSS via `var(--vscode-sonOfAnton-*)`.  Include all Mission Control colors, title bar colors, terminal block colors.
**Expected output:** ~50 `registerColor()` calls covering all custom surfaces.
**Verification:** `npm run compile-check-ts-native` passes. Colors appear in VS Code's color reference.

---

### Task 5: Create custom activity bar icon SVGs [P]
**Files:** `resources/icons/son-of-anton/*.svg` (7 files)
**Description:** Create SVG icons for all 7 activity bar items: Agent Tasks (branching node graph), Explorer (folder tree), DAG Explorer (directed graph), Memory Browser (layered cylinders), Spec Documents (document with checklist), MCP Connections (plug/socket), Search (magnifier). Each SVG: 24x24 viewBox, single-color `currentColor`, no fill hardcoded.
**Expected output:** 7 SVG files following Codicon conventions.
**Verification:** Each SVG renders at 24x24 in a browser.

---

### Task 6: Register custom activity bar in sessions workbench
**Files:** `src/vs/sessions/contrib/activityBar/browser/activityBar.contribution.ts`, `src/vs/sessions/sessions.desktop.main.ts`
**Description:** Register 7 view containers with custom icons for the sessions activity bar. Map each to its panel (Agent Tasks → Mission Control, DAG Explorer → DAG view, etc.). Set width to 40px. Use two-gold system for active/inactive states. Import contribution in sessions.desktop.main.ts.
**Expected output:** Activity bar with 7 custom items rendering in sessions workbench.
**Verification:** Launch IDE, switch to sessions mode, verify 7 icons appear with correct active/inactive gold colors.

---

### Checkpoint A1 — Review Tasks 1-6

Pause here. Review the visual foundation work:
- [ ] Color tokens stylesheet exists with all 30 tokens
- [ ] Theme JSON eliminates all VS Code blue
- [ ] Geist fonts load in the sessions workbench
- [ ] 7 activity bar icons render correctly
- [ ] IDE compiles without errors

Proceed? (yes / adjust / redo task N)

---

### Task 7: Title bar — wordmark and layout
**Files:** `src/vs/sessions/contrib/titleBarWidgets/browser/titleBarWidgets.contribution.ts`, `src/vs/sessions/contrib/titleBarWidgets/browser/wordmark.ts`
**Description:** Add the centred `Son of Anton` wordmark to the sessions titlebar. Geist 500, tracking +0.05em, color `#F5A623`. Override the titlebar background to `#0A0A0A`. Wire into existing TitlebarPart.
**Expected output:** Title bar shows amber `Son of Anton` text centred.
**Verification:** Visual inspection on launch.

---

### Task 8: Title bar — model indicator widget
**Files:** `src/vs/sessions/contrib/titleBarWidgets/browser/modelIndicator.ts`
**Description:** Add a right-side widget showing the active LLM model (e.g., `claude-sonnet-4-6`). Color `#B8860B`. Subscribe to LLM provider service for model changes. Register as `Menus.TitleBarRight` action.
**Expected output:** Model name appears in title bar, updates when provider changes.
**Verification:** Switch provider in settings, verify title bar updates.

---

### Task 9: Title bar — context usage bar widget
**Files:** `src/vs/sessions/contrib/titleBarWidgets/browser/contextBar.ts`
**Description:** Add a thin horizontal bar (80px wide, 4px tall) showing context window usage percentage. Amber fill proportional to usage. Subscribe to agent manager's token counter.
**Expected output:** Slim progress bar in title bar right section.
**Verification:** Send a chat message, verify bar updates.

---

### Task 10: Title bar — cost ticker widget
**Files:** `src/vs/sessions/contrib/titleBarWidgets/browser/costTicker.ts`
**Description:** Add a cost display showing accumulated session cost (e.g., `$0.47`). Color `#B8860B`. Subscribe to metrics tracker for cost updates. Format as USD with 2 decimal places.
**Expected output:** Cost ticker in title bar, updates after each agent action.
**Verification:** Send a chat message, verify cost increases.

---

### Task 11: Welcome screen — full rewrite
**Files:** `src/vs/sessions/contrib/welcome/browser/welcomeView.ts`
**Description:** Rewrite the existing welcome view with branded layout. Full-canvas `#0D0D0D`, centred wordmark (Geist 600, 36px, `#F5A623`), subtitle, two amber-outlined buttons (Open Project, New Agent Task), recent projects list, bottom status bar with model stack and memory status. No VS Code default chrome.
**Expected output:** Branded welcome screen per `docs/design/surfaces/welcome-screen.md`.
**Verification:** Launch IDE without workspace, verify branded welcome appears.

---

### Checkpoint A2 — Review Tasks 7-11

Pause here. Review title bar and welcome screen:
- [ ] Wordmark, model indicator, context bar, cost ticker all visible in title bar
- [ ] Welcome screen shows branded layout, not VS Code default
- [ ] All text uses Geist font
- [ ] No VS Code blue visible anywhere
- [ ] IDE compiles without errors

Proceed? (yes / adjust / redo task N)

---

### Task 12: Tab bar styling
**Files:** `src/vs/sessions/contrib/theme/browser/tabOverrides.css`
**Description:** Apply tab bar treatment: active tab `#1A1A1A` bg with `#F5A623` 2px bottom border, inactive tab `#0D0D0D` bg with `#2A2A2A` border, 4px bottom-corner radius. Add agent-modified shimmer animation (CSS keyframes). Add spec document icon prefix for `.md` files under `.son-of-anton/specs/`.
**Expected output:** CSS overrides for session workbench tabs.
**Verification:** Open multiple files, verify tab styling matches spec.

---

### Task 13: Editor chrome — cursor and gutter styling
**Files:** Extensions to theme JSON, editor color overrides in `src/vs/sessions/common/theme.ts`
**Description:** Apply editor chrome from visual identity spec: amber cursor line left-border glow, muted gold line numbers (`#B8860B`), amber selection (15% opacity), amber find match (25% opacity), amber bracket match border.
**Expected output:** Editor uses gold/amber throughout, no VS Code blue highlights.
**Verification:** Open a file, select text, find a string, verify all highlights are amber/gold.

---

### Task 14: Session mode indicator
**Files:** `src/vs/sessions/contrib/theme/browser/modeIndicator.ts`
**Description:** Add a visual indicator showing whether the user is in Editor Mode or Mission Control Mode. Small pill in the title bar left area: `EDITOR` or `MISSION CONTROL` with appropriate background colors.
**Expected output:** Mode pill visible in title bar, updates on toggle.
**Verification:** Toggle with `⌘⇧M`, verify indicator changes.

---

### Checkpoint A3 — Review Phase A Complete

Phase A complete. The IDE should now be visually distinct from VS Code.
- [ ] Take a screenshot — it should NOT look like VS Code
- [ ] Color system: dark backgrounds + amber/gold throughout
- [ ] Typography: Geist for UI, Geist Mono for editor
- [ ] Activity bar: 7 custom icons with gold active/inactive
- [ ] Title bar: wordmark, model, context bar, cost ticker
- [ ] Welcome: branded cold-start experience
- [ ] Tabs: styled with amber accents
- [ ] Editor: gold highlights, no blue

Proceed to Phase B? (yes / adjust)

---

## Phase B — Core Differentiators (Tasks 15-32)

Makes it feel like nothing else. Mission Control, DAG Explorer, Terminal Blocks.

---

### Task 15: Mission Control — type definitions [P]
**Files:** `src/vs/sessions/contrib/missionControl/common/missionControlTypes.ts`
**Description:** Define all TypeScript interfaces and enums from the Mission Control spec Section 5 + Section 9: `IMissionControlTask`, `MissionControlTaskStatus`, `TicketType`, `TicketPriority`, `IMissionControlTokenUsage`, `IMissionControlTraceEntry`, `IMissionControlFileDiff`, `ITaskComment`, `IRejection`, `IBoardState`. Export everything.
**Expected output:** Complete type definitions file per spec.
**Verification:** `npm run compile-check-ts-native` passes.

---

### Task 16: Mission Control — service interface [P]
**Files:** `src/vs/sessions/contrib/missionControl/common/missionControlService.ts`
**Description:** Define the `IMissionControlService` interface with service decorator, all events (`onTaskCreated`, `onTaskUpdated`, etc.), queries (`getTasks`, `getTask`, `getStatusCounts`, `getTotalCost`), mutations (`createTask`, `updateTaskStatus`, `approveTask`, `rejectTask`, etc.), and board management methods. Include valid status transition rules.
**Expected output:** Complete service interface per spec Sections 5.2 and 9.
**Verification:** TypeScript compiles.

---

### Task 17: Mission Control — service implementation
**Files:** `src/vs/sessions/contrib/missionControl/browser/missionControlService.ts`
**Description:** Implement `MissionControlService`. In-memory task state with `Map<string, MissionControlTask>`. Event emitters for all lifecycle events. Status transition validation. Cost aggregation. Board persistence to `.son-of-anton/board.json` (debounced 1s). Board restore on session start.
**Expected output:** Complete service implementation with state management, events, persistence.
**Verification:** Unit test: create task, update status, verify events fire, verify invalid transitions throw.

---

### Task 18: Mission Control — task card DOM component
**Files:** `src/vs/sessions/contrib/missionControl/browser/taskCard.ts`
**Description:** Implement the `TaskCard` class. Renders collapsed and expanded states per spec Section 3. Status border colors, model badges, agent icons, metadata row, trace viewer, diff preview, action buttons. Handles click to expand/collapse, action button callbacks.
**Expected output:** TaskCard class that renders a complete card given an `IMissionControlTask`.
**Verification:** Instantiate with test data, verify DOM structure matches spec.

---

### Task 19: Mission Control — kanban layout manager
**Files:** `src/vs/sessions/contrib/missionControl/browser/taskKanban.ts`
**Description:** Implement `TaskKanban`. Four columns (Queued, Running, Review, Complete) with headers showing count badges. Cards sorted by priority within columns. Drag-and-drop between columns using VS Code's DnD patterns. Validates transitions. Virtual list per column for performance.
**Expected output:** Kanban layout that renders cards in columns and supports drag-and-drop.
**Verification:** Create 5 test tasks with different statuses, verify correct column assignment.

---

### Task 20: Mission Control — activity feed
**Files:** `src/vs/sessions/contrib/missionControl/browser/activityFeed.ts`
**Description:** Implement `ActivityFeed`. Virtual list showing agent activity entries with timestamp, model badge, agent name, and action description. Max 1000 entries. Auto-scrolls unless user has scrolled up. Subscribes to `onTaskUpdated` to generate entries.
**Expected output:** Scrolling activity log with agent attribution.
**Verification:** Create tasks and append trace entries, verify feed updates.

---

### Task 21: Mission Control — DAG minimap
**Files:** `src/vs/sessions/contrib/missionControl/browser/dagMinimap.ts`
**Description:** Implement `DagMinimap`. Canvas-based (300x180px) force-directed layout showing task dependency graph. Nodes colored by status. Running nodes pulse. Click a node to highlight corresponding card. "Open DAG Explorer" button.
**Expected output:** Interactive minimap rendering task dependencies.
**Verification:** Create tasks with parent-child relationships, verify graph renders.

---

### Checkpoint B1 — Review Tasks 15-21

Pause here. Review Mission Control core:
- [ ] Service creates/updates/moves tasks correctly
- [ ] Task cards render with correct styling and status colors
- [ ] Kanban columns display cards, drag-and-drop works
- [ ] Activity feed shows agent activity
- [ ] DAG minimap renders task dependencies
- [ ] Board state persists to disk and restores

Proceed? (yes / adjust / redo task N)

---

### Task 22: Mission Control — view and mode toggle
**Files:** `src/vs/sessions/contrib/missionControl/browser/missionControlView.ts`, `src/vs/sessions/contrib/missionControl/browser/missionControlActions.ts`, `src/vs/sessions/contrib/missionControl/browser/missionControl.contribution.ts`
**Description:** Create the main `MissionControlViewPane` (extends ViewPane). Composes kanban, activity feed, and minimap. Register the view container. Implement `⌘⇧M` toggle action that hides editor chrome and shows Mission Control full-width. Register contribution import in sessions.desktop.main.ts.
**Expected output:** `⌘⇧M` toggles between Editor Mode and full-width Mission Control.
**Verification:** Toggle mode, verify full-width kanban appears. Toggle back, verify editor restores.

---

### Task 23: Mission Control — MCP tools for agents
**Files:** `extensions/son-of-anton/src/mcp/missionControlTools.ts`, update `extensions/son-of-anton/src/mcp/McpClient.ts`
**Description:** Register MCP tools that agents call to interact with the board: `mission_control_update_status`, `mission_control_append_trace`, `mission_control_report_diff`, `mission_control_comment`, `mission_control_create_ticket` (orchestrator only), `mission_control_move_ticket` (orchestrator only), `mission_control_assign` (orchestrator only). Each tool validates caller permissions.
**Expected output:** 7 MCP tools registered, callable by agents via the MCP gateway.
**Verification:** Call each tool with test data, verify board state updates.

---

### Task 24: Mission Control — user board management UI
**Files:** `src/vs/sessions/contrib/missionControl/browser/boardManagement.ts`
**Description:** Add user-facing board management: `+` button in column headers to create tickets inline, double-click card summary for inline edit, right-click context menu for priority/labels/assign, filter bar above columns (by label, priority, agent, epic), `Cmd+Shift+N` shortcut for new ticket.
**Expected output:** Users can create, edit, prioritize, and filter tickets directly on the board.
**Verification:** Create a ticket via `+` button, edit it, set priority, filter — all work.

---

### Task 25: Mission Control — keyboard navigation
**Files:** Update `src/vs/sessions/contrib/missionControl/browser/missionControlView.ts`
**Description:** Implement full keyboard navigation per spec Section 4.4. Arrow keys between columns/cards, Enter to expand, Escape to collapse/exit, A/R/P/C/D shortcuts for card actions, Tab/Shift+Tab between regions. ARIA roles on all elements.
**Expected output:** Fully keyboard-navigable board with screen reader support.
**Verification:** Navigate entire board using only keyboard. Run accessibility audit.

---

### Task 26: Mission Control — CSS stylesheet
**Files:** `src/vs/sessions/contrib/missionControl/browser/media/missionControl.css`
**Description:** Complete CSS for Mission Control: backgrounds, card styling, column headers, status borders, model badges, action buttons, activity feed, minimap container, animations (pulse for running cards), hover effects, drag-and-drop visual feedback. All colors via CSS custom properties.
**Expected output:** Single CSS file covering all Mission Control styling.
**Verification:** Visual inspection — matches the spec mockups.

---

### Checkpoint B2 — Review Tasks 22-26

Pause here. Review complete Mission Control:
- [ ] Mode toggle works (⌘⇧M)
- [ ] Board is fully interactive (create, edit, drag, filter)
- [ ] Agents can update their tickets via MCP tools
- [ ] Keyboard navigation works end-to-end
- [ ] Visual styling matches the spec
- [ ] ARIA roles present on all interactive elements

Proceed? (yes / adjust / redo task N)

---

### Task 27: DAG Explorer — type definitions and service interface [P]
**Files:** `src/vs/sessions/contrib/dagExplorer/common/dagTypes.ts`, `src/vs/sessions/contrib/dagExplorer/common/dagService.ts`
**Description:** Define interfaces: `IDagNode`, `IDagEdge`, `IDagGraph`, `IDagImpactResult`, `IDagNodeDetails`, `IDagGraphUpdateEvent`. Define `IDagExplorerService` with methods: `getGraph`, `getImpactRadius`, `getNodeDetails`, `onGraphUpdated`. Define webview message protocol types.
**Expected output:** Complete type definitions per DAG Explorer spec Section 6.
**Verification:** TypeScript compiles.

---

### Task 28: DAG Explorer — service implementation
**Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagService.ts`
**Description:** Implement `DagExplorerService`. Fetches graph data via MCP client (calls `dependencyTraversal`, `impactAnalysis`, `build_targets` tools). Caches results with TTL. Falls back to empty graph when MCP gateway unavailable. Supports incremental updates on file save.
**Expected output:** Service that fetches and caches DAG data from backend.
**Verification:** With MCP gateway running, service returns graph data. Without it, returns empty graph.

---

### Task 29: DAG Explorer — webview graph renderer
**Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagRenderer.ts`, `src/vs/sessions/contrib/dagExplorer/browser/dagWebview.html`, `src/vs/sessions/contrib/dagExplorer/browser/dagWebview.js`
**Description:** Create a webview-based graph renderer. Use dagre layout for directed graph arrangement. Render nodes as rounded rectangles with colors per spec (bg `#1A1A1A`, border `#2A2A2A`, active amber). Edges in `#3A3A3A`, highlighted in `#F5A623`. Pan/zoom via mouse. Click node to select. Message bridge between webview and extension host.
**Expected output:** Interactive graph visualization in a webview.
**Verification:** Feed test graph data, verify nodes and edges render with correct colors and layout.

---

### Task 30: DAG Explorer — impact overlay and view registration
**Files:** `src/vs/sessions/contrib/dagExplorer/browser/impactOverlay.ts`, `src/vs/sessions/contrib/dagExplorer/browser/dagExplorerView.ts`, `src/vs/sessions/contrib/dagExplorer/browser/dagExplorer.contribution.ts`
**Description:** Implement impact radius visualization (amber glow on affected nodes). Register DAG Explorer as a view in the activity bar. Wire into sessions workbench. Add `i` key for impact analysis mode, double-click node to jump to file, right-click to dispatch agent task.
**Expected output:** DAG Explorer accessible from activity bar with impact analysis.
**Verification:** Open DAG Explorer, select a node, press `i`, verify dependents highlight amber.

---

### Task 31: Terminal Blocks — type definitions and service [P]
**Files:** `src/vs/sessions/contrib/terminalBlocks/common/blockTypes.ts`, `src/vs/sessions/contrib/terminalBlocks/common/blockService.ts`, `src/vs/sessions/contrib/terminalBlocks/browser/blockService.ts`
**Description:** Define `ITerminalBlock`, `TerminalBlockType`, `ITerminalBlockAttribution`, `ITerminalBlockService`. Implement service that detects command boundaries in terminal output, parses agent attribution from OSC escape sequences, creates block objects with metadata.
**Expected output:** Service that segments terminal output into attributed blocks.
**Verification:** Run a command in terminal, verify a block is created with correct type.

---

### Task 32: Terminal Blocks — renderer and contribution
**Files:** `src/vs/sessions/contrib/terminalBlocks/browser/blockRenderer.ts`, `src/vs/sessions/contrib/terminalBlocks/browser/terminalBlocks.contribution.ts`
**Description:** Render blocks with colored left borders (grey=manual, amber=agent, green=pass, red=fail, gold=checkpoint). Show metadata on hover (agent, model, cost, timestamp). Add "copy", "checkpoint", "revert" action buttons. Collapse/expand blocks. Register contribution.
**Expected output:** Terminal shows semantic blocks with agent attribution and colored borders.
**Verification:** Run an agent task that executes terminal commands, verify blocks appear with correct attribution.

---

### Checkpoint B3 — Review Phase B Complete

Phase B complete. Son of Anton should now feel like nothing else.
- [ ] Mission Control: full agile board with kanban, drag-and-drop, agent tools
- [ ] DAG Explorer: interactive graph with impact analysis
- [ ] Terminal Blocks: semantic blocks with agent attribution
- [ ] All three surfaces use the Son of Anton color system
- [ ] Mode toggle works seamlessly

Proceed to Phase C? (yes / adjust)

---

## Phase C — Refinement (Tasks 33-36)

### Task 33: Spec Renderer — EARS clause parser [P]
**Files:** `src/vs/sessions/contrib/specRenderer/browser/earsParser.ts`
**Description:** Parse EARS notation from markdown. Regex patterns for WHEN/IF/SHALL/WHILE keywords. Extract clauses into `IEarsClause` objects with id, keyword, condition, action, status.
**Expected output:** Parser function that takes markdown string, returns array of `IEarsClause`.
**Verification:** Parse sample requirements.md, verify all clauses extracted correctly.

---

### Task 34: Spec Renderer — card rendering and view
**Files:** `src/vs/sessions/contrib/specRenderer/browser/earsCardRenderer.ts`, `src/vs/sessions/contrib/specRenderer/browser/taskChecklistRenderer.ts`, `src/vs/sessions/contrib/specRenderer/browser/specEditorOverlay.ts`, `src/vs/sessions/contrib/specRenderer/browser/specRenderer.contribution.ts`
**Description:** Render requirements as EARS clause cards (bg `#161616`, EARS keywords in `#C8962A`, status indicators). Render tasks.md as interactive checklist with dependency lines. Register as custom EditorPane that intercepts `.md` files under `.son-of-anton/specs/`. Include progress bar.
**Expected output:** Spec files open in structured card/checklist view instead of plain markdown.
**Verification:** Open a spec requirements.md file, verify EARS cards render.

---

### Task 35: Spec Renderer — Mermaid diagram support [P]
**Files:** Update `src/vs/sessions/contrib/specRenderer/browser/specEditorOverlay.ts`
**Description:** Detect Mermaid code blocks in design.md specs. Render inline using mermaid.js (bundled in webview). Apply dark theme with amber accents. DOMPurify for sanitization.
**Expected output:** Mermaid diagrams render inline in design spec documents.
**Verification:** Open a design.md with Mermaid blocks, verify diagrams render.

---

### Task 36: Spec Renderer — agent attribution and status tracking
**Files:** Update spec renderer files
**Description:** Show agent-completed tasks with attribution badges (agent name + model). Track clause satisfaction status from spec pipeline service. Wire progress bar to completion percentage.
**Expected output:** Spec documents show which agents completed which items and overall progress.
**Verification:** Complete a spec pipeline task, verify the spec renderer updates with attribution.

---

### Checkpoint C — Review Phase C Complete

- [ ] EARS clauses render as cards, not plain text
- [ ] Tasks render as interactive checklists
- [ ] Mermaid diagrams expand inline
- [ ] Agent attribution visible on completed items
- [ ] Progress bars track completion

Proceed to Phase D? (yes / adjust)

---

## Phase D — Infrastructure Systems (Tasks 37-45)

### Task 37: Hybrid Memory — SQLite schema and migration [P]
**Files:** `extensions/son-of-anton/src/memory/schema.ts`, `extensions/son-of-anton/src/memory/migrationManager.ts`
**Description:** Define SQLite schema: `nodes` table (graph), `edges` table (graph relationships), `documents` table (FTS5 for keyword search), `vectors` table (sqlite-vec for embeddings). Create migration manager for schema versioning. Database file: `.son-of-anton/memory.db`.
**Expected output:** Schema definition and migration system. Database created on first access.
**Verification:** Initialize memory store, verify tables created in SQLite file.

---

### Task 38: Hybrid Memory — SQLite memory store implementation
**Files:** `extensions/son-of-anton/src/memory/sqliteMemory.ts`
**Description:** Implement `IMemoryStore` with SQLite backend. Keyword search via FTS5. Vector search via sqlite-vec (if available, graceful fallback without it). Graph queries via recursive CTEs on nodes/edges tables. Hybrid query that combines all three with scoring.
**Expected output:** Working local-first memory store with tri-modal retrieval.
**Verification:** Store test data (code, docs, relationships), query with semantic/structural/exact modes, verify relevant results returned.

---

### Task 39: Hybrid Memory — Docker upgrade detection
**Files:** `extensions/son-of-anton/src/memory/memoryFactory.ts`
**Description:** Create factory that detects whether Docker stack is running (health check FalkorDB:6379 and Qdrant:6333). If available, creates Docker-backed memory store. If not, falls back to SQLite. Transparent to consumers.
**Expected output:** Factory function returning the best available memory backend.
**Verification:** Test with Docker running (returns Docker store), without Docker (returns SQLite store).

---

### Task 40: Hybrid Checkpoints — git checkpoint implementation [P]
**Files:** `extensions/son-of-anton/src/checkpoints/gitCheckpoints.ts`
**Description:** Implement git-based checkpoints using plumbing commands. Create shadow branch (`refs/checkpoints/<session-id>`). Auto-commit before each agent file modification using temp index (no interference with user's staging area). Commit message: `[checkpoint] <agent>: <action>`. Rollback via `git checkout`.
**Expected output:** Git checkpoint service that snapshots tracked files without affecting user's git state.
**Verification:** Create checkpoint, modify file, rollback, verify file restored.

---

### Task 41: Hybrid Checkpoints — filesystem checkpoint implementation [P]
**Files:** `extensions/son-of-anton/src/checkpoints/fsCheckpoints.ts`
**Description:** Implement delta-based filesystem checkpoints. Store changed files in `.son-of-anton/checkpoints/<session>/<checkpoint-id>/`. Gzip compressed. Only store files that changed since last checkpoint. Checkpoint manifest tracks file list and metadata.
**Expected output:** FS checkpoint service for non-git-tracked files.
**Verification:** Create checkpoint, modify untracked file, rollback, verify restored.

---

### Task 42: Hybrid Checkpoints — unified checkpoint service
**Files:** `extensions/son-of-anton/src/checkpoints/checkpointService.ts`
**Description:** Implement `ICheckpointService` that combines git and FS checkpoints. Uses git for tracked source files, FS for everything else. Checkpoint ID format: `cp-<timestamp>-<agent>-<short-hash>`. Provides `create`, `rollback`, `list`, `prune` operations. Auto-prune checkpoints older than 24h.
**Expected output:** Unified checkpoint service with hybrid strategy.
**Verification:** Create checkpoint, modify tracked + untracked files, rollback, verify all restored.

---

### Task 43: ACP — client implementation [P]
**Files:** `extensions/son-of-anton/src/acp/acpClient.ts`, `extensions/son-of-anton/src/acp/agentRegistry.ts`
**Description:** Implement ACP client (JSON-RPC 2.0 over stdio/HTTP). Agent registry that discovers agents from `.acp.json` manifests. Connect to external agents (Gemini CLI, Codex CLI, etc.). Send requests, receive responses. Map external agent tasks to Mission Control tickets.
**Expected output:** ACP client that can connect to and communicate with external ACP agents.
**Verification:** Register a mock ACP agent, send a request, verify response received.

---

### Task 44: ACP — Mission Control integration
**Files:** Update `extensions/son-of-anton/src/acp/acpClient.ts`, update Mission Control service
**Description:** External ACP agents appear as task cards in Mission Control like internal agents. Orchestrator can delegate subtasks to ACP agents based on capabilities. Agent status updates flow back to Mission Control. Security: ACP agents run in sandbox with workspace trust permissions.
**Expected output:** ACP agents visible and manageable on the Mission Control board.
**Verification:** Connect external agent, assign task, verify card appears and updates.

---

### Task 45: Integration wiring — connect all systems
**Files:** Multiple files across extension and sessions layer
**Description:** Wire everything together: Checkpoint service creates checkpoints before agent actions and shows checkpoint IDs on Mission Control cards and terminal blocks. Memory store provides context to agents via the retrieval pipeline. DAG Explorer highlights nodes affected by running Mission Control tasks. Cost ticker aggregates from all sources. Board state survives IDE restart.
**Expected output:** All systems connected end-to-end.
**Verification:** Full workflow: create ticket on board → Anton decomposes → agents execute with checkpoints → terminal shows attributed blocks → DAG shows impact → review and approve on board.

---

### Checkpoint D — Review Phase D and Full Build Complete

All phases complete.
- [ ] Hybrid memory: SQLite works without Docker, upgrades transparently
- [ ] Hybrid checkpoints: git + FS snapshots, rollback works
- [ ] ACP: external agents connect and appear on board
- [ ] End-to-end workflow: ticket → plan → execute → review → approve
- [ ] IDE compiles with 0 errors
- [ ] All custom surfaces use Son of Anton visual identity

---

## Summary

- **Total tasks:** 45
- **Checkpoints:** 8 review points
- **Phase A (Visual):** 14 tasks — theme, fonts, icons, title bar, welcome, tabs
- **Phase B (Core):** 18 tasks — Mission Control (12), DAG Explorer (4), Terminal Blocks (2)
- **Phase C (Refinement):** 4 tasks — Spec Renderer
- **Phase D (Infrastructure):** 9 tasks — Memory (3), Checkpoints (3), ACP (2), Wiring (1)
- **Parallel-safe tasks:** 14 marked with `[P]`
- **Modification tiers:** ~90% Tier 1 (new files), ~10% Tier 2 (imports/registrations), 0% Tier 3
