#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export CO_TESTING="1"
export TECTONIC_PATH="__missing__"
unset ELECTRON_RUN_AS_NODE

echo "[co:test:ext] compiling co-shell"
npx tsc -p extensions/co-shell/tsconfig.json --pretty false

echo "[co:test:ext] compiling co-template-generator"
npx tsc -p extensions/co-template-generator/tsconfig.json --pretty false

echo "[co:test:ext] running co-shell integration hooks"
npx mocha "extensions/co-shell/out/test/integration/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:ext] running co-template-generator integration hooks"
npx mocha "extensions/co-template-generator/out/test/integration/**/*.test.js" --ui tdd --timeout 60000
