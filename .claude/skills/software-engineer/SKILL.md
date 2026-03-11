---
name: software-engineer
description: >
  Quality mindset for Son of Anton development. Core principle: understand the
  problem deeply before writing code. Guides through correctness → clarity →
  simplicity → performance. Includes self-review checklist before committing.
  Trigger on: starting any new implementation, "how should I approach this",
  or "what's the best way to implement".
---

# Software Engineer — Quality Mindset for Son of Anton

This skill instils the quality mindset that should precede and accompany all implementation work in the Son of Anton codebase.

## Core Principle

Understand the problem before writing code. The best code is often the code you decided not to write.

### Before Writing Anything

1. **Can this problem be solved without new code?**
   - Is there already a VS Code API that handles this?
   - Is there an existing service in `services/` that can be extended?
   - Is there a utility in `src/vs/base/` that already does this?
   - Search before building: use Grep and Glob to explore the codebase first.

2. **What is the minimal correct solution?**
   - Start from the user's need, not from an interesting technical idea
   - Resist adding flexibility or abstraction until it is needed by a second use case
   - Prefer extending an existing pattern over introducing a new one

3. **Where does this belong in the architecture?**
   - Which VS Code layer? (`base` → `platform` → `editor` → `workbench` → `sessions`)
   - Tier 1 (new file) or must it be Tier 2/3?
   - Service or contribution? (backend processing → service; UI or editor intelligence → contribution)

## Decision Priority

When making implementation decisions, apply this order of priority:

1. **Correctness** — Does it do the right thing in all cases?
2. **Clarity** — Can another developer understand this in 30 seconds?
3. **Simplicity** — Is this the simplest correct solution?
4. **Performance** — Is it fast enough for the use case?

Do not optimise for performance at the cost of correctness or clarity unless profiling proves it is necessary.

## Quality Bar

Every piece of code merged into Son of Anton must be:

| Criterion | Standard |
|-----------|----------|
| **Works** | Passes all tests; handles error cases; no known edge cases left unaddressed |
| **Clear** | Self-explanatory names; single responsibility per function; JSDoc for public APIs |
| **Tested** | Every new function has at least one test; error cases covered |
| **Safe** | No secrets in code; no unsafe DOM mutation; no telemetry to Microsoft; inputs validated |
| **Maintainable** | Follows VS Code conventions; tier stated; upstream risk documented |

## VS Code Conventions Checklist

Apply these conventions at all times:

- [ ] Tabs for indentation — never spaces
- [ ] PascalCase for types, enums, classes
- [ ] camelCase for functions, methods, properties, local variables
- [ ] Single quotes for internal strings; `nls.localize()` for all user-visible strings
- [ ] Microsoft copyright header on every new file
- [ ] Disposables registered immediately after creation
- [ ] `async`/`await` — never `.then()` chains
- [ ] Named export functions — not `export const x = () => {}`
- [ ] Arrow function parameters: no parens for single param (`x => x + 1`)
- [ ] No `any` or `unknown` without justification
- [ ] No `bind()`, `call()`, `apply()` when an arrow function suffices

## Self-Review Checklist

Before marking any work complete, run through this checklist:

### Correctness
- [ ] Does it handle the happy path correctly?
- [ ] Does it handle empty/null/undefined inputs?
- [ ] Does it handle errors from dependencies (network, database, file system)?
- [ ] Are all async operations properly awaited?

### Clarity
- [ ] Would another developer understand this function without comments?
- [ ] Are function names accurate descriptions of what they do?
- [ ] Is each function under ~30 lines?
- [ ] Are JSDoc comments present for all exported functions and classes?

### Tests
- [ ] Is every new function tested?
- [ ] Are error cases tested?
- [ ] Do test names follow `'should <behaviour> when <scenario>'`?
- [ ] Do tests use `assert.deepStrictEqual` for snapshot-style comparison?

### Safety
- [ ] No hardcoded secrets, tokens, or credentials
- [ ] No calls to Microsoft telemetry domains
- [ ] No unsafe DOM mutation patterns (the hook catches this, but verify)
- [ ] All user-visible strings go through `nls.localize()`

### Architecture
- [ ] Is the modification tier correct?
- [ ] Are layering rules respected (no importing from a higher layer)?
- [ ] Are disposables properly managed?
- [ ] Does a new service have a health endpoint and Dockerfile HEALTHCHECK?

### Compilation
- [ ] `npm run compile-check-ts-native` — zero TypeScript errors
- [ ] `npm run valid-layers-check` — no layering violations
- [ ] All tests pass with `scripts/test.sh`

## When to Stop and Ask

Stop and ask the developer for input when:
- A Tier 2 or Tier 3 change is required and you're uncertain it's justified
- The correct VS Code layer is ambiguous
- An existing VS Code API almost fits but not quite — is it better to adapt or to add?
- A decision will be hard to reverse (e.g., a public interface, a database schema)
- An error has occurred three times in a row (max 3 retries, then escalate)
