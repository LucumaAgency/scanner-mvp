# Valuador inmobiliario

Landing simple con un formulario que lee la base de propiedades scrapeadas (MongoDB Atlas) y devuelve un veredicto: **bajo mercado / dentro del rango / sobre mercado**, basado en el precio por m² comparado contra los percentiles de propiedades similares en el mismo distrito.

- **Frontend**: React 18 + Vite + Tailwind
- **Backend**: Node 20+ (probado en 21.7.3) + Express + driver oficial de MongoDB
- **Base de datos**: MongoDB Atlas (poblada por el scraper de [`scraper urbania`](https://github.com/...))
- **Deploy**: GitHub Actions (build) → Webhook → Plesk Git pull → `deploy.sh` → Phusion Passenger

---

## Tabla de contenido

1. [Arquitectura del deploy](#arquitectura-del-deploy)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Desarrollo local](#desarrollo-local)
4. [Endpoints](#endpoints)
5. [Configuración real en Plesk](#configuración-real-en-plesk-evaluador-inmobiliariopruebalucumasite)
6. [GitHub Actions: build automático](#github-actions-build-automático)
7. [Plesk Git: pull automático](#plesk-git-pull-automático)
8. [Variables de entorno](#variables-de-entorno)
9. [Cosas que aprendimos a la mala](#cosas-que-aprendimos-a-la-mala)
10. [Troubleshooting](#troubleshooting)

---

## Arquitectura del deploy

```
   Dev local                GitHub                  GitHub Actions             Plesk Server
   ─────────                ──────                  ──────────────             ────────────
   git push                  ┌─────────┐             ┌─────────────┐
   ─────────────────────────▶│  main   │────push────▶│ Build       │
                             │ branch  │             │ frontend    │
                             │         │             │ + commit    │
                             │         │◀──push──────│ dist back   │
                             │         │             └─────────────┘
                             │         │                    │
                             │         │                    ▼
                             │         │             webhook /push
                             │         │                    │
                             └─────────┘                    ▼
                                                    ┌──────────────┐
                                                    │ Plesk Git    │
                                                    │ pull main    │
                                                    └──────────────┘
                                                            │
                                                            ▼
                                                    ┌──────────────┐
                                                    │  deploy.sh   │
                                                    │  npm install │
                                                    │  (backend)   │
                                                    │  restart.txt │
                                                    └──────────────┘
                                                            │
                                                            ▼
                                                    ┌──────────────┐
                                                    │ Phusion      │
                                                    │ Passenger    │
                                                    │ ─ Express    │
                                                    │ ─ /api/*     │
                                                    │ + nginx      │
                                                    │ ─ /dist/*    │
                                                    └──────────────┘
```

**Por qué dos pulls de hecho** (uno de GH Actions, uno de Plesk):

- `git push` a `main` con código fuente
- GitHub Actions builda el frontend y commitea `frontend/dist/` a `main`
- Eso dispara el webhook a Plesk
- Plesk pulla la versión "completa" (con dist incluido)
- `deploy.sh` solo instala deps del backend y reinicia — el build pesado ya pasó

Resultado: el server **no necesita Vite ni dev-deps** del frontend. Build reproducible en CI, deploy rápido.

---

## Estructura del proyecto

```
valuador-app/
├── backend/
│   ├── server.js           Express, /api/health, /api/distritos, /api/valuar
│   ├── valuator.js         Lógica de comparables + percentiles
│   ├── db.js               Cliente Mongo (singleton)
│   └── package.json        express, mongodb, dotenv
├── frontend/
│   ├── src/
│   │   ├── App.jsx         Form + tarjeta de resultado
│   │   ├── main.jsx
│   │   └── index.css       (Tailwind)
│   ├── dist/               (Generado por GitHub Actions, committeado al repo)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── .github/
│   └── workflows/
│       └── build.yml       Build frontend on push, commit dist back
├── deploy.sh               Lo ejecuta Plesk después de cada git pull
├── .gitignore              ignora dist/ excepto frontend/dist
├── .env.example
└── README.md
```

---

## Desarrollo local

```bash
# 1. Clonar
git clone git@github.com:LucumaAgency/scanner-mvp.git
cd scanner-mvp

# 2. Variables de entorno
cp .env.example .env
# editar .env y poner tu MONGO_URI

# 3. Instalar deps
npm run install:all

# 4. Dev mode (dos terminales)
# A — backend con auto-reload:
npm run dev:backend
# B — frontend con HMR (proxy a :3000):
npm run dev:frontend
```

Frontend en http://localhost:5173, API en http://localhost:3000.

Para probar exactamente como producción:

```bash
npm run build   # = npm install:all + vite build
npm start       # backend sirve API + frontend/dist en :3000
```

---

## Endpoints

| Método | Path             | Descripción                               |
|--------|------------------|-------------------------------------------|
| GET    | `/api/health`    | Sanity check (`{"ok": true}`)             |
| GET    | `/api/distritos` | Lista distritos con stats agregadas (venta + alquiler) |
| POST   | `/api/valuar`    | Body: `{district, propertyType, operation, area, bedrooms, priceUsd}` |
| POST   | `/api/calcular`  | Calculadora de inversión (ratios + proyección + veredicto) — ver [docs/calculadora-inversion.md](docs/calculadora-inversion.md) |

Respuesta de `POST /api/valuar`:

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
  "strategy": "similares",
  "operation": "venta"
}
```

`strategy` puede ser:
- `"similares"`: ≥5 comparables con área ±25% y dorms ±1
- `"distrito_completo"`: fallback porque no había suficientes similares

`verdict` puede ser: `BAJO_MERCADO`, `DENTRO_RANGO`, `SOBRE_MERCADO`.

`operation` puede ser `"venta"` o `"alquiler"`. Default `"venta"` si no se envía.

### `POST /api/calcular` (calculadora de inversión)

Replica la lógica del Excel "Calculadora v6.0" (rentas, plusvalía, inflación, ganancia real).
Documentación detallada — fórmulas, schemas, decisiones — en **[docs/calculadora-inversion.md](docs/calculadora-inversion.md)**.

---

## Configuración real en Plesk (`evaluador-inmobiliario.pruebalucuma.site`)

### Pantalla Node.js

| Campo | Valor |
|---|---|
| **Versión de Node.js** | `21.7.3` (cualquier 20+ funciona) |
| **Administrador de paquetes** | `npm` |
| **Modo de aplicación** | `production` |
| **URL de la aplicación** | `http://evaluador-inmobiliario.pruebalucuma.site` |
| **Raíz de la aplicación** | `/evaluador-inmobiliario.pruebalucuma.site` |
| **Raíz del documento** | `/evaluador-inmobiliario.pruebalucuma.site/frontend/dist` ⚠️ |
| **Archivo de inicio de la aplicación** | `backend/server.js` |

> ⚠️ **Cuidado con la diferencia entre los dos campos**:
> - **Raíz de la aplicación** = de dónde Passenger ejecuta Node (`backend/server.js` se resuelve relativo a esto).
> - **Raíz del documento** = de dónde nginx sirve archivos estáticos. Apuntar a `frontend/dist` hace que `/` cargue nuestra app React, y `/api/*` caiga al Node app porque no encuentra archivo.

Si `Raíz del documento` queda en la raíz del proyecto, nginx encuentra el `index.html` default de Plesk (4.35 KB) y lo sirve antes de pasar la request a Node. Por eso aparece "la pantalla de Plesk" aunque la app esté corriendo bien.

### Variables de entorno personalizadas (Plesk → Node.js → "Variables de entorno...")

| Nombre | Valor |
|---|---|
| `MONGO_URI` | `mongodb+srv://USER:PASS@cluster.mongodb.net/?appName=...` |
| `MONGO_DB` | `scanner_inmobiliario` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

> Pegar la `MONGO_URI` en una sola línea, sin espacios al principio o al final.
>
> **Whitelist en Atlas**: agregar la IP del server (`66.94.108.141` en este caso) a Network Access. Para descartar problemas durante el primer deploy, está OK usar `0.0.0.0/0` y proteger solo con usuario/password.

---

## GitHub Actions: build automático

`.github/workflows/build.yml` se dispara en cada push a `main` y:

1. Hace `npm install` + `vite build` en `frontend/`
2. Si `frontend/dist/` cambió, lo commitea de vuelta como `github-actions[bot]` con mensaje `chore: rebuild frontend/dist`
3. Ese commit dispara el webhook a Plesk → pull automático

### Setup necesario

1. **Permisos de write para el workflow**:
   - https://github.com/LucumaAgency/scanner-mvp/settings/actions
   - Sección "Workflow permissions"
   - Seleccionar **"Read and write permissions"**
   - Save

2. **No hace falta agregar secrets** — el workflow usa `GITHUB_TOKEN` que tiene perms automáticamente, y por diseño los pushes hechos con `GITHUB_TOKEN` **no re-disparan workflows** (así se evita el loop infinito).

### Disparar manualmente

Actions → "Build frontend" → "Run workflow" → Run.

---

## Plesk Git: pull automático

### Conexión inicial

Plesk → tu dominio → **Git** → Add Repository:

| Campo | Valor |
|---|---|
| Remote Git hosting | GitHub |
| Repository URL | `git@github.com:LucumaAgency/scanner-mvp.git` |
| Server path | `/evaluador-inmobiliario.pruebalucuma.site` (mismo que "Raíz de la aplicación") |
| Branch | `main` |

### SSH key

Plesk genera una **deploy key** al crear la conexión. Tres caminos para autorizarla:

1. **Deploy key del repo** (la opción "limpia" pero tiene un catch): GitHub → Settings del repo → **Deploy keys** → Add deploy key → pegar la pública. Read-only suficiente.

2. **SSH key de cuenta** (lo que terminamos haciendo): si Plesk usa la misma key del server para todos sus repos y ya está registrada en otro proyecto, GitHub tira "key already in use". En ese caso ir a https://github.com/settings/keys → New SSH key → Authentication key → pegar. Funciona porque la cuenta tiene acceso al repo.

3. **HTTPS + Personal Access Token** (alternativa si la SSH se resiste): Repository URL `https://github.com/LucumaAgency/scanner-mvp.git`, username = tu user de GitHub, password = un PAT clásico con scope `repo` generado en https://github.com/settings/tokens.

### Webhook para auto-pull

1. En la pantalla de Plesk Git, copiar la **Webhook URL** que muestra Plesk.
2. GitHub → Settings del repo → **Webhooks** → Add webhook:
   - Payload URL: la que copiaste de Plesk
   - Content type: `application/json`
   - Eventos: solo `push`
3. En Plesk: activar **"Deployment automático"** / "Automatic deployment"

### Additional deployment actions

Plesk → Git → **"Additional deployment actions"** (o "Acciones adicionales de despliegue"):

```
deploy.sh
```

> ⚠️ **Sin `bash` adelante**. Si ponés `bash deploy.sh`, Plesk falla con `dirname: command not found` por una rareza de su sandbox. Sin `bash`, Plesk ejecuta el archivo directo y respeta el shebang `#!/usr/bin/env bash` que ya tiene.

---

## Variables de entorno

Las definimos en dos lugares según el contexto:

| Lugar | Cuándo |
|---|---|
| `.env` en el repo (gitignored) | Desarrollo local |
| Variables de entorno de Plesk Node.js | Producción |

Variables esperadas (`backend/server.js` y `backend/db.js`):

- `MONGO_URI`: connection string de Atlas (requerido)
- `MONGO_DB`: nombre de la DB (default: `scanner_inmobiliario`)
- `PORT`: puerto del Express (default: `3000`)
- `NODE_ENV`: `production` o vacío

---

## Cosas que aprendimos a la mala

Notas para no volver a tropezarse:

1. **`bash deploy.sh` falla en Plesk; `deploy.sh` solo, funciona.** El sandbox de las "deployment actions" tiene un PATH muy reducido y al invocar `bash` pierde acceso a `dirname`, `npm`, etc. Sin `bash`, Plesk ejecuta el archivo directo via shebang y herda un PATH menos castrado.

2. **El PATH de Plesk en deploy actions es mínimo.** Por eso `deploy.sh` lo setea explícitamente al principio (`/usr/bin`, `/bin`, etc.) y hace auto-discovery de `node` en `/opt/plesk/node/*/bin`. No asumas que `node`, `npm`, ni siquiera `dirname` están en el PATH.

3. **"Raíz de la aplicación" ≠ "Raíz del documento"** en Plesk Node.js. La primera es para Passenger (resuelve el startup file). La segunda es para nginx (sirve estáticos). En este proyecto son distintas: `app root = /<dominio>/` y `doc root = /<dominio>/frontend/dist`.

4. **Si Document Root apunta a la raíz del proyecto, ves la página default de Plesk.** Porque nginx encuentra el `index.html` placeholder antes de pasar a Node. Hay que apuntar Document Root a `frontend/dist`.

5. **"Key already in use" cuando agregás la deploy key**: pasa porque Plesk reusa la misma SSH key del server para varios repos. Workaround: agregarla como SSH key de tu **cuenta** GitHub (no como deploy key del repo).

6. **La extensión Node.js de Plesk tiene su propio Node**, no el del sistema. Suele estar en `/opt/plesk/node/<version>/bin/`.

7. **Build en GitHub Actions, deploy en Plesk**: separa preocupaciones. Si el build falla, lo ves en Actions (logs claros) sin afectar lo que está corriendo. Si el deploy falla, Plesk te lo dice. Y el server no necesita instalar `vite` ni dev-deps.

8. **`GITHUB_TOKEN` no re-dispara workflows**: por eso podemos commitear `dist/` desde Actions sin entrar en loop infinito. Si en el futuro se cambia a un PAT custom, hay que agregar `[skip ci]` o filtrar por autor del commit.

---

## Troubleshooting

### Veo la página default de Plesk al entrar al dominio
- Document Root apunta a la raíz del proyecto en vez de `frontend/dist`. Cambialo en Plesk → Node.js.
- O `frontend/dist/` no existe todavía: revisá Actions del repo, asegurate que el build haya commiteado el dist.

### "El archivo no existe" para `backend/server.js`
- "Raíz de la aplicación" está mal. Tiene que ser la carpeta donde vive `backend/`, no la del frontend.

### 502 Bad Gateway
- El Node app no arrancó. Plesk → Node.js → "Logs" muestra el stack. Causas comunes:
  - `MONGO_URI` mal pegado (espacios, salto de línea, comillas)
  - IP del server no whitelisteada en Atlas Network Access
  - Falta `npm install` en backend — verificar que `deploy.sh` corrió OK

### `MongoServerSelectionError` en logs del Node app
- Atlas no acepta la conexión desde la IP del server. Atlas → Network Access → Add IP → la IP de Plesk (`66.94.108.141` para este server) o `0.0.0.0/0` para descartar.

### Webhook de GitHub no dispara el pull en Plesk
- GitHub → Settings → Webhooks → "Recent Deliveries". Cada delivery muestra el response. Si es 200, Plesk recibió. Si es timeout o 4xx, hay problema.
- Si la URL del webhook fue regenerada en Plesk, hay que actualizarla también en GitHub.
- Plesk → Git → "Pull Updates" funciona como fallback manual.

### `deploy.sh: line X: <comando>: command not found`
- El PATH de Plesk no incluye lo que necesitás. Si es algo nuevo, agregalo a la línea `export PATH=...` al principio de `deploy.sh`.

### El frontend no se reconstruye en GitHub Actions
- Verificar que el workflow tiene `permissions: contents: write` (ya está en el YAML).
- Verificar https://github.com/LucumaAgency/scanner-mvp/settings/actions → "Workflow permissions" = "Read and write".
- Verificar el job en Actions: si pasa pero no commitea, es porque `frontend/dist/` no cambió respecto al último commit.

### `frontend/dist` está en `.gitignore` y no entra al repo
- El `.gitignore` debe tener:
  ```
  dist/
  !frontend/dist/
  !frontend/dist/**
  ```
  Las líneas `!` re-incluyen frontend/dist. Si las borraste por error, el workflow no podrá commitear nada.
