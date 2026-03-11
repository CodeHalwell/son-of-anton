---
name: adr
description: >
  Architecture Decision Records in MADR format for Son of Anton. When to write
  one (significant, contested, non-obvious decisions). Format: context, decision,
  alternatives considered (table), consequences (positive + trade-offs). Files in
  docs/decisions/ with sequential numbering.
  Trigger on: "write an ADR", "document this decision", "why did we choose X",
  architectural choices about VS Code layer, service design, or tech stack.
---

# Architecture Decision Records for Son of Anton

An ADR captures a significant architectural decision: its context, the decision made, and the trade-offs accepted. Written once, read many times.

## When to Write an ADR

Write an ADR when a decision is:

- **Significant** — affects multiple files, teams, or layers of the system
- **Contested** — reasonable people might choose differently
- **Non-obvious** — the rationale is not self-evident from the code

You do NOT need an ADR for:
- Routine implementation choices (naming, variable type, algorithm in one function)
- Bug fixes
- Style/formatting changes

### SoA-Specific Triggers

Always write an ADR for:
- Choosing which VS Code layer a new feature lives in
- Adding a new backend service (vs. extending an existing one)
- Choosing a new third-party dependency or protocol
- Tier 3 modifications — the written justification IS an ADR
- Any change to the FalkorDB graph schema or Qdrant collection structure
- Changing agent model routing rules

## File Location and Naming

ADRs live in `docs/decisions/`.

Format: `docs/decisions/NNNN-short-kebab-title.md`

Check existing files to get the next number:
```
docs/decisions/0001-use-falkordb-for-code-graph.md
docs/decisions/0002-use-qdrant-for-vector-search.md
docs/decisions/0003-sessions-layer-for-agent-workflows.md
```

## MADR Format

```markdown
# <NNN>. <Short Title in Title Case>

**Date:** <ISO date>
**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-NNNN]
**Deciders:** <names or roles>

## Context

<1-3 paragraphs describing the situation. What problem needed a decision?
What were the constraints? What drove the need for this choice?
Include relevant VS Code layer constraints, upstream merge risk, or SoA architecture principles that apply.>

## Decision

**We will [decision statement].**

<1-2 paragraphs explaining the decision in plain terms. What exactly are we doing?
What are we NOT doing as a result?>

## Alternatives Considered

| Alternative | Pros | Cons | Reason rejected |
|------------|------|------|----------------|
| Option A (chosen) | Pro 1, Pro 2 | Con 1 | — (this is the chosen option) |
| Option B | Pro 1 | Con 1, Con 2 | Explain why it lost |
| Option C | ... | ... | Explain why it lost |

## Consequences

### Positive
- <Benefit 1>
- <Benefit 2>

### Trade-offs
- <Trade-off 1 — be honest about what we're giving up>
- <Trade-off 2>

### Risks
- <Risk 1 — what could go wrong, and how do we mitigate?>

## Modification Tier

**Tier:** [1 / 2 / 3]

<For Tier 3: why can't this be accomplished as Tier 1 or 2?>

## References

- [Link to relevant design doc, upstream issue, or external resource]
```

## Example: Choosing VS Code Layer

```markdown
# 0004. Place Agent Session Panel in src/vs/sessions/ Layer

**Date:** 2026-03-10
**Status:** Accepted
**Deciders:** Daniel Halwell

## Context

The Son of Anton agent session panel needs to live somewhere in the VS Code source tree.
Options include the main workbench (`src/vs/workbench/`), a built-in extension
(`extensions/son-of-anton/`), or the dedicated sessions layer (`src/vs/sessions/`).

The sessions layer was added specifically for agentic workflows and can import from
workbench but workbench cannot import from sessions, enforcing a clean dependency direction.

## Decision

**We will place the agent session panel in `src/vs/sessions/`.**

This is a Tier 1 change — new files only, no modification of existing VS Code sources.

## Alternatives Considered

| Alternative | Pros | Cons | Reason rejected |
|------------|------|------|----------------|
| `src/vs/sessions/` (chosen) | Tier 1, clean separation, designed for this | N/A | — |
| `src/vs/workbench/contrib/` | Familiar, existing patterns | Mixes SoA with VS Code contrib, Tier 2+ | Higher merge conflict risk |
| `extensions/son-of-anton/` | Full isolation, Tier 1 | Limited workbench API access | Too limited for deep integration |

## Consequences

### Positive
- Zero merge conflict risk with upstream VS Code
- Clean architectural boundary
- Easy to remove or update independently

### Trade-offs
- Less familiar to developers who don't know the sessions layer
- Cannot be imported by workbench code (by design)
```

## Quality Standards per Section

**Context:** Must explain WHY a decision was needed — not just WHAT was decided. Include constraints from the VS Code architecture (layering rules, tier policy, upstream merge risk).

**Decision:** Must be a clear, actionable statement. Start with "We will..." not "We considered..."

**Alternatives considered:** Must have at least 2 alternatives, including the chosen option in the first row. The "reason rejected" column must be honest — not circular reasoning.

**Consequences:** Must include both positives AND trade-offs. An ADR with no trade-offs is not being honest.

## ADR Lifecycle

- **Proposed** — written, not yet agreed
- **Accepted** — agreed by relevant stakeholders
- **Deprecated** — no longer applies but kept for historical context
- **Superseded by ADR-NNNN** — replaced by a newer decision

When superseding an ADR, update the old ADR's status AND reference it in the new ADR's Context section.
