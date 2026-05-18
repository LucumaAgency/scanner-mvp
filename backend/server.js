import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./db.js";
import { valuar, listDistricts } from "./valuator.js";
import {
  calcularInversion,
  validateCalculatorInput,
  tasaGRecomendada,
  validateTasaGInput,
} from "./calculator.js";
import { parseCopiaLiteral } from "./copiaLiteral.js";

// multer y el motor OCR son OPCIONALES: se cargan de forma perezosa para que
// el servidor arranque aunque esas dependencias no estén instaladas. Si faltan,
// /api/copia-literal responde 503 y el resto de la plataforma funciona normal.
let _upload;
async function getUpload() {
  if (_upload) return _upload; // solo se cachea el éxito
  try {
    const multer = (await import("multer")).default;
    _upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    });
  } catch (e) {
    // No se cachea el fallo: si luego instalas la dep, funciona sin reiniciar.
    console.error("multer no disponible:", e?.message);
    return null;
  }
  return _upload;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mongoConnected: app.locals.mongoConnected,
    mongoError: app.locals.mongoError,
    nodeVersion: process.version,
    env: {
      mongoUriSet: Boolean(process.env.MONGO_URI),
      mongoDb: process.env.MONGO_DB || "(default)",
      port: process.env.PORT || "(default 3000)",
    },
  })
);

app.get("/api/distritos", async (_req, res) => {
  try {
    const districts = await listDistricts();
    res.json({ districts, count: districts.length });
  } catch (e) {
    console.error("[/api/distritos] ERROR:", e?.message);
    console.error(e?.stack);
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

app.post("/api/valuar", async (req, res) => {
  const { district, propertyType, operation, area, bedrooms, priceUsd } = req.body || {};

  const errors = validate({ district, propertyType, operation, area, bedrooms, priceUsd });
  if (errors.length) return res.status(400).json({ errors });

  // priceUsd es opcional: si no se envía, devolvemos solo los percentiles
  // de mercado de la zona (sin veredicto).
  const priceProvided = priceUsd != null && priceUsd !== "";

  try {
    const result = await valuar({
      districtSlug: String(district).trim(),
      propertyType: String(propertyType).trim(),
      operation: String(operation || "venta").trim(),
      area: Number(area),
      bedrooms: Number(bedrooms),
      priceUsd: priceProvided ? Number(priceUsd) : null,
    });
    res.json(result);
  } catch (e) {
    console.error("[/api/valuar]", e);
    res.status(500).json({ error: "internal" });
  }
});

// Calculadora de inversión inmobiliaria — replica la lógica del Excel "Calculadora v6.0".
// Input: ver validateCalculatorInput en calculator.js.
// Output: ratios (3 escenarios) + proyección + veredicto.
app.post("/api/calcular", (req, res) => {
  const errors = validateCalculatorInput(req.body || {});
  if (errors.length) return res.status(400).json({ errors });

  try {
    const result = calcularInversion(req.body);
    res.json(result);
  } catch (e) {
    console.error("[/api/calcular]", e);
    res.status(500).json({ error: "internal" });
  }
});

// Regla automática de `g` (plusvalía) desde el CAGR histórico de la zona.
// Todos los inputs opcionales: sin datos devuelve la regla conservadora.
app.post("/api/tasa-g", (req, res) => {
  const errors = validateTasaGInput(req.body || {});
  if (errors.length) return res.status(400).json({ errors });

  try {
    const body = req.body || {};
    const num = (v) => (v == null || v === "" ? undefined : Number(v));
    const result = tasaGRecomendada({
      ubicacion: body.ubicacion,
      anioInicial: num(body.anioInicial),
      precioInicial: num(body.precioInicial),
      anioActual: num(body.anioActual),
      precioActual: num(body.precioActual),
    });
    res.json(result);
  } catch (e) {
    console.error("[/api/tasa-g]", e);
    res.status(500).json({ error: "internal" });
  }
});

// Subida OPCIONAL de la copia literal de SUNARP. El usuario ya llenó los datos
// a mano; esto solo agrega precisión a la plusvalía (g) leyendo el historial
// de transferencias. El PDF se procesa en RAM y se descarta; no se guarda PII.
app.post("/api/copia-literal", async (req, res) => {
  const upload = await getUpload();
  if (!upload) {
    return res.status(503).json({
      ok: false,
      error:
        "La lectura automática no está disponible en el servidor. Continúa ingresando la plusvalía a mano.",
    });
  }
  upload.single("file")(req, res, async (mErr) => {
    if (mErr) {
      const msg =
        mErr.code === "LIMIT_FILE_SIZE"
          ? "El archivo supera 15 MB."
          : "No se pudo recibir el archivo.";
      return res.status(400).json({ ok: false, error: msg });
    }
    const file = req.file;
    if (!file || !file.buffer?.length) {
      return res.status(400).json({ ok: false, error: "Adjunta el PDF en el campo 'file'." });
    }
    const esPdf =
      file.mimetype === "application/pdf" ||
      /\.pdf$/i.test(file.originalname || "");
    if (!esPdf) {
      return res.status(400).json({ ok: false, error: "Solo se acepta un PDF de copia literal." });
    }

    let buffer = file.buffer;
    try {
      const { ocrPdfBuffer } = await import("./ocr.js");
      const { text, pages } = await ocrPdfBuffer(buffer);
      const datos = parseCopiaLiteral(text);

      // Sugerencia de g desde el CAGR (regla Lima/provincia ya existente).
      let g_sugerida = null;
      if (datos.cagr?.ok) {
        g_sugerida = tasaGRecomendada({
          ubicacion: datos.es_lima ? "Lima" : datos.oficina_registral || "provincia",
          anioInicial: datos.cagr.anio_inicial,
          precioInicial: datos.cagr.precio_inicial,
          anioActual: datos.cagr.anio_final,
          precioActual: datos.cagr.precio_final,
        });
      }

      res.json({ ...datos, paginas_ocr: pages, g_sugerida });
    } catch (e) {
      if (e?.name === "OcrUnavailableError") {
        console.error("[/api/copia-literal] OCR no disponible:", e.message);
        return res.status(503).json({
          ok: false,
          error:
            "No pudimos leer el PDF automáticamente. Continúa ingresando la plusvalía a mano.",
        });
      }
      console.error("[/api/copia-literal]", e);
      return res.status(500).json({ ok: false, error: "internal" });
    } finally {
      // Descarta el PDF de memoria explícitamente.
      buffer = null;
      if (req.file) req.file.buffer = null;
    }
  });
});

const STATIC_DIR = path.resolve(__dirname, "../frontend/dist");
app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"), (err) => {
    if (err) res.status(404).send("Not built. Run: npm run build:frontend");
  });
});

