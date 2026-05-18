# Cambios del Excel: v6.0 → v8.0

> Fecha análisis: 2026-05-17 · Fuente: Google Sheet "Calculadora de inversión inmobiliaria v8.0"
> (Vive 360 Inmobiliaria). Baseline: lógica v6.0 implementada en `backend/calculator.js`
> y documentada en `docs/calculadora-inversion.md`.

El nuevo libro tiene **4 hojas**: `🏠 Calculadora`, `📊 Plusvalía Zona`,
`📈 Inflación BCRP`, `📊 Proyección Anual`. El código actual replica solo la primera
(parcialmente). Pie de página dice "v7.0", título "v8.0" — versión inconsistente en el
propio archivo.

---

## 1. Moneda nativa cambió: ahora es S/. (Soles), USD derivado  ⚠️ cambio estructural

| | v6.0 (código) | v8.0 (nuevo) |
|---|---|---|
| Dato principal | `priceUsd` (USD nativo) | `Precio de compra (S/.)` B10 |
| Tipo de cambio | no existe | **input** B8 (default `3.4`), ⚠ actualizar mensual |
| USD | input directo | `B11 = B10 / B8` derivado |
| Costo/m² | no se mostraba | USD (`B11/B9`) y S/. (`B10/B9`) |

Todos los outputs financieros se calculan en S/. y se convierten a USD dividiendo por TC.
La calculadora del MVP es **USD-first**; habría que decidir: agregar TC e inputs en
S/., o mantener USD y solo documentar el equivalente.

## 2. Inflación acumulada: ahora mezcla BCRP histórico real + π proyectada  ⭐ mejora clave

Resuelve directamente la **Limitación conocida #1** del doc actual.

- **v6.0**: `inflacion_acum = (1+π)^n − 1` — solo π proyectada.
- **v8.0** (celda B59): para los años del horizonte que caen en la tabla histórica
  BCRP (2010–2025) usa la **inflación real acumulada** de esos años; para los años
  futuros (post-2025) compone con π. Fórmula:
  `EXP(SUMPRODUCT(años∈[compra, compra+n-1] · LN(1+infl_real))) · (1+π)^(años_futuros) − 1`,
  con fallback a `(1+π)^n − 1`.
- Nueva hoja **📈 Inflación BCRP**: tabla año→inflación 2010–2025 (0.0229 … 0.0151).

Implica portear esa tabla a constantes en `calculator.js` y reescribir el cálculo de
inflación acumulada según año de compra.

## 3. Nueva hoja 📊 Plusvalía Zona — regla automática para `g` (CAGR)

Resuelve la mejora futura "Reemplazar g con CAGR histórico real" del doc.

- CAGR histórico zona: `(precioActual / precioInicial)^(1/años) − 1`.
- **Regla automática** para la `g` recomendada (celda B20):
  - Lima con dato propio: `g = min(CAGR, inflPromBCRP + 0.02)`
  - Provincia con dato, `CAGR ≥ 7%` → `g = 0.05` (conservador)
  - Provincia con dato, `CAGR < 7%` → `g = CAGR`
  - Lima sin dato → `g = inflPromBCRP`
  - Provincia sin dato → `g = 0.05`
  - `inflPromBCRP` = promedio últimos 10 años BCRP ≈ 3.23%
- La Calculadora jala el CAGR como **referencia** (B47); la `g` final sigue siendo
  input manual (se puede sobreescribir).

## 4. Nueva hoja 📊 Proyección Anual — tabla año a año (20 años)

Resuelve la **Limitación #2** ("sin tabla año-a-año").

Columnas: valor inmueble, renta anual neta, renta acumulada, plusvalía acum %,
renta acum %, **rentabilidad total acum %**, inflación acum %.

- Renta del año: `0` si `año ≤ años_sin_renta`, si no
  `renta_neta_prom · (1+g)^(año − años_sin_renta − 1)`.
- ⚠️ **Inconsistencia interna del Excel**: la tabla anual hace crecer la renta con
  **g (plusvalía)**, pero el agregado ⑤ (celda B56) la hace crecer con **π (inflación)**
  — y su propio comentario dice "crecen con inflación π, no con g". El agregado B56 es
  el correcto según la intención de diseño; la tabla anual tiene un bug de fórmula.
  Además el autor dejó una nota en la hoja: *"OJO ESTE GRÁFICO NO DEBE SER ASÍ…"*.

## 5. Plusvalía inmediata: ahora en S/. + se deriva el %

- v6.0: `plusvaliaInmediataUsd` (USD).
- v8.0: `B18` en S/. y `B19 = B18/B10` = **% plusvalía inmediata** (cifra clave del
  resumen ejecutivo, ej. "+S/.22,000 desde el día 1 vs precio lista").

## 6. Cuadro de alquiler de referencia (Urbania/BCRP) — Lima

Nueva tabla en `📊 Plusvalía Zona` (filas 30–46): alquiler **USD/m²/año** por distrito
de Lima (Barranco 127, Miraflores 110, San Isidro 143, …), series trimestrales
2022–2024. Es referencia manual para llenar el alquiler. Ojo: es anual por m², no
mensual — distinto de cómo el MVP pre-llena (USD/m²/mes desde Mongo).

## 7. Veredicto simplificado

- **v6.0 (código)**: 3 estados — `GANANCIA_REAL` (rentab>infl **y** ganancia>0),
  `GANANCIA_NOMINAL` (ganancia>0 pero rentab≤infl), `PERDIDA_REAL` (ganancia≤0).
