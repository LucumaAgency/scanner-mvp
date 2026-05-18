/**
 * Parser de Copia/Certificado Literal de SUNARP.
 *
 * Recibe el TEXTO ya extraído por OCR (ver ocr.js) y devuelve los datos que
 * usa el análisis de inversión:
 *   - fecha de extracción + vigencia (90 días)
 *   - número de partida y oficina registral
 *   - flag de cargas/gravámenes
 *   - transferencias históricas (monto, fecha, acto, fracción)
 *   - CAGR de plusvalía a partir de las compraventas a valor de mercado
 *
 * NO maneja datos personales: el titular/DNI no se extrae ni se persiste
 * (decisión de privacidad, Ley 29733). El PDF nunca se guarda (ver server.js).
 *
 * Es PURO (texto → objeto), por eso es testeable aislado (copiaLiteral.test.js).
 */

// Actos que reflejan precio de mercado (sirven para CAGR).
const ACTOS_MERCADO = ["compraventa", "dacion_en_pago"];

// Detección de tipo de acto por palabras clave (sobre texto OCR, tolerante).
const ACTO_PATTERNS = [
  { acto: "compraventa", re: /COMPRA\s*[-\s]*VENTA/i },
  { acto: "dacion_en_pago", re: /DACI[ÓO]N\s+EN\s+PAGO/i },
  { acto: "anticipo_legitima", re: /ANTICIPO\s+DE\s+LEG[ÍI]TIMA/i },
  { acto: "donacion", re: /DONACI[ÓO]N/i },
  { acto: "sucesion", re: /SUCESI[ÓO]N\s+INTESTADA|HERENCIA|TESTAMENTO/i },
  { acto: "adjudicacion", re: /ADJUDICACI[ÓO]N|DIVISI[ÓO]N\s+Y\s+PARTICI[ÓO]N/i },
  { acto: "aporte", re: /APORTE\b/i },
];

const ASIENTO_RE = /\b([A-D]\s?0{0,4}\d{1,5})\b/g;

