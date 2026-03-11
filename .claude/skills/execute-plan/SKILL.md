---
name: execute-plan
description: >
  Executes an approved implementation plan by dispatching task-executor subagents
  per task. Applies two-stage review (spec compliance + code quality) after each
  task via task-reviewer. Max 2 re-dispatches before escalating to human. Pauses
  at human checkpoints. Reports progress after each task.
  Trigger on: "execute the plan", "run the plan", "start implementing", or after a
  plan is approved.
---

# Execute Plan — Orchestrated Plan Execution for Son of Anton

This skill takes an approved plan from `docs/plans/<feature-name>.md` and executes it task by task, using subagents to implement and review each task.

## Input

- An approved plan document from `docs/plans/<feature-name>.md`
- All task files at `docs/tasks/<feature-name>-<NNN>.md`
- Developer confirmation that the plan is approved

## Execution Loop

For each task in sequence:

```
1. Read docs/tasks/<feature-name>-<NNN>.md
2. Dispatch task-executor agent with the task spec
3. Dispatch task-reviewer agent with the task spec + executor output
4. If review result is REJECT:
   a. Re-dispatch task-executor with review findings (retry 1)
   b. Re-dispatch task-reviewer again
   c. If still REJECT: re-dispatch task-executor again (retry 2)
   d. If still REJECT after 2 retries: ESCALATE TO HUMAN — do not proceed
5. If review result is ACCEPT or ACCEPT WITH MINOR FIXES:
   a. Log task as complete
   b. Report progress to developer
6. If this task is a CHECKPOINT: pause and ask developer to review before continuing
```

## Progress Reporting

After each task completes, report:

```
## Task <NNN> Complete: <Title>

**Status:** [PASS / PASSED AFTER N RETRIES]
**Files changed:** [list]
**Tier:** [1 / 2 / 3]
**Review:** [ACCEPT / ACCEPT WITH MINOR FIXES]
**Minor findings:** [if any — listed for awareness]

Progress: [N] / [total] tasks complete.
[Next task: <NNN> — <Title>] OR [CHECKPOINT — awaiting developer review]
```

## Human Checkpoints

When a task marked CHECKPOINT is reached:

```
## Checkpoint After Task <NNN>

Work so far is complete and reviewed. Please review the changes before we continue.

**What was built:**
[Summary of tasks completed since last checkpoint]

**Files changed:**
[Cumulative list since last checkpoint]

**Tier summary:**
[Breakdown of tier classifications]

**To continue:** Reply "continue" or "proceed"
**To adjust:** Describe any changes needed before proceeding
**To abort:** Reply "stop" — all completed tasks remain in place
```

Do not proceed past a checkpoint without explicit developer confirmation.

## Error Escalation

If a task fails after 2 retries:

```
## ESCALATION: Task <NNN> Failed After 2 Retries

**Task:** <Title>
**File(s):** [list]

**Review findings that caused rejection:**
[Summary of Critical/Important findings from task-reviewer]

**Suggested actions:**
1. Review the task spec in docs/tasks/<feature-name>-<NNN>.md
2. The issue may require a design change — consider updating the design doc
3. Alternatively, manually implement this task and mark it complete

**Execution is paused.** Reply with:
- "retry" — to attempt a third dispatch (not recommended)
- "skip" — to skip this task and continue (only if task is non-blocking)
- "stop" — to halt execution; all prior tasks remain in place
- Or provide corrected implementation guidance
```

## Abort Behaviour

If execution is aborted at any point:
- All completed tasks remain in the codebase (do not roll back)
- Report which tasks completed and which did not
- Note any partial state that may need manual cleanup

## Completion Report

When all tasks are complete:

```
## Plan Execution Complete: <Feature Name>

**Tasks completed:** [N] / [N]
**Retries required:** [N tasks needed retries]
**Total tier summary:** [N Tier 1, N Tier 2, N Tier 3 tasks]

**Files created:**
[list]

**Files modified:**
[list]

**Next steps:**
- Run npm run compile-check-ts-native to confirm zero errors
- Run scripts/test.sh to confirm all tests pass
- Create a PR following the git-workflow skill
- Ensure the PR description states the modification tier
```

## Constraints

- Max 5 subagents running concurrently (respect the SoA rate limit policy)
- Each task-executor and task-reviewer pair counts as 2 agent dispatches
- If the plan has more than 10 tasks, confirm with the developer before starting
