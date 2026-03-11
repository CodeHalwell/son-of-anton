---
name: write-plan
description: >
  Takes an approved design document and breaks it into 2-5 minute implementation
  tasks. Each task has file paths, description, expected output, and verification
  step. Applies interface-first ordering (types before services before views).
  Includes tier classification per task and human checkpoints every 3 tasks.
  Writes plan to docs/plans/ and individual tasks to docs/tasks/.
  Trigger on: "write a plan", "break this into tasks", "create an implementation plan",
  or after a design doc is approved.
---

# Write Plan — Implementation Planning for Son of Anton

This skill takes an approved design document and decomposes it into a sequence of small, independently-executable tasks.

## Input

- An approved design document from `docs/design/<feature-name>.md`
- Confirm the design is approved before writing the plan

## Task Sizing

Each task should take 2-5 minutes to execute. If a task would take longer:
- Split it into sub-tasks (e.g., "write interface" then "implement service")
- Each sub-task must be independently verifiable

If a task is under 1 minute (e.g., adding a single import), merge it with adjacent tasks.

## Ordering Principle: Interface First

Tasks must be ordered so that each task's dependencies are complete before it runs:

1. **Type definitions and interfaces** — define the contract before any implementation
2. **Backend services** — implement the service endpoint
3. **Platform services / DI registration** — workbench service that calls the backend
4. **Contribution / UI** — views, panes, commands that consume the service
5. **Tests** — written after the code they test is complete
6. **Documentation** — updated last

This ordering means later tasks can assume earlier types exist and compile cleanly.

## Task Format

Each task is written to `docs/tasks/<feature-name>-<NNN>.md`:

```markdown
# Task <NNN>: <Short Title>

**Plan:** <feature-name>
**Tier:** [1 / 2 / 3]
**Estimated time:** [2-5 minutes]

## Description

<What to do — precise enough that a task-executor agent can follow without asking questions>

## Files to Modify

- `path/to/file.ts` — [create | modify | delete]
- `path/to/other-file.ts` — [create | modify]

## Expected Output

<Code snippet or description of what the file(s) should look like after the task>

## Verification

<Exact command(s) to run to verify this task is complete>

For TypeScript changes:
- `npm run compile-check-ts-native` — must produce zero errors

For service changes:
- `docker compose build <service-name>` — must build successfully

For tests:
- `scripts/test.sh --grep "<test suite name>"` — all tests must pass

## Dependencies

<List task IDs that must be complete before this task can start, or "None">

## Spec References

<REQ-NNN or EC-NNN from the design doc, or "None">
```

## Plan Format

The overall plan is written to `docs/plans/<feature-name>.md`:

```markdown
# Plan: <Feature Name>

**Design doc:** docs/design/<feature-name>.md
**Date:** <ISO date>
**Overall tier:** Tier [1 / 2 / 3]

## Task Sequence

| # | Task | File(s) | Tier | Checkpoint? |
|---|------|---------|------|-------------|
| 001 | Define contract interfaces | services/my-service/src/contract.ts | 1 | — |
| 002 | Implement service endpoint | services/my-service/src/index.ts | 1 | — |
| 003 | Write service tests | services/my-service/test/index.test.ts | 1 | CHECKPOINT |
| 004 | Implement workbench service | src/vs/workbench/services/... | 1 | — |
| 005 | Register in contribution | src/vs/workbench/contrib/... | 2 | — |
| 006 | Implement view pane | src/vs/sessions/... | 1 | CHECKPOINT |

## Human Checkpoints

Checkpoints occur every 3 tasks. At a checkpoint, the plan executor pauses and asks
the developer to review work so far before continuing.

## Risk Notes

<Any tasks with high risk of being wrong — explain what to watch for>
```

## Human Checkpoints

Insert a checkpoint marker after every 3 tasks. At checkpoints, the `execute-plan` skill will pause and ask the developer to review before continuing.

Checkpoints are especially important:
- After all interface/type tasks are complete (before implementation begins)
- After backend service is complete (before IDE integration begins)
- At any Tier 2 or Tier 3 task

## Tier Per Task

Every task must have its tier stated:

- Creating a new file in `services/`, `extensions/`, `src/vs/sessions/` → Tier 1
- Modifying an existing file to add an import or registry entry → Tier 2
- Modifying existing VS Code logic → Tier 3

If any task is Tier 3, add a justification note explaining why it cannot be Tier 1 or 2.

## Output

After writing the plan:
1. Confirm the task count and estimated total time with the developer
2. Ask if any tasks need to be split, merged, or reordered
3. Only proceed to `execute-plan` after the developer has approved the plan
