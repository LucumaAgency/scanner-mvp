/**
 * Cliente compartido para todas las versiones de la calculadora.
 * Centraliza:
 *   - fetch al catálogo de distritos
 *   - fetch a /api/calcular
 *   - construcción de defaults inteligentes desde el distrito seleccionado
 *
 * Uso típico (dentro de un componente React):
 *   const { districts, loading } = useDistricts();
 *   const inputs = buildDefaults(district, priceUsd);
 *   const result = await calcular(payload);
 */

import { useEffect, useState } from "react";

export const PROPERTY_TYPES = [
  { value: "departamento", label: "Departamento", emoji: "🏢", hasBedrooms: true },
  { value: "casa", label: "Casa", emoji: "🏠", hasBedrooms: true },
  { value: "oficina", label: "Oficina", emoji: "💼", hasBedrooms: false },
  { value: "local", label: "Local comercial", emoji: "🏪", hasBedrooms: false },
  { value: "terreno", label: "Terreno", emoji: "🌳", hasBedrooms: false },
  { value: "cochera", label: "Cochera", emoji: "🚗", hasBedrooms: false },
  { value: "deposito", label: "Depósito", emoji: "📦", hasBedrooms: false },
];

/**
 * Hook: trae el catálogo de distritos del backend.
 */
export function useDistricts() {
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/distritos")
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts || []))
      .catch((e) => setError(e?.message || "Error cargando distritos"))
      .finally(() => setLoading(false));
  }, []);

  return { districts, loading, error };
}

/**
 * Construye un objeto de defaults para todos los inputs de la calculadora,
 * usando stats reales del distrito cuando están disponibles.
 */
export function buildDefaults(district, priceUsd, areaM2) {
  const stats = district?.stats || {};
  const today = new Date();

  const alqP25 = stats.p25_price_usd_per_m2_alquiler;
  const alqMed = stats.median_price_usd_per_m2_alquiler;
  const alqP75 = stats.p75_price_usd_per_m2_alquiler;

  return {
    priceUsd: priceUsd || 0,
    areaM2: areaM2 || 0,
    plusvaliaInmediataUsd: 0,
    yearCompra: today.getFullYear(),
    monthCompra: today.getMonth() + 1,
    yearEntrega: today.getFullYear() + 2,
    monthEntrega: 12,
    alquilerPorM2Mes: {
      pesimista: alqP25 ?? 10,
      promedio: alqMed ?? 15,
      optimista: alqP75 ?? 22,
    },
    vacancia: { pesimista: 0.10, promedio: 0.08, optimista: 0.05 },
    gastosOperativosUsd: {
      pesimista: Math.round((priceUsd || 0) * 0.006),
      promedio: Math.round((priceUsd || 0) * 0.004),
      optimista: Math.round((priceUsd || 0) * 0.003),
    },
    g: 0.05,
    n: 10,
    inflacion: 0.03,
  };
}

/**
 * POST /api/calcular — devuelve { ok, ratios, proyeccion, verdict, ... } o lanza Error.
 */
export async function calcular(payload) {
  const res = await fetch("/api/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.errors || [data.error || "Error"]).join(", "));
  }
  return data;
}

export const MONTHS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" }, { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" }, { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" }, { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" }, { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

export function fmt(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmt2(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
