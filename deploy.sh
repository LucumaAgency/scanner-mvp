#!/usr/bin/env bash
# Ejecutado por Plesk como "Additional deployment actions" después de cada git pull.
set -euo pipefail

# Plesk corre con PATH reducido — forzamos los básicos así dirname/find/etc resuelven.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

# cd al dir del script sin depender de `dirname`
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
cd "$SCRIPT_DIR"
echo "==> CWD=$(pwd)"

# ──────────────────────────────────────────────────────────────
# Localizar node automáticamente
# ──────────────────────────────────────────────────────────────
NODE_BIN_DIR=""
for d in \
  /opt/plesk/node/*/bin \
  /usr/local/nodejs/bin \
  /usr/local/bin \
  /usr/bin \
  /root/.nvm/versions/node/*/bin \
  ~/.nvm/versions/node/*/bin
do
  # ojo: el glob puede expandirse a una ruta sin archivos (ej. /opt/plesk/node/*/bin si no existe)
  if [ -d "$d" ] && [ -x "$d/node" ]; then
    NODE_BIN_DIR="$d"
    break
  fi
done

if [ -z "$NODE_BIN_DIR" ]; then
  echo "==> FATAL: no encontré 'node' en rutas conocidas. Buscando en el filesystem..."
  find / -name node -type f -executable 2>/dev/null | head -20 || true
  echo "==> Copia esa(s) ruta(s) al chat para ajustar el script."
  exit 1
fi

export PATH="$NODE_BIN_DIR:$PATH"
echo "==> Node encontrado en: $NODE_BIN_DIR"
echo "==> node $(node --version)"
echo "==> npm  $(npm --version)"

# ──────────────────────────────────────────────────────────────
# Build & deploy
# ──────────────────────────────────────────────────────────────
echo "==> Installing backend deps (production only)"
( cd backend && npm install --omit=dev --no-audit --no-fund )

echo "==> Installing frontend deps + build"
( cd frontend && npm install --no-audit --no-fund && npm run build )

echo "==> Restarting Node app (Phusion Passenger)"
mkdir -p tmp
touch tmp/restart.txt

echo "==> Deploy OK"
