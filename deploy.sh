#!/usr/bin/env bash
# Ejecutado por Plesk como "Additional deployment actions" después de cada git pull.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing backend deps (production only)"
( cd backend && npm install --omit=dev --no-audit --no-fund )

echo "==> Installing frontend deps + build"
( cd frontend && npm install --no-audit --no-fund && npm run build )

echo "==> Restarting Node app (Phusion Passenger)"
mkdir -p tmp
touch tmp/restart.txt

echo "==> Deploy OK"
