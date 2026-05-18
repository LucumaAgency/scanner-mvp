/**
 * Lógica de la calculadora de inversión inmobiliaria.
 * Replica las fórmulas del Excel "Calculadora v8.0" (Vive 360 Inmobiliaria).
 *
 * El cálculo es PURO (no toca Mongo): recibe un objeto JS, devuelve otro.
 * La moneda base de cómputo es USD; si se pasa `tipoCambio` se devuelven
 * también los equivalentes en S/. (el Excel es S/.-nativo, USD derivado).
 *
 * Cambios v6.0 → v8.0 implementados (ver docs/cambios-excel-v8.md):
 *   ② Inflación acumulada = BCRP histórico real + π proyectada para años futuros
 *   ③ Regla automática de `g` desde CAGR de zona (tasaGRecomendada)
 *   ④ Tabla de proyección año a año (proyeccion_anual[])
 *   ⑤ Soporte S/. ↔ USD vía tipoCambio
 *   ⑥ plusvalía inmediata + su % derivado
 *   ⑦ Veredicto colapsado a 3 estados consistentes con la matemática
 *   ⑧ Flags cumple_benchmark por escenario
 */

const SCENARIOS = ["pesimista", "promedio", "optimista"];

// ── Tabla de inflación anual Perú — BCRP / INEI (hoja "📈 Inflación BCRP") ──
// Año → inflación anual (decimal). Es el dato real ya transcurrido.
const INFLACION_BCRP = {
  2010: 0.0229, 2011: 0.0474, 2012: 0.0265, 2013: 0.028,
  2014: 0.033, 2015: 0.044, 2016: 0.032, 2017: 0.014,
  2018: 0.022, 2019: 0.019, 2020: 0.020, 2021: 0.064,
  2022: 0.085, 2023: 0.032, 2024: 0.020, 2025: 0.0151,
};
const BCRP_ANIOS = Object.keys(INFLACION_BCRP).map(Number);
const BCRP_ULTIMO_ANIO = Math.max(...BCRP_ANIOS);
// Promedio últimos 10 años (2016–2025) — usado por la regla de `g`.
const INFLACION_PROM_BCRP =
  [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
    .reduce((s, y) => s + INFLACION_BCRP[y], 0) / 10;

function round(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function pct(n, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return null;
  return round(n * 100, decimals);
}

// Anualidad creciente: suma de rentas que crecen a tasa `g` durante `n` años.
// Si g ≈ 0 cae a `pago × n`.
function anualidadCreciente(pagoInicial, tasaCrecimiento, años) {
  if (años <= 0) return 0;
  if (Math.abs(tasaCrecimiento) < 1e-9) return pagoInicial * años;
  return (pagoInicial * (Math.pow(1 + tasaCrecimiento, años) - 1)) / tasaCrecimiento;
}

/**
 * ⑤ Inflación acumulada del período (Excel v8.0, celda B59).
 *
 * Para los años del horizonte que ya transcurrieron y están en la tabla BCRP
 * usa la inflación REAL acumulada; para los años aún futuros compone π.
 *
 *   factor_hist = Π (1 + infl_real[y])  para y ∈ [compra, compra+n−1] con dato
 *   años_futuros = n − (años con dato histórico)
 *   inflación_acum = factor_hist · (1+π)^años_futuros − 1
 *
 * Nota: el Excel original usa `(end − últimoAñoHist)` para los años futuros, lo
 * que sobre-cuenta para compras posteriores a 2025. Acá usamos `n − histCount`,
 * que es la intención correcta y coincide con el Excel para todos los casos
 * realistas (compras 2010–2026). Fallback: (1+π)^n − 1.
 */
function inflacionAcumulada(yearCompra, n, pi) {
  const startY = Math.round(yearCompra);
  const N = Math.round(n);
  if (!Number.isFinite(startY) || !Number.isFinite(N) || N <= 0) {
    return Math.pow(1 + pi, n) - 1;
  }
  const endY = startY + N - 1;
  let factor = 1;
  let histCount = 0;
  for (let y = startY; y <= endY; y++) {
    if (INFLACION_BCRP[y] != null) {
      factor *= 1 + INFLACION_BCRP[y];
      histCount++;
    }
  }
  const añosFuturos = Math.max(0, N - histCount);
  const acum = factor * Math.pow(1 + pi, añosFuturos) - 1;
  return Number.isFinite(acum) ? acum : Math.pow(1 + pi, n) - 1;
}

/**
 * ③ Regla automática de `g` (Excel v8.0, hoja "📊 Plusvalía Zona", celda B20).
 * Devuelve la tasa recomendada + CAGR histórico + explicación. La `g` final
 * sigue siendo input manual de la calculadora (esto es solo referencia).
 */
export function tasaGRecomendada({
  ubicacion,
  anioInicial,
  precioInicial,
  anioActual,
  precioActual,
} = {}) {
  const tieneData =
    Number.isFinite(anioInicial) &&
    Number.isFinite(precioInicial) &&
    Number.isFinite(anioActual) &&
    Number.isFinite(precioActual) &&
    precioInicial > 0 &&
    anioActual > anioInicial;

  const cagr = tieneData
    ? Math.pow(precioActual / precioInicial, 1 / (anioActual - anioInicial)) - 1
    : null;

  const esLima = String(ubicacion || "").trim().toUpperCase() === "LIMA";

  let g;
  let regla;
  if (tieneData) {
    if (esLima) {
      g = Math.min(cagr, INFLACION_PROM_BCRP + 0.02);
      regla = "Lima con dato propio: mínimo entre CAGR histórico y (inflación promedio + 2%)";
    } else if (cagr >= 0.07) {
      g = 0.05;
      regla = "Provincia: CAGR ≥ 7% → se usa 5% conservador";
    } else {
      g = cagr;
      regla = "Provincia: CAGR < 7% → se usa el CAGR histórico";
    }
  } else if (esLima) {
    g = INFLACION_PROM_BCRP;
    regla = "Lima sin dato propio: se usa la inflación promedio BCRP como piso";
  } else {
    g = 0.05;
    regla = "Provincia sin dato propio: se usa 5% conservador";
  }

  return {
    ok: true,
    g_recomendada: round(g, 4),
    g_recomendada_pct: pct(g, 2),
    cagr: cagr == null ? null : round(cagr, 4),
    cagr_pct: cagr == null ? null : pct(cagr, 2),
    infl_prom_bcrp: round(INFLACION_PROM_BCRP, 4),
    infl_prom_bcrp_pct: pct(INFLACION_PROM_BCRP, 2),
    es_lima: esLima,
    tiene_dato_propio: tieneData,
    regla,
  };
}

const BENCHMARKS = {
  cap_rate: 5, // % bruto, > 5% Lima comercial
  net_cap_rate: 4, // % neto, > 4%
  per: 18, // años, < 18 (bruto)
  per_neto: 15, // años, < 15 (neto)
};

function ratiosPorEscenario(input, escenario) {
  const alq = input.alquilerPorM2Mes[escenario];
  const vac = input.vacancia[escenario];
  const gop = input.gastosOperativosUsd[escenario];

  const ingBrutoMensual = alq * input.areaM2;
  const ingBrutoAnual = ingBrutoMensual * 12;
  const ingNetoAnual = ingBrutoAnual * (1 - vac) - gop;

  const capRate = pct(ingBrutoAnual / input.priceUsd, 2);
  const netCapRate = pct(ingNetoAnual / input.priceUsd, 2);
  const per = ingBrutoAnual > 0 ? round(input.priceUsd / ingBrutoAnual, 1) : null;
  const perNeto = ingNetoAnual > 0 ? round(input.priceUsd / ingNetoAnual, 1) : null;

  return {
    ing_bruto_mensual_usd: round(ingBrutoMensual),
    ing_bruto_anual_usd: round(ingBrutoAnual),
    ing_neto_anual_usd: round(ingNetoAnual),
    cap_rate: capRate,
    net_cap_rate: netCapRate,
    per,
    per_neto: perNeto,
    // ⑧ Cumple benchmark de referencia (Excel columna ✓).
    cumple: {
      cap_rate: capRate != null && capRate > BENCHMARKS.cap_rate,
      net_cap_rate: netCapRate != null && netCapRate > BENCHMARKS.net_cap_rate,
      per: per != null && per < BENCHMARKS.per,
      per_neto: perNeto != null && perNeto < BENCHMARKS.per_neto,
    },
  };
}

/**
 * ④ Tabla de proyección año a año (Excel v8.0, hoja "📊 Proyección Anual").
 * La renta crece con π (corrige el bug del Excel, que en la tabla anual usaba
 * g; el propio comentario del agregado B56 dice que debe crecer con π).
 */
function proyeccionAnual({ priceUsd, g, pi, n, anosSinRenta, ingNetoPromedio }) {
  const N = Math.min(Math.max(Math.round(n), 1), 30);
  const filas = [];
  let rentaAcum = 0;
  for (let a = 1; a <= N; a++) {
    const valor = priceUsd * Math.pow(1 + g, a);
    const renta =
      a <= anosSinRenta
        ? 0
        : ingNetoPromedio * Math.pow(1 + pi, a - anosSinRenta - 1);
    rentaAcum += renta;
    const plusPct = Math.pow(1 + g, a) - 1;
    const rentaPct = rentaAcum / priceUsd;
    filas.push({
      anio: a,
      valor_inmueble_usd: round(valor),
      renta_anual_neta_usd: round(renta),
      renta_acum_usd: round(rentaAcum),
      plusvalia_acum_pct: pct(plusPct),
      renta_acum_pct: pct(rentaPct),
      rentabilidad_total_pct: pct(plusPct + rentaPct),
      // Mirror del Excel: la tabla anual usa π simple (no histórico BCRP).
      inflacion_acum_pct: pct(Math.pow(1 + pi, a) - 1),
    });
  }
  return filas;
}

export function calcularInversion(input) {
  const {
    priceUsd,
    areaM2,
    plusvaliaInmediataUsd = 0,
    yearCompra,
    monthCompra,
    yearEntrega,
    monthEntrega,
    g, // plusvalía proyectada anual (0.05 = 5%)
    n, // horizonte años
    inflacion, // π anual (0.03 = 3%)
    tipoCambio, // S/. por USD (opcional, solo para mostrar equivalentes)
  } = input;

  const tc = Number.isFinite(tipoCambio) && tipoCambio > 0 ? tipoCambio : null;

  // ① Tiempos
  const mesesSinRenta = Math.max(
    0,
    (yearEntrega - yearCompra) * 12 + monthEntrega - monthCompra
  );
  const añosSinRenta = mesesSinRenta / 12;
  const añosConRenta = Math.max(0, n - añosSinRenta);

  // ② Ratios para los 3 escenarios
  const ratios = {};
  for (const esc of SCENARIOS) {
    ratios[esc] = ratiosPorEscenario(input, esc);
  }

  // ③ Proyección — escenario PROMEDIO para estimar rentas futuras
  const ingNetoPromedio = ratios.promedio.ing_neto_anual_usd;

  const valorEntrega = priceUsd + plusvaliaInmediataUsd;
  const plusvaliaInmediataPct = priceUsd > 0 ? plusvaliaInmediataUsd / priceUsd : 0;
  const valorFinal = priceUsd * Math.pow(1 + g, n);
  const plusvaliaAcumPct = Math.pow(1 + g, n) - 1;
  const plusvaliaUsd = valorFinal - priceUsd;

  // Rentas acumuladas creciendo con inflación (conservador — no con g).
  const rentaAcumUsd = anualidadCreciente(ingNetoPromedio, inflacion, añosConRenta);
  const rentaAcumPct = rentaAcumUsd / priceUsd;

  const rentabilidadTotalPct = plusvaliaAcumPct + rentaAcumPct;

  // ⑤ Inflación acumulada: BCRP histórico real + π futura.
  const inflacionAcumPct = inflacionAcumulada(yearCompra, n, inflacion);

  const inversionAjustadaUsd = priceUsd * (1 + inflacionAcumPct);
  const valorTotalObtenidoUsd = valorFinal + rentaAcumUsd;
  const gananciaRealUsd = valorTotalObtenidoUsd - inversionAjustadaUsd;
  const moic = valorTotalObtenidoUsd / priceUsd;

  // ⑦ Veredicto — 3 estados consistentes con la matemática.
  // rentabilidad_total > inflación_acum  ⟺  ganancia_real > 0  (MOIC = 1 + rentab).
  // El caso "ganancia nominal" del v6.0 era inalcanzable: se elimina.
  const EPS = 1e-9;
  let verdict;
  let verdictTone;
  if (rentabilidadTotalPct > inflacionAcumPct + EPS) {
    verdict = "GANANCIA_REAL";
    verdictTone = "green";
  } else if (Math.abs(rentabilidadTotalPct - inflacionAcumPct) <= EPS) {
    verdict = "NEUTRO";
    verdictTone = "amber";
  } else {
    verdict = "PERDIDA_REAL";
    verdictTone = "red";
  }

  const proyeccion = {
    valor_entrega_usd: round(valorEntrega),
    valor_final_usd: round(valorFinal),
    plusvalia_inmediata_usd: round(plusvaliaInmediataUsd),
    plusvalia_inmediata_pct: pct(plusvaliaInmediataPct),
    plusvalia_acum_pct: pct(plusvaliaAcumPct),
    plusvalia_usd: round(plusvaliaUsd),
    renta_acum_usd: round(rentaAcumUsd),
    renta_acum_pct: pct(rentaAcumPct),
    rentabilidad_total_pct: pct(rentabilidadTotalPct),
    inflacion_acum_pct: pct(inflacionAcumPct),
    inversion_ajustada_usd: round(inversionAjustadaUsd),
    valor_total_obtenido_usd: round(valorTotalObtenidoUsd),
    ganancia_real_usd: round(gananciaRealUsd),
    moic: round(moic, 2),
  };

  // Equivalentes en S/. de las cifras clave (si hay tipo de cambio).
  const soles = tc
    ? {
        tipo_cambio: tc,
        precio_compra: round(priceUsd * tc),
        valor_entrega: round(valorEntrega * tc),
        valor_final: round(valorFinal * tc),
        renta_acum: round(rentaAcumUsd * tc),
        valor_total_obtenido: round(valorTotalObtenidoUsd * tc),
        inversion_ajustada: round(inversionAjustadaUsd * tc),
        ganancia_real: round(gananciaRealUsd * tc),
      }
    : null;

  return {
    ok: true,
    input: {
      priceUsd,
      areaM2,
      plusvaliaInmediataUsd,
      yearCompra,
      monthCompra,
      yearEntrega,
      monthEntrega,
      g: pct(g, 2),
      n,
      inflacion: pct(inflacion, 2),
      tipoCambio: tc,
    },
    tiempos: {
      meses_sin_renta: round(mesesSinRenta, 0),
      años_sin_renta: round(añosSinRenta, 2),
      años_con_renta: round(añosConRenta, 2),
    },
    ratios,
    benchmarks: BENCHMARKS,
    proyeccion,
    proyeccion_anual: proyeccionAnual({
      priceUsd,
      g,
      pi: inflacion,
      n,
      anosSinRenta: añosSinRenta,
      ingNetoPromedio,
    }),
    soles,
    verdict,
    verdict_tone: verdictTone,
  };
}

/**
 * Validación de inputs — devuelve array de errores (vacío = OK).
 */
export function validateCalculatorInput(body) {
  const errs = [];
  const fnum = (v) => Number.isFinite(Number(v));
  const fint = (v) => Number.isInteger(Number(v));

  if (!fnum(body.priceUsd) || body.priceUsd < 1000) errs.push("priceUsd inválido");
  if (!fnum(body.areaM2) || body.areaM2 < 10) errs.push("areaM2 inválido");
  if (!fnum(body.plusvaliaInmediataUsd) || body.plusvaliaInmediataUsd < 0)
    errs.push("plusvaliaInmediataUsd inválido");

  if (!fint(body.yearCompra) || body.yearCompra < 2000 || body.yearCompra > 2100)
    errs.push("yearCompra fuera de rango");
  if (!fint(body.monthCompra) || body.monthCompra < 1 || body.monthCompra > 12)
    errs.push("monthCompra fuera de rango");
  if (!fint(body.yearEntrega) || body.yearEntrega < 2000 || body.yearEntrega > 2100)
    errs.push("yearEntrega fuera de rango");
  if (!fint(body.monthEntrega) || body.monthEntrega < 1 || body.monthEntrega > 12)
    errs.push("monthEntrega fuera de rango");

  for (const esc of SCENARIOS) {
    if (!fnum(body.alquilerPorM2Mes?.[esc]) || body.alquilerPorM2Mes[esc] < 0)
      errs.push(`alquilerPorM2Mes.${esc} inválido`);
    if (!fnum(body.vacancia?.[esc]) || body.vacancia[esc] < 0 || body.vacancia[esc] >= 1)
      errs.push(`vacancia.${esc} inválida (debe estar en [0,1))`);
    if (!fnum(body.gastosOperativosUsd?.[esc]) || body.gastosOperativosUsd[esc] < 0)
      errs.push(`gastosOperativosUsd.${esc} inválido`);
  }

  if (!fnum(body.g) || body.g < -0.5 || body.g > 1)
    errs.push("g (plusvalía) fuera de rango razonable [-0.5, 1]");
  if (!fnum(body.n) || body.n < 1 || body.n > 50)
    errs.push("n (horizonte) fuera de rango (1-50 años)");
  if (!fnum(body.inflacion) || body.inflacion < 0 || body.inflacion > 0.5)
    errs.push("inflacion fuera de rango [0, 0.5]");

  // tipoCambio es opcional; solo se valida si viene.
  if (body.tipoCambio != null && body.tipoCambio !== "") {
    if (!fnum(body.tipoCambio) || body.tipoCambio < 1 || body.tipoCambio > 10)
      errs.push("tipoCambio fuera de rango (1-10 S/./USD)");
  }

  return errs;
}

/**
 * Validación para la regla de `g` por CAGR (endpoint /api/tasa-g).
 * Todos los campos son opcionales — sin datos devuelve la regla "sin dato".
 */
export function validateTasaGInput(body) {
  const errs = [];
  const opt = (v) => v == null || v === "";
  const fnum = (v) => Number.isFinite(Number(v));
  for (const k of ["anioInicial", "precioInicial", "anioActual", "precioActual"]) {
    if (!opt(body?.[k]) && !fnum(body[k])) errs.push(`${k} inválido`);
  }
  return errs;
}
