#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export TECTONIC_PATH="__missing__"

echo "[co:test:unit] compiling co-template-core"
npx tsc -p packages/co-template-core/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-diagramador"
npx tsc -p extensions/co-diagramador/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-shell"
npx tsc -p extensions/co-shell/tsconfig.json --pretty false

echo "[co:test:unit] running co-template-core mocha"
npx mocha "packages/co-template-core/out/test/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-diagramador mocha"
npx mocha "extensions/co-diagramador/out/**/test/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-shell unit mocha"
npx mocha "extensions/co-shell/out/test/unit/**/*.test.js" --ui tdd --timeout 60000
