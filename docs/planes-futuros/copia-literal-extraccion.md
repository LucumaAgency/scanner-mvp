# Extracción de Copia Literal (SUNARP) → plusvalía histórica

> **Estado**: 📝 Diseño · pendiente decisión
> **Última actualización**: 2026-05-18
> **Owner**: por definir

Propuesta para que el usuario suba su **Copia / Certificado Literal de SUNARP**
(Registro de Propiedad Inmueble) y la plataforma extraiga datos registrales que
se usan en el análisis de inversión — en particular el **historial de
transferencias** para calcular el **CAGR de plusvalía** y alimentar la `g` de la
calculadora v8.0.

Visión: **"Subo la copia literal → la plataforma me dice la plusvalía histórica
real del inmueble y la mete sola en el análisis"**.

Es análogo a [`upload-de-brochures.md`](upload-de-brochures.md) pero con un
documento legal escaneado, no un brochure comercial.

---

## 1. Hallazgo técnico que condiciona el diseño

El PDF de muestra (`copia literal terreno.pdf`, partida 11010149, Zona Registral
VI Pucallpa, 7 páginas) tiene esta estructura:

| Página | Contenido | ¿Texto extraíble? |
|---|---|---|
| 1 | Carátula (títulos pendientes, mandato judicial, etc.) | Sí (overlay digital) |
| 2–7 | Cuerpo registral (rubros, asientos, titulares, montos) | **No** — son imágenes TIFF ~2480×3504 |

`pypdf` solo recupera el overlay digital: `Partida Registral N°: 11010149`,
`Solicitud N° : 2023-6932420`, `Fecha Impresión 08/11/2023`. **Todo el
contenido jurídico (asientos A0001, B0001, C0001…, titulares, montos, cargas) es
imagen escaneada.**

