---
name: brainstorm
description: >
  Structured Q&A for new Son of Anton features. Guides the developer through
  understand → clarify → confirm → design doc. Produces a design document in
  docs/design/ that includes tier classification, VS Code layer analysis, and
  upstream merge risk. Trigger on: "let's brainstorm", "I have an idea", "what if
  we added", "help me think through", or any new feature discussion.
---

# Brainstorm — Structured Feature Design for Son of Anton

A new feature starts here. This skill guides you through a structured Q&A to understand the problem deeply before writing any code.

## Process

### Phase 1: Understand

Ask these questions to understand the feature:

1. **What problem does this solve for the developer?** (Not what it does — what pain does it remove?)
2. **Who uses this feature?** (Developer using SoA IDE, an AI agent, a service, or all three?)
3. **What does success look like?** (Describe the happy path end-to-end)
4. **What does failure look like?** (What happens when things go wrong?)
5. **How often will this be used?** (Every keystroke, on demand, background, one-time setup?)

### Phase 2: Clarify — SoA-Specific Questions

After understanding the problem, ask these SoA-specific questions:

**VS Code Layer Analysis**
- Which layer does this naturally belong to?
  - `src/vs/base/` — generic utility with no VS Code dependencies
  - `src/vs/platform/` — platform service available across the workbench
  - `src/vs/editor/` — text editing intelligence
  - `src/vs/workbench/` — workbench UI contribution
  - `src/vs/sessions/` — agent session workflow (preferred for new SoA features)
  - `services/<name>/` — standalone backend service

**Upstream Merge Risk**
- Does this require modifying existing VS Code source files? (If yes, why can't it be a new file?)
- Can this be implemented entirely as Tier 1 (new files only)?
- If not, what is the minimum Tier 2 hook needed?

**Service vs. Contribution**
- Does this require persistent state or background processing? (→ backend service)
- Is this purely UI or editor intelligence? (→ workbench contribution)
- Does it need to expose tools to LLM agents? (→ MCP server)
- Does it span IDE and backend? (→ full-stack, needs API contract)

**Data and Storage**
- Does this need code graph data? (→ FalkorDB queries)
- Does this need semantic/vector search? (→ Qdrant)
- Does this need to persist user preferences? (→ VS Code ConfigurationService)
- Does this need to store session state? (→ VS Code StorageService or service-level store)

**Agent Integration**
- Does this expose tools to Claude agents via MCP?
- Does it affect how agents read or write code?
- Does it need to run during agent sessions (`src/vs/sessions/`)?

### Phase 3: Confirm

Summarise your understanding back to the developer:

```
Based on our discussion, here is what I understand:

**Problem:** [one sentence]
**Users:** [who benefits]
**Solution:** [what we build]
**Layer:** [VS Code layer and/or service]
**Tier:** [Tier 1 / 2 / 3 — with justification]
**Upstream risk:** [none / low / medium — explain]

Does this capture it correctly? Any corrections before I write the design doc?
```

Wait for confirmation before proceeding to Phase 4.

### Phase 4: Design Document

Write a design document to `docs/design/<feature-name>.md`.

```markdown
# Design: <Feature Name>

**Date:** <ISO date>
**Author:** <developer or "Claude">
**Status:** Draft

## Problem Statement

<One paragraph describing the problem and why it matters>

## Proposed Solution

<One paragraph describing the solution at a high level>

## VS Code Layer

<Which layer(s) this touches and why>

## Modification Tier

**Overall tier:** Tier [1 / 2 / 3]

| File / Directory | Tier | Justification |
|-----------------|------|---------------|
| `services/<name>/` | 1 | New service, no existing files modified |
| `src/vs/sessions/<name>/` | 1 | New file in sessions layer |
| `src/vs/workbench/contrib/<existing>/` | 2 | Hook into existing registry |

<For any Tier 3: written justification for why Tier 1 or 2 is not sufficient>

## Upstream Merge Risk

<Low / Medium / High — explain which upstream files are touched and why>

## Interface Contracts

<TypeScript interfaces for key data flows, especially IDE ↔ service boundaries>

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| ... | ... |

## Open Questions

- [ ] <Question that needs a decision before implementation>

## Success Criteria

- [ ] <Measurable acceptance criterion>
- [ ] <Measurable acceptance criterion>
```

## Output

The design document is saved to `docs/design/<feature-name>.md`. This document becomes the input for the `write-plan` skill.

## Notes
- Always complete all three phases before writing the design doc
- Do not start writing code during brainstorm — this is a thinking-first phase
- If the developer already has strong opinions on the approach, the clarify phase can be shorter, but still confirm tier and layer
