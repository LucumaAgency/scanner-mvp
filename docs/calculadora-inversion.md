# Calculadora de inversión inmobiliaria

Replica en código la lógica del Excel **"Calculadora v6.0"** (360 Inmobiliaria) para evaluar la rentabilidad de una inversión: rentas, plusvalía, inflación y ganancia real ajustada.

Vive **debajo del valuador** existente: cuando el usuario valua un precio en operación "Comprar", aparece un botón "Analizar como inversión" que expande un form con todos los inputs del Excel (precio, fechas, alquiler, vacancia, gastos, supuestos g/n/π) y devuelve ratios, proyección y veredicto.

---

## Tabla de contenido

1. [Arquitectura](#arquitectura)
2. [Versiones de UX](#versiones-de-ux)
3. [Endpoints API](#endpoints-api)
4. [Fórmulas implementadas](#fórmulas-implementadas)
5. [Inputs, defaults y pre-llenado inteligente](#inputs-defaults-y-pre-llenado-inteligente)
6. [Veredictos](#veredictos)
7. [Dependencia con el scraper urbania](#dependencia-con-el-scraper-urbania)
8. [Cómo extender](#cómo-extender)
9. [Limitaciones conocidas](#limitaciones-conocidas)
10. [Glosario financiero](#glosario-financiero)

---

## Arquitectura

```
                                                  ┌────────────────────┐
                                                  │ scraper urbania    │
                                                  │ (repo aparte)      │
                                                  │ build_districts.py │
                                                  └─────────┬──────────┘
                                                            │ aggregations
                                                            ▼
                                                  ┌────────────────────┐
                                                  │ MongoDB Atlas      │
                                                  │ db.districts       │
                                                  │   stats.median_..._│
                                                  │     alquiler       │
                                                  └─────────┬──────────┘
                                                            │
   ┌────────────────────────────────────────────────────────┼──────────┐
   │  scanner-mvp                                           │          │
   │                                                        ▼          │
   │  ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐   │
   │  │ frontend     │───▶│ POST /api/calcular│───▶│ calculator.js  │   │
   │  │ App.jsx      │    │ (server.js)       │    │ calcularInversion │
   │  │ InvestmentSec│    │ + validate input  │    │ + fórmulas Excel  │
   │  └──────────────┘    └──────────────────┘    └────────────────┘   │
   │         ▲                                                          │
   │         │ pre-fill defaults                                        │
   │         │                                                          │
   │  ┌──────┴──────────┐                                              │
   │  │ GET /api/distritos │                                            │
   │  │ → stats alquiler│                                              │
   │  └─────────────────┘                                              │
   └──────────────────────────────────────────────────────────────────────
```

**Decisión de diseño clave**: el cálculo es **puro** (no toca Mongo). `calculator.js` recibe un objeto JS, devuelve otro objeto JS. Esto lo hace testeable aisladamente y permite agregar variantes (ej. simulación Monte Carlo, year-by-year) sin tocar el server.

El único acceso a base es para **pre-llenar** los inputs del form usando datos reales del distrito (vía `/api/distritos`).

---

## Versiones de UX

La calculadora tiene **4 presentaciones** del mismo backend, accesibles por rutas distintas. Útil para A/B testing y para comparar enfoques pedagógicos según el perfil del usuario.

| Ruta | Nombre | Filosofía | Para quién |
|---|---|---|---|
| `/` | Original | Calculadora detrás de un botón "Analizar como inversión" — primero se valua el precio, después se profundiza | Usuario que entra a evaluar precio y opcionalmente quiere análisis financiero |
| `/version1` | **Wizard** | Una pregunta por pantalla, sin jerga financiera. Captura solo lo esencial (distrito, tipo, área, precio, entrega, alquiler, horizonte). Vacancia/gastos/π quedan ocultos con defaults | Persona que se pierde con forms largos. Conversion-friendly |
| `/version2` | **Tarjetas explicadas** | Form completo en una pantalla. Cada campo es una tarjeta con título + tooltip "(?)" que explica para qué sirve. Sección "Avanzado" colapsable | Quien quiere control total pero necesita entender los términos |
| `/version3` | **Historia interactiva** | Mad Libs financiero. El usuario lee un párrafo y completa los blancos amarillos. Resultado contado como una narrativa ("Año 2036, tu departamento ya no vale...") | Persona muy no-técnica, sin paciencia para forms tradicionales |

**Las 4 versiones consumen el mismo `POST /api/calcular`**. La diferencia está 100% en el cliente.

### Código compartido

```
frontend/src/
├── App.jsx                       ← Versión original
├── lib/
│   ├── calculatorApi.js          ← Hook useDistricts, fetch /api/calcular,
│   │                                 buildDefaults() — usado por las 3 versiones
│   └── Layout.jsx                ← Header + footer con navegación cruzada
└── versions/
    ├── VersionWizard.jsx         ← /version1
    ├── VersionCards.jsx          ← /version2
    └── VersionStory.jsx          ← /version3
```

### Decisiones de diseño por versión

**Wizard (`/version1`)** — pierde precisión a cambio de simplicidad. Solo pregunta el alquiler "promedio"; pesimista/optimista se derivan automáticamente como `±15%`. Vacancia y gastos quedan en defaults. Ideal cuando la prioridad es que el user complete el flujo.

**Cards (`/version2`)** — captura todos los inputs del Excel. Cada campo tiene una explicación que se muestra al click "(?)" — no satura la vista pero está disponible. La sección "Supuestos avanzados" (g, n, π) está cerrada por defecto porque la mayoría de users debería usar los defaults.

**Story (`/version3`)** — único enfoque sin tablas. Tanto el form como el resultado son texto fluido. Inputs con borde amarillo subrayado para invitar a editar. El resultado se cuenta en presente futuro: "tu propiedad valdrá X". Trade-off: más difícil escanear datos rápido, pero más memorable.

### Cómo agregar una versión nueva

1. Crear `frontend/src/versions/VersionTuPropuesta.jsx`
2. Importar `useDistricts`, `buildDefaults`, `calcular`, `Layout` desde `lib/`
3. Agregar la ruta en `frontend/src/main.jsx`:
   ```jsx
   <Route path="/version4" element={<VersionTuPropuesta />} />
   ```
4. Agregar al array `VERSIONS` en `lib/Layout.jsx` para que aparezca en el footer cruzado.

---

## Endpoints API

### `POST /api/calcular`

Calcula la proyección de inversión.

**Request body:**

```json
{
  "priceUsd": 220000,
  "areaM2": 80,
  "plusvaliaInmediataUsd": 6500,

  "yearCompra": 2026,
  "monthCompra": 5,
  "yearEntrega": 2028,
  "monthEntrega": 7,

  "alquilerPorM2Mes": {
    "pesimista": 9.5,
    "promedio": 12.3,
    "optimista": 16.0
  },
  "vacancia": {
    "pesimista": 0.10,
    "promedio": 0.08,
    "optimista": 0.05
  },
  "gastosOperativosUsd": {
    "pesimista": 1320,
    "promedio": 880,
    "optimista": 660
  },

  "g": 0.05,
  "n": 10,
  "inflacion": 0.03
}
```

**Response (200):**

```json
{
  "ok": true,
  "input": { ... },
  "tiempos": {
    "meses_sin_renta": 26,
    "años_sin_renta": 2.17,
    "años_con_renta": 7.83
  },
  "ratios": {
    "pesimista": { "cap_rate": 4.15, "net_cap_rate": 3.13, "per": 24.1, "per_neto": 32.0, "ing_neto_anual_usd": 6864 },
    "promedio":  { "cap_rate": 5.37, "net_cap_rate": 4.09, "per": 18.6, "per_neto": 24.4, "ing_neto_anual_usd": 8990 },
    "optimista": { "cap_rate": 6.98, "net_cap_rate": 5.55, "per": 14.3, "per_neto": 18.0, "ing_neto_anual_usd": 12200 }
  },
  "proyeccion": {
    "valor_entrega_usd": 226500,
    "valor_final_usd": 358335,
    "plusvalia_acum_pct": 62.9,
    "plusvalia_usd": 138335,
    "renta_acum_usd": 79150,
    "renta_acum_pct": 36.0,
    "rentabilidad_total_pct": 98.9,
    "inflacion_acum_pct": 34.4,
    "inversion_ajustada_usd": 295680,
    "valor_total_obtenido_usd": 437485,
    "ganancia_real_usd": 141805,
    "moic": 1.99
  },
  "verdict": "GANANCIA_REAL",
  "verdict_tone": "green"
}
```

**Errores (400):**

```json
{ "errors": ["g (plusvalía) fuera de rango razonable [-0.5, 1]"] }
```

### `GET /api/distritos`

Devuelve el catálogo de distritos con stats agregadas (extendido para incluir alquiler).

```json
{
  "districts": [
    {
      "slug": "miraflores",
      "name": "Miraflores",
      "province": "Lima",
      "stats": {
        "active_listings": 496,
        "venta_count": 90,
        "alquiler_count": 406,
        "p25_price_usd_per_m2_venta": 2126,
        "median_price_usd_per_m2_venta": 2378,
        "p75_price_usd_per_m2_venta": 2783,
        "p25_price_usd_per_m2_alquiler": 9.5,
        "median_price_usd_per_m2_alquiler": 12.3,
        "p75_price_usd_per_m2_alquiler": 16.0
      }
    }
  ],
  "count": 50
}
```

El frontend usa los `*_alquiler` para pre-llenar los 3 escenarios de la calculadora.

---

## Fórmulas implementadas

Toda la matemática vive en `backend/calculator.js`. Cada bloque mapea a una sección numerada del Excel.

### ① Tiempos

| Variable | Fórmula | Excel |
|---|---|---|
| `meses_sin_renta` | `(yearEntrega − yearCompra) × 12 + monthEntrega − monthCompra` | B44 |
| `años_sin_renta` | `meses_sin_renta / 12` | B45 |
| `años_con_renta` | `n − años_sin_renta` | B46 |

### ② Ratios por escenario (3×)

Para cada `esc ∈ {pesimista, promedio, optimista}`:

| Métrica | Fórmula |
|---|---|
| `ing_bruto_mensual` | `alquilerPorM2Mes[esc] × area` |
| `ing_bruto_anual` | `ing_bruto_mensual × 12` |
| `ing_neto_anual` | `ing_bruto_anual × (1 − vacancia[esc]) − gastosOperativos[esc]` |
| `cap_rate` | `ing_bruto_anual / priceUsd` |
| `net_cap_rate` | `ing_neto_anual / priceUsd` |
| `per` | `priceUsd / ing_bruto_anual` (años recuperación bruto) |
| `per_neto` | `priceUsd / ing_neto_anual` (años recuperación neto) |

Benchmarks de referencia (del Excel, no enforced en código):
- CAP rate Lima comercial: 5%–10%
- NET CAP rate: 4%–8%
- PER bruto: < 18 años (Lima)
- PER neto: < 15 años

### ③ Proyección (escenario promedio)

| Variable | Fórmula | Excel |
|---|---|---|
| `valor_entrega_usd` | `priceUsd + plusvaliaInmediataUsd` | B51 |
| `valor_final_usd` | `priceUsd × (1 + g)^n` | B52 |
| `plusvalia_acum_pct` | `(1 + g)^n − 1` | B53 |
| `plusvalia_usd` | `valor_final − priceUsd` | B54 |
| `renta_acum_usd` | **Anualidad creciente** (ver abajo) | B56 |
| `renta_acum_pct` | `renta_acum / priceUsd` | B57 |
| `rentabilidad_total_pct` | `plusvalia_acum + renta_acum_pct` | B58 |
| `inflacion_acum_pct` | `(1 + π)^n − 1` | B59 |
| `inversion_ajustada_usd` | `priceUsd × (1 + inflacion_acum)` | B60 |
| `valor_total_obtenido_usd` | `valor_final + renta_acum` | B61 |
| `ganancia_real_usd` | `valor_total_obtenido − inversion_ajustada` | B62 |
| `moic` | `valor_total_obtenido / priceUsd` | A85 |

**Anualidad creciente** (rentas que crecen con inflación cada año, durante `años_con_renta`):

```
si π ≈ 0:
  renta_acum = ing_neto_anual × años_con_renta

si π > 0:
  renta_acum = ing_neto_anual × ((1 + π)^años_con_renta − 1) / π
```

Esto modela que el alquiler se ajusta anualmente con inflación. Es **conservador** porque usa π en vez de g — las rentas crecen menos que el inmueble.

---

## Inputs, defaults y pre-llenado inteligente

Cuando el user expande la calculadora, el form viene **pre-llenado** según el distrito y precio ya ingresados.

| Campo | Default | Origen |
|---|---|---|
| `priceUsd`, `areaM2` | Vienen del valuador | Form anterior |
| `plusvaliaInmediataUsd` | `0` | Solo el inversionista lo sabe |
| `yearCompra` / `monthCompra` | Hoy | `new Date()` |
| `yearEntrega` / `monthEntrega` | hoy + 2 años | Asume preventa típica |
| `alquilerPorM2Mes` | `p25 / median / p75` del distrito | `district.stats.*_alquiler` |
| ↳ fallback | `10 / 15 / 22` | Si el distrito no tiene stats |
| `vacancia` | `0.10 / 0.08 / 0.05` | Defaults del Excel |
| `gastosOperativosUsd` | `0.6% / 0.4% / 0.3%` del precio anual | Heurística simple |
| `g` (plusvalía) | `0.05` (5%) | Default del Excel — regla conservadora |
| `n` (horizonte) | `10` años | Default del Excel |
| `inflacion` (π) | `0.03` (3%) | Promedio BCRP reciente |

**Por qué pre-llenar y no preguntar todo desde cero**: el Excel tiene 60+ celdas de input. Pedirle eso al usuario de entrada mata la conversion. La estrategia es "valuá rápido, después si te interesa profundizá". Cada nivel agrega un solo click.

---

## Veredictos

El backend devuelve `verdict` + `verdict_tone` que el frontend traduce a colores y mensajes.

| Veredicto | Condición | Tono | Mensaje |
|---|---|---|---|
| `GANANCIA_REAL` | `rentabilidad_total > inflacion_acum` Y `ganancia_real_usd > 0` | verde | "La rentabilidad supera la inflación acumulada" |
| `GANANCIA_NOMINAL` | `ganancia_real_usd > 0` pero rentabilidad ≤ inflación | ámbar | "Hay ganancia en USD pero por debajo del costo de oportunidad inflacionario" |
| `PERDIDA_REAL` | `ganancia_real_usd ≤ 0` | rojo | "El valor total obtenido no cubre la inflación acumulada" |

El caso `GANANCIA_NOMINAL` no existe en el Excel original (que solo tiene verde/rojo) — lo agregué porque es informativo: "ganaste plata pero perdiste poder adquisitivo".

---

## Dependencia con el scraper urbania

Los pre-llenados de alquiler vienen de `db.districts.stats.median_price_usd_per_m2_alquiler`. **Esos campos los popula el script `build_districts.py` del repo `scraper urbania`.**

Si esos campos no existen (porque el script no se corrió desde que se agregaron), el frontend cae a fallbacks genéricos: `10 / 15 / 22 USD/m²/mes`. La app sigue funcionando, solo pierde precisión en el pre-llenado.

**Cómo refrescar las stats**:
```bash
cd "scraper urbania"
python build_districts.py
```

Idempotente. Recomendado: correr semanal o cada vez que el inventario crezca >10%.

---

## Cómo extender

### Agregar un nuevo escenario (ej. "muy optimista")

1. En `calculator.js`, extender la constante `SCENARIOS`:
   ```js
   const SCENARIOS = ["pesimista", "promedio", "optimista", "muy_optimista"];
   ```
2. Agregar el campo correspondiente en `validateCalculatorInput`.
3. En `App.jsx`, extender `ScenarioRow` para mostrar la 4ta columna.
4. En `defaultsFromDistrict`, decidir un valor sensato (ej. `p75 × 1.15`).

### Mostrar tabla año-por-año (como hoja "Proyección Anual" del Excel)

`calculator.js` devuelve agregados — no hay aún la tabla anual. Para sumarla:

1. Agregar función `proyeccionAnual(input)` que devuelva un array de N items con valor inmueble, renta del año, acumulados, etc.
2. En `calcularInversion`, incluir `proyeccion_anual: proyeccionAnual(input)` en el response.
3. En frontend, agregar un componente que renderice la tabla.

Estimado: ~1h.

### Reemplazar `g` con CAGR histórico real

Hoy `g` es input manual con default 5%. El Excel sugiere calcular CAGR desde precios histórico de la zona (hoja "Plusvalía Zona"). Para automatizarlo:

1. Necesitás histórico de precios — el scraper urbania **no lo tiene** (solo snapshot actual). Habría que registrar un job mensual que fotografíe `median_price_usd_per_m2_venta` por distrito → tener una serie temporal en una colección nueva (`district_history`).
2. Después de N meses, calcular CAGR = `(precio_actual / precio_inicial) ^ (1 / años) − 1`.
3. Usar la regla del Excel: si CAGR ≥ 7% → cap a 5% (conservador). Si < 7% → usar CAGR directo. Para Lima: `min(CAGR, inflacion + 2%)`.

Estimado: 1-2 semanas (incluye recolección de histórico).

### Agregar conversión PEN ↔ USD en outputs

Hoy todo se calcula en USD. Si querés mostrar S/. también (como el Excel):

1. Agregar campo `tipoCambio` al input (default 3.7).
2. En `calculator.js`, derivar versiones PEN: `valor_final_pen = valor_final_usd × tipoCambio`.
3. En frontend, agregar columna PEN en las tarjetas de resultado.

Estimado: 30 min.

---

## Limitaciones conocidas

1. **Inflación pre-2026**: el Excel mezcla histórico BCRP (2010-2025) + π proyectada para compras pasadas. El código usa **solo π proyectada**. Para casos "compré en 2018 ¿cómo me fue?", la inflación acumulada se subestima si π default < inflación real. Workaround: subir π manualmente al promedio histórico de los años faltantes. Solución limpia: portear la tabla BCRP y combinar.

2. **Sin tabla año-a-año**: el Excel tiene una hoja "Proyección Anual" que muestra el crecimiento year-by-year. Hoy solo devolvemos los agregados. Útil para gráficos.

3. **`gastosOperativosUsd` como % del precio**: heurística (0.6%/0.4%/0.3% anual). La realidad varía por edificio (mantenimiento puede ser fijo independiente del precio). Suficiente para MVP, mejorable después si querés más precisión.

4. **Plusvalía inmediata es input manual**: no la podemos inferir de la base porque urbania no separa "precio socio fundador" de "precio lista". El user tiene que tipearla (o dejar 0 si compra a precio público).

5. **MOIC asume todo el horizonte completo**: no maneja venta intermedia del inmueble. Si querés vender al año 5 (no al 10), hay que correr la calculadora con `n = 5`. No hay flag de "vender en año X" automatizado.

6. **Sin descuento de impuestos**: el Excel tampoco lo hace, pero es relevante. En Perú la renta de alquiler está gravada. Mejora futura: agregar `impuesto_renta` como parámetro (default 5%).

---

## Glosario financiero

| Término | Definición |
|---|---|
| **CAP rate** | Capitalization rate. Renta bruta anual / precio compra. Mide rentabilidad bruta como % del capital invertido. |
| **NET CAP rate** | Igual al CAP rate pero descontando vacancia y gastos operativos. Más realista. |
| **PER** | Price-to-Earnings Ratio adaptado a inmuebles. Cuántos años de renta toma recuperar el capital. PER = 10 → recuperás en 10 años. |
| **MOIC** | Multiple on Invested Capital. Cuántas veces multiplicás tu capital. MOIC = 2x → duplicaste. |
| **g** | Growth rate. Tasa anual de plusvalía proyectada del inmueble. |
| **n** | Horizonte de inversión en años. |
| **π** | Inflación proyectada anual (decimal: 0.03 = 3%). |
| **CAGR** | Compound Annual Growth Rate. Tasa de crecimiento compuesto que iguala el cambio de un valor entre dos puntos en el tiempo. |
| **Plusvalía inmediata** | Diferencia entre el precio que pagás (socio fundador / preventa) y el precio público de lanzamiento. Ganancia "instantánea" en papel al recibir la propiedad. |
| **Anualidad creciente** | Suma de pagos que crecen a tasa constante. Aquí: rentas que aumentan con π cada año durante `años_con_renta`. |
| **Inflación acumulada** | Pérdida total de poder adquisitivo en el horizonte n. `(1+π)^n − 1`. Compras comparan tu ganancia contra esto para ver si "ganaste de verdad". |
| **Ganancia real** | Ganancia descontada por inflación. Si tu inmueble vale más pero el dinero vale menos, lo que importa es esta cifra. |
