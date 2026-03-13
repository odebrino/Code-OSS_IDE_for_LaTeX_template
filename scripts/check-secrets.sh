#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Keep checks focused on CO-owned surfaces to avoid false positives in upstream VS Code content.
TARGETS=(
	".github/workflows"
	"co-tests"
	"extensions/co-*"
	"packages/co-*"
	"scripts"
	"docs"
	"CO.md"
	"package.json"
)

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
TOKEN_RE='((API_KEY|AUTH_TOKEN|CLIENT_SECRET|PASSWORD|SECRET|TOKEN)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9._/-]{8,}|BEARER[[:space:]]+[A-Za-z0-9._-]{10,})'
PRIVATE_KEY_RE='-----BEGIN [A-Z ]*PRIVATE KEY-----'
URL_CREDENTIALS_RE='https?://[^:/[:space:]]+:[^@/[:space:]]+@'
JWT_RE='eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}'
ALLOWLIST_RE='@example\.(com|org|net)\b|<admin_identifier>'

echo "Checking tracked files for potential secrets..."

matches="$(
	git grep -nIE "$EMAIL_RE|$TOKEN_RE|$PRIVATE_KEY_RE|$URL_CREDENTIALS_RE|$JWT_RE" -- "${TARGETS[@]}" \
		':(exclude)co-secret/**' || true
)"

filtered_matches="$(
	printf '%s\n' "$matches" | grep -vE "$ALLOWLIST_RE" || true
)"

if [[ -n "${filtered_matches//[$'\t\r\n ']}" ]]; then
	printf '%s\n' "$filtered_matches"
	echo
	echo "Potential secret-like content found."
	exit 1
fi

echo "No potential secrets found in CO tracked surfaces."