function normalizarMonto(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\s/g, "");
  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");
  if (tienePunto && tieneComa) {
    // El último separador es el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (tieneComa) {
    // ",dd" al final = decimal; si no, separador de miles.
    s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function detectarMoneda(token) {
  const t = (token || "").toUpperCase().replace(/\s/g, "");
  if (/US\$|USD|D[ÓO]LAR/.test(t)) return "USD";
  if (/^I\/?\.?$|INTI/.test(t)) return "ITL"; // Intis (1985–1991)
  if (/ORO/.test(t)) return "SOL_ORO"; // Soles de Oro (hasta 1985)
  return "PEN"; // S/. nuevo sol / sol
}

function parseFecha(d, m, y) {
  const dd = Number(d), mm = Number(m), yy = Number(y);
  if (!yy || yy < 1900 || yy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31)
    return null;
  return { iso: `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, year: yy };
}

function buscarFechaActo(bloque) {
  // Prioridad: "ESCRITURA PÚBLICA de fecha DD/MM/YYYY"; fallback "presentado el …".
  const esc = bloque.match(/ESCRITURA\s+P[ÚU]BLICA\s+de\s+fecha\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (esc) return parseFecha(esc[1], esc[2], esc[3]);
  const pres = bloque.match(/present[ao]d[oa]\s+el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (pres) return parseFecha(pres[1], pres[2], pres[3]);
  const any = bloque.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return any ? parseFecha(any[1], any[2], any[3]) : null;
}

function buscarMonto(bloque) {
  // "por el precio de S/. 2,000.00"  (tolerante a ruido OCR en el símbolo)
  const re =
    /(?:por\s+el\s+precio\s+de|precio\s+pactado|suma\s+de|valor\s+de)\s*(US\$|S\s*\/?\s*\.?|S1\.?|SI\.?|I\s*\/?\s*\.?|\$)?\s*([\d.,]{2,})/i;
  const m = bloque.match(re);
  if (!m) return { monto: null, moneda: null };
  // Recorta separadores colgantes (ej. "2,000.00," por la coma siguiente).
  const limpio = m[2].replace(/^[.,]+|[.,]+$/g, "");
  return { monto: normalizarMonto(limpio), moneda: detectarMoneda(m[1]) };
}

function buscarFraccion(bloque) {
  // Transferencia parcial: "acciones y derechos" + porcentaje si aparece.
  if (!/acciones\s+y\s+derechos|cuota\s+ideal|al?[ií]cuota/i.test(bloque)) return 1;
  const pct = bloque.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (pct) {
    const f = Number(String(pct[1]).replace(",", ".")) / 100;
    if (f > 0 && f <= 1) return f;
  }
  const frac = bloque.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:parte|acciones)/i);
  if (frac && Number(frac[2])) {
    const f = Number(frac[1]) / Number(frac[2]);
    if (f > 0 && f <= 1) return f;
  }
  return 0.5; // parcial sin % legible → conservador, marca baja confianza
}

function detectarActo(bloque) {
  for (const { acto, re } of ACTO_PATTERNS) if (re.test(bloque)) return acto;
  return "otro";
}

/** Divide el texto OCR en bloques por asiento (C00001, B00002, D0001…). */
function partirEnAsientos(texto) {
  const idxs = [];
  let m;
  ASIENTO_RE.lastIndex = 0;
  while ((m = ASIENTO_RE.exec(texto))) {
    idxs.push({ asiento: m[1].replace(/\s/g, ""), pos: m.index });
  }
  const bloques = [];
  for (let i = 0; i < idxs.length; i++) {
    const ini = idxs[i].pos;
    const fin = i + 1 < idxs.length ? idxs[i + 1].pos : texto.length;
    bloques.push({ asiento: idxs[i].asiento, texto: texto.slice(ini, fin) });
  }
  return bloques;
}

function detectarCargas(texto) {
  const tieneRubro = /RUBRO\s*:?\s*(CARGAS\s+Y\s+GRAV[ÁA]MENES|GRAV[ÁA]MENES)/i.test(texto);
  const palabras = /\b(HIPOTECA|EMBARGO|MEDIDA\s+CAUTELAR|SERVIDUMBRE|USUFRUCTO|AFECTACI[ÓO]N)\b/i;
  // "NINGUNO" cerca del rubro de cargas = saneado.
  const sinCargas = /CARGAS\s+Y\s+GRAV[ÁA]MENES[\s\S]{0,120}?NINGUN[OA]/i.test(texto);
  const hay = (tieneRubro && !sinCargas) || (palabras.test(texto) && !sinCargas);
  const tipos = [];
  for (const k of ["HIPOTECA", "EMBARGO", "MEDIDA CAUTELAR", "SERVIDUMBRE", "USUFRUCTO"]) {
    if (new RegExp(k.replace(" ", "\\s+"), "i").test(texto)) tipos.push(k.toLowerCase());
  }
  return { tiene_cargas: hay, tipos };
}

/**
 * @param {string} texto  Texto OCR concatenado de todas las páginas.
 * @returns objeto con los datos del análisis (sin PII).
 */
export function parseCopiaLiteral(texto = "") {
  const t = String(texto).replace(/ /g, " ");

  const fImp = t.match(/Fecha\s+Impresi[óo]n\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const fechaExtraccion = fImp ? parseFecha(fImp[1], fImp[2], fImp[3]) : null;

  let vigente = null;
  if (fechaExtraccion) {
    const dias = (Date.now() - new Date(fechaExtraccion.iso).getTime()) / 86400000;
    vigente = dias <= 90;
  }

  const partidaM = t.match(/Partida(?:\s+Registral)?\s*N[°º:\s]*\s*([0-9]{5,})/i) ||
    t.match(/PART\.?\s*ELECT\.?\s*N[°ºo:\s]*\s*([0-9]{5,})/i);
  const partida = partidaM ? partidaM[1] : null;

  // "OFICINA REGISTRAL <CIUDAD>" trae la ciudad directa (la línea ZONA trae "SEDE").
  const ofM =
    t.match(/OFICINA\s+REGISTRAL\s+([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,})?)/i) ||
    t.match(/\b(LIMA|PUCALLPA|AREQUIPA|CUSCO|TRUJILLO|PIURA|CHICLAYO|ICA|TACNA|HUANCAYO|IQUITOS)\b/i);
  const oficina = ofM ? ofM[1].trim() : null;
  const esLima = /\bLIMA\b/i.test(oficina || "");

  const cargas = detectarCargas(t);

  const transferencias = [];
  for (const b of partirEnAsientos(t)) {
    const acto = detectarActo(b.texto);
    if (acto === "otro") continue;
    const { monto, moneda } = buscarMonto(b.texto);
    const fecha = buscarFechaActo(b.texto);
    const fraccion = buscarFraccion(b.texto);
    if (!fecha) continue;
    transferencias.push({
      asiento: b.asiento,
      acto,
      es_mercado: ACTOS_MERCADO.includes(acto),
      fecha: fecha.iso,
      anio: fecha.year,
      monto,
      moneda: monto ? moneda : null,
      fraccion,
    });
  }
  transferencias.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const cagr = calcularCagr(transferencias);

  return {
    ok: true,
    fecha_extraccion: fechaExtraccion?.iso || null,
    vigente,
    partida,
    oficina_registral: oficina,
    es_lima: esLima,
    cargas_gravamenes: cargas,
    transferencias,
    cagr,
  };
}

/** CAGR a partir de la primera y última transferencia a valor de mercado. */
export function calcularCagr(transferencias) {
  const mkt = transferencias.filter(
    (x) => x.es_mercado && x.monto > 0 && x.anio
  );
  if (mkt.length < 2) {
    return { ok: false, motivo: "menos_de_2_compraventas_con_monto" };
  }
  const p0 = mkt[0];
  const pn = mkt[mkt.length - 1];
  const anios = pn.anio - p0.anio;
  if (anios <= 0) return { ok: false, motivo: "fechas_no_crecientes" };

  // Escala por la fracción transferida (acciones y derechos).
  const v0 = p0.monto / (p0.fraccion || 1);
  const vn = pn.monto / (pn.fraccion || 1);
  const cagr = Math.pow(vn / v0, 1 / anios) - 1;

  // Confiable solo si misma moneda, post-1991 (sin reformas) y fracción completa.
  const confiable =
    p0.moneda === pn.moneda &&
    p0.moneda === "PEN" &&
    p0.anio >= 1991 &&
    p0.fraccion === 1 &&
    pn.fraccion === 1;

  return {
    ok: true,
    anio_inicial: p0.anio,
    precio_inicial: Math.round(v0),
    anio_final: pn.anio,
    precio_final: Math.round(vn),
    cagr,
    cagr_pct: Math.round(cagr * 1000) / 10,
    moneda: p0.moneda,
    confiable,
    nota: confiable
      ? "CAGR nominal — referencial (los montos registrales suelen estar subvaluados)."
      : "CAGR poco confiable: monedas distintas, montos pre-1991 o transferencia parcial. Úsalo solo como referencia.",
  };
}
