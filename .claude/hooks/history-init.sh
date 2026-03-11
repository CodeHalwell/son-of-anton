#!/usr/bin/env bash
set -euo pipefail

# Description: Bootstrap .history/ directory and inject recent change entries into session context
# Event: SessionStart

INPUT=$(cat)

HISTORY_DIR="${CLAUDE_PROJECT_DIR}/.history"
CHANGES_FILE="${HISTORY_DIR}/changes.json"
RETRO_FILE="${HISTORY_DIR}/retrospective.md"

# Create .history directory if it does not exist
mkdir -p "${HISTORY_DIR}"

# Bootstrap changes.json if it does not exist
if [ ! -f "${CHANGES_FILE}" ]; then
	cat > "${CHANGES_FILE}" <<'EOF'
{
  "version": "1.0.0",
  "project": "Son-Of-Anton",
  "entries": []
}
EOF
fi

# Bootstrap retrospective.md if it does not exist
if [ ! -f "${RETRO_FILE}" ]; then
	cat > "${RETRO_FILE}" <<'EOF'
# Son of Anton — Retrospective Log

This file records retrospective notes, lessons learned, and architectural observations
accumulated during AI-assisted development sessions.

## Format

Each entry starts with a date heading and contains:
- What was changed and why
- Merge-conflict risk tier (1/2/3)
- Any gotchas or follow-up items

---

EOF
fi

# Inject the 5 most recent change entries into context (if any exist)
ENTRY_COUNT=$(jq '.entries | length' "${CHANGES_FILE}" 2>/dev/null || echo "0")

if [ "${ENTRY_COUNT}" -gt 0 ]; then
	echo "=== Son of Anton — Recent Change History (last 5 entries) ==="
	jq -r '
		.entries
		| sort_by(.timestamp)
		| reverse
		| .[0:5][]
		| "[\(.timestamp // "unknown")] \(.tier // "?") | \(.summary // "(no summary)")\n  Files: \((.files // []) | join(", "))\n  Author: \(.author // "unknown")"
	' "${CHANGES_FILE}" 2>/dev/null || true
	echo "=== End Change History ==="
else
	echo "=== Son of Anton — Change History: no entries yet ==="
fi

exit 0
