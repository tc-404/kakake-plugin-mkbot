#!/usr/bin/env bash

set -euo pipefail



ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT"



npm config set fetch-timeout 600000 2>/dev/null || true



echo "[MKbot] 1/2 npm install ..."

npm install



echo "[MKbot] 2/2 npm run build ..."

npm run build



echo "[MKbot] build done -> kakake-plugin-mkbot/"

read -r -p "Press Enter to exit..." _

