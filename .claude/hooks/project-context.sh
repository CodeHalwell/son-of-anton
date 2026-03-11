#!/usr/bin/env bash
set -euo pipefail

# Description: Inject Son of Anton project conventions into session context
# Event: SessionStart

INPUT=$(cat)

cat <<'CONTEXT'
=== Son of Anton Project Conventions ===

LANGUAGE & TOOLING
- TypeScript is the primary language. All production code under src/, services/, extensions/ must be .ts
- Use npm (not pnpm or yarn). Run: npm install, npm run compile-check-ts-native
- ESLint + Prettier with the project's existing config
- Mocha for unit tests; integration tests require the Docker Compose stack

INDENTATION & FORMATTING
- Tabs for indentation (VS Code upstream convention — never spaces)
- Single quotes for internal/code strings
- Double quotes for user-facing strings that need localisation (use nls.localize())
- Arrow functions => over anonymous function expressions
- PascalCase for types, enums, classes; camelCase for functions, properties, variables

TIER MODIFICATION POLICY (every PR must state its tier)
- Tier 1 (75%): New files in services/, extensions/, src/vs/sessions/, docs, config — zero merge-conflict risk
- Tier 2 (20%): Hooks into existing VS Code modules (imports, registries, menu items) — human review required
- Tier 3 (<5%): Direct patches to existing VS Code core files — senior engineer review + written justification

ARCHITECTURE RULES
- Services live in services/<service-name>/ — each needs Dockerfile, package.json, health endpoint
- Extensions live in extensions/<extension-name>/
- src/vs/sessions/ is the agentic-workflow workbench layer (may import from vs/workbench, not vice versa)
- No direct network calls to Microsoft telemetry/update domains
- No telemetry without explicit opt-in
- No secrets in source; use .env files (never committed)

VS CODE DEPENDENCY INJECTION PATTERNS
- Services injected through constructor parameters (non-service params come after service params)
- Register disposables immediately; use DisposableStore, MutableDisposable, DisposableMap
- Use IEditorService to open editors (not IEditorGroupsService.activeGroup.openEditor)
- Avoid bind()/call()/apply() for `this` binding — prefer arrow functions

TYPESCRIPT VALIDATION
- Type-check main sources: npm run compile-check-ts-native  (validates ./src/tsconfig.json)
- Type-check extensions: npm run gulp compile-extensions
- Never run tests while compilation errors exist
- Check layering: npm run valid-layers-check

REPOSITORY MAP
- Son-Of-Anton       — main IDE (this repo, VS Code fork)
- son-of-anton-graph — Docker Compose stack, FalkorDB + Qdrant, graph indexer
- son-of-anton-mcp   — MCP server definitions (TypeScript or Python)
- son-of-anton-agents — Agent definitions and shared LLM client

DOCKER COMPOSE QUICK REFERENCE
- docker compose up -d              # start all 17 backend services
- docker compose ps                 # check service health
- docker compose logs -f            # tail logs
- docker compose down -v            # teardown + remove data

MODEL ROUTING
- Orchestration / complex reasoning: Opus
- Code generation, refactoring, tests: Sonnet
- Exploration, completions, summaries: Haiku

=== End Son of Anton Conventions ===
CONTEXT

exit 0