- **v8.0**: compara solo **rentabilidad total `B58` vs inflación acumulada `B59`**:
  🟢 `B58 > B59`, 🟡 `B58 = B59`, 🔴 `B58 < B59`.
- Nota matemática: en este modelo `ganancia_real > 0 ⟺ B58 > B59` (son equivalentes
  porque `MOIC = 1 + B58` y el mínimo anti-inflación es `1 + B59`). Es decir, el caso
  `GANANCIA_NOMINAL` del código actual es **inalcanzable / redundante** con esta
  matemática. Conviene colapsar a 2 estados (o 3 con el neutro 🟡).

## 8. Cambios cosméticos / menores

- Escenarios renombrados: `pesimista / promedio / optimista` → **MÍNIMO / PROMEDIO / MÁXIMO**.
- Ratios con check visual vs benchmark: columna `✅/⚠️` (`IF(ratio > umbral,…)`).
  El código no devuelve este flag — se podría agregar `cumple_benchmark`.
- Nuevos inputs: `Tipo de propiedad` (texto libre), `Tipo de cambio`.
- `Año/Mes de compra` movidos a la sección ④ Supuestos.
- Resumen ejecutivo + narrativa con umbral MOIC: `MOIC ≥ 2` → "DUPLICAS TU INVERSIÓN".
  `MOIC = B61/B10` (igual a la lógica actual).

---

## Fórmulas que NO cambiaron (siguen igual que v6.0)

- Tiempos: `meses_sin_renta`, `años_sin_renta`, `años_con_renta` (B44–B46).
- Ratios ② : ingreso bruto/neto, CAP rate (bruto), NET CAP rate, PER, PER neto.
- Proyección ⑤ : `valor_entrega = precio + plusv_inmediata`,
  `valor_final = precio·(1+g)^n`, `plusvalia_acum = (1+g)^n−1`,
  `renta_acum` = anualidad creciente con π, `rentab_total = plusv_acum% + renta_acum%`,
  `inversion_ajustada = precio·(1+infl_acum)`, `total_obtenido = valor_final + renta_acum`,
  `ganancia_real = total_obtenido − inversion_ajustada`, `MOIC`.

---

## Plan de actualización sugerido para `calculator.js`

| # | Cambio | Esfuerzo | Prioridad |
|---|---|---|---|
| 2 | Inflación acumulada con tabla BCRP histórica + π futura | Medio | **Alta** (corrige limitación real) |
| 7 | Colapsar veredicto a 2–3 estados consistentes con la matemática | Bajo | Alta |
| 4 | Endpoint/respuesta con tabla año-a-año (`proyeccion_anual[]`) | Medio | Media |
| 3 | Regla automática de `g` desde CAGR (input opcional precio inicial/final + ubicación) | Medio | Media |
| 1 | Soporte S/. ↔ USD con tipo de cambio | Medio | Media (depende de UX) |
| 5 | `plusvaliaInmediata` + derivar `%` en el output | Bajo | Baja |
| 8 | Flags `cumple_benchmark`, rename escenarios en UI | Bajo | Baja |

Bug a no replicar: la renta año-a-año del Excel crece con `g`; debe crecer con `π`
(como el agregado B56). Implementar la versión correcta.

---

## Estado de implementación — 2026-05-17 (todo el set v8.0)

Implementado y verificado contra el Excel (caso S/.170k / TC 3.4):
plusvalía acum 62.9%, inflación acum 41.1%, rentab. total 130.1%, MOIC 2.3,
ganancia real S/.151,378 — coinciden exactamente.

- **backend/calculator.js** — reescrito a v8.0:
  - Tabla `INFLACION_BCRP` 2010–2025 + `inflacionAcumulada()` (histórico real +
    π futura). Corrige el sobre-conteo del Excel para compras post-2025 usando
    `n − añosConDatoHistórico`.
  - `tasaGRecomendada()` exportada (regla CAGR Lima/provincia, con/sin dato).
  - `proyeccionAnual()` — tabla año a año; renta crece con **π** (no con g: se
    descarta el bug del Excel).
  - Soporte S/. vía `tipoCambio` (opcional) → bloque `soles` en la respuesta.
  - `plusvalia_inmediata_usd` + `plusvalia_inmediata_pct` en la proyección.
  - Veredicto colapsado a `GANANCIA_REAL` / `NEUTRO` / `PERDIDA_REAL` (se elimina
    el `GANANCIA_NOMINAL` inalcanzable).
  - `cumple{}` por escenario + `benchmarks` en la respuesta.
- **backend/server.js** — nuevo endpoint `POST /api/tasa-g`; `tipoCambio` opcional
  validado en `/api/calcular`.
- **frontend** — `App.jsx`: input Tipo de cambio, helper CAGR (`CagrHelper` →
  `/api/tasa-g` con botón "Usar como g"), tabla año-a-año, equivalentes en S/.,
  checks ✅/⚠️ de benchmark, veredicto `NEUTRO`. `calculatorApi.js`: defaults
  `tipoCambio: 3.5`, `inflacion: 0.035` (las 3 versiones alternativas siguen
  funcionando por compatibilidad; el render extendido se agregó solo a la ruta `/`).

Pendiente (no bloqueante): replicar la tabla año-a-año y los nuevos campos en las
3 versiones alternativas de UX (`VersionWizard/Cards/Story`), y tests unitarios
de `inflacionAcumulada()` / `tasaGRecomendada()`.
