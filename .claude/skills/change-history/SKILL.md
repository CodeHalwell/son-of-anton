---
name: change-history
description: >
  Maintain a structured JSON history of project changes in .history/changes.json.
  Use this skill after making any medium-to-large changes to the codebase. This includes:
  new files, API changes, schema changes, agent modifications, dependency changes,
  refactors, config changes, and significant bug fixes. Do NOT log formatting-only
  changes, typo fixes, or trivial single-line edits. When in doubt, log it — future
  sessions benefit from more context, not less.
---

# Change History

After making medium-to-large changes, update `.history/changes.json` with a new entry.

## Steps

1. Read the current `.history/changes.json` (create it if it doesn't exist)
2. Determine if the changes warrant a log entry (see criteria below)
3. If yes, append a new entry to the `entries` array
4. Write the updated file back

## Entry Schema

Each entry must have:
- `id`: ISO timestamp + 6-char random hex suffix (e.g. `"2025-01-15T14:32:00Z-a1b2c3"`)
- `timestamp`: Current UTC time in ISO 8601
- `type`: One of `feature`, `bugfix`, `refactor`, `config`, `docs`, `test`, `infra`, `agent`
- `scope`: One of `ide`, `services`, `extensions`, `mcp`, `graph`, `infra`, `config`
- `summary`: One-line description (max 120 chars), like a commit message
- `detail`: Multi-sentence explanation including WHY the change was made
- `files_changed`: Array of all file paths created, modified, or deleted
- `breaking`: Boolean — does this break existing interfaces?
- `tier`: Modification tier (1, 2, or 3) per the project's tier policy
- `dependencies_added`: Array of `"package@version"` (if any)
- `dependencies_removed`: Array of `"package@version"` (if any)
- `related_entries`: Array of entry IDs this builds on (if any)
- `tags`: Freeform tags for searchability

## When to Log

**Always log:** New files/modules, service changes, extension changes, API changes,
MCP server changes, graph schema changes, infrastructure changes, dependency changes,
config changes, refactors, bug fixes.

**Never log:** Formatting-only, typo fixes, trivial single-line edits.

## Initialisation

If `.history/changes.json` doesn't exist, create it:

```json
{
  "version": "1.0.0",
  "project": "Son-Of-Anton",
  "entries": []
}
```
