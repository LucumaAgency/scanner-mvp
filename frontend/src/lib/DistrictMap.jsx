import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Mapa de burbujas para elegir un distrito.
// - una burbuja por distrito en su centroide
// - tamaño  = inventario activo (cantidad de avisos de la operación elegida)
// - color   = precio mediano USD/m²: barato (verde) → medio (ámbar) → caro (rojo)
// Click en una burbuja = selecciona ese distrito.

const PERU_CENTER = [-9.19, -75.0];

// Ramp verde → ámbar → rojo.
const RAMP = [
  [0.0, [34, 197, 94]], // green-500
  [0.5, [245, 158, 11]], // amber-500
  [1.0, [239, 68, 68]], // red-500
];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function priceColor(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, c0] = RAMP[i - 1];
    const [t1, c1] = RAMP[i];
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0 || 1);
      return `rgb(${lerp(c0[0], c1[0], k)},${lerp(c0[1], c1[1], k)},${lerp(c0[2], c1[2], k)})`;
    }
  }
  return "rgb(239,68,68)";
}

// Ajusta el encuadre del mapa a las burbujas del NÚCLEO (donde está el grueso
// del inventario) cada vez que cambian. maxZoom controla qué tan cerca llega.
function FitToMarkers({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length) {
      map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 });
    }
  }, [map, bounds]);
  return null;
}

export default function DistrictMap({
  districts,
  operation,
  selectedSlug,
  onSelect,
}) {
  const isAlquiler = operation === "alquiler";

  const points = useMemo(() => {
    const out = [];
    for (const d of districts) {
      const coords = d.centroid?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const count = isAlquiler
        ? d.stats?.alquiler_count
        : d.stats?.venta_count;
      if (!count) continue;
      const price = isAlquiler
        ? d.stats?.median_price_usd_per_m2_alquiler
        : d.stats?.median_price_usd_per_m2_venta;
      out.push({
        slug: d.slug,
        name: d.name,
        department: d.department,
        lat: coords[1],
        lng: coords[0],
        count,
        price: price ?? null,
      });
    }
    return out;
  }, [districts, isAlquiler]);

  // Normalización para color (precio) y tamaño (inventario).
  const { maxCount, priceMin, priceSpan } = useMemo(() => {
    const counts = points.map((p) => p.count);
    const prices = points.map((p) => p.price).filter((v) => v != null);
    const pMin = prices.length ? Math.min(...prices) : 0;
    const pMax = prices.length ? Math.max(...prices) : 1;
    return {
      maxCount: counts.length ? Math.max(...counts) : 1,
      priceMin: pMin,
      priceSpan: pMax - pMin || 1,
    };
  }, [points]);

  // Encuadre inicial: solo los distritos que suman ~90% del inventario (los más
  // densos). Así el mapa abre zoomeado en Lima en vez de alejarse para mostrar
  // provincias con 1 aviso. Las demás burbujas igual se dibujan; el user puede
  // alejar/pan para verlas.
  const bounds = useMemo(() => {
    if (!points.length) return [];
    const total = points.reduce((s, p) => s + p.count, 0);
    const sorted = [...points].sort((a, b) => b.count - a.count);
    const core = [];
    let acc = 0;
    for (const p of sorted) {
      core.push([p.lat, p.lng]);
      acc += p.count;
      if (acc >= total * 0.9) break;
    }
    return core;
  }, [points]);

  const fmt = (n) =>
    n == null ? "-" : Number(n).toLocaleString("en-US", { maximumFractionDigits: isAlquiler ? 1 : 0 });

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200">
      <MapContainer
        center={PERU_CENTER}
        zoom={5}
        scrollWheelZoom={false}
        style={{ height: "340px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMarkers bounds={bounds} />
        {points.map((p) => {
          const selected = p.slug === selectedSlug;
          const radius = 6 + 22 * Math.sqrt(p.count / maxCount);
          const t = p.price == null ? 0.5 : (p.price - priceMin) / priceSpan;
          const fill = priceColor(t);
          return (
            <CircleMarker
              key={p.slug}
              center={[p.lat, p.lng]}
              radius={radius}
              pathOptions={{
                color: selected ? "#0f172a" : "#ffffff",
                weight: selected ? 3 : 1,
                fillColor: fill,
                fillOpacity: selected ? 0.95 : 0.7,
              }}
              eventHandlers={{ click: () => onSelect(p.slug) }}
            >
              <Tooltip direction="top" offset={[0, -2]}>
                <div className="text-xs">
                  <div className="font-semibold">{p.name}</div>
                  {p.department && (
                    <div className="text-slate-500">{p.department}</div>
                  )}
                  <div>
                    {p.count} {p.count === 1 ? "propiedad" : "propiedades"}
                  </div>
                  {p.price != null && (
                    <div>
                      Mediana: ${fmt(p.price)}/m²{isAlquiler ? "·mes" : ""}
                    </div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Leyenda */}
      <div className="absolute bottom-2 right-2 z-[1000] bg-white/90 backdrop-blur rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm pointer-events-none">
        <div className="flex items-center gap-1">
          <span>barato</span>
          <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, rgb(34,197,94), rgb(245,158,11), rgb(239,68,68))" }} />
          <span>caro</span>
        </div>
        <div className="mt-0.5">tamaño = nº de avisos</div>
      </div>
    </div>
  );
}
