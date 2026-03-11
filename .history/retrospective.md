# Son of Anton v2 — Build Retrospective

## Session 1: 2026-03-10 — Phase A-D Foundation

### Summary
- 60+ new files created across 8 UI surfaces and 3 infrastructure systems
- All code in `src/vs/sessions/` — 100% Tier 1 modifications (zero merge conflict risk)
- Zero TypeScript compilation errors maintained throughout

### What went well
- All 8 surface type systems and services implemented in a single session
- All view pane components (kanban board, DAG explorer, spec renderer, terminal blocks, title bar, welcome screen, memory browser) built and registered
- View container and view descriptor registrations completed for activity bar visibility
- Integration wiring connecting all subsystems (checkpoints, memory, DAG, title bar) via event-driven architecture
- Geist font files downloaded and CSS applied
- Theme JSON with 200+ color overrides eliminating VS Code blue
- Clean compile at every checkpoint

### Patterns observed
- VS Code DI pattern (`createDecorator`, `registerSingleton`, `InstantiationType.Delayed`) is consistent and reliable
- ViewPane constructor signature must exactly match base class order — no extra services allowed
- `this._register()` vs `this._store.add()` — both valid in Disposable subclasses
- `WindowVisibility.Sessions` required for all sessions workbench view containers
- `localize` for plain strings, `localize2` for struct with `.value` — contribution files use `localize2`

### Decisions made
- Used Codicon icons (project, graphLine, notebook, database) for view containers instead of custom SVGs — simpler, matches VS Code patterns
- Placed all new view containers in `ViewContainerLocation.Sidebar` with `WindowVisibility.Sessions`
- Integration wiring uses `WorkbenchPhase.Eventually` to avoid blocking startup
- Checkpoints auto-created on ticket status → Running transition (best-effort, non-blocking)
- Completed tickets indexed as memory nodes of kind `Decision`

### Risks/concerns
- No integration tests yet — surfaces exist but haven't been visually verified in a running IDE
- Some view panes have placeholder content (Memory Browser search, Welcome Screen)
- SpecRenderer and SpecPipeline are separate surfaces — may want to unify
- `better-sqlite3` native addon added to extension deps — needs rebuild for VS Code's Node.js version

## Milestone: Phase D Infrastructure Complete

### Summary
- 4 background agents completed all Phase D infrastructure
- 54 total new files (43 sessions layer + 11 extension layer)
- All 45 planned tasks addressed

### Infrastructure delivered
- **MCP Tools**: 7 tools for agent board interaction (update_status, append_trace, report_diff, comment, create_ticket, move_ticket, assign) with orchestrator-only permission enforcement
- **Hybrid Checkpoints**: Git plumbing (temp index, shadow refs), FS deltas (gzip, SHA-256), unified service with 24h auto-prune
- **ACP Client**: JSON-RPC 2.0 over stdio (LSP framing) and HTTP, agent discovery from .acp.json manifests, 30s request timeouts
- **SQLite Memory**: FTS5 keyword search (bm25), recursive CTE graph traversal (depth 3, score attenuation), sqlite-vec vector search (graceful fallback), hybrid scoring (0.4/0.4/0.2 weighting), WAL mode

### Lessons for next session
- Always verify Codicon names exist in codiconsLibrary.ts before using
- ViewPane constructor takes exactly: options, keybinding, contextMenu, configuration, contextKey, viewDescriptor, instantiation, opener, theme, hover — no telemetry
- Board data model: columns contain tickets, not the board directly
- Run `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit -p src/tsconfig.json` — standard tsc will OOM