// (#4) Tipos extendidos al set completo que detecta el scraper.
const VALID_PROPERTY_TYPES = [
  "departamento", "casa", "terreno", "oficina", "local",
  "cochera", "deposito", "habitacion", "edificio", "quinta",
];

const VALID_OPERATIONS = ["venta", "alquiler"];

function validate({ district, propertyType, operation, area, bedrooms, priceUsd }) {
  const errs = [];
  if (!district || typeof district !== "string") errs.push("district requerido");
  if (!propertyType || !VALID_PROPERTY_TYPES.includes(propertyType))
    errs.push(`propertyType inválido (válidos: ${VALID_PROPERTY_TYPES.join(", ")})`);
  if (operation != null && !VALID_OPERATIONS.includes(operation))
    errs.push(`operation inválida (venta|alquiler)`);
  const a = Number(area);
  if (!Number.isFinite(a) || a < 10 || a > 5000) errs.push("area fuera de rango (10-5000 m²)");
  const b = Number(bedrooms);
  if (!Number.isInteger(b) || b < 0 || b > 15) errs.push("bedrooms fuera de rango (0-15)");
  // priceUsd es opcional: solo se valida el rango si el usuario lo envió.
  // Min bajo a 100 USD: alquileres mensuales pueden ser de USD 200-3000.
  if (priceUsd != null && priceUsd !== "") {
    const p = Number(priceUsd);
    if (!Number.isFinite(p) || p < 100 || p > 50_000_000) errs.push("priceUsd fuera de rango (100-50M)");
  }
  return errs;
}

app.locals.mongoConnected = false;
app.locals.mongoError = null;

(async () => {
  try {
    await connect();
    app.locals.mongoConnected = true;
    console.log("Mongo conectado OK");
  } catch (e) {
    app.locals.mongoError = e?.message || String(e);
    console.error("WARNING: Mongo no conectado al arrancar:", e?.message);
    console.error(e?.stack);
    // No process.exit — dejamos el server vivo para que /api/health responda
    // y /api/distritos devuelva el mensaje real en JSON
  }
  app.listen(PORT, () => console.log(`Valuador escuchando en :${PORT}`));
})();
