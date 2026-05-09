import { getListings, getDistricts } from "./db.js";

const VALID_OPERATIONS = new Set(["venta", "alquiler"]);

const PROJECTION = {
  _id: 0,
  price_usd_per_m2: 1,
  area_total_m2: 1,
  bedrooms: 1,
};

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const k = (sorted.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

export async function valuar({
  districtSlug,
  propertyType,
  operation,
  area,
  bedrooms,
  priceUsd,
}) {
  const op = VALID_OPERATIONS.has(operation) ? operation : "venta";

  // (#5) Validar el distrito contra el catálogo `districts` antes de query.
  const districtsCol = getDistricts();
  const district = await districtsCol.findOne(
    { slug: districtSlug },
    { projection: { name: 1, slug: 1 } }
  );

  if (!district) {
    return {
      ok: false,
      reason: "distrito_invalido",
      message: `Distrito '${districtSlug}' no está en el catálogo. Pedí la lista en /api/distritos.`,
    };
  }

  const col = getListings();

  const baseFilter = {
    operation: op,
    property_type: propertyType,
    "address.district": district.name,
    active: true,
    // (#1) Solo comparables con ubicación verificada por polígono.
    location_quality: { $in: ["ok", "neighborhood"] },
    // Filtro adicional: descartar outliers absurdos del precio/m².
    price_usd_per_m2: { $ne: null, $gt: 100, $lt: 20000 },
  };

  const docs = await col.find(baseFilter).project(PROJECTION).toArray();

  if (docs.length < 5) {
    return {
      ok: false,
      reason: "pocos_comparables",
      message: `Solo ${docs.length} comparables en ${district.name} para ${propertyType} (${op}). Falta scrapear más datos.`,
      district: district.name,
      district_slug: district.slug,
      property_type: propertyType,
      operation: op,
      total_in_district: docs.length,
    };
  }

  const similar = docs.filter(
    (d) =>
      d.area_total_m2 &&
      d.area_total_m2 >= 0.75 * area &&
      d.area_total_m2 <= 1.25 * area &&
      d.bedrooms != null &&
      Math.abs(d.bedrooms - bedrooms) <= 1
  );

  let upms;
  let strategy;
  let nUsed;

  if (similar.length >= 5) {
    upms = similar.map((d) => d.price_usd_per_m2);
    strategy = "similares";
    nUsed = similar.length;
  } else {
    upms = docs.map((d) => d.price_usd_per_m2);
    strategy = "distrito_completo";
    nUsed = upms.length;
  }

  const p25 = percentile(upms, 0.25);
  const p50 = percentile(upms, 0.5);
  const p75 = percentile(upms, 0.75);

  const upmInput = priceUsd / area;
  const diffPct = ((upmInput - p50) / p50) * 100;

  let verdict;
  if (upmInput < p25) verdict = "BAJO_MERCADO";
  else if (upmInput > p75) verdict = "SOBRE_MERCADO";
  else verdict = "DENTRO_RANGO";

  return {
    ok: true,
    district: district.name,
    district_slug: district.slug,
    property_type: propertyType,
    operation: op,
    input: {
      area,
      bedrooms,
      price_usd: priceUsd,
      price_usd_per_m2: round(upmInput),
    },
    strategy,
    n_comps: nUsed,
    n_similar: similar.length,
    n_district: docs.length,
    market: { p25: round(p25), p50: round(p50), p75: round(p75) },
    verdict,
    diff_pct: round(diffPct, 1),
  };
}

// (#2) Lista distritos desde la colección `districts`, no desde un distinct sobre listings.
// Devuelve objetos {slug, name, stats} ordenados por inventario activo descendente.
export async function listDistricts() {
  const col = getDistricts();
  const docs = await col
    .find({ "stats.active_listings": { $gt: 0 } })
    .project({
      _id: 0,
      slug: 1,
      name: 1,
      province: 1,
      "stats.active_listings": 1,
      "stats.venta_count": 1,
      "stats.alquiler_count": 1,
      "stats.median_price_usd_per_m2_venta": 1,
    })
    .sort({ "stats.active_listings": -1 })
    .toArray();
  return docs;
}

function round(n, decimals = 2) {
  if (n == null) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}
