# Son of Anton — Full Sweep Plan

**Status:** Implemented
**Date:** 2026-03-10
**Tier:** Tier 1 (100% — all new files in `src/vs/sessions/` and `extensions/`)
**Branch:** Working on top of current `chore/npm-audit-force-2026-03-09`

## Overview

Complete all v2 surfaces, fix all compilation errors, integrate AGUI end-to-end.
4 phases, 28 tasks across 6 component groups.

## Phase 1: Stabilise (3 tasks)

### Group: Compilation & Wiring

**Task 1** — Fix WebGPU type conflicts
- **Files:** `src/tsconfig.json` (or `src/typings/`)
- **Action:** Add `skipLibCheck` or exclude `@webgpu/types` from compilation
- **Verify:** `npm run compile-check-ts-native` reports 0 errors (ignoring DAG stub)

**Task 2** — Create DAG Explorer type stubs
- **Files:** `src/vs/sessions/contrib/dagExplorer/common/dagTypes.ts`, `src/vs/sessions/contrib/dagExplorer/browser/dagExplorerService.ts`
- **Action:** Create minimal interfaces (`IDagExplorerService`, `IDagNode`, `DagNodeStatus`) so integration wiring compiles
- **Verify:** Full TypeScript compilation passes with 0 errors

**Task 3** — Verify all existing surface registrations compile and wire
- **Files:** All `*.contribution.ts` files in `src/vs/sessions/contrib/`
- **Action:** Import-check all surfaces, fix any broken references
- **Verify:** `npm run compile-check-ts-native` passes clean

## Phase 2: Complete v2 Surfaces (17 tasks)

### Group: DAG Explorer (5 tasks)

**Task 4** — DAG Explorer types and data model `[P]`
- **Files:** `src/vs/sessions/contrib/dagExplorer/common/dagTypes.ts` (expand stubs from Task 2)
- **Action:** Full type definitions: `IDagNode` (file/function/module layers), `IDagEdge`, `IDagGraph`, `DagNodeStatus`, `DagLayout`, impact analysis types
- **Verify:** Types compile, no circular dependencies

**Task 5** — DAG Explorer service implementation `[P]`
- **Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagExplorerService.ts`
- **Action:** `IDagExplorerService` with: graph state, node CRUD, BFS impact analysis, layer filtering, event emitters
- **Verify:** Service registered via `registerSingleton`, integration wiring methods resolve

**Task 6** — DAG Explorer webview HTML/JS
- **Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagExplorerHtml.ts`
- **Action:** Webview with dagre layout, SVG rendering, 3-layer selector, node click → details panel, impact radius highlight. Gold/amber theme.
- **Verify:** HTML string generates valid HTML5 with CSP

