#!/usr/bin/env bash
set -euo pipefail

# Description: Scan file content being written for secrets and block if found
# Event: PreToolUse
# Matcher: Edit|Write

INPUT=$(cat)

# Extract the file content from the tool input (handles both Edit and Write tool shapes)
# Write tool uses "content", Edit tool uses "new_string"
CONTENT=$(echo "${INPUT}" | jq -r '
	.tool_input.content // .tool_input.new_string // ""
')

if [ -z "${CONTENT}" ]; then
	exit 0
fi

FOUND=""

# AWS access key IDs (AKIA...)
if echo "${CONTENT}" | grep -qE 'AKIA[0-9A-Z]{16}'; then
	FOUND="${FOUND}\n  - AWS Access Key ID (AKIA...)"
fi

# AWS secret access keys (40-char base64 after common assignment patterns)
if echo "${CONTENT}" | grep -qiE '(aws_secret_access_key|AWS_SECRET)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9/+]{40}'; then
	FOUND="${FOUND}\n  - AWS Secret Access Key assignment"
fi

# GitHub personal access tokens (classic: ghp_, fine-grained: github_pat_)
if echo "${CONTENT}" | grep -qE '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})'; then
	FOUND="${FOUND}\n  - GitHub Personal Access Token"
fi

# Generic Bearer tokens in Authorization headers
if echo "${CONTENT}" | grep -qiE 'Authorization[[:space:]]*:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._\-]{20,}'; then
	FOUND="${FOUND}\n  - Bearer token in Authorization header"
fi

# PEM private keys
if echo "${CONTENT}" | grep -qF '-----BEGIN'; then
	if echo "${CONTENT}" | grep -qE '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY'; then
		FOUND="${FOUND}\n  - PEM private key block"
	fi
fi

# Connection strings with embedded passwords: protocol://user:password@host
if echo "${CONTENT}" | grep -qE '[a-zA-Z][a-zA-Z0-9+\-.]*://[^:@/]+:[^@/]{4,}@[a-zA-Z0-9._\-]+'; then
	FOUND="${FOUND}\n  - Connection string with embedded password"
fi

# High-entropy API key assignments (e.g. API_KEY = "abc123xyz...")
if echo "${CONTENT}" | grep -qiE '(api_key|apikey|api_token|access_token|secret_key|private_key|client_secret)[[:space:]]*[=:][[:space:]]*["\x27][A-Za-z0-9/+_\-]{32,}["\x27]'; then
	FOUND="${FOUND}\n  - High-entropy API key assignment"
fi

# Anthropic API keys
if echo "${CONTENT}" | grep -qE 'sk-ant-[A-Za-z0-9\-_]{20,}'; then
	FOUND="${FOUND}\n  - Anthropic API key (sk-ant-...)"
fi

# OpenAI API keys
if echo "${CONTENT}" | grep -qE 'sk-[A-Za-z0-9]{48}'; then
	FOUND="${FOUND}\n  - OpenAI API key (sk-...)"
fi

if [ -n "${FOUND}" ]; then
	echo -e "BLOCKED: Potential secrets detected in file content. Do not store secrets in source code.\nFound:${FOUND}\nUse environment variables or .env files (never committed) instead." >&2
	exit 2
fi

exit 0
