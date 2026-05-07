#!/usr/bin/env bash
# Plesk lo ejecuta como "Additional deployment actions" después de cada git pull.
# El build del frontend ya viene hecho desde GitHub Actions (frontend/dist está commiteado).
# Acá solo instalamos las deps del backend en producción y reiniciamos Passenger.
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

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
  if [ -d "$d" ] && [ -x "$d/node" ]; then
    NODE_BIN_DIR="$d"
    break
  fi
done

if [ -z "$NODE_BIN_DIR" ]; then
  echo "==> FATAL: no encontré 'node' en rutas conocidas. Buscando..."
  find / -name node -type f -executable 2>/dev/null | head -20 || true
  exit 1
fi

export PATH="$NODE_BIN_DIR:$PATH"
echo "==> Node: $(node --version)  npm: $(npm --version)"

# ──────────────────────────────────────────────────────────────
# Backend: install prod deps
# ──────────────────────────────────────────────────────────────
echo "==> Installing backend deps (production only)"
( cd backend && npm install --omit=dev --no-audit --no-fund )

# ──────────────────────────────────────────────────────────────
# Verificar que el frontend ya viene buildeado
# ──────────────────────────────────────────────────────────────
if [ ! -f frontend/dist/index.html ]; then
  echo "==> WARNING: frontend/dist/index.html no existe."
  echo "==> El build de GitHub Actions probablemente no terminó todavía o falló."
  echo "==> Revisá la pestaña Actions del repo."
fi

# ──────────────────────────────────────────────────────────────
# Reiniciar Passenger
# ──────────────────────────────────────────────────────────────
echo "==> Restarting Node app (Phusion Passenger)"
mkdir -p tmp
touch tmp/restart.txt

echo "==> Deploy OK"
