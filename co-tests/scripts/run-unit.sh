#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export TECTONIC_PATH="__missing__"

echo "[co:test:unit] compiling co-storage-core"
npx tsc -p packages/co-storage-core/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-template-core"
npx tsc -p packages/co-template-core/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-preview-core"
npx tsc -p packages/co-preview-core/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-diagramador"
npx tsc -p extensions/co-diagramador/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-data-set"
npx tsc -p extensions/co-data-set/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-correcao"
npx tsc -p extensions/co-correcao/tsconfig.json --pretty false

echo "[co:test:unit] compiling co-shell"
npx tsc -p extensions/co-shell/tsconfig.json --pretty false

echo "[co:test:unit] running co-storage-core mocha"
npx mocha "packages/co-storage-core/out/test/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-template-core mocha"
npx mocha "packages/co-template-core/out/test/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-preview-core mocha"
npx mocha "packages/co-preview-core/out/test/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-diagramador mocha"
npx mocha "extensions/co-diagramador/out/test/unit/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-data-set mocha"
npx mocha "extensions/co-data-set/out/test/unit/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-correcao mocha"
npx mocha "extensions/co-correcao/out/test/unit/**/*.test.js" --ui tdd --timeout 60000

echo "[co:test:unit] running co-shell unit mocha"
npx mocha "extensions/co-shell/out/test/unit/**/*.test.js" --ui tdd --timeout 60000
