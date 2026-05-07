import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./db.js";
import { valuar, listDistricts } from "./valuator.js";

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
  const { district, propertyType, area, bedrooms, priceUsd } = req.body || {};

  const errors = validate({ district, propertyType, area, bedrooms, priceUsd });
  if (errors.length) return res.status(400).json({ errors });

  try {
    const result = await valuar({
      district: String(district).trim(),
      propertyType: String(propertyType).trim(),
      area: Number(area),
      bedrooms: Number(bedrooms),
      priceUsd: Number(priceUsd),
    });
    res.json(result);
  } catch (e) {
    console.error("[/api/valuar]", e);
    res.status(500).json({ error: "internal" });
  }
});

const STATIC_DIR = path.resolve(__dirname, "../frontend/dist");
app.use(express.static(STATIC_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"), (err) => {
    if (err) res.status(404).send("Not built. Run: npm run build:frontend");
  });
});

function validate({ district, propertyType, area, bedrooms, priceUsd }) {
  const errs = [];
  if (!district || typeof district !== "string") errs.push("district requerido");
  if (!propertyType || !["departamento", "casa", "terreno", "oficina", "local"].includes(propertyType))
    errs.push("propertyType inválido");
  const a = Number(area);
  if (!Number.isFinite(a) || a < 10 || a > 5000) errs.push("area fuera de rango (10-5000 m²)");
  const b = Number(bedrooms);
  if (!Number.isInteger(b) || b < 0 || b > 15) errs.push("bedrooms fuera de rango (0-15)");
  const p = Number(priceUsd);
  if (!Number.isFinite(p) || p < 1000 || p > 50_000_000) errs.push("priceUsd fuera de rango");
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
