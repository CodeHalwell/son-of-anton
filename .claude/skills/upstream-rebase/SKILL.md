---
name: upstream-rebase
description: >
  Guide the upstream VS Code rebase and merge workflow. Use when pulling updates from
  the upstream microsoft/vscode repository, resolving merge conflicts, or planning
  upstream sync strategy. Triggers on: "upstream", "rebase", "merge from vscode",
  "sync upstream", "microsoft/vscode", or upstream conflict resolution.
---

# Upstream Rebase Guide

## Strategy: Services-first, fork-second

All AI capabilities are built as standalone services (Tier 1) to minimise merge conflicts.
Only Tier 2/3 changes touch upstream VS Code code.

## Before Rebasing

1. Ensure all tests pass on the current branch
2. Review pending Tier 2/3 changes — these are most likely to conflict
3. Check the VS Code release notes for breaking changes
4. Back up any in-progress work

## Rebase Process

```bash
# Add upstream remote (one-time)
git remote add upstream https://github.com/microsoft/vscode.git

# Fetch upstream changes
git fetch upstream

# Create a rebase branch
git checkout -b chore/upstream-rebase-YYYY-MM-DD main

# Rebase onto upstream
git rebase upstream/main
```

## Conflict Resolution Priority

1. **Keep our changes** for: services/, extensions/son-of-anton/, src/vs/sessions/
2. **Take upstream** for: most core VS Code files unless we have Tier 3 patches
3. **Manual merge** for: Tier 2/3 modifications — review each conflict carefully

## After Rebasing

1. Run `npm run compile-check-ts-native` to verify TypeScript compiles
2. Run `npm run valid-layers-check` to check layering
3. Test the Son of Anton extension specifically
4. Test Docker Compose services still work
5. Create a PR with detailed notes on conflicts resolved

## Key Files to Watch

These files are most likely to conflict during upstream rebases:
- `package.json` / `package-lock.json` — dependency changes
- `src/vs/workbench/` files — if we have Tier 2/3 patches
- Build scripts in `build/`
- GitHub Actions workflows