**Task 7** — DAG Explorer view pane
- **Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagExplorerView.ts`
- **Action:** `ViewPane` subclass hosting the webview, message passing for graph updates, layer toggle commands
- **Verify:** View renders in sessions workbench

**Task 8** — DAG Explorer contribution registration
- **Files:** `src/vs/sessions/contrib/dagExplorer/browser/dagExplorer.contribution.ts`
- **Action:** Register view container, view, commands (focus impact, change layer, refresh)
- **Verify:** DAG Explorer appears in activity bar

### Group: Terminal Blocks Completion (3 tasks)

**Task 9** — OSC escape sequence parser
- **Files:** `src/vs/sessions/contrib/terminalBlocks/browser/oscParser.ts`
- **Action:** Parse OSC 1337 attribution sequences from terminal output, extract agent name, model, run ID, cost
- **Verify:** Parser unit logic correct for sample OSC strings

**Task 10** — Block action buttons and collapse/expand
- **Files:** `src/vs/sessions/contrib/terminalBlocks/browser/terminalBlockRenderer.ts` (extend)
- **Action:** Add collapse/expand toggle, copy button, checkpoint button, re-run button. ARIA roles for accessibility.
- **Verify:** Actions fire correct events

**Task 11** — Terminal Blocks CSS and accessibility
- **Files:** `src/vs/sessions/contrib/terminalBlocks/browser/media/terminalBlocks.css`
- **Action:** Left-border colors per block type (amber=agent, green=pass, red=fail, blue=checkpoint), hover states, keyboard focus ring
- **Verify:** Styles match spec color tokens

### Group: Spec Renderer Completion (3 tasks)

**Task 12** — EARS clause parser `[P]`
- **Files:** `src/vs/sessions/contrib/specRenderer/browser/earsParser.ts`
- **Action:** Regex-based parser for EARS patterns: WHEN trigger, IF precondition, the system SHALL, WHILE state. Extract clause type, keywords, requirement text
- **Verify:** Parser correctly identifies clause types from sample spec text

**Task 13** — Clause card and task checklist renderers
- **Files:** `src/vs/sessions/contrib/specRenderer/browser/earsCardRenderer.ts`, `src/vs/sessions/contrib/specRenderer/browser/taskChecklistRenderer.ts`
- **Action:** EARS clause cards with keyword highlighting (amber for WHEN/SHALL, blue for IF/WHILE). Task checklist with dependency lines and status checkboxes.
- **Verify:** Cards render with correct colors and structure

**Task 14** — Mermaid diagram integration
- **Files:** `src/vs/sessions/contrib/specRenderer/browser/mermaidRenderer.ts`
- **Action:** Render Mermaid diagram blocks from spec markdown in a sandboxed iframe. Support sequence, flowchart, class diagrams.
- **Verify:** Sample Mermaid syntax renders as SVG

### Group: Memory Browser Completion (3 tasks)

**Task 15** — Memory search UI `[P]`
- **Files:** `src/vs/sessions/contrib/memory/browser/memoryBrowserView.ts` (extend)
- **Action:** Search input with tri-modal toggle (keyword/semantic/graph), results list with relevance scores, node detail panel
- **Verify:** Search UI renders, emits search events

**Task 16** — Memory service wiring to extension backend
- **Files:** `src/vs/sessions/contrib/memory/browser/memoryService.ts` (extend)
- **Action:** Wire `IMemoryService` to call extension's SQLite memory via command/message bridge. Fallback to in-memory store.
- **Verify:** Search queries return results from backend

**Task 17** — Memory graph visualisation
- **Files:** `src/vs/sessions/contrib/memory/browser/memoryGraphView.ts`
- **Action:** Small force-directed graph showing related memory nodes. Click node → detail. Edge labels for relationship types.
- **Verify:** Graph renders for sample data

### Group: Mission Control Polish (3 tasks)

**Task 18** — Kanban drag-and-drop layout
- **Files:** `src/vs/sessions/contrib/missionControl/browser/missionControlView.ts` (extend), `src/vs/sessions/contrib/missionControl/browser/kanbanLayout.ts`
- **Action:** CSS grid kanban with 5 columns, drag-and-drop ticket movement (HTML5 drag API), column headers with ticket counts
- **Verify:** Tickets can be dragged between columns, status updates fire

**Task 19** — Activity feed virtual list
- **Files:** `src/vs/sessions/contrib/missionControl/browser/activityFeed.ts`
- **Action:** Virtual scrolling list showing real-time agent activity (trace entries, status changes, cost updates). Filter by agent/type.
- **Verify:** Feed renders entries, auto-scrolls on new activity

**Task 20** — Mission Control keyboard navigation and CSS
- **Files:** `src/vs/sessions/contrib/missionControl/browser/media/missionControl.css`
- **Action:** Arrow key navigation between columns/tickets, Tab for actions, Enter to expand. Complete CSS with amber accent colors.
- **Verify:** Full keyboard navigation works, WCAG AA contrast

## Phase 3: AGUI Integration (5 tasks)

### Group: Cross-system Wiring

**Task 21** — AGUI → Mission Control bridge
- **Files:** `src/vs/sessions/contrib/integration/browser/aguiMissionControlBridge.ts`
- **Action:** When AGUI agent run starts → create/update Mission Control ticket. Stream AGUI events as trace entries. Run completion → ticket status update.
- **Verify:** Starting an agent run creates a ticket, events appear as traces

**Task 22** — AGUI → DAG Explorer bridge
- **Files:** `src/vs/sessions/contrib/integration/browser/aguiDagBridge.ts`
- **Action:** When AGUI agent modifies files → highlight affected DAG nodes. Show impact radius during active runs.
- **Verify:** File modifications during agent run highlight in DAG

**Task 23** — AGUI → Terminal Blocks bridge
- **Files:** `src/vs/sessions/contrib/integration/browser/aguiTerminalBridge.ts`
- **Action:** Attribute terminal commands executed by AGUI agents to their agent blocks. Inject OSC sequences or use side-channel attribution.
- **Verify:** Terminal output during agent run gets agent-attributed blocks

**Task 24** — AGUI → Title Bar bridge
- **Files:** `src/vs/sessions/contrib/integration/browser/integrationWiring.ts` (extend)
- **Action:** Active AGUI run → title bar shows agent name, model, streaming indicator, accumulated cost
- **Verify:** Title bar updates during active agent runs

**Task 25** — Sessions main module registration
- **Files:** `src/vs/sessions/sessions.common.main.ts`
- **Action:** Ensure all new contributions are imported and registered in the sessions entry point
- **Verify:** All surfaces load when sessions workbench activates

## Phase 4: Polish (3 tasks)

**Task 26** — Full compilation verification
- **Files:** All
- **Action:** Run `npm run compile-check-ts-native`, fix any remaining errors. Verify layering with `npm run valid-layers-check`.
- **Verify:** Zero TypeScript errors, zero layering violations

**Task 27** — Integration smoke test
- **Files:** All integration wiring
- **Action:** Trace the event flow: AGUI run → Mission Control ticket → checkpoint → memory index → DAG update → title bar. Verify all paths compile and wire correctly.
- **Verify:** No dead-end event handlers, all services registered

**Task 28** — Update project artefacts
- **Files:** `docs/plans/son-of-anton-full-sweep.md`, `.history/changes.json`, `.history/retrospective.md`, `CLAUDE.md`
- **Action:** Mark tasks complete, update change history, write retrospective, update CLAUDE.md with new file paths
- **Verify:** All documentation reflects actual state

---

## Task Summary

| Phase | Tasks | Parallel-safe |
|-------|-------|---------------|
| 1. Stabilise | 3 | 1-3 sequential |
| 2. Surfaces | 17 | 4-5, 9, 12, 15 parallel; rest sequential per group |
| 3. Integration | 5 | 21-24 parallel after surfaces done |
| 4. Polish | 3 | Sequential |
| **Total** | **28** | |

## Quality Gates

- After Phase 1: TypeScript compiles clean
- After every 5 tasks: Code reviewer agent reviews batch
- After Phase 2: All surfaces render, events fire
- After Phase 3: Full AGUI → surface event flow works
- After Phase 4: Zero errors, zero layering violations
