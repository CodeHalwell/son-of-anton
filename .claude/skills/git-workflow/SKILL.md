---
name: git-workflow
description: >
  Git workflow conventions for Son of Anton. Branch naming (feat/fix/chore/docs/
  refactor/test + kebab-case). Conventional commits. Squash rules. Safe rebase.
  Never force-push shared branches. --force-with-lease for feature branches.
  PR-ready checklist. Trigger on: creating branches, preparing commits, writing
  PR descriptions, or any git operation question.
---

# Git Workflow for Son of Anton

## Branch Naming

Format: `<type>/<short-kebab-description>`

| Type | Use for |
|------|---------|
| `feat/` | New features or capabilities |
| `fix/` | Bug fixes |
| `chore/` | Maintenance, dependency updates, build changes |
| `docs/` | Documentation only changes |
| `refactor/` | Code restructuring with no behaviour change |
| `test/` | Adding or fixing tests |

Examples:
```
feat/falkordb-code-graph-indexer
fix/sessions-pane-disposable-leak
chore/npm-audit-fix-2026-03
docs/update-service-map
refactor/model-router-async-cleanup
test/myfeature-service-unit-tests
```

Rules:
- Kebab-case — all lowercase, hyphens only
- Concise — under 50 characters total (including type prefix)
- No generic names: `feat/my-feature` or `fix/bug-fix` are not allowed

## Conventional Commits

Format: `<type>(<scope>): <imperative description>`

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance (no production code change) |
| `docs` | Documentation |
| `refactor` | Refactor with no behaviour change |
| `test` | Adding or correcting tests |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

Scope is the affected area: `sessions`, `indexer`, `falkordb`, `qdrant`, `mcp-gateway`, `workbench`, `services`, etc.

Examples:
```
feat(sessions): add code graph panel to agent session window
fix(indexer): handle empty file paths in Tree-sitter indexer
chore(npm): apply npm audit fix for 2026-03 advisories
docs(services): update service map with spec-pipeline entry
refactor(model-router): extract retry logic into shared utility
test(myfeature): add unit tests for findRelated edge cases
```

Rules:
- Description in imperative present tense: "add", "fix", "remove" — not "added", "fixes", "removing"
- Under 72 characters for the subject line
- Body optional — use for "why" context when not obvious from the title

## Commit Body

For non-trivial changes, add a body:

```
feat(sessions): add FalkorDB query panel to agent session window

The agent session window now includes a panel for inspecting the
code graph directly. This helps developers understand what context
agents are using during planning.

Tier: 1 (new file in src/vs/sessions/)
```

## Squash Rules

Before merging a feature branch, squash commits that:
- Fix compilation errors introduced in a prior commit on the same branch
- Address review feedback on the same branch
- Are "wip" or "temp" commits

Do NOT squash:
- Logically separate changes that should be independently revertable
- Commits that cross tier boundaries (keep Tier 1 and Tier 2 changes separate)

```bash
# Interactive rebase to squash (only on your feature branch — never shared branches)
git rebase -i origin/main

# Or squash all commits on branch into one
git reset --soft origin/main
git commit -m "feat(scope): description of everything"
```

## Rebase vs. Merge

- **Prefer rebase** for feature branches to keep history linear
- **Use merge commits** only for integrating upstream VS Code changes (preserves upstream history)
- **Never rebase** commits that have been pushed to a shared branch (main, or branches others are working on)

```bash
# Update feature branch with latest main (safe rebase)
git fetch origin
git rebase origin/main

# If conflicts arise, resolve then continue
git rebase --continue

# Safe abort if needed
git rebase --abort
```

## Force Push Rules

| Branch | Force push allowed? |
|--------|-------------------|
| `main` | NEVER — not even with --force-with-lease |
| Any shared branch | NEVER |
| Your own feature branch (not yet reviewed) | Yes, with `--force-with-lease` |
| Your own feature branch (under review) | Only with reviewer's knowledge |

```bash
# SAFE force push (only for your own feature branches)
git push --force-with-lease origin feat/my-feature

# NEVER — no safety net
git push --force origin main
```

## PR Description Template

Every PR must include:

```markdown
## Summary

<1-3 sentences describing what this PR does and why>

## Modification Tier

**Tier:** [1 / 2 / 3]

**Tier justification:** [For Tier 3 only — why can't this be Tier 1 or 2?]

**Files changed:**
| File | Tier | Change type |
|------|------|------------|
| `services/my-service/src/index.ts` | 1 | Created |
| `src/vs/sessions/myPane/browser/myPane.ts` | 1 | Created |
| `src/vs/workbench/contrib/existing/existing.ts` | 2 | Modified (added registry entry) |

## Test Plan

- [ ] `npm run compile-check-ts-native` — zero TypeScript errors
- [ ] `npm run valid-layers-check` — no layering violations
- [ ] `scripts/test.sh --grep "MyFeature"` — all tests pass
- [ ] `docker compose build my-service` — service builds (if applicable)
- [ ] Manual: [describe manual verification steps]

## Change History

- Updated `.history/changes.json` with entry type `feature`, scope `[scope]`
```

## PR-Ready Checklist

Before opening a PR:

- [ ] Branch name follows `<type>/<kebab-description>` format
- [ ] All commits follow conventional commit format
- [ ] Squashed any WIP / fixup commits
- [ ] `npm run compile-check-ts-native` — zero errors
- [ ] `npm run valid-layers-check` — no violations
- [ ] All tests pass
- [ ] Modification tier stated and correct
- [ ] `.history/changes.json` updated (if medium-to-large change)
- [ ] PR description uses the template above

## Upstream Sync

When pulling upstream VS Code changes (use the `upstream-rebase` skill for the full workflow):

```bash
# Add upstream remote (once)
git remote add upstream https://github.com/microsoft/vscode.git

# Fetch upstream
git fetch upstream

# Merge upstream into main (preserve their history)
git checkout main
git merge upstream/main --no-ff -m "chore: merge upstream vscode <version>"
```

Do not rebase SoA commits onto upstream — merge preserves both histories and makes conflict attribution clear.
