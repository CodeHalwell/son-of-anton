#!/usr/bin/env bash
set -euo pipefail

# Description: Detect circular imports in TypeScript files using madge (if available).
#              Non-blocking — advisory only. Reports cycles involving the edited file.
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

# Skip node_modules and generated output
case "${FILE_PATH}" in
	*/node_modules/*|*/out/*|*/dist/*) exit 0 ;;
esac

# Resolve absolute path for the edited file
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
	ABS_PATH="${CLAUDE_PROJECT_DIR}/${FILE_PATH}"
	PROJECT_ROOT="${CLAUDE_PROJECT_DIR}"
else
	ABS_PATH="${FILE_PATH}"
	PROJECT_ROOT="$(pwd)"
fi

# File must exist
if [ ! -f "${ABS_PATH}" ]; then
	exit 0
fi

# Locate madge
MADGE_BIN=""
if command -v madge >/dev/null 2>&1; then
	MADGE_BIN="madge"
elif [ -f "${PROJECT_ROOT}/node_modules/.bin/madge" ]; then
	MADGE_BIN="${PROJECT_ROOT}/node_modules/.bin/madge"
elif command -v npx >/dev/null 2>&1; then
	# Check if madge is available via npx without installing it
	if npx --no-install madge --version >/dev/null 2>&1; then
		MADGE_BIN="npx --no-install madge"
	fi
fi

if [ -z "${MADGE_BIN}" ]; then
	# madge not available — skip silently
	exit 0
fi

# Determine the source directory to scan (src/ or the file's parent)
SRC_DIR="${PROJECT_ROOT}/src"
if [ ! -d "${SRC_DIR}" ]; then
	SRC_DIR="$(dirname "${ABS_PATH}")"
fi

# Run madge circular check — cap at 30 seconds to avoid blocking Claude
CYCLES=$(timeout 30 ${MADGE_BIN} \
	--circular \
	--ts-config "${PROJECT_ROOT}/tsconfig.json" \
	--extensions ts,tsx \
	"${SRC_DIR}" 2>/dev/null || true)

if [ -z "${CYCLES}" ]; then
	exit 0
fi

# Filter cycles that involve the edited file (by relative path or basename)
RELATIVE_PATH="${FILE_PATH#./}"
BASENAME=$(basename "${FILE_PATH}" .ts)
BASENAME="${BASENAME%.tsx}"

RELEVANT=$(echo "${CYCLES}" | grep -E "(${RELATIVE_PATH}|${BASENAME})" || true)

if [ -n "${RELEVANT}" ]; then
	echo "=== Circular Import Advisory ==="
	echo "File: ${FILE_PATH}"
	echo "Cycles involving this file:"
	echo "${RELEVANT}" | while IFS= read -r line; do
		echo "  ${line}"
	done
	echo "Circular imports can cause runtime errors in VS Code's layered architecture."
	echo "Check the layering rules: npm run valid-layers-check"
	echo "=== End Circular Import Advisory ==="
fi

# Always exit 0 — advisory only
exit 0
