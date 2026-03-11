---
name: tier-classification
description: >
  Classify code modifications by merge conflict risk using the Son of Anton tier system.
  Use when planning changes, writing PR descriptions, or deciding review requirements.
  Tier 1 = new files alongside core (zero conflict risk), Tier 2 = hooks into existing
  code (low risk, human review), Tier 3 = direct core patches (high risk, senior review).
---

# Modification Tier Classification

## Tier 1 — New files alongside core (target: 75% of changes)
- New services in `services/`
- New extensions in `extensions/`
- New files in `src/vs/sessions/`
- Configuration files, documentation
- **Zero merge conflict risk.** No review gate beyond CI.

## Tier 2 — Hooks into existing code (target: 20% of changes)
- Adding imports or extension points to existing VS Code modules
- Registering new contributions in existing registries
- Adding new menu items, commands, keybindings
- **Low merge conflict risk.** Human review required.

## Tier 3 — Direct core patches (target: <5% of changes)
- Modifying existing VS Code source files in `src/vs/`
- Changing build scripts or configuration
- Altering existing UI components
- **High merge conflict risk.** Requires written justification and senior engineer review.

## How to Classify

1. Check the file path — is it entirely new or modifying existing?
2. If modifying existing, is it just adding imports/registrations (Tier 2) or changing logic (Tier 3)?
3. Every PR description must state which tier(s) of modification it contains
4. Tier 3 changes need written justification for why Tier 1 or 2 won't work

## PR Description Template

```
## Modification Tier: [1|2|3]

**Tier justification:** [For Tier 3 only — explain why this can't be Tier 1 or 2]

**Files changed:**
- [list files with their tier classification]
```
