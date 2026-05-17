# Análisis y observaciones — scanner-mvp (Valuador Inmobiliario)

> Fecha: 2026-05-17 · Revisión de código del MVP

## Qué es

App web que valoriza propiedades comparando el precio/m² contra percentiles de
propiedades similares scrapeadas (Urbania → MongoDB Atlas), más una
**calculadora de inversión** que replica un Excel "Calculadora v6.0".

- **Frontend**: React 18 + Vite + Tailwind + react-router (versiones de UX: Cards, Wizard, Story)
- **Backend**: Node 20 + Express + driver oficial Mongo, sin ORM
- **Deploy**: push a `main` → GitHub Actions buildea y commitea `frontend/dist` →
  webhook → Plesk pull → `deploy.sh` → Phusion Passenger
- ~530 líneas de backend, ~2.500 de frontend. Sin tests.

## Lo que está bien hecho

- **Sin inyección NoSQL**: todo input se castea (`String()`, `Number()`) y se valida
  contra whitelist (`VALID_PROPERTY_TYPES`, `VALID_OPERATIONS`) o contra el catálogo
  `districts` antes de query.
- **Degradación elegante**: si Mongo no conecta, el server no muere — `/api/health`
  reporta el error real y `/api/distritos` devuelve el mensaje en JSON.
- **Lógica de comparables sólida**: filtra por `location_quality`, excluye
  `manual_flag` (fraude/spam), rangos USD/m² distintos para venta vs alquiler, y
  hace fallback `similares → distrito_completo` con umbral mínimo de 5 comps.
- **CI/deploy bien pensado**: el server productivo no necesita Vite ni dev-deps;
  build reproducible en Actions.
- `.gitignore` correcto (node_modules NO trackeado).

## Problemas detectados

### Seguridad / robustez (medio)

1. **Sin rate limiting** en `/api/valuar` y `/api/calcular` (públicos, hacen query a
   Mongo / cálculo). Un bot puede saturar el cluster Atlas. → `express-rate-limit`.
2. **`/api/health` filtra metadatos**: nombre de DB, si el URI está set, puerto.
   Riesgo bajo, pero conviene reducirlo en producción.
3. **`app.get("*")`** sirve `index.html` también para rutas `/api/*` inexistentes —
   debería devolver 404 JSON para paths bajo `/api`.

### Lógica financiera de `calculator.js` (revisar con el cliente)

4. **`plusvaliaInmediataUsd` se calcula pero no se usa**: `valorEntrega = priceUsd +
   plusvaliaInmediataUsd` se reporta, pero `valorFinal = priceUsd * (1+g)^n` ignora
   esa plusvalía inmediata.
5. **Plusvalía sobre horizonte completo `n`**: aplica `(1+g)^n` desde la compra, sin
   descontar los `añosSinRenta` (pre-entrega) — modelado discutible vs el Excel.
6. **Mezcla nominal vs real**: `rentaAcumUsd` acumula rentas nominales creciendo con
   inflación, comparadas contra `inversionAjustadaUsd` ajustada por inflación.
   Aproximación razonable pero hay que documentarla para no confundir "GANANCIA_REAL".

### Mantenibilidad (bajo)

7. **`PROPERTY_TYPES` duplicado** en `App.jsx` y `calculatorApi.js` (con divergencias).
8. **Sin tests** en lógica crítica (`percentile()`, `calcularInversion()`).
9. **Varias versiones de UX coexisten** — decidir la ganadora y borrar el resto.
10. Archivo `v1 refinada.png` (1.4 MB) suelto sin trackear.

## Recomendación priorizada

| Prioridad | Acción |
|---|---|
| Alta  | Rate limiting + 404 JSON para `/api/*` inexistente |
| Alta  | Tests unitarios de `percentile()` y `calcularInversion()` (validar vs Excel) |
| Media | Aclarar manejo de `plusvaliaInmediataUsd` y plusvalía pre-entrega |
| Media | Centralizar `PROPERTY_TYPES`, elegir 1 versión de UX |
| Baja  | Limitar payload de `/api/health` en prod, limpiar `.png` suelto |

## Cambios aplicados

- **2026-05-17 — Precio de venta opcional**: el usuario puede consultar el precio/m²
  de la zona (percentiles p25/mediana/p75) sin ingresar un precio. Si no hay precio,
  no se calcula veredicto ni `diff_pct`, y la calculadora de inversión queda oculta
  (necesita el precio). Cambios en `server.js` (`validate`), `valuator.js` (`valuar`)
  y `frontend/src/App.jsx` (form + `ResultCard`).
