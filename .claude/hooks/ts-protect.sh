#!/usr/bin/env bash
set -euo pipefail

# Description: Protect critical config files from accidental modification.
#              Blocks edits to package-lock.json, node_modules/, CI/CD workflows,
#              root-level tsconfig.json, and .env files.
# Event: PreToolUse
# Matcher: Edit|Write

INPUT=$(cat)

# Extract the target file path from the tool input
FILE_PATH=$(echo "${INPUT}" | jq -r '.tool_input.path // .tool_input.file_path // ""')

if [ -z "${FILE_PATH}" ]; then
	exit 0
fi

REASON=""

# package-lock.json — managed by npm, not manually edited
case "${FILE_PATH}" in
	package-lock.json|*/package-lock.json)
		REASON="package-lock.json is managed by npm. Run 'npm install' or 'npm update' instead of editing it directly." ;;
esac

# node_modules/ — never edited directly
if [ -z "${REASON}" ]; then
	case "${FILE_PATH}" in
		node_modules/*|*/node_modules/*)
			REASON="Files inside node_modules/ must never be edited. Modify package.json dependencies and run 'npm install'." ;;
	esac
fi

# .github/workflows/ — CI/CD pipelines require careful review (Tier 3)
if [ -z "${REASON}" ]; then
	case "${FILE_PATH}" in
		.github/workflows/*|*/.github/workflows/*)
			REASON="Modifying CI/CD workflow files in .github/workflows/ is a Tier 3 change. Requires senior engineer review and written justification." ;;
	esac
fi

# Root-level tsconfig.json only (not tsconfigs inside packages)
if [ -z "${REASON}" ]; then
	# Match exactly "tsconfig.json" at the root, or one path segment deep (e.g. ./tsconfig.json)
	case "${FILE_PATH}" in
		tsconfig.json|./tsconfig.json)
			REASON="Root-level tsconfig.json controls the entire TypeScript compilation. This is a Tier 3 change — document why it can't be achieved with a local tsconfig override." ;;
	esac
fi

# .env files — never committed, sensitive
if [ -z "${REASON}" ]; then
	BASENAME=$(basename "${FILE_PATH}")
	case "${BASENAME}" in
		.env|.env.*|*.env)
			REASON=".env files must never be committed or written to disk via Claude. Use environment variables at runtime or a secrets manager." ;;
	esac
fi

if [ -n "${REASON}" ]; then
	echo "BLOCKED: ${REASON}" >&2
	exit 2
fi

exit 0
