#!/usr/bin/env bash
set -euo pipefail

# Description: Block creation of .js/.jsx files in src/ directory.
#              Son of Anton is a TypeScript-first VS Code fork; .js files in src/ indicate
#              a mistake. Allowed exceptions: config files, scripts/, build/, out/, test/.
# Event: PreToolUse
# Matcher: Edit|Write

INPUT=$(cat)

# Extract the target file path from the tool input
FILE_PATH=$(echo "${INPUT}" | jq -r '.tool_input.path // .tool_input.file_path // ""')

if [ -z "${FILE_PATH}" ]; then
	exit 0
fi

# Only care about .js and .jsx files
case "${FILE_PATH}" in
	*.js|*.jsx) ;;
	*) exit 0 ;;
esac

# Only block files inside src/
case "${FILE_PATH}" in
	*/src/*) ;;
	src/*) ;;
	*) exit 0 ;;
esac

# Allow exemptions
# 1. Config files: *.config.js, *.config.mjs, *.config.cjs
case "${FILE_PATH}" in
	*.config.js|*.config.mjs|*.config.cjs) exit 0 ;;
esac

# 2. Allowed sub-directories: scripts/, node_modules/, out/, build/, test/
case "${FILE_PATH}" in
	*/scripts/*|*/node_modules/*|*/out/*|*/build/*|*/test/*)
		exit 0 ;;
esac

BASENAME=$(basename "${FILE_PATH}")
echo "BLOCKED: Creating '${BASENAME}' as a .js/.jsx file inside src/ is not allowed." >&2
echo "Son of Anton is TypeScript-only. Create a .ts or .tsx file instead." >&2
echo "Allowed exceptions: *.config.js, files under scripts/, build/, out/, test/, node_modules/." >&2
exit 2
