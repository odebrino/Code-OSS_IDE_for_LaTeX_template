#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

bash co-tests/scripts/run-unit.sh
bash co-tests/scripts/run-ext.sh
