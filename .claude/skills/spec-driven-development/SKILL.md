---
name: spec-driven-development
description: >
  Specs as the primary artefact for Son of Anton development. Detects complexity
  (small/medium/large) and writes a spec with requirements, acceptance criteria,
  and interface contracts before any code is written. Validates spec after
  execution. Specs saved to docs/specs/.
  Trigger on: "write a spec", "spec this out", any feature with more than one
  affected layer, or medium/large complexity features.
---

# Spec-Driven Development for Son of Anton

Specifications are the primary artefact. Code is written to satisfy specs, not the other way around.

## Complexity Detection

Before writing a spec, classify the feature:

| Size | Signals | Action |
|------|---------|--------|
| **Small** | One file, one function, clear requirement | Short spec (1 page) |
| **Medium** | Multiple files, one layer, well-understood problem | Standard spec |
| **Large** | Multiple layers (IDE + service), new data model, agent integration, Tier 2+ | Full spec with interface contracts |

For small changes (e.g., fixing a bug in one function), a spec may be a single paragraph with one acceptance criterion. For large changes, a full spec is mandatory before implementation begins.

## Spec Format

Save specs to `docs/specs/<feature-name>.md`.

```markdown
# Spec: <Feature Name>

**ID:** SPEC-<NNN> (sequential, check existing specs for next number)
**Date:** <ISO date>
**Status:** [Draft | Approved | Implemented | Superseded]
**Complexity:** [Small | Medium | Large]
**Tier:** [1 | 2 | 3]

## Problem Statement

<One paragraph. What problem does the developer (or agent) have? Why does it matter now?>

## Scope

**In scope:**
- <What this spec covers>

**Out of scope:**
- <What this spec deliberately does not cover>

## Requirements

| ID | Requirement | Priority |
|----|------------|---------|
| REQ-001 | <The system shall...> | Must |
| REQ-002 | <The system shall...> | Should |
| REQ-003 | <The system should...> | Could |

Priority follows MoSCoW: Must / Should / Could / Won't.

## Acceptance Criteria

For each requirement, one or more verifiable acceptance criteria:

| ID | Criterion | Verification |
|----|-----------|-------------|
| EC-001 | Given <state>, when <action>, then <outcome> | `scripts/test.sh --grep "EC-001"` |
| EC-002 | Given <state>, when <action>, then <outcome> | Manual: open panel, click button, observe result |

## Interface Contracts

For Medium and Large features, define the TypeScript interfaces that bound the implementation:

```typescript
// The IDE workbench service interface
export interface IMyFeatureService {
	readonly _serviceBrand: undefined;
	doSomething(input: MyInput): Promise<MyOutput>;
}

export interface MyInput {
	filePath: string;
	options?: MyOptions;
}

export interface MyOutput {
	results: MyResult[];
	durationMs: number;
}
```

These interfaces are the contract. Implementation must satisfy them.

## VS Code Layer Analysis

| Component | Layer | File path |
|-----------|-------|-----------|
| Service interface | `platform` or `workbench/services` | `src/vs/workbench/services/myFeature/common/myFeature.ts` |
| Service implementation | `workbench/services` | `src/vs/workbench/services/myFeature/browser/myFeatureService.ts` |
| UI contribution | `workbench/contrib` or `sessions` | `src/vs/sessions/myFeature/browser/myFeatureView.ts` |
| Backend service | `services/` | `services/my-feature/src/index.ts` |

## Modification Tier

**Overall tier:** Tier [1 / 2 / 3]

<Table of files and their individual tiers>

<For Tier 3: written justification>

## Test Plan

- Unit tests: `src/vs/workbench/services/myFeature/test/myFeatureService.test.ts`
- Integration tests: `src/vs/workbench/contrib/myFeature/test/myFeature.integrationTest.ts`
- Service tests: `services/my-feature/test/index.test.ts`

All acceptance criteria must have a corresponding test or manual verification step.

## Open Questions

- [ ] <Question requiring a decision — will block implementation if unanswered>

## Dependencies

- <Other specs or systems this depends on>
```

## Spec Validation After Implementation

After implementation is complete, validate the spec:

1. **Run all tests** identified in the test plan
2. **Verify each acceptance criterion** — mark as [PASS] or [FAIL] with evidence
3. **Update spec status** to `Implemented` if all Must criteria pass
4. **Document any deviations** — if implementation differs from the spec, update the spec to reflect reality

```markdown
## Validation Results

**Date:** <ISO date>
**Overall:** [PASS / FAIL]

| EC-ID | Result | Notes |
|-------|--------|-------|
| EC-001 | PASS | `scripts/test.sh` — 3 tests pass |
| EC-002 | PASS | Manual verification confirmed |
```

## Spec Numbering

Check `docs/specs/` for existing specs before assigning a number. Use the next sequential SPEC-NNN. If `docs/specs/` does not exist, create it and start at SPEC-001.

## Notes

- A spec is not a task list — it describes what the system must do, not how
- Implementation details belong in the design doc (`docs/design/`) and plan (`docs/plans/`)
- Specs should survive a complete reimplementation — they describe behaviour, not code