→ Conclusión: la extracción **no** puede ser parsing de texto. Necesita
**OCR o un modelo con visión**. Y la redacción de los asientos SUNARP es texto
legal corrido y variable ("...por contrato de compraventa de fecha ... el
precio pactado asciende a la suma de S/. ... que el vendedor declara haber
recibido..."), por lo que regex sobre OCR crudo es frágil. Recomendado:
**Claude API con visión + salida JSON estructurada (tool use / JSON schema)**.

---

## 2. Datos a extraer y para qué sirven en el análisis

| Dato | De dónde sale | Uso en la plataforma |
|---|---|---|
| **Fecha de extracción** | Pie / "Fecha Impresión" | Validez: SUNARP la da por 90 días. Marca el dato como fresco/vencido; sella el análisis con su fecha. |
| **N° de partida** | Encabezado de páginas | Identificador único del inmueble; dedupe; clave para verificar autenticidad. |
| **Cargas y gravámenes** | Rubro "Cargas y Gravámenes" (asientos D/ gravamen, hipotecas, embargos, servidumbres) | **Flag de riesgo en el veredicto**: un inmueble con hipoteca/embargo vigente no es comparable a uno saneado. Ajusta el mensaje ("⚠ tiene hipoteca inscrita") y puede degradar el veredicto. |
| **Titular actual** | Rubro "Títulos de dominio" / último asiento de propiedad | Confirma propiedad. ⚠ Dato personal (PII) — ver §7. |
| **Transferencias históricas**: monto + fecha + % transferido + tipo de acto | Asientos de compraventa / transferencia de dominio | **Lo central**: serie de precios → CAGR → alimenta `tasaGRecomendada()` / `g`. |

### Cómo se obtiene la plusvalía histórica (CAGR)

La lógica `tasaGRecomendada()` (calculator.js, ya implementada) espera
`anioInicial, precioInicial, anioActual, precioActual`. De los asientos:

1. Filtrar **solo transferencias a valor de mercado**: compraventa, dación en
   pago. **Excluir** herencia, anticipo de legítima, donación, adjudicación por
   división y partición, aporte — esos no reflejan precio de mercado.
2. Tomar la transferencia más antigua válida (P₀, año₀) y la más reciente
   (Pₙ, añoₙ).
3. Si el acto transfirió un **% parcial** (cuotas / "acciones y derechos"),
   escalar el monto al 100% del inmueble (`monto / fracción`).
4. **Normalizar moneda** (ver §5) — crítico para montos antiguos.
5. `CAGR = (Pₙ / P₀)^(1 / (añoₙ − año₀)) − 1`.
6. Pasar a la regla existente: Lima → `min(CAGR, inflación_prom + 2%)`;
   provincia → CAGR si <7%, 5% si ≥7%. Se autocompleta la `g` de la calculadora
   y el helper "Calcular la plusvalía anual con el histórico" deja de ser manual.

---

## 3. Flujo end-to-end

```
Usuario arrastra "copia literal.pdf"
        ↓
POST /api/copia-literal  (multipart, límite ~10MB, solo PDF)
        ↓
Backend: validar tipo/tamaño · render de páginas 2..N a imágenes (pdftoppm/sharp)
        ↓
Claude API (visión) con JSON schema estricto  →  JSON candidato + confianza
        ↓
Normalización + validación (partida, fechas coherentes, moneda, tipo de acto)
        ↓
Verificación de autenticidad (código verificación digital / QR vs SUNARP en línea)
        ↓
PREVIEW EDITABLE  ← el usuario confirma/corrige (nunca aplicar a ciegas)
        ↓
Persistir + feed: g (CAGR) → /api/calcular · cargas → flag en /api/valuar
```

## 4. Schema de salida (borrador)

```json
{
  "fecha_extraccion": "2023-11-08",
  "vigente": true,
  "partida": "11010149",
  "oficina_registral": "VI - Pucallpa",
  "titular_actual": [{ "nombre": "…", "tipo_doc": "DNI", "cuota": 1.0 }],
  "cargas_gravamenes": [
    { "asiento": "D00001", "tipo": "hipoteca", "vigente": true, "monto": 50000, "moneda": "PEN", "acreedor": "…" }
  ],
  "transferencias": [
    { "asiento": "C00001", "fecha": "2008-03-12", "acto": "compraventa",
      "monto": 35000, "moneda": "PEN", "fraccion": 1.0,
      "transferentes": ["…"], "adquirentes": ["…"], "es_mercado": true }
  ],
  "cagr": { "anio_inicial": 2008, "precio_inicial": 35000,
            "anio_final": 2021, "precio_final": 120000,
            "cagr_pct": 9.9, "moneda_base": "PEN_nominal", "confiable": false },
  "confianza": 0.0,
  "notas_extraccion": ["monto del asiento C0001 ilegible — estimado"]
}
```

## 5. Edge cases y por qué el CAGR es "referencial, no verdad"

- **Subvaluación**: en compraventas peruanas se suele declarar un precio menor
  al real para pagar menos alcabala/impuestos. El monto del asiento puede estar
  muy por debajo del valor real → CAGR distorsionado. **Mostrar siempre como
  referencia, permitir override manual.**
- **Monedas históricas**: Soles de Oro (hasta 1985), Intis (1985–1991), Nuevo
  Sol / Sol (1991+). Un asiento de 1990 en "I/." (intis) no es comparable a uno
  de 2021 en "S/." sin conversión. Normalizar a una base común (idealmente
  **USD del año vía TC histórico**, evita el problema de redenominaciones).
- **Actos no-mercado**: herencia, anticipo de legítima, donación, adjudicación,
  aporte de capital → excluir del CAGR (marcar `es_mercado: false`).
- **Transferencias parciales**: "compra de acciones y derechos" de un %; escalar
  al 100% o el CAGR queda mal.
- **Sin asientos de compraventa**: terrenos que solo tuvieron
  inmatriculación + herencias → no hay CAGR; caer al default conservador (la
  regla ya lo contempla: provincia sin dato = 5%).
- **OCR de montos**: cifras escritas en letras y números; baja confianza →
  forzar confirmación humana.
- **Autenticidad**: el PDF trae "Código de Verificación Digital"; un PDF
  adulterado es trivial. Validar contra SUNARP en línea antes de confiar.

## 6. Plan de implementación (MVP → completo)

| Fase | Alcance | Esfuerzo |
|---|---|---|
| **MVP** | Endpoint upload + render + Claude visión → JSON → **preview editable**; extrae partida, fecha, titular, cargas (flag), transferencias; CAGR marcado "referencial"; el usuario confirma y se autocompleta `g` | ~3–5 días |
| F2 | Normalización de moneda histórica (TC USD por año) + clasificación acto mercado/no-mercado robusta | ~2–3 días |
| F3 | Verificación de autenticidad vs SUNARP en línea; persistencia + dedupe por partida | ~2 días |
| F4 | Integrar carga/gravamen al veredicto del valuador (no solo mostrar) | ~1 día |

## 7. Seguridad y privacidad

- El titular y los intervinientes son **datos personales** (Ley 29733). No
  almacenar más de lo necesario; consentimiento explícito al subir; idealmente
  procesar y descartar el PDF, guardar solo los campos del análisis.
- El PDF puede contener domicilios/DNI → no loggear contenido crudo, no enviarlo
  a servicios sin acuerdo de tratamiento de datos.
- Borrado a pedido; retención corta del archivo original.

## 8. Estado de implementación — 2026-05-18 (MVP construido)

Decidido: **OCR en JavaScript** (sin binarios de sistema) y **sin persistir PII;
el PDF nunca toca disco**.

- `backend/copiaLiteral.js` — parser puro (texto OCR → datos). Extrae fecha de
  extracción + vigencia 90 días, partida, oficina, flag de cargas/gravámenes,
  transferencias (acto, fecha, monto, moneda, fracción) y CAGR de las
  compraventas a valor de mercado. **No extrae titular/DNI** (privacidad).
  Tests: `backend/copiaLiteral.test.js` (9 casos, usan el texto real de la copia
  de muestra). Total suite: **21/21**.
- `backend/ocr.js` — `pdfjs-dist` + `@napi-rs/canvas` (prebuilt, sin apt) +
  `tesseract.js` (WASM, español). Si falta alguna dep lanza
  `OcrUnavailableError` → el endpoint responde 503 y el usuario sigue a mano.
- `backend/server.js` — `POST /api/copia-literal` con `multer.memoryStorage()`
  (el PDF vive en RAM y se descarta en `finally`; nunca se escribe a disco).
  Devuelve los datos + `g_sugerida` (vía `tasaGRecomendada`). No persiste nada.
- Frontend — subida **opcional** en el `CagrHelper` (ruta `/`) y en el paso
  "ajustes" del wizard (`/version1`): preview con CAGR, aviso de cargas y botón
  "Usar X% como plusvalía". Si falla el OCR, mensaje para continuar manual.

**Notas de despliegue:**
- `deploy.sh` ya corre `npm install` en la raíz → instala las nuevas deps
  (`multer`, `pdfjs-dist`, `@napi-rs/canvas`, `tesseract.js`).
- `tesseract.js` baja `spa.traineddata` del CDN en el primer uso. Si el server
  no tiene salida a internet, vendorizar el archivo y setear `OCR_LANG_PATH`
  (y opcionalmente `OCR_LANG`). Sin eso, el OCR degrada con gracia (503).
- No fue posible probar OCR end-to-end en el entorno de desarrollo (sin red
  para tesseract.js); el parser y el CAGR sí están cubiertos por tests con el
  texto real del documento.

## 9. Decisiones pendientes

1. ¿Proveedor de visión? (Claude vs el GPT-4o ya propuesto para brochures —
   conviene **unificar un solo pipeline de extracción** para ambos documentos).
2. ¿Moneda base del CAGR: USD histórico (recomendado) o S/. real?
3. ¿Bloqueamos el análisis si hay carga/gravamen vigente o solo lo advertimos?
4. ¿Cuánta retención del PDF original (privacidad vs reproceso)?
5. ¿Verificación de autenticidad obligatoria o best-effort en el MVP?
