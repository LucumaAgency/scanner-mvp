# Valuador inmobiliario

Landing simple con un formulario que lee la base de propiedades scrapeadas (MongoDB Atlas) y devuelve un veredicto: bajo mercado / dentro del rango / sobre mercado.

- **Backend**: Node 20 + Express + driver oficial de MongoDB
- **Frontend**: React 18 + Vite + Tailwind
- **Deploy**: GitHub Actions → Plesk (Node.js + Phusion Passenger)

```
valuador-app/
├── backend/         Express server, lógica de valuación, sirve también /dist
├── frontend/        Vite + React + Tailwind (form + tarjeta de resultado)
├── .github/
│   └── workflows/
│       └── deploy.yml   Build + rsync + restart
└── README.md
```

---

## Desarrollo local

```bash
# 1. Clonar y entrar
cd valuador-app

# 2. .env (copiar el ejemplo y poner tu URI de Atlas)
cp .env.example .env
# editar .env

# 3. Dependencias
npm run install:all

# 4. Dev mode (dos terminales)
# terminal A — API:
npm run dev:backend
# terminal B — Frontend con HMR (proxy a :3000):
npm run dev:frontend
```

Frontend en http://localhost:5173, API en http://localhost:3000.

Para probar el bundle de producción local:

```bash
npm run build
npm start
# → todo en http://localhost:3000
```

---

## Endpoints

| Método | Path             | Descripción                              |
|--------|------------------|------------------------------------------|
| GET    | /api/health      | Sanity check                              |
| GET    | /api/distritos   | Lista de distritos con avisos activos     |
| POST   | /api/valuar      | Body: `{district, propertyType, area, bedrooms, priceUsd}` |

Respuesta de `/api/valuar`:

```json
{
  "ok": true,
  "verdict": "DENTRO_RANGO",
  "diff_pct": 4.2,
  "input": { "area": 80, "bedrooms": 2, "price_usd": 220000, "price_usd_per_m2": 2750 },
  "market": { "p25": 2400, "p50": 2640, "p75": 2900 },
  "n_comps": 47,
  "n_similar": 47,
  "n_district": 312,
  "strategy": "similares"
}
```

`strategy = "distrito_completo"` significa que hubo menos de 5 comparables similares (área ±25%, dorms ±1) y se usó la muestra completa del distrito como fallback.

---

## Setup en Plesk

### 1. Crear el sitio

En Plesk → Websites & Domains → Add Domain (o subdomain). Por ejemplo `valuador.tudominio.com`.

### 2. Habilitar Node.js

Plesk → tu dominio → **Node.js**. Si no aparece, instalar la extensión "Node.js" desde Extensions.

Configurar:

- **Node.js Version**: 20.x (o la más alta disponible)
- **Application Mode**: production
- **Document Root**: `/httpdocs` (default)
- **Application Root**: `/httpdocs` (mismo)
- **Application Startup File**: `backend/server.js`
- **Custom environment variables**:
  - `MONGO_URI` = tu connection string de Atlas
  - `MONGO_DB` = `scanner_inmobiliario`
  - `PORT` = `3000` (Plesk lo proxea automáticamente)
  - `NODE_ENV` = `production`

Click "Enable Node.js" y luego "NPM install" (Plesk lee `backend/package.json` por la ruta del startup file).

> Si Plesk no auto-instala el backend, hay que hacerlo manual la primera vez por SSH:
> ```bash
> cd /var/www/vhosts/tudominio.com/httpdocs/backend
> npm ci --omit=dev
> ```

### 3. Whitelist de IP en Atlas

En MongoDB Atlas → Network Access → agregar la IP del servidor Plesk. Si la IP es dinámica o no querés depender de eso, agregar `0.0.0.0/0` (acceso desde cualquier lado) y proteger solo con usuario/password fuerte.

---

## Setup de GitHub Actions

### 1. Crear repo y subir

```bash
cd valuador-app
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin git@github.com:TU_USUARIO/valuador-app.git
git push -u origin main
```

### 2. Generar SSH key dedicada para deploys

En tu máquina:

```bash
ssh-keygen -t ed25519 -C "github-actions-valuador" -f ~/.ssh/valuador_deploy -N ""
```

Esto genera dos archivos:
- `~/.ssh/valuador_deploy` (privado — va al secret de GitHub)
- `~/.ssh/valuador_deploy.pub` (público — va al servidor)

Subir la clave pública al usuario de Plesk:

```bash
ssh-copy-id -i ~/.ssh/valuador_deploy.pub TU_USUARIO_PLESK@TU_IP
```

(O pegarla manualmente en `~/.ssh/authorized_keys` del usuario de Plesk).

Probar:

```bash
ssh -i ~/.ssh/valuador_deploy TU_USUARIO_PLESK@TU_IP "echo OK"
```

### 3. Agregar secrets en GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret. Crear los 4:

| Secret           | Valor                                                              |
|------------------|--------------------------------------------------------------------|
| `PLESK_HOST`     | IP o hostname del servidor (`123.45.67.89` o `tudominio.com`)      |
| `PLESK_USER`     | Usuario SSH de Plesk del dominio                                   |
| `PLESK_PATH`     | Ruta absoluta al sitio. Ej: `/var/www/vhosts/tudominio.com/httpdocs` |
| `PLESK_SSH_KEY`  | **Contenido completo** de `~/.ssh/valuador_deploy` (clave privada) |

### 4. Primer deploy

Push a `main` o disparar manualmente desde Actions → Deploy → Run workflow.

El workflow:

1. Instala deps de frontend, hace `vite build` → genera `frontend/dist/`
2. Instala deps de backend en modo producción (`npm ci --omit=dev`)
3. Rsync de todo al server (excluye `.env`, `node_modules` no usados, sources del frontend)
4. SSH al server y `touch tmp/restart.txt` → Passenger reinicia el Node app

---

## Troubleshooting

**"502 Bad Gateway" después del deploy**
La app de Node no arrancó. Plesk → tu dominio → Node.js → "Logs" muestra el stack. Causas comunes:
- `MONGO_URI` mal puesto en las env vars de Plesk
- IP del server no whitelisteada en Atlas
- Falta hacer "NPM install" la primera vez

**Atlas timeout (`MongoServerSelectionError`)**
Whitelist en Atlas Network Access, o usar `0.0.0.0/0`.

**"Cannot find module ..."**
Plesk no corrió `npm install` o no encontró el `package.json` correcto. Forzar manualmente:
```bash
cd $PLESK_PATH/backend && npm ci --omit=dev
```
Luego "Restart App" en Plesk o `touch tmp/restart.txt`.

**El frontend no carga (404 en /)**
Verificar que `frontend/dist/` existe en el server después del rsync. Si falta, el build de GH Actions falló — revisar logs.

**Permission denied en SSH desde GH Actions**
La clave pública no está en `~/.ssh/authorized_keys` del usuario de Plesk, o el secret `PLESK_SSH_KEY` no incluye la clave privada completa (incluye los `-----BEGIN/END-----`).
