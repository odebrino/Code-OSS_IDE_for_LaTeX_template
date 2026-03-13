#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export CO_TESTING="1"
export TECTONIC_PATH="__missing__"
export MOCHA_FGREP="[smoke]"
unset ELECTRON_RUN_AS_NODE

echo "[co:test:smoke] compiling co-doc-core"
npx tsc -p packages/co-doc-core/tsconfig.json --pretty false

echo "[co:test:smoke] compiling co-storage-core"
npx tsc -p packages/co-storage-core/tsconfig.json --pretty false

echo "[co:test:smoke] compiling co-template-core"
npx tsc -p packages/co-template-core/tsconfig.json --pretty false

echo "[co:test:smoke] compiling co-preview-core"
npx tsc -p packages/co-preview-core/tsconfig.json --pretty false

echo "[co:test:smoke] compiling co-diagramador"
npx tsc -p extensions/co-diagramador/tsconfig.json --pretty false

echo "[co:test:smoke] compiling co-correcao"
npx tsc -p extensions/co-correcao/tsconfig.json --pretty false

echo "[co:test:smoke] running co-diagramador smoke"
node co-tests/vscode-runner/runExtensionsTests.mjs co-diagramador

echo "[co:test:smoke] running co-correcao smoke"
node co-tests/vscode-runner/runExtensionsTests.mjs co-correcao
