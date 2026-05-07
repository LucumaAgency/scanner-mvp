import { getListings } from "./db.js";

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

export async function valuar({ district, propertyType, area, bedrooms, priceUsd }) {
  const col = getListings();

  const baseFilter = {
    operation: "venta",
    property_type: propertyType,
    "address.district": district,
    active: true,
    price_usd_per_m2: { $ne: null },
  };

  const docs = await col.find(baseFilter).project(PROJECTION).toArray();

  if (docs.length < 5) {
    return {
      ok: false,
      reason: "pocos_comparables",
      message: `Solo ${docs.length} comparables en ${district} para ${propertyType}. Falta scrapear más datos.`,
      district,
      property_type: propertyType,
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
    district,
    property_type: propertyType,
    input: { area, bedrooms, price_usd: priceUsd, price_usd_per_m2: round(upmInput) },
    strategy,
    n_comps: nUsed,
    n_similar: similar.length,
    n_district: docs.length,
    market: { p25: round(p25), p50: round(p50), p75: round(p75) },
    verdict,
    diff_pct: round(diffPct, 1),
  };
}

export async function listDistricts() {
  const col = getListings();
  const raw = await col.distinct("address.district", {
    operation: "venta",
    active: true,
  });
  return raw
    .filter((d) => typeof d === "string" && d.trim().length > 0)
    .map((d) => d.trim())
    .sort((a, b) => a.localeCompare(b, "es"));
}

function round(n, decimals = 2) {
  if (n == null) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}
