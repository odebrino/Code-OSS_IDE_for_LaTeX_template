#!/usr/bin/env bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

bash scripts/check-secrets.sh
npm run co:test:unit
