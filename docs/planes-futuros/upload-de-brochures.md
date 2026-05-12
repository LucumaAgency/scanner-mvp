# Upload de brochures (extracción con OpenAI)

> **Estado**: 📝 Diseño · pendiente decisión
> **Última actualización**: 2026-05-11
> **Owner**: por definir

Propuesta para que el inversor suba el **PDF del brochure / cotización** que recibe de una inmobiliaria, y el sistema extraiga automáticamente los datos clave (precio, área, fecha de entrega, etc.) para pre-llenar la calculadora de inversión.

Visión: **"Subo el PDF → en 30 segundos tengo el veredicto de ROI"**.

---

## Tabla de contenido

1. [Problema y caso de uso](#problema-y-caso-de-uso)
2. [Por qué OpenAI y no otra cosa](#por-qué-openai-y-no-otra-cosa)
3. [Flujo end-to-end](#flujo-end-to-end)
4. [Stack técnico](#stack-técnico)
5. [Schema del API](#schema-del-api)
6. [Prompt engineering](#prompt-engineering)
7. [UX: preview antes de aplicar](#ux-preview-antes-de-aplicar)
8. [Costos y modelo de uso](#costos-y-modelo-de-uso)
9. [Manejo de errores y edge cases](#manejo-de-errores-y-edge-cases)
10. [Plan de implementación](#plan-de-implementación)
11. [Seguridad y privacidad](#seguridad-y-privacidad)
12. [Decisiones pendientes](#decisiones-pendientes)
13. [Riesgos y limitaciones](#riesgos-y-limitaciones)
14. [Métricas de éxito](#métricas-de-éxito)

---

## Problema y caso de uso

Hoy el flujo del inversor es:

```
Recibe brochure PDF de inmobiliaria
        ↓
Lee precio, área, fechas, plusvalía manualmente
        ↓
Tipea esos números en la calculadora del scanner-mvp
        ↓
Decide si invertir
```

**Problema**: el paso 3 (tipeo manual) es la fricción principal. Cada brochure tiene 6-12 datos que copiar. Inversores activos reciben **5-30 brochures por mes**. Re-tipear todo desincentiva el uso de la herramienta.

**Solución propuesta**: drag & drop del PDF → extracción automática → preview editable → un click para calcular.

**Reducción de fricción esperada**: de ~3 minutos por análisis a ~30 segundos.

---

## Por qué OpenAI y no otra cosa

Decisión: **OpenAI GPT-4o-mini** (con fallback a GPT-4o para PDFs complejos).

### Comparativa de opciones

| Opción | Pros | Contras | Costo/PDF |
|---|---|---|---|
| **OpenAI GPT-4o-mini** ✅ | Excelente para JSON estructurado · Vision · Cheap · `response_format: json_schema` garantiza estructura válida | API key paga · Datos van a OpenAI | $0.001-$0.005 |
| OpenAI GPT-4o | Más preciso en PDFs visualmente complejos | 5-10x más caro | $0.015-$0.030 |
| Anthropic Claude Sonnet | Excelente parsing, vision nativa | Comparable al de arriba pero el equipo ya pidió OpenAI | $0.005-$0.015 |
| Tesseract OCR (open-source) | Gratis, on-prem | Requiere lógica adicional para estructurar · Frágil con tablas · Sin entendimiento semántico | $0 |
| pdf-parse + regex | Rápido, gratis | Solo PDFs text-based · Cada inmobiliaria tiene formato distinto · No escala | $0 |

**Razones específicas para OpenAI:**
- El equipo lo pidió explícitamente
- `response_format: { type: "json_schema" }` garantiza que la respuesta cumple el schema (no hay que parsear texto libre)
- GPT-4o-mini tiene vision nativa (no hay que convertir PDF→imagen aparte)
- Pricing predecible y bajo

---

## Flujo end-to-end

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend                                                            │
│                                                                      │
│  ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐  │
│  │ Drag & drop  │ ──▶ │ Preview de los │ ──▶ │ Calculadora      │  │
│  │ del PDF      │     │ datos extraídos│     │ con campos       │  │
│  │ (max 5 MB)   │     │ + edición      │     │ pre-llenados     │  │
│  └──────────────┘     └────────────────┘     └──────────────────┘  │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend                                                             │
│                                                                      │
│  POST /api/extract-brochure (multipart/form-data)                   │
│  │                                                                   │
│  ├─ multer: validar MIME, tamaño, guardar en /tmp                  │
│  ├─ pdf-parse: ¿hay texto extraíble?                               │
│  │     ├─ SÍ → enviar texto a GPT-4o-mini                          │
│  │     └─ NO → convertir páginas a base64 PNG, enviar como image  │
│  ├─ OpenAI API call con response_format json_schema                 │
│  ├─ Validar response (rangos plausibles)                            │
│  └─ Devolver JSON estructurado al frontend                          │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────┐
   │ OpenAI API           │
   │ gpt-4o-mini          │
   │ (vision + json_schema)│
   └──────────────────────┘
```

---

## Stack técnico

### Backend

```json
{
  "openai": "^4.x",
  "multer": "^1.x",
  "pdf-parse": "^1.x",
  "pdf-img-convert": "^2.x"      // solo si fallback a vision
}
```

### Variables de entorno nuevas

```bash
OPENAI_API_KEY=sk-...           # obligatoria
OPENAI_MODEL=gpt-4o-mini        # default, override-able a gpt-4o
MAX_PDF_SIZE_MB=5               # límite de upload
MAX_PDF_PAGES=15                # truncar si más
```

### Estructura de archivos nuevos/modificados

```
scanner-mvp/
├── backend/
│   ├── extract.js               (NUEVO)  ← lógica de extracción
│   └── server.js                (MODIFICADO) ← endpoint nuevo + multer
├── frontend/src/
│   ├── components/
│   │   └── BrochureUpload.jsx   (NUEVO)  ← drag-drop + preview
│   └── App.jsx                  (MODIFICADO) ← integración con calculadora
└── docs/upload-de-brochures.md  (mover desde planes-futuros cuando esté listo)
```

---

## Schema del API

### `POST /api/extract-brochure`

**Request**: multipart/form-data
- `file`: el PDF (max 5MB)

**Response 200** (extracción exitosa):

```json
{
  "ok": true,
  "extracted": {
    "priceUsd": 220000,
    "priceOriginal": "USD 220,000",
    "priceCurrency": "USD",
    "areaM2": 80,
    "bedrooms": 2,
    "bathrooms": 2,
    "district": "Miraflores",
    "address": "Av. Larco 1234",
    "propertyType": "departamento",
    "yearEntrega": 2028,
    "monthEntrega": 7,
    "plusvaliaInmediataUsd": 0,
    "developer": "Constructora ABC",
    "projectName": "Edificio Arena Larco",
    "tipoCambio": null
  },
  "confidence": {
    "priceUsd": "high",
    "areaM2": "high",
    "district": "high",
    "yearEntrega": "medium",
    "plusvaliaInmediataUsd": "low"
  },
  "raw_excerpts": {
    "priceUsd": "Precio: USD 220,000 contra entrega",
    "areaM2": "Área techada: 80 m²",
    "yearEntrega": "Entrega: Q3 2028"
  },
  "warnings": [
    "El brochure menciona 'desde USD 220,000' — usé el precio mínimo. Verificá si aplica a tu unidad.",
    "Fecha de entrega 'Q3 2028' interpretada como julio 2028"
  ],
  "meta": {
    "model": "gpt-4o-mini",
    "tokens_input": 5420,
    "tokens_output": 380,
    "cost_usd": 0.0011,
    "extraction_method": "text"
  }
}
```

**Response 400** (validación):

```json
{
  "ok": false,
  "error": "file_too_large",
  "message": "El PDF supera 5 MB. Comprimilo o subí una versión más liviana."
}
```

**Response 422** (extracción fallida):

```json
{
  "ok": false,
  "error": "extraction_failed",
  "reason": "no_relevant_data",
  "message": "El PDF no parece contener información de un proyecto inmobiliario. Verificá que sea el brochure correcto.",
  "extracted_fragments": "..."
}
```

### Confianza de cada campo

- `high`: dato encontrado explícitamente, formato claro
- `medium`: dato inferido (ej. "Q3 2028" → julio), o ambiguo (rango "desde X")
- `low`: dato no encontrado, devolvió default o `null`

El frontend usa esto para resaltar los campos que requieren revisión manual.

---

## Prompt engineering

### System prompt

```
Sos un asistente especializado en extraer datos estructurados de brochures
de proyectos inmobiliarios peruanos en preventa.

REGLAS:
1. Devolvé SOLO datos que aparecen explícitamente o son inferibles con
   alta confianza del documento. NO inventes valores.
2. Si un dato no aparece, devolvelo como null y marcá confidence "low".
3. Para precios, normalizá a USD si el documento usa otra moneda
   (asumiendo TC ~3.7 si no se especifica). Conservá el precio original
   en `priceOriginal`.
4. Para fechas tipo "Q3 2028", "Tercer trimestre 2028", "Mediados 2028":
   inferí mes (Q1=marzo, Q2=junio, Q3=septiembre, Q4=diciembre) y marcá
   confidence "medium".
5. Para precios "desde X", usá el mínimo y agregá warning.
6. Si el brochure tiene múltiples unidades (3 dorm, 2 dorm, etc.):
   devolvé los datos del modelo MÁS COMÚN o el destacado.
7. property_type debe ser uno de: departamento, casa, terreno, oficina,
   local, cochera, deposito, habitacion, edificio, quinta.
8. district debe ser un distrito de Lima/Callao/Perú escrito completo
   (ej: "Santiago de Surco" no "Surco").
9. Si el documento no parece ser un brochure inmobiliario, devolvé
   error "no_relevant_data".

Devolvé warnings claros cuando hagas inferencias o normalizaciones.
```

### User message (con texto extraído del PDF)

```
Extraé los datos de este brochure inmobiliario:

---
[contenido del PDF aquí, max 8000 tokens]
---
```

### Para PDFs visuales (vision)

```
Extraé los datos de este brochure inmobiliario.
[image_1, image_2, ...]
```

### `response_format` JSON schema

```js
{
  type: "json_schema",
  json_schema: {
    name: "brochure_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["extracted", "confidence", "warnings"],
      properties: {
        extracted: {
          type: "object",
          additionalProperties: false,
          required: ["priceUsd", "areaM2", "district", "propertyType", "yearEntrega", "monthEntrega"],
          properties: {
            priceUsd: { type: ["number", "null"] },
            priceOriginal: { type: ["string", "null"] },
            priceCurrency: { type: ["string", "null"], enum: ["USD", "PEN", null] },
            areaM2: { type: ["number", "null"] },
            bedrooms: { type: ["integer", "null"] },
            bathrooms: { type: ["integer", "null"] },
            district: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            propertyType: {
              type: ["string", "null"],
              enum: ["departamento", "casa", "terreno", "oficina", "local",
                     "cochera", "deposito", "habitacion", "edificio", "quinta", null]
            },
            yearEntrega: { type: ["integer", "null"] },
            monthEntrega: { type: ["integer", "null"] },
            plusvaliaInmediataUsd: { type: ["number", "null"] },
            developer: { type: ["string", "null"] },
            projectName: { type: ["string", "null"] },
            tipoCambio: { type: ["number", "null"] }
          }
        },
        confidence: {
          type: "object",
          // por simplicidad: cada campo en `extracted` puede tener su nivel
          additionalProperties: { type: "string", enum: ["high", "medium", "low"] }
        },
        warnings: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  }
}
```

Con `strict: true`, OpenAI **garantiza** que la respuesta es JSON válido cumpliendo el schema. No hay que validar nosotros.

---

## UX: preview antes de aplicar

Después del upload, NO mandamos directo a la calculadora. Hay un **preview con edición**:

```
┌──────────────────────────────────────────────────────────────┐
│  📄 Edificio Arena Larco — Constructora ABC                  │
│  Datos extraídos del brochure (revisá antes de continuar):  │
│                                                              │
│  Precio          USD 220,000      ✓ alta confianza          │
│  Área            80 m²            ✓ alta confianza          │
│  Distrito        Miraflores       ✓ alta confianza          │
│  Tipo            Departamento     ✓ alta confianza          │
│  Dormitorios     2                ✓ alta confianza          │
│  Año entrega     2028 (julio)     ⚠ inferido de "Q3 2028"  │
│  Plusvalía       USD 0            ⚠ no encontrado          │
│  Dirección       Av. Larco 1234   ✓ alta confianza          │
│                                                              │
│  ⚠ Advertencias:                                             │
│  • El brochure menciona "desde USD 220,000" — usé el mínimo │
│  • Fecha "Q3 2028" interpretada como julio                  │
│                                                              │
│  [✏️ Editar manualmente]  [✗ Descartar]  [✓ Usar y calcular]│
└──────────────────────────────────────────────────────────────┘
```

**Por qué este step matters:**
1. Transparencia — el user ve exactamente qué entendió la IA
2. Corrección — campos con confianza media/baja se editan en línea
3. Confianza del producto — si el user descubre que la IA se equivocó después de calcular, pierde fe en toda la herramienta

Al hacer "Usar y calcular", los datos se inyectan en la calculadora pre-llenada y el user ve el veredicto.

---

## Costos y modelo de uso

### Costo por extracción

**Caso típico** (brochure de 4-8 páginas, texto extraíble):

| Componente | Tokens | Precio gpt-4o-mini |
|---|---|---|
| System prompt | ~400 | $0.060 / 1M input |
| Texto del PDF | ~5000 | $0.060 / 1M input |
| Schema response | ~300 (output) | $0.240 / 1M output |
| **Total por PDF** | ~5400 in + 380 out | **~$0.0010 / extracción** |

**Caso vision** (PDF escaneado, sin texto extraíble):

| Componente | Tokens | Precio gpt-4o-mini |
|---|---|---|
| Cada imagen 1024x1024 | ~1100 | $0.060 / 1M |
| 6 páginas como imagen | ~6600 | — |
| Schema response | ~380 | $0.240 / 1M |
| **Total por PDF** | ~7000 in + 380 out | **~$0.0014 / extracción** |

**Caso GPT-4o** (modelo full, para PDFs muy complejos):

| Componente | Tokens | Precio gpt-4o |
|---|---|---|
| Inputs combinados | ~6000 | $2.50 / 1M |
| Output | ~500 | $10.00 / 1M |
| **Total por PDF** | — | **~$0.020 / extracción** |

### Proyecciones mensuales

| Volumen | gpt-4o-mini | gpt-4o |
|---|---|---|
| 100 uploads/mes | $0.10 | $2 |
| 1,000 uploads/mes | $1 | $20 |
| 10,000 uploads/mes | $10 | $200 |

**A volumen razonable, el costo es trivial** (< $20/mes para 1k uploads). Solo justifica preocupación si el negocio escala a 100k+ uploads/mes.

### Modelos de uso (decisión de negocio)

| Modelo | Pro | Contra |
|---|---|---|
| **Free para todos** | Máxima adopción | Riesgo de abuso (subir cualquier cosa) |
| **Gated por login** | Limita abuso, captura emails | Fricción extra |
| **Free hasta N/mes, después paga** | Modelo freemium | Complejidad billing |
| **Cobra por uso** ($1-5 por extracción + análisis) | Cubre costo + margen | Pueden buscar alternativa gratis |

**Default recomendado**: free + gated (login simple por email). Captura leads sin desincentivar uso. Implementar paywall después si el volumen lo justifica.

---

## Manejo de errores y edge cases

| Caso | Comportamiento |
|---|---|
| PDF > 5 MB | 400 con mensaje claro "comprimilo" |
| MIME no es PDF | 400 "solo PDFs" |
| PDF corrupto / no parseable | 422 "no se pudo leer el PDF" |
| PDF en blanco / sin texto | Intentar vision; si igual no extrae nada → 422 "no encontramos datos" |
| PDF de >15 páginas | Truncar a primeras 15 + warning |
| OpenAI API timeout (>30s) | 504, sugerir reintento |
| OpenAI API rate limit | 429, esperar exponencial backoff (3 reintentos) |
| OpenAI API down | 503, mostrar mensaje + ofrecer rellenar manualmente |
| Datos extraídos inverosímiles (precio < $1k o > $50M, área < 1m² o > 10000m²) | Devolver con warning, NO bloquear (a veces son verdad — ej. terrenos grandes) |
| Brochure no es de Perú (otro país) | Devolver datos pero warning "el sistema está optimizado para Perú" |
| Brochure es de un proyecto comercial / hotel / hospital | Devolver datos pero warning "el valuador está pensado para residencial" |
| Multi-idioma (brochure inglés) | Funciona OK, GPT-4o-mini es multilingüe |

### Idempotencia / cache

Para no pagar dos veces por el mismo PDF si el user lo sube de nuevo:

- Calcular **hash MD5 del PDF** al upload
- Cachear extracted JSON en una collection nueva `brochure_cache` con TTL de 30 días
- Si hash existe en cache, devolver cached + flag `from_cache: true`

Ahorro estimado: 20-40% en bills de OpenAI si el user re-sube el mismo PDF para iterar.

---

## Plan de implementación

| Paso | Archivo | Esfuerzo | Bloqueante |
|---|---|---|---|
| 1. Setup OpenAI: instalar SDK, agregar OPENAI_API_KEY a .env, doc del setup | package.json + .env.example | 30 min | — |
| 2. Crear `backend/extract.js`: función `extractBrochureFromPdf(buffer)` | backend/extract.js | 1.5 h | 1 |
| 3. Endpoint `POST /api/extract-brochure` con multer (max 5MB, PDF only) | backend/server.js | 45 min | 2 |
| 4. Cache con MD5 (collection `brochure_cache`, TTL 30 días) | backend/extract.js + db.js | 30 min | 3 |
| 5. Componente `<BrochureUpload />` con drag & drop + preview editable | frontend/src/components/BrochureUpload.jsx | 2 h | 3 |
| 6. Integración con la calculadora: botón "📄 Subir brochure" arriba del form, al confirmar pre-llena | frontend/src/App.jsx + versions/* | 1 h | 5 |
| 7. Manejo de errores en UI (toast con mensaje claro) | frontend | 30 min | 6 |
| 8. Testing E2E con 5-10 brochures reales (cada inmobiliaria distinta) | manual | 1 h | 7 |
| 9. Doc final del feature en `docs/upload-de-brochures.md` (mover desde planes-futuros) | docs/ | 30 min | 8 |

**Total**: ~8 horas + ~$1-5 en OpenAI tests.

### Fase 0 (antes de empezar): proof of concept

Antes de codear todo, **validar con 3-5 brochures reales** que el prompt + GPT-4o-mini + json_schema devuelven datos útiles. Costo: < $0.01. Tiempo: 1 hora.

Si el POC falla (datos inconsistentes, alucinaciones, etc.) hay que iterar el prompt o cambiar a GPT-4o antes de invertir las 8h.

---

## Seguridad y privacidad

### Datos sensibles

Los brochures pueden contener:
- Direcciones precisas (riesgo bajo — son públicas en el aviso)
- Nombre del comprador (si es brochure personalizado — riesgo alto)
- Información financiera del comprador (en cotizaciones específicas)

### Mitigaciones

1. **No almacenar el PDF original** después de procesar (borrar de /tmp inmediatamente).
2. **Cachear solo el JSON extracted**, no el PDF.
3. **Pasar a OpenAI solo lo necesario** (texto del PDF), no el archivo completo si es texto-based.
4. **Disclaimer en UI**: "El brochure se procesa con OpenAI. No subas documentos con datos personales sensibles."
5. **Opt-out**: si el user no quiere subir a OpenAI, dejar el flow manual de tipear los datos.

### OpenAI data usage

OpenAI no usa los datos de API para entrenar modelos por default (a partir de 2023). Cumple GDPR y similares. Pero igual: **mejor no enviar PII innecesaria**.

Si el negocio escala y el compliance es crítico: considerar **deployment en Azure OpenAI** (mismas APIs, datos quedan en infra Azure de la empresa).

---

## Decisiones pendientes

### 1) Modelo default

| Opción | Cuándo |
|---|---|
| `gpt-4o-mini` | Default — 90% de los casos |
| `gpt-4o` | Cuando mini falla — fallback automático |
| `gpt-4o` | Always — cuando el negocio prioriza precisión sobre costo |

**Recomendado**: empezar con `gpt-4o-mini` siempre. Si en testing vemos > 10% de extractions fallidas, agregar fallback automático a `gpt-4o`.

### 2) Authentication

| Opción | Pro | Contra |
|---|---|---|
| Sin login (público) | Máxima fricción cero | Anyone can spam |
| Email-only (sin password) | Captura leads | Friction baja |
| Login completo | Tracking, billing | Más friction |

**Recomendado**: arrancar **sin login**, agregar rate limit por IP (5 uploads/hora). Login solo cuando justifique.

### 3) Cache TTL

- 7 días: el contenido del brochure raramente cambia
- 30 días: razonable, ahorra costo si user itera
- 90 días: muy largo, brochures pueden actualizar precios

**Recomendado**: **30 días**.

### 4) Limit de tamaño

- 5 MB: cubre 95% de brochures
- 10 MB: cubre 99% pero requiere más memoria server
- 20 MB: brochures con muchas fotos hi-res

**Recomendado**: **5 MB** para v1. Subir si recibimos muchos errores.

### 5) UX del preview

- **Inline en la calculadora** (los campos extraídos aparecen ya en el form, con badges)
- **Modal aparte** (review → confirm → cierra modal → form pre-llenado)
- **Side-by-side** (PDF preview + form a la derecha)

**Recomendado**: **modal aparte** para v1. Más explícito el "estos son los datos extraídos, ¿confirmás?".

---

## Riesgos y limitaciones

1. **Hallucinations**: el modelo puede inventar datos si el brochure es ambiguo. Mitigación: `strict: true` en json_schema + reglas explícitas en prompt + warnings + preview obligatorio.

2. **Brochures con tablas complejas multi-modelo** (ej. "1 dorm: $180k, 2 dorm: $220k, 3 dorm: $310k"): el modelo puede elegir cualquiera. Mitigación: regla en prompt "el modelo más común o destacado", warning explícito, preview editable.

3. **Inmobiliarias raras / formato muy custom**: si el brochure es solo imágenes de planos sin precio textual, la extracción falla. Mitigación: caer al flow manual con mensaje claro.

4. **PDFs encriptados / protegidos**: pdf-parse falla. Detectar y devolver error claro.

5. **Costos descontrolados si hay abuso**: usuario sube 1000 PDFs de prueba. Mitigación: rate limit + cache.

6. **Cambio de pricing de OpenAI**: precios pueden subir. Mitigación: monitorear gasto mensual, alertar si pasa N% del budget.

7. **OpenAI down**: API no disponible. Mitigación: feature flag para deshabilitar el upload + mostrar form manual.

8. **Calidad variable de extracción por inmobiliaria**: las inmobiliarias top tienen brochures bien estructurados → extracción 95%+. Las informales tienen brochures hechos en Word → extracción 60%. Aceptable, pero hay que medirlo.

---

## Métricas de éxito

A los 30 días post-launch:

| Métrica | Target |
|---|---|
| % de uploads que terminan en "Calcular" (no descartados) | ≥ 70% |
| % de campos pre-llenados que el user EDITA antes de calcular | ≤ 25% (señal de buena precisión) |
| % de extractions con `confidence: high` en priceUsd | ≥ 90% |
| Tiempo promedio "subir PDF" → "veredicto en pantalla" | ≤ 30 segundos |
| Costo promedio por upload | ≤ $0.005 |
| % de uploads que disparan error 422 (no se pudo extraer) | ≤ 10% |
| NPS o feedback cualitativo del feature | ≥ 8/10 |

Si el % de edits es > 40%, el modelo no entiende los brochures bien — re-iterar prompt o cambiar a gpt-4o.

Si el % de error 422 es > 20%, hay un patrón de brochures que no manejamos — investigar y ajustar.

---

## Referencias

- [OpenAI Structured Outputs (json_schema)](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI Vision API](https://platform.openai.com/docs/guides/vision)
- [pdf-parse npm](https://www.npmjs.com/package/pdf-parse)
- [multer npm](https://www.npmjs.com/package/multer)
- `docs/calculadora-inversion.md` — feature destino donde aterrizan los datos extraídos
- `docs/planes-futuros/historial-de-precios.md` — propuesta complementaria que se beneficia de tener más volumen de proyectos analizados
