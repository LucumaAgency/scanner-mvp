/**
 * Tests del parser de Copia Literal. Usan el texto real de la copia literal
 * de muestra (partida 11010149, SUNARP Pucallpa) más un caso sintético con
 * dos compraventas para verificar el CAGR.  npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseCopiaLiteral, calcularCagr } from "./copiaLiteral.js";

// Fragmento textual real (tal como sale del OCR de la página C00002).
const REAL = `
ZONA REGISTRAL Nº VI. SEDE PUCALLPA
OFICINA REGISTRAL PUCALLPA
Nº Partida: 11010149
PART. ELECT. No 11010149
Solicitud N° : 2023 - 6932420
Fecha Impresión :  08/11/2023 19:40:44

REGISTRO DE PROPIEDAD INMUEBLE
RUBRO : TITULOS DE DOMINIO
C00002
VENDEDOR : Eleazar VELASQUEZ NAVARRO, divorciado
COMPRA VENTA
A favor de NORA ROJAS DE PANDURO, casada con WILIAN ARMANDO PANDURO BANDA,
por el precio de  S/. 2,000.00, pagados con dinero en efectivo.- Asi consta de la
ESCRITURA PÚBLICA de fecha 08/09/2005 otorgada ante el Notario Público de
Pucallpa Dra. MARIANELLA SUSANA PARRA MONTERO.- El título fue presentado el
12/09/2005 a las 08:58:40 AM horas, bajo el N° 2005-00011424 del Tomo Diario 825.
`;

test("extrae partida, oficina y fecha de extracción", () => {
  const r = parseCopiaLiteral(REAL);
  assert.equal(r.partida, "11010149");
  assert.match(r.oficina_registral || "", /PUCALLPA/i);
  assert.equal(r.es_lima, false);
  assert.equal(r.fecha_extraccion, "2023-11-08");
  assert.equal(r.vigente, false); // impresa en 2023, > 90 días
});

test("extrae la compraventa con monto y fecha de escritura", () => {
  const r = parseCopiaLiteral(REAL);
  const cv = r.transferencias.find((x) => x.acto === "compraventa");
  assert.ok(cv, "debe detectar la compraventa");
  assert.equal(cv.es_mercado, true);
  assert.equal(cv.monto, 2000);
  assert.equal(cv.moneda, "PEN");
  assert.equal(cv.fecha, "2005-09-08");
  assert.equal(cv.fraccion, 1);
});

test("una sola compraventa → CAGR no calculable", () => {
  const r = parseCopiaLiteral(REAL);
  assert.equal(r.cagr.ok, false);
});

test("CAGR con dos compraventas a valor de mercado", () => {
  const texto = `
    Partida Registral N° : 11010149
    ZONA REGISTRAL LIMA OFICINA REGISTRAL LIMA
    Fecha Impresión : 10/05/2026 09:00:00
    C00001 COMPRA VENTA por el precio de S/. 80,000.00
    ESCRITURA PÚBLICA de fecha 15/03/2010 otorgada ante Notario.
    C00002 COMPRA VENTA por el precio de S/. 235,000.00
    ESCRITURA PÚBLICA de fecha 20/06/2024 otorgada ante Notario.
  `;
  const r = parseCopiaLiteral(texto);
  assert.equal(r.es_lima, true);
  assert.equal(r.transferencias.length, 2);
  assert.equal(r.cagr.ok, true);
  assert.equal(r.cagr.anio_inicial, 2010);
  assert.equal(r.cagr.precio_inicial, 80000);
  assert.equal(r.cagr.anio_final, 2024);
  assert.equal(r.cagr.precio_final, 235000);
  // (235000/80000)^(1/14)-1 ≈ 7.99%
  assert.ok(Math.abs(r.cagr.cagr_pct - 8.0) < 0.2, `cagr_pct=${r.cagr.cagr_pct}`);
  assert.equal(r.cagr.confiable, true);
});

test("excluye actos que no son de mercado (anticipo/herencia/donación)", () => {
  const texto = `
    Fecha Impresión : 10/05/2026 09:00:00
    C00001 ANTICIPO DE LEGITIMA a favor de su hijo, sin precio.
    ESCRITURA PÚBLICA de fecha 01/01/2012 otorgada ante Notario.
    C00002 SUCESION INTESTADA declarada el 02/02/2018.
    D00001 DONACION de fecha 03/03/2020.
  `;
  const r = parseCopiaLiteral(texto);
  for (const tr of r.transferencias) assert.equal(tr.es_mercado, false);
  assert.equal(r.cagr.ok, false);
});

test("transferencia parcial (acciones y derechos %) escala el monto", () => {
  const texto = `
    Fecha Impresión : 10/05/2026 09:00:00
    C00001 COMPRA VENTA de las acciones y derechos equivalentes al 50%
    por el precio de S/. 50,000.00 ESCRITURA PÚBLICA de fecha 10/01/2015.
    C00002 COMPRA VENTA por el precio de S/. 220,000.00
    ESCRITURA PÚBLICA de fecha 10/01/2023.
  `;
  const r = parseCopiaLiteral(texto);
  const parcial = r.transferencias[0];
  assert.equal(parcial.fraccion, 0.5);
  // 50,000 / 0.5 = 100,000 como valor del 100%
  assert.equal(r.cagr.precio_inicial, 100000);
  assert.equal(r.cagr.confiable, false); // fracción != 1
});

test("detecta cargas/gravámenes (hipoteca) y ausencia", () => {
  const con = parseCopiaLiteral(
    "RUBRO : CARGAS Y GRAVAMENES D00001 HIPOTECA a favor del Banco por S/. 90,000."
  );
  assert.equal(con.cargas_gravamenes.tiene_cargas, true);
  assert.ok(con.cargas_gravamenes.tipos.includes("hipoteca"));

  const sin = parseCopiaLiteral("CARGAS Y GRAVAMENES\nNINGUNO.");
  assert.equal(sin.cargas_gravamenes.tiene_cargas, false);
});

test("normalización de montos con separadores", () => {
  // "2.000,00" (formato alterno) y "1,250,000.50" (miles US).
  const a = parseCopiaLiteral(
    "Fecha Impresión : 10/05/2026 09:00:00 C00001 COMPRA VENTA por el precio de S/. 2.000,00 ESCRITURA PÚBLICA de fecha 01/01/2020."
  );
  assert.equal(a.transferencias[0].monto, 2000);
  const b = parseCopiaLiteral(
    "Fecha Impresión : 10/05/2026 09:00:00 C00001 COMPRA VENTA por el precio de US$ 1,250,000.50 ESCRITURA PÚBLICA de fecha 01/01/2020."
  );
  assert.equal(b.transferencias[0].monto, 1250000.5);
  assert.equal(b.transferencias[0].moneda, "USD");
});

// Texto OCR REAL (tesseract) de la partida 11010149 — condensado pero fiel a
// los puntos difíciles: "_S/.", "S/. ... Nuevos Soles", "SI. ... SOLES",
// "Escritura Pública N” 43 de fecha", aporte de capital (no es mercado),
// y códigos de asiento ilegibles (Co0002, Conoo4, Coooos).
const OCR_REAL = `
ZONA REGISTRAL N* VI. SEDE PUCALLPA
OFICINA REGISTRAL PUCALLPA
SUPERINTENDENCIA NACIONAL N* Partida: 11010149
Fecha Impresión :  08/11/2023 19:40:44
RUBRO : TITULOS DE DOMINIO
Co0001 DERECHO DE PROPIEDAD El (los) poseedor (es) ... Inscripción de oficio,
según D. Leg N” 667.- El título fue presentado el 25/02/2005 a las 08:35:23 AM.
RUBRO : TITULOS DE DOMINIO
Co0002 VENDEDOR : Eleazar VELASQUEZ NAVARRO, divorciado
COMPRA VENTA A favor de NORA ROJAS DE PANDURO, casada con WILIAN ARMANDO
PANDURO BANDA, por el precio de _S/. 2,000.00, pagados con dinero en efectivo.- Asi
consta de la ESCRITURA PÚBLICA de fecha 08/09/2005 otorgada ante el Notario.
El título fue presentado el 12/09/2005 a las 08:58:40 AM.
RUBRO : TITULOS DE DOMINIO
Co00o1 VENDEDOR : Willian Armando PANDURO BANDA, casado con Nora ROJAS DE PANDURO
COMPRA VENTA A favor de VLADIMIR JESÚS GUERRA RETAMOZO, soltero, por el precio de
S/. 10,000.00 Nuevos Soles, que son pagados al contado. Así consta de la
Escritura Pública de fecha 27/09/2005 otorgada ante la Notario.
El título fue presentado el 01/12/2005 a las 11:58:05 AM.
RUBRO : TITULOS DE DOMINIO
Conoo4 VENDEDOR: VLADIMIR JESUS GUERRA RETAMOZO
COMPRA VENTA: A favor de DEYSI JENNY CORDOVA OROZ, soltera, con D.N.I N* 45955089,
ha adquirido el derecho de propiedad del inmueble registrado en la presente partida,
por el precio de SI. 192,000.00 SOLES, totalmente cancelados, en virtud a la compra
venta. Así consta en la Escritura Pública N” 43 de fecha 12/01/2021, otorgada ante notario.
El titulo fue presentado el 13/01/2021 a las 12:48:33 PM.
RUBRO: TITULOS DE DOMINIO
Coooos TRANSFERENCIA POR APORTE DE CAPITAL: VIVE 360 INMOBILIARIA S.A.C., con
R.U.C. N* 20608026046, inscrita en la Partida Electrónica N* 14685775, ha adquirido
el derecho de propiedad ... valorizado en S/. 192,000 (CIENTO NOVENTA Y DOS MIL),
en mérito al Aporte de Capital. Así consta de la escritura pública N* 1095 de fecha
27/07/2021. El título fue presentado el 02/08/2021 a las 08:17:46 AM.
`;

test("OCR real de la partida 11010149: 3 compraventas + aporte excluido", () => {
  const r = parseCopiaLiteral(OCR_REAL);
  assert.equal(r.partida, "11010149");
  assert.equal(r.oficina_registral, "PUCALLPA");
  assert.equal(r.es_lima, false);

  const cv = r.transferencias.filter((x) => x.acto === "compraventa");
  assert.equal(cv.length, 3, "deben detectarse 3 compraventas");
  const montos = cv.map((x) => x.monto).sort((a, b) => a - b);
  assert.deepEqual(montos, [2000, 10000, 192000]);

  const aporte = r.transferencias.find((x) => x.acto === "aporte");
  assert.ok(aporte, "el aporte de capital se detecta");
  assert.equal(aporte.es_mercado, false);

  // CAGR: primera compraventa de mercado (2005, S/.2,000) → última (2021, S/.192,000)
  assert.equal(r.cagr.ok, true);
  assert.equal(r.cagr.anio_inicial, 2005);
  assert.equal(r.cagr.precio_inicial, 2000);
  assert.equal(r.cagr.anio_final, 2021);
  assert.equal(r.cagr.precio_final, 192000);
  // ~33%/año es implausible → debe marcarse poco confiable (subvaluación 2005).
  assert.equal(r.cagr.confiable, false);
  assert.match(r.cagr.nota, /implausible|subvalua/i);
});

test("calcularCagr directo: insuficiente vs válido", () => {
  assert.equal(calcularCagr([]).ok, false);
  const r = calcularCagr([
    { es_mercado: true, monto: 100, anio: 2010, fraccion: 1, moneda: "PEN" },
    { es_mercado: true, monto: 200, anio: 2020, fraccion: 1, moneda: "PEN" },
  ]);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.cagr_pct - 7.2) < 0.2); // 2^(1/10)-1 ≈ 7.18%
});
