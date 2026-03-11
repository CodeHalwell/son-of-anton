---
name: code-review-framework
description: >
  Three severity tiers (Critical/Important/Minor) applied across five concern
  passes: correctness → quality → security → tests → integration. Output format
  with file:line references. Approval criteria: no Critical, all Important
  addressed. Adapted for VS Code conventions, disposable management, and
  localization. Trigger on: "review this", "review my changes", before merging,
  or after a task-executor completes work.
---

# Code Review Framework for Son of Anton

Structured code review in five passes, each with a specific focus. Review systematically — do not mix concerns.

## Severity Tiers

| Tier | Label | Meaning | Merge gate |
|------|-------|---------|-----------|
| 🔴 | **Critical** | Bug, security vulnerability, data loss, broken build | Block merge |
| 🟡 | **Important** | Convention violation, missing test, disposable leak, incorrect tier | Must fix before merge |
| 🔵 | **Minor** | Style preference, naming improvement, optional enhancement | Can merge, fix later |

## Five-Pass Review

### Pass 1: Correctness

Focus only on whether the code does the right thing.

- Does it handle empty input, null, undefined?
- Are all async operations awaited? Are Promises returned when they should be?
- Are error cases handled — not swallowed with empty `catch {}` blocks?
- Are array bounds checked before access?
- Are disposables cleaned up in all code paths (including error paths)?
- Does the code handle service unavailability gracefully (retry, fallback, or error propagation)?

### Pass 2: Code Quality

Focus on VS Code conventions and maintainability.

**Indentation and Style**
- Tabs, not spaces
- Arrow functions over anonymous function expressions
- Named export functions, not `export const x = () => {}`
- Arrow function parameter parens: `x => x + 1` not `(x) => x + 1` for single params
- Curly braces on every `if`/`for`/`while` body

**Naming**
- PascalCase for types, enums, classes
- camelCase for functions, methods, properties, variables
- Whole words — no abbreviations unless universally known (`url`, `id`, `api` are fine)
- Function names describe what they return or do — not how

**Structure**
- Functions under ~30 lines
- Single responsibility per function
- JSDoc on all exported functions, classes, interfaces
- Microsoft copyright header on every new file

**Localisation**
- All user-visible strings use `nls.localize()` — no raw string literals in UI
- `nls.localize()` first argument is a stable key string — not a template literal
- No string concatenation inside `nls.localize()` — use `{0}` placeholders

**Disposables**
- Every disposable registered immediately after creation
- `DisposableStore`, `MutableDisposable`, or `DisposableMap` used as appropriate
- Methods called repeatedly do not register disposables to `this._disposables` — they return `IDisposable`
- `super.dispose()` called last in `dispose()` overrides

**Layering**
- Run `npm run valid-layers-check` — report any violations
- No imports from a higher architectural layer (`workbench` must not import from `sessions`)
- Tier stated correctly:
  - New file in `services/`, `extensions/`, `src/vs/sessions/` → Tier 1
  - Hook into existing VS Code module → Tier 2
  - Modifying existing VS Code core logic → Tier 3

### Pass 3: Security

- No hardcoded secrets, tokens, or API keys
- No calls to Microsoft telemetry domains (`microsoft.com`, `visualstudio.com`, `vortex.data`)
- No unsafe DOM mutation patterns (verify against the `ts-protect.sh` hook patterns)
- Input validation on all data from: extension host, network calls, user input
- FalkorDB queries use parameterised form — no Cypher string concatenation with user data
- HTTP responses do not expose `process.env` values or internal stack traces in production

### Pass 4: Tests

- Every new public function has at least one test
- Tests cover: happy path, at least one edge case, at least one error case
- Test names follow `'should <behaviour> when <scenario>'`
- Tests use `assert.deepStrictEqual` for snapshot-style comparison
- No `any` type in test files
- Tests do not make real network calls — dependencies are stubbed
- Tests are in the correct directory for their layer (`src/vs/*/test/`)

### Pass 5: Integration

- If this is a cross-cutting change (IDE + service), verify the API contract is consistent on both sides
- Dockerfile builds: `docker compose build <service-name>`
- Health endpoint works: `curl http://localhost:<port>/healthz`
- Docker Compose entry has a `healthcheck`
- If a new service was added, it appears in the docker-services skill's service map

## Output Format

```
## Code Review

**Changeset:** [PR title or description of change]
**Tier:** Tier [1 / 2 / 3]
**Reviewer:** [name or agent]

### 🔴 Critical

- `src/vs/workbench/services/myService/browser/myServiceImpl.ts:42` —
  Promise is not awaited; `queryGraph()` will run in the background without error handling.
  Fix: `await this._graphService.queryGraph(params)` or propagate the Promise to the caller.

### 🟡 Important

- `src/vs/sessions/myPane/browser/myPane.ts:15` —
  User-visible label `"My Pane Title"` is not localised.
  Fix: `nls.localize('myPane.title', "My Pane Title")`

- `src/vs/workbench/services/myService/browser/myServiceImpl.ts:88` —
  `DisposableStore` created inside a method called on every keystroke;
  disposables will accumulate. Return `IDisposable` from this method instead.

### 🔵 Minor

- `services/my-service/src/index.ts:5` —
  Variable named `res` — prefer `response` (whole words in names).

### Recommendation

🔴 **BLOCK** — Critical finding must be fixed before merge.

OR

🟡 **REVISE** — Important findings must be addressed.

OR

✅ **APPROVE** — No Critical or Important findings. Minor suggestions noted.
```

## Approval Criteria

| Status | Condition |
|--------|-----------|
| **APPROVE** | Zero Critical; zero Important |
| **APPROVE WITH MINOR FIXES** | Zero Critical; zero Important; Minor findings noted but non-blocking |
| **REVISE** | Zero Critical; one or more Important findings |
| **BLOCK** | One or more Critical findings |

## Quick Checks (run before reviewing code)

```bash
# Type errors
npm run compile-check-ts-native

# Layering violations
npm run valid-layers-check

# See what changed
git diff --stat HEAD~1

# Check for secrets (dry-run)
.claude/hooks/secrets-scan.sh
```
