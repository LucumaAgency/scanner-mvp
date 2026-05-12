# Historial de precios

> **Estado**: 📝 Diseño · pendiente decisión
> **Última actualización**: 2026-05-11
> **Owner**: por definir

Propuesta para agregar tracking de evolución de precios al scanner-mvp. Hoy la base es un snapshot único (cada crawl sobreescribe). Esta propuesta plantea **cómo capturar y mostrar la dimensión temporal** del mercado inmobiliario.

---

## Tabla de contenido

1. [Problema y contexto](#problema-y-contexto)
2. [Realidad: cero data histórica disponible](#realidad-cero-data-histórica-disponible)
3. [Las dos interpretaciones de "historial"](#las-dos-interpretaciones-de-historial)
4. [Opción A: Histórico agregado por distrito × tipo](#opción-a-histórico-agregado-por-distrito--tipo)
5. [Opción B: Cambios de precio en avisos individuales](#opción-b-cambios-de-precio-en-avisos-individuales)
6. [Recomendación](#recomendación)
7. [Decisiones pendientes](#decisiones-pendientes)
8. [Plan de implementación](#plan-de-implementación)
9. [Métricas de éxito](#métricas-de-éxito)
10. [Riesgos y limitaciones](#riesgos-y-limitaciones)

---

## Problema y contexto

El valuador actual responde "tu precio está dentro/sobre/bajo del rango actual del distrito". Es un snapshot. Le faltan **2 dimensiones temporales** importantes:

1. **Tendencia macro**: ¿el segmento está subiendo o cayendo? Esta info impacta decisiones de timing ("¿espero a que baje? ¿corro a comprar?").
2. **Stress del aviso individual**: ¿este vendedor ya bajó el precio 3 veces? Eso indica margen de negociación, no se ve en el snapshot actual.

Sin tendencias, el valuador es un termómetro puntual. Con tendencias, es una herramienta predictiva.

Para el modelo de negocio ("encontrar oportunidades inmobiliarias") esta información es **clave** — las mejores oportunidades suelen ser avisos con stress de vendedor (bajadas sucesivas) en zonas con tendencia alcista (apreciación + cap rate creciente).

---

## Realidad: cero data histórica disponible

Antes de diseñar, hay que ser explícitos:

> **Hoy el scraper guarda solo el estado actual. La base no tiene memoria.**

El proyecto modular original (`scraper urbania/db.py`) tenía una collection `listings_history` con la idea de registrar cambios de precio, pero:

- El minicrawl (que es lo que se usa hoy) **no la popula**.
- Aunque la popularan, solo serían ~3 semanas de data acumulada.
- Para análisis de tendencias estadísticamente significativos: **necesitamos mínimo 3-6 meses de snapshots**.

Implicación: la infraestructura se construye hoy, pero **el feature será visualmente pobre los primeros 1-3 meses**. Hay que comunicarlo en la UX ("Aún acumulando datos — vuelve en X días").

**Alternativas para acelerar (no recomendadas inicialmente):**
- Comprar data histórica a Properati Insights / Adondevivir (costo no investigado)
- Pedir dump al MEF / INEI (datos públicos pero granularidad distrital, no por listing)
- Scrapear el "Wayback Machine" de urbania.pe (técnicamente posible, éticamente gris, baja calidad)

---

## Las dos interpretaciones de "historial"

Cuando el equipo dijo "historial de precios por el tipo de propiedad que busca", hay dos lecturas válidas y **complementarias**:

### Interpretación A — agregado

> "Departamentos en Miraflores: hace 6 meses la mediana era $2,300/m², hoy $2,378/m²"

Útil para: **timing de mercado, tendencias de segmento, marketing ("Miraflores subió 8% en 6 meses")**.

### Interpretación B — puntual

> "Este aviso bajó de $230k a $210k hace 14 días"

Útil para: **detectar stress del vendedor, signals de oportunidad, motor de alertas**.

Ambas son valiosas y se construyen sobre infraestructuras paralelas. Recomiendo construir las dos.

---

## Opción A: Histórico agregado por distrito × tipo

### Modelo de datos — nueva collection `district_stats_history`

```javascript
{
  _id: ObjectId,
  district_slug: "miraflores",
  district_name: "Miraflores",
  property_type: "departamento",      // o null para "todas"
  operation: "venta",                  // o null para "todas"
  date: ISODate("2026-05-01"),         // primer día del periodo (mes o semana)
  granularity: "monthly",              // "weekly" | "monthly"

  stats: {
    active_listings: 412,
    median_price_usd_per_m2: 2378,
    p25_price_usd_per_m2: 2126,
    p75_price_usd_per_m2: 2783,
    sample_size: 90,                   // n con price_usd_per_m2 plausible
  }
}
```

**Índices recomendados:**
```javascript
db.district_stats_history.createIndex(
  { district_slug: 1, property_type: 1, operation: 1, date: -1 }
);
db.district_stats_history.createIndex({ date: 1 });  // para queries cross-distrito
```

### Recolección

Dos opciones:

**Opción A.1 — extender `build_districts.py`** para que cada corrida también haga snapshot:

```python
# Al final de build_districts.main()
from datetime import datetime, timezone
snapshot_date = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

for rec in records:
    for op in ["venta", "alquiler"]:
        for ptype in ["departamento", "casa", "terreno", ...]:
            stats = compute_stats_filtered(listings_col, rec["name"], op, ptype)
            history_col.update_one(
                {
                    "district_slug": rec["slug"],
                    "property_type": ptype,
                    "operation": op,
                    "date": snapshot_date,
                },
                {"$set": {..., "stats": stats}},
                upsert=True,
            )
```

Re-corre el último snapshot del mes si build_districts se corre varias veces (idempotente, refleja el estado más reciente del mes).

**Opción A.2 — script aparte `record_snapshot.py`** corrido por cron mensual.

Más limpio (separación de concerns) pero requiere setup de cron en el servidor del scraper.

### Endpoint nuevo

`GET /api/historial-distrito?district=miraflores&propertyType=departamento&operation=venta`

```json
{
  "district": "Miraflores",
  "property_type": "departamento",
  "operation": "venta",
  "granularity": "monthly",
  "history": [
    { "date": "2026-01-01", "median": 2300, "p25": 2050, "p75": 2700, "n": 85 },
    { "date": "2026-02-01", "median": 2340, "p25": 2080, "p75": 2730, "n": 88 },
    { "date": "2026-03-01", "median": 2360, "p25": 2100, "p75": 2750, "n": 89 },
    { "date": "2026-04-01", "median": 2378, "p25": 2126, "p75": 2783, "n": 90 }
  ],
  "summary": {
    "trend_pct_3m": 1.6,           // cambio % vs 3 meses atrás
    "trend_pct_12m": null,          // null si no hay data de hace 12 meses
    "current_median": 2378,
    "min_n": 85,                    // tamaño mínimo de sample en la serie
  }
}
```

### UX — frontend

Debajo del resultado del valuador actual, agregar una sección:

```
┌────────────────────────────────────────────────┐
│ Tendencia del mercado                          │
│                                                │
│  $/m²                                          │
│  2400 ┤                              ●         │
│  2300 ┤                  ●      ●              │
│  2200 ┤      ●      ●                          │
│  2100 ┤  ●                                     │
│       └────────────────────────────────         │
│       Ene Feb Mar Abr May Jun Jul Ago         │
│                                                │
│  Miraflores · departamentos · venta            │
│  +1.6% últimos 3 meses                         │
└────────────────────────────────────────────────┘
```

**Estados de UI:**
- Sin data (≤ 1 snapshot): "Aún acumulando datos. Vuelve en ~30 días."
- Data parcial (2-5 snapshots): mostrar gráfico pero con disclaimer "datos preliminares".
- Data completa (≥ 6 snapshots): gráfico full con summary.

**Implementación sugerida**: SVG inline (sparkline). Sin librerías externas. ~30 líneas de React. Si después se quiere algo más sofisticado: Recharts (~80kb gzip), pero overkill para este caso.

---

## Opción B: Cambios de precio en avisos individuales

### Modelo de datos — collection `listings_history` (ya existe en Atlas, pero vacía)

Schema propuesto:

```javascript
{
  _id: ObjectId,
  posting_id: "146768055",
  seen_at: ISODate("2026-05-11T..."),
  kind: "price_change",                // "created" | "price_change" | "inactive"

  price_prev: 230000,
  price: 210000,
  currency: "USD",

  // Contexto extra (snapshot del estado al momento del cambio)
  district: "Miraflores",
  property_type: "departamento",
  area_total_m2: 80,
}
```

Índices:
```javascript
db.listings_history.createIndex({ posting_id: 1, seen_at: -1 });
db.listings_history.createIndex({ seen_at: -1, kind: 1 });
```

### Recolección — modificar `urbania_minicrawl.upsert()`

Hoy el upsert sobreescribe el price sin chequear cambio. Cambio mínimo:

```python
def upsert(col, history_col, rec):
    pid = rec["posting_id"]
    now = datetime.now(timezone.utc)
    rec["last_seen_at"] = now
    rec["active"] = True

    existing = col.find_one(
        {"posting_id": pid},
        {"_id": 1, "manual_flag": 1, "price": 1, "currency": 1},
    )

    if existing and existing.get("manual_flag"):
        rec.pop("active", None)

    if existing is None:
        rec["first_seen_at"] = now
        col.insert_one(rec)
        history_col.insert_one({
            "posting_id": pid,
            "seen_at": now,
            "kind": "created",
            "price": rec.get("price"),
            "currency": rec.get("currency"),
            "district": (rec.get("address") or {}).get("district"),
            "property_type": rec.get("property_type"),
        })
        return "created"

    # Detectar cambio de precio
    if existing.get("price") != rec.get("price") or existing.get("currency") != rec.get("currency"):
        history_col.insert_one({
            "posting_id": pid,
            "seen_at": now,
            "kind": "price_change",
            "price_prev": existing.get("price"),
            "currency_prev": existing.get("currency"),
            "price": rec.get("price"),
            "currency": rec.get("currency"),
        })

    col.update_one({"posting_id": pid}, {"$set": rec})
    return "updated"
```

### Endpoint nuevo

`GET /api/historial-listing/:posting_id`

```json
{
  "posting_id": "146768055",
  "events": [
    { "date": "2026-04-15", "kind": "created", "price": 230000, "currency": "USD" },
    { "date": "2026-04-29", "kind": "price_change", "price_prev": 230000, "price": 220000 },
    { "date": "2026-05-08", "kind": "price_change", "price_prev": 220000, "price": 210000 }
  ],
  "summary": {
    "first_seen_at": "2026-04-15",
    "current_price": 210000,
    "total_change_pct": -8.7,
    "n_changes": 2,
    "stress_score": "high"          // baja sostenida → flag para el inversor
  }
}
```

`stress_score` calculado heurísticamente:
- `low`: 0 cambios o 1 cambio < 5%
- `medium`: 1-2 cambios entre 5-10%
- `high`: 2+ cambios o cambio total > 10%

### UX — frontend

En la card de comparables del valuador, agregar un badge cuando un aviso tiene cambios:

```
┌──────────────────────────────────────┐
│ Comparable #3                        │
│ Depto 80m² · 2 dorm · $215k          │
│ 📉 Bajó 8.7% en 24 días              │  ← badge nuevo
└──────────────────────────────────────┘
```

Y en el resultado del valuador principal, si la propiedad valuada matchea con un listing trackeado: timeline pequeño con los cambios.

---

## Recomendación

**Hacer A + B en paralelo.** Razones:

1. **Infraestructura complementaria**: A es una collection nueva, B reutiliza una que ya existe (vacía). El effort total es ~2.5h.
2. **B empieza a dar valor más rápido** (1-2 meses vs 3-6 meses para A).
3. **A tiene más valor a largo plazo** (tendencias estructurales, marketing, decisiones de desarrollo).
4. **Los dos juntos** son sinérgicos: detectar zonas en alza (A) + avisos con stress (B) = "mejores oportunidades del mes".

---

## Decisiones pendientes

Antes de implementar:

### 1) Frecuencia del snapshot agregado (A)

| Opción | Pro | Contra |
|---|---|---|
| Mensual (1er día del mes) | Menos volumen, alineado con cómo piensa el negocio | Granularidad gruesa |
| Semanal (cada lunes) | Detecta movimientos cortos, gráficos más densos | 4× volumen, ruido en muestras chicas |
| Diario | Máximo detalle | Mucho ruido, los precios diarios tienen baja varianza real |

**Default recomendado**: **mensual**. Si después se ve que es lento, escalamos a semanal.

### 2) Granularidad del agregado (A)

¿Qué dimensiones agrupamos?

| Combinación | Volumen de buckets | Comentario |
|---|---|---|
| `(distrito, operación)` | ~50 × 2 = 100 | Más simple, perdemos diferencia depto vs casa |
| `(distrito, tipo, operación)` | ~50 × 5 × 2 = 500 | **Recomendado** — captura segmento típico |
| `(distrito, tipo, operación, bedrooms_bucket)` | ~50 × 5 × 2 × 5 = 2,500 | Muy fino — algunos buckets quedan con n=0 |

**Default recomendado**: **`(distrito, tipo, operación)`**. Si un bucket tiene n < 5, devolvemos `null` en stats — el frontend lo muestra como "Sin datos suficientes".

### 3) Visualización (A + B)

| Opción | Tamaño | Estilo |
|---|---|---|
| **SVG inline manual** (sparkline + summary) | +0KB | Lightweight, sin axes, sin tooltips |
| **Recharts** | +80KB gzip | Profesional, axes, tooltips, animaciones |
| **Tabla simple con últimos N puntos** | +0KB | Sin gráfico, solo números — para v0 |

**Default recomendado**: empezar con **SVG inline**. Sufficient para sparkline y summary. Si la UX necesita más, escalamos a Recharts.

### 4) Backfill / data histórica externa

¿Vale la pena gastar tiempo en conseguir histórico externo, o aceptamos los 3-6 meses de cold start?

**Default recomendado**: **aceptar cold start**. Comunicar honestamente en la UI ("empezamos a trackear el 2026-05-11"). Backfill solo si una fuente confiable aparece sin esfuerzo.

---

## Plan de implementación

Si se aprueba A + B + decisiones default:

| Paso | Archivo | Esfuerzo | Bloqueante |
|---|---|---|---|
| 1. Modificar `urbania_minicrawl.upsert()` para registrar cambios en `listings_history` | scraper urbania | 15 min | — |
| 2. Modificar `build_districts.py`: agregar snapshot a `district_stats_history` por mes | scraper urbania | 30 min | — |
| 3. Crear endpoint `/api/historial-distrito` | backend/server.js + valuator.js | 20 min | 2 |
| 4. Crear endpoint `/api/historial-listing/:id` | mismo | 15 min | 1 |
| 5. Componente `<DistrictTrend />` con sparkline SVG | frontend/src/components/ | 45 min | 3 |
| 6. Componente `<ListingPriceHistory />` con badge | frontend/src/components/ | 30 min | 4 |
| 7. Integrar componentes al resultado del valuador en App.jsx | frontend/src/App.jsx | 20 min | 5, 6 |
| 8. Doc del feature en `docs/historial-precios.md` (mover desde planes-futuros) | docs/ | 30 min | todo |

**Total**: ~3 horas de coding + tiempo de espera para acumular data.

---

## Métricas de éxito

A los 3 meses de implementado:

| Métrica | Target |
|---|---|
| Snapshots agregados acumulados | ≥ 3 (1 por mes) |
| Listings con ≥ 1 cambio de precio | ≥ 30% del inventario |
| % de valuaciones que usan el historial (clicks o expansiones) | ≥ 20% |
| % de buckets `(distrito, tipo, op)` con n ≥ 5 en historial | ≥ 60% |

Si el % de uso es < 5%, el feature no aporta valor — considerar revertir o rediseñar UX.

---

## Riesgos y limitaciones

1. **Cold start de 3-6 meses**: durante este período el feature está visible pero vacío. UX debe comunicarlo bien o se percibe como "roto".

2. **Volatilidad de samples chicos**: en distritos pequeños (Punta Hermosa, La Punta) la mediana puede saltar 20% mes a mes solo por composición de muestra. Necesario filtro `n >= 5` y disclaimer.

3. **Cambios de precio "falsos"**: si un aviso se republica con otro `posting_id`, lo perdemos. Sería ideal deduplicar por `(address + área + dorms)` para detectar reposts. Out of scope para v1.

4. **Drift del scraper**: si urbania cambia el HTML y `price` queda mal parseado, los cambios de precio reportados van a ser falsos positivos. Mitigación: monitorear distribución de cambios — si más del 30% en una semana cambia de precio, algo huele mal.

5. **Costo de almacenamiento Atlas free tier (512MB)**: con `district_stats_history` mensual × 50 distritos × 5 tipos × 2 ops = 500 docs/mes. En 5 años = 30k docs (~10MB). Sin riesgo. `listings_history` con ~3k cambios/año = ~150KB/año. Sin riesgo.

6. **Concurrencia**: si build_districts corre 2 veces en el mismo mes, los upserts a `district_stats_history` son idempotentes (compound key incluye `date`). Sin riesgo.

---

## Referencias

- `docs/calculadora-inversion.md` — feature ya implementado que se beneficiaría de este historial (la calculadora podría usar tendencia para refinar `g`)
- `scraper urbania/db.py` (proyecto modular original) — tenía la idea de `listings_history`, vacía en el setup actual del minicrawl
