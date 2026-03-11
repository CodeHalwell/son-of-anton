#!/usr/bin/env bash
set -euo pipefail

# Description: Warn when a written TypeScript file has functions with cyclomatic complexity > 10.
#              Uses ESLint complexity rule. Non-blocking — advisory only.
# Event: PostToolUse
# Matcher: Edit|Write

INPUT=$(cat)

# Extract the file path that was just written
FILE_PATH=$(echo "${INPUT}" | jq -r '.tool_input.path // .tool_input.file_path // ""')

if [ -z "${FILE_PATH}" ]; then
	exit 0
fi

# Only check TypeScript files
case "${FILE_PATH}" in
	*.ts|*.tsx) ;;
	*) exit 0 ;;
esac

# Resolve absolute path
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
	ABS_PATH="${CLAUDE_PROJECT_DIR}/${FILE_PATH}"
else
	ABS_PATH="${FILE_PATH}"
fi

# File must exist to check it
if [ ! -f "${ABS_PATH}" ]; then
	exit 0
fi

# Skip node_modules and out/
case "${ABS_PATH}" in
	*/node_modules/*|*/out/*) exit 0 ;;
esac

# Locate ESLint binary
ESLINT_BIN=""
if command -v npx >/dev/null 2>&1; then
	ESLINT_BIN="npx --no-install eslint"
elif [ -f "${CLAUDE_PROJECT_DIR:-}/node_modules/.bin/eslint" ]; then
	ESLINT_BIN="${CLAUDE_PROJECT_DIR}/node_modules/.bin/eslint"
fi

if [ -z "${ESLINT_BIN}" ]; then
	# ESLint not available — skip silently
	exit 0
fi

# Run ESLint with only the complexity rule (threshold: 10)
# We use --no-eslintrc to avoid loading the full project config which might be slow
RESULT=$(${ESLINT_BIN} \
	--rule '{"complexity": ["warn", 10]}' \
	--format compact \
	--no-eslintrc \
	--parser-options "ecmaVersion:2022" \
	"${ABS_PATH}" 2>&1 || true)

if echo "${RESULT}" | grep -q 'complexity'; then
	echo "=== Complexity Advisory ==="
	echo "File: ${FILE_PATH}"
	echo "${RESULT}" | grep 'complexity' | while IFS= read -r line; do
		echo "  WARNING: ${line}"
	done
	echo "Consider breaking high-complexity functions into smaller helpers."
	echo "=== End Complexity Advisory ==="
fi

# Always exit 0 — this is advisory only
exit 0
