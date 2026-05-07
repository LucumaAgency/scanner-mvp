#!/usr/bin/env bash
# Ejecutado por Plesk como "Additional deployment actions" después de cada git pull.
set -euo pipefail

# Plesk corre las acciones de deploy con PATH reducido — forzamos uno completo.
# Si tu Plesk tiene Node 18 o 22, cambiá el "20" por la versión correspondiente.
export PATH="/opt/plesk/node/20/bin:/opt/plesk/node/18/bin:/opt/plesk/node/22/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# cd al dir del script sin depender de `dirname` (que tampoco está en el PATH inicial)
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
cd "$SCRIPT_DIR"

echo "==> CWD=$(pwd)"
echo "==> node $(node --version)"
echo "==> npm $(npm --version)"

echo "==> Installing backend deps (production only)"
( cd backend && npm install --omit=dev --no-audit --no-fund )

echo "==> Installing frontend deps + build"
( cd frontend && npm install --no-audit --no-fund && npm run build )

echo "==> Restarting Node app (Phusion Passenger)"
mkdir -p tmp
touch tmp/restart.txt

echo "==> Deploy OK"
