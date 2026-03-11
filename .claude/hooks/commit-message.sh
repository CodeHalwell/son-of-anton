#!/usr/bin/env bash
set -euo pipefail

# Description: Enforce conventional commits format on git commit commands.
#              Blocks git commit calls whose message does not follow the spec.
# Event: PreToolUse
# Matcher: Bash

INPUT=$(cat)

# Extract the command string
COMMAND=$(echo "${INPUT}" | jq -r '.tool_input.command // ""')

if [ -z "${COMMAND}" ]; then
	exit 0
fi

# Only process git commit commands
if ! echo "${COMMAND}" | grep -qE '^git commit|git commit '; then
	exit 0
fi

# Skip --amend and --allow-empty-message (let them through — author knows what they're doing)
if echo "${COMMAND}" | grep -qE '(--allow-empty-message)'; then
	exit 0
fi

# Extract the commit message from -m "..." or -m '...'
# Also handle heredoc-style (cat <<'EOF') — we skip enforcement for those as the message
# is not inline and will be validated by the pre-commit hook instead.
if echo "${COMMAND}" | grep -qE "<<'?EOF'?|<<'?'EOF'?"; then
	# Heredoc commits — trust them; the message is authored explicitly
	exit 0
fi

COMMIT_MSG=""
# Try to extract -m "message" or -m 'message'
if echo "${COMMAND}" | grep -qE '\-m[[:space:]]+"'; then
	COMMIT_MSG=$(echo "${COMMAND}" | sed -E 's/.*-m[[:space:]]+"([^"]+)".*/\1/')
elif echo "${COMMAND}" | grep -qE "\-m[[:space:]]+'"; then
	COMMIT_MSG=$(echo "${COMMAND}" | sed -E "s/.*-m[[:space:]]+'([^']+)'.*/\1/")
fi

if [ -z "${COMMIT_MSG}" ]; then
	# Could not extract inline message (may be using --file or a heredoc we missed); allow
	exit 0
fi

# Conventional commits pattern:
# type(optional-scope): description
# Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
CONVENTIONAL_PATTERN='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._\-]+\))?!?: .{1,}'

if ! echo "${COMMIT_MSG}" | grep -qE "${CONVENTIONAL_PATTERN}"; then
	cat >&2 <<'ERRMSG'
BLOCKED: Commit message does not follow Conventional Commits format.

Required format:  type(scope): description
                  type: description

Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

Examples:
  feat(sessions): add agent session window layout
  fix(graph): handle disconnected FalkorDB nodes
  chore(npm): update package-lock after audit fix
  docs: update architecture decision for Tier 2 changes
  refactor(mcp)!: rename tool registration API (breaking change)

Breaking changes: append ! after type/scope, e.g. feat!: or fix(api)!:
ERRMSG
	exit 2
fi

exit 0
