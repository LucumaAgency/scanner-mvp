/**
 * Tests de la lógica financiera (Excel v8.0). Sin dependencias externas:
 *   npm test     (node --test)
 *
 * El caso base reproduce el ejemplo del Excel (precio S/.170,000 / TC 3.4 =
 * USD 50,000) y verifica que los agregados coincidan con la hoja.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularInversion,
  tasaGRecomendada,
  validateCalculatorInput,
  validateTasaGInput,
} from "./calculator.js";

const TC = 3.4;

// Caso base = ejemplo del Excel v8.0 convertido a USD.
function baseInput(overrides = {}) {
  return {
    priceUsd: 170000 / TC, // 50,000
    areaM2: 32,
    plusvaliaInmediataUsd: 22000 / TC,
    yearCompra: 2026,
    monthCompra: 5,
    yearEntrega: 2028,
    monthEntrega: 7,
    alquilerPorM2Mes: { pesimista: 30 / TC, promedio: 40 / TC, optimista: 50 / TC },
    vacancia: { pesimista: 0.1, promedio: 0.08, optimista: 0.05 },
    gastosOperativosUsd: { pesimista: 1500 / TC, promedio: 1200 / TC, optimista: 900 / TC },
    g: 0.05,
    n: 10,
    inflacion: 0.035,
    tipoCambio: TC,
    ...overrides,
  };
}

const approx = (a, b, tol = 0.1) =>
  assert.ok(Math.abs(a - b) <= tol, `esperado ≈ ${b}, recibido ${a}`);

test("caso base coincide con el Excel v8.0", () => {
  const r = calcularInversion(baseInput());
  assert.equal(r.ok, true);
  approx(r.proyeccion.plusvalia_acum_pct, 62.9);
  approx(r.proyeccion.inflacion_acum_pct, 41.1);
  approx(r.proyeccion.rentabilidad_total_pct, 130.1);
  approx(r.proyeccion.moic, 2.3, 0.05);
  // Ganancia real en S/. del Excel: 151,378.
  approx(r.soles.ganancia_real, 151378, 50);
  assert.equal(r.verdict, "GANANCIA_REAL");
  assert.equal(r.verdict_tone, "green");
});

test("inflación acumulada: compra 2026 usa solo π proyectada", () => {
  const r = calcularInversion(baseInput({ yearCompra: 2026, n: 10 }));
  // (1.035)^10 - 1 = 0.41060 -> 41.1%
  approx(r.proyeccion.inflacion_acum_pct, 41.1);
});

test("inflación acumulada: compra 2018 usa BCRP histórico real", () => {
  const r = calcularInversion(baseInput({ yearCompra: 2018, n: 10 }));
  // Producto BCRP 2018–2025 × (1.035)^2 − 1 ≈ 40.4%
  approx(r.proyeccion.inflacion_acum_pct, 40.4);
});

test("inflación acumulada: compra futura no sobre-cuenta (n − histórico)", () => {
  const r = calcularInversion(baseInput({ yearCompra: 2030, n: 5 }));
  // Sin años históricos en [2030,2034] -> (1.035)^5 − 1 = 18.77%
  approx(r.proyeccion.inflacion_acum_pct, 18.8);
});

test("veredicto NEUTRO cuando rentabilidad = inflación", () => {
  // Sin rentas (alquiler/gastos/vac 0) y g = π => rentab_total == inflación_acum.
  const r = calcularInversion(
    baseInput({
      g: 0.03,
      inflacion: 0.03,
      yearCompra: 2026,
      plusvaliaInmediataUsd: 0,
      alquilerPorM2Mes: { pesimista: 0, promedio: 0, optimista: 0 },
      gastosOperativosUsd: { pesimista: 0, promedio: 0, optimista: 0 },
      vacancia: { pesimista: 0, promedio: 0, optimista: 0 },
    })
  );
  assert.equal(r.verdict, "NEUTRO");
  assert.equal(r.verdict_tone, "amber");
});

test("veredicto PERDIDA_REAL cuando la rentabilidad no cubre la inflación", () => {
  const r = calcularInversion(
    baseInput({
      g: 0,
      inflacion: 0.05,
      plusvaliaInmediataUsd: 0,
      alquilerPorM2Mes: { pesimista: 0.01, promedio: 0.01, optimista: 0.01 },
      gastosOperativosUsd: { pesimista: 0, promedio: 0, optimista: 0 },
      vacancia: { pesimista: 0, promedio: 0, optimista: 0 },
    })
  );
  assert.equal(r.verdict, "PERDIDA_REAL");
  assert.equal(r.verdict_tone, "red");
});

test("nunca devuelve el estado obsoleto GANANCIA_NOMINAL", () => {
  for (const g of [-0.2, 0, 0.05, 0.2]) {
    for (const inflacion of [0, 0.02, 0.05, 0.1]) {
      const r = calcularInversion(baseInput({ g, inflacion }));
      assert.notEqual(r.verdict, "GANANCIA_NOMINAL");
      assert.ok(["GANANCIA_REAL", "NEUTRO", "PERDIDA_REAL"].includes(r.verdict));
    }
  }
});

test("proyección año a año: $0 en preventa, renta crece luego", () => {
  const r = calcularInversion(baseInput());
  assert.equal(r.proyeccion_anual.length, 10);
  // años_sin_renta ≈ 2.17 → años 1 y 2 sin renta, año 3 con renta.
  assert.equal(r.proyeccion_anual[0].renta_anual_neta_usd, 0);
  assert.equal(r.proyeccion_anual[1].renta_anual_neta_usd, 0);
  assert.ok(r.proyeccion_anual[2].renta_anual_neta_usd > 0);
  // La renta crece año a año (con π).
  assert.ok(
    r.proyeccion_anual[3].renta_anual_neta_usd >
      r.proyeccion_anual[2].renta_anual_neta_usd
  );
  // El último año cierra con la plusvalía acumulada del agregado.
  approx(r.proyeccion_anual[9].plusvalia_acum_pct, r.proyeccion.plusvalia_acum_pct);
});

test("flags cumple/benchmark presentes por escenario", () => {
  const r = calcularInversion(baseInput());
  assert.equal(typeof r.ratios.promedio.cumple.cap_rate, "boolean");
  assert.equal(r.ratios.promedio.cumple.cap_rate, true);
  assert.deepEqual(Object.keys(r.benchmarks).sort(), [
    "cap_rate",
    "net_cap_rate",
    "per",
    "per_neto",
  ]);
});

test("bloque soles solo cuando hay tipo de cambio", () => {
  const conTc = calcularInversion(baseInput({ tipoCambio: 3.6 }));
  assert.equal(conTc.soles.tipo_cambio, 3.6);
  approx(conTc.soles.precio_compra, conTc.input.priceUsd * 3.6, 1);

  const sinTc = calcularInversion(baseInput({ tipoCambio: undefined }));
  assert.equal(sinTc.soles, null);
});

test("tasaGRecomendada — todas las ramas", () => {
  // Lima con dato: min(CAGR, infl_prom + 2%)
  const limaData = tasaGRecomendada({
    ubicacion: "Lima",
    anioInicial: 2019,
    precioInicial: 120000,
    anioActual: 2025,
    precioActual: 235000,
  });
  assert.equal(limaData.es_lima, true);
  assert.equal(limaData.tiene_dato_propio, true);
  approx(limaData.cagr_pct, 11.85, 0.1);
  approx(limaData.g_recomendada_pct, 5.23, 0.05);

  // Provincia con dato y CAGR ≥ 7% → 5%
  const provAlta = tasaGRecomendada({
    ubicacion: "Pucallpa",
    anioInicial: 2019,
    precioInicial: 120000,
    anioActual: 2025,
    precioActual: 235000,
  });
  assert.equal(provAlta.g_recomendada, 0.05);

  // Provincia con dato y CAGR < 7% → CAGR
  const provBaja = tasaGRecomendada({
    ubicacion: "Cusco",
    anioInicial: 2019,
    precioInicial: 100000,
    anioActual: 2025,
    precioActual: 110000,
  });
  assert.ok(provBaja.g_recomendada < 0.07);
  approx(provBaja.g_recomendada, provBaja.cagr, 0.001);

  // Lima sin dato → inflación promedio BCRP
  const limaSin = tasaGRecomendada({ ubicacion: "Lima" });
  assert.equal(limaSin.tiene_dato_propio, false);
  assert.equal(limaSin.g_recomendada, limaSin.infl_prom_bcrp);

  // Provincia sin dato → 5%
  const provSin = tasaGRecomendada({ ubicacion: "Tarapoto" });
  assert.equal(provSin.g_recomendada, 0.05);
});

test("validación de inputs", () => {
  assert.deepEqual(validateCalculatorInput(baseInput()), []);
  assert.ok(validateCalculatorInput({}).length > 0);

  // tipoCambio opcional: ausente OK, fuera de rango error.
  assert.deepEqual(validateCalculatorInput(baseInput({ tipoCambio: undefined })), []);
  assert.ok(
    validateCalculatorInput(baseInput({ tipoCambio: 99 })).some((e) =>
      e.includes("tipoCambio")
    )
  );

  // tasa-g: vacío OK, tipo inválido error.
  assert.deepEqual(validateTasaGInput({}), []);
  assert.ok(validateTasaGInput({ anioInicial: "abc" }).length > 0);
});
