/**
 * Lógica de la calculadora de inversión inmobiliaria.
 * Replica las fórmulas del Excel "Calculadora v6.0" pero en USD nativo.
 *
 * Inputs principales:
 *   - priceUsd: precio de compra
 *   - areaM2: área techada
 *   - plusvaliaInmediataUsd: diferencia precio lista − precio socio fundador
 *   - yearCompra, monthCompra, yearEntrega, monthEntrega
 *   - 3 escenarios (pesimista / promedio / optimista) para:
 *       alquilerPorM2Mes, vacancia, gastosOperativosUsd
 *   - Supuestos: g (plusvalía anual), n (horizonte años), inflacion (π)
 *
 * Output: ratios por escenario + proyección (basada en escenario promedio) + veredicto.
 */

const SCENARIOS = ["pesimista", "promedio", "optimista"];

function round(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function pct(n, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return null;
  return round(n * 100, decimals);
}

// Fórmula de anualidad creciente: suma de pagos que crecen a tasa `g` durante `n` años.
// Si g ≈ 0 cae a `pago × n`.
function anualidadCreciente(pagoInicial, tasaCrecimiento, años) {
  if (años <= 0) return 0;
  if (Math.abs(tasaCrecimiento) < 1e-9) return pagoInicial * años;
  return (pagoInicial * (Math.pow(1 + tasaCrecimiento, años) - 1)) / tasaCrecimiento;
}

function ratiosPorEscenario(input, escenario) {
  const alq = input.alquilerPorM2Mes[escenario];
  const vac = input.vacancia[escenario];
  const gop = input.gastosOperativosUsd[escenario];

  const ingBrutoMensual = alq * input.areaM2;
  const ingBrutoAnual = ingBrutoMensual * 12;
  const ingNetoAnual = ingBrutoAnual * (1 - vac) - gop;

  return {
    ing_bruto_mensual_usd: round(ingBrutoMensual),
    ing_bruto_anual_usd: round(ingBrutoAnual),
    ing_neto_anual_usd: round(ingNetoAnual),
    cap_rate: pct(ingBrutoAnual / input.priceUsd, 2),
    net_cap_rate: pct(ingNetoAnual / input.priceUsd, 2),
    per: ingBrutoAnual > 0 ? round(input.priceUsd / ingBrutoAnual, 1) : null,
    per_neto: ingNetoAnual > 0 ? round(input.priceUsd / ingNetoAnual, 1) : null,
  };
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
    g,        // plusvalía proyectada anual (0.05 = 5%)
    n,        // horizonte años
    inflacion // π anual (0.03 = 3%)
  } = input;

  // Tiempos
  const mesesSinRenta = Math.max(0, (yearEntrega - yearCompra) * 12 + monthEntrega - monthCompra);
  const añosSinRenta = mesesSinRenta / 12;
  const añosConRenta = Math.max(0, n - añosSinRenta);

  // Ratios para los 3 escenarios
  const ratios = {};
  for (const esc of SCENARIOS) {
    ratios[esc] = ratiosPorEscenario(input, esc);
  }

  // Proyección — usa el escenario PROMEDIO para estimar rentas futuras
  const ingNetoPromedio = ratios.promedio.ing_neto_anual_usd;

  const valorEntrega = priceUsd + plusvaliaInmediataUsd;
  const valorFinal = priceUsd * Math.pow(1 + g, n);
  const plusvaliaAcumPct = Math.pow(1 + g, n) - 1;
  const plusvaliaUsd = valorFinal - priceUsd;

  // Rentas acumuladas creciendo con inflación (conservador — no con plusvalía del inmueble).
  const rentaAcumUsd = anualidadCreciente(ingNetoPromedio, inflacion, añosConRenta);
  const rentaAcumPct = rentaAcumUsd / priceUsd;

  const rentabilidadTotalPct = plusvaliaAcumPct + rentaAcumPct;

  // Para compras desde 2026, usamos solo π proyectada (asumimos período 100% futuro).
  // Para compras anteriores el Excel mezcla histórico BCRP — lo simplificamos.
  const inflacionAcumPct = Math.pow(1 + inflacion, n) - 1;

  const inversionAjustadaUsd = priceUsd * (1 + inflacionAcumPct);
  const valorTotalObtenidoUsd = valorFinal + rentaAcumUsd;
  const gananciaRealUsd = valorTotalObtenidoUsd - inversionAjustadaUsd;
  const moic = valorTotalObtenidoUsd / priceUsd;

  // Veredicto
  let verdict;
  let verdictTone;
  if (rentabilidadTotalPct > inflacionAcumPct && gananciaRealUsd > 0) {
    verdict = "GANANCIA_REAL";
    verdictTone = "green";
  } else if (gananciaRealUsd > 0) {
    verdict = "GANANCIA_NOMINAL";
    verdictTone = "amber";
  } else {
    verdict = "PERDIDA_REAL";
    verdictTone = "red";
  }

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
    },
    tiempos: {
      meses_sin_renta: round(mesesSinRenta, 0),
      años_sin_renta: round(añosSinRenta, 2),
      años_con_renta: round(añosConRenta, 2),
    },
    ratios,
    proyeccion: {
      valor_entrega_usd: round(valorEntrega),
      valor_final_usd: round(valorFinal),
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
    },
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

  return errs;
}
