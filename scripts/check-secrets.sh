#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Keep checks focused on CO-owned surfaces to avoid false positives in upstream VS Code content.
TARGETS=(
	"extensions/co-*"
	"packages/co-*"
	"docs"
	"CO.md"
)

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
TOKEN_RE='(API_KEY=|TOKEN=|SECRET=|PASSWORD=|AUTH_TOKEN=|BEARER\s+[A-Za-z0-9._-]+)'
DOMAIN_RE='\b(admin@|gmail\.com|outlook\.com|hotmail\.com|icloud\.com)\b'

echo "Checking tracked files for potential secrets..."

if git grep -nE "$EMAIL_RE|$TOKEN_RE|$DOMAIN_RE" -- "${TARGETS[@]}" \
	':(exclude)extensions/co-shell/config/*.template.json' \
	':(exclude)docs/SECRETS.md' \
	':(exclude)co-secret/**'; then
	echo
	echo "Potential secret-like content found."
	exit 1
fi

echo "No potential secrets found in CO tracked surfaces."
