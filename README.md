# Valuador inmobiliario

Landing simple con un formulario que lee la base de propiedades scrapeadas (MongoDB Atlas) y devuelve un veredicto: bajo mercado / dentro del rango / sobre mercado.

- **Backend**: Node 20 + Express + driver oficial de MongoDB
- **Frontend**: React 18 + Vite + Tailwind
- **Deploy**: Plesk Git pull (webhook) + `deploy.sh` corre el build y reinicia Passenger

```
valuador-app/
├── backend/         Express server, lógica de valuación, sirve también /dist
├── frontend/        Vite + React + Tailwind (form + tarjeta de resultado)
├── deploy.sh        Lo ejecuta Plesk después de cada pull
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

## Setup de Git en Plesk (deploy automático)

Plesk pulla el repo directo de GitHub y ejecuta `deploy.sh` después de cada pull. No se necesitan workflows ni secrets de GitHub.

### 1. Plesk → tu dominio → Git → Add Repository

- **Remote Git hosting**: GitHub
- **Repository URL**: `git@github.com:LucumaAgency/scanner-mvp.git`
- **Server path**: el mismo *Application Root* del Node app (ej: `/httpdocs`)
- **Branch**: `main`

Plesk genera una **deploy key**. Copiarla y agregarla en:
GitHub → Settings del repo → **Deploy keys** → Add deploy key → pegar → "Allow write access" *desactivado* (solo lectura, suficiente).

### 2. Configurar el deploy automático

En la misma pantalla de Plesk Git:

- **Automatic deployment**: ON
- **Deployment mode**: "Pull mode" (Plesk hace el `git pull`)
- **Webhook URL**: Plesk muestra una URL — copiarla y pegarla en GitHub → Settings del repo → **Webhooks** → Add webhook (Content type: `application/json`, eventos: solo `push`)
- **Additional deployment actions** (textarea): pegar:

```bash
bash deploy.sh
```

Eso es todo. Cada `git push` a `main` dispara: webhook → Plesk pulla → corre `deploy.sh` → instala deps → builda frontend → reinicia Passenger.

### 3. Primer deploy

En Plesk → Git → tu repo → click "Pull updates" (o pushear cualquier cambio a `main`). Verificar en "Deployment log" que `deploy.sh` corrió sin errores.

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
Verificar que `frontend/dist/` existe en el server después del pull. Si falta, `deploy.sh` falló — revisar el "Deployment log" en Plesk → Git.

**Webhook de GitHub no dispara el pull**
- En GitHub → Settings → Webhooks → ver el "Recent Deliveries"; tiene que mostrar 200 OK.
- Si la URL del webhook fue regenerada en Plesk, hay que actualizarla también en GitHub.
- Plesk → Git → "Pull updates" funciona como fallback manual.

**`deploy.sh: Permission denied`**
Asegurate que el archivo está commiteado con bit ejecutable: `git update-index --chmod=+x deploy.sh && git commit -m "fix: deploy.sh executable" && git push`. Como alternativa, en "Additional deployment actions" usar `bash deploy.sh` (ya está así por default).
