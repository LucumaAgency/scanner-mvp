/**
 * Versión 1 — Wizard paso a paso, presentación tipo landing hero.
 *
 * Layout: hero a pantalla completa con foto de Lima como background.
 * Columna izquierda (al fondo): título Montserrat Bold + párrafo único.
 * Columna derecha: card del wizard en modo noche.
 *
 * Captura solo lo esencial — vacancia/gastos/π quedan con defaults ocultos.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  PROPERTY_TYPES,
  MONTHS,
  useDistricts,
  buildDefaults,
  calcular,
  fmt,
} from "../lib/calculatorApi.js";

const HERO_BG = "/background.jpg";

const VERSIONS = [
  { path: "/", label: "Original" },
  { path: "/version1", label: "v1 · Wizard" },
  { path: "/version2", label: "v2 · Tarjetas" },
  { path: "/version3", label: "v3 · Historia" },
];

const STEPS = [
  "distrito",
  "tipo",
  "tamano",
  "precio",
  "entrega",
  "alquiler",
  "horizonte",
  "resultado",
];

export default function VersionWizard() {
  const { districts, loading } = useDistricts();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    districtSlug: "",
    propertyType: "departamento",
    areaM2: "",
    bedrooms: "2",
    priceUsd: "",
    yearEntrega: new Date().getFullYear() + 2,
    monthEntrega: 12,
    alquilerUsdM2Mes: "",
    n: 10,
  });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const visibleDistricts = districts.filter((d) => d.stats?.venta_count > 0);
  const district = districts.find((d) => d.slug === data.districtSlug);
  const propertyTypeMeta = PROPERTY_TYPES.find((t) => t.value === data.propertyType);

  const suggestedAlquiler = useMemo(() => {
    if (data.alquilerUsdM2Mes) return Number(data.alquilerUsdM2Mes);
    return district?.stats?.median_price_usd_per_m2_alquiler ?? 15;
  }, [district, data.alquilerUsdM2Mes]);

  function set(key, value) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function calculate() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const today = new Date();
      const defaults = buildDefaults(district, Number(data.priceUsd), Number(data.areaM2));
      const med = Number(suggestedAlquiler);
      const payload = {
        ...defaults,
        priceUsd: Number(data.priceUsd),
        areaM2: Number(data.areaM2),
        yearCompra: today.getFullYear(),
        monthCompra: today.getMonth() + 1,
        yearEntrega: Number(data.yearEntrega),
        monthEntrega: Number(data.monthEntrega),
        n: Number(data.n),
        alquilerPorM2Mes: {
          pesimista: round(med * 0.85, 1),
          promedio: med,
          optimista: round(med * 1.15, 1),
        },
      };
      const res = await calcular(payload);
      setResult(res);
      next();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const currentStep = STEPS[step];

  return (
    <HeroLayout>
      <div className="bg-slate-900/95 backdrop-blur rounded-2xl shadow-2xl border border-white/10 p-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            Calculadora de inversión
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Paso {step + 1} de {STEPS.length} — sin tecnicismos
          </p>
        </div>

        <ProgressBar step={step} total={STEPS.length} />

        {currentStep === "distrito" && (
          <Step
            question="¿En qué distrito está la propiedad?"
            help="Empecemos por la ubicación. Buscá entre los distritos con ventas activas."
            canNext={!!data.districtSlug}
            onNext={next}
            backVisible={false}
          >
            <DistrictLiveSearch
              districts={visibleDistricts}
              selectedSlug={data.districtSlug}
              loading={loading}
              onSelect={(slug) => set("districtSlug", slug)}
            />
          </Step>
        )}

        {currentStep === "tipo" && (
          <Step
            question="¿Qué tipo de propiedad es?"
            help=""
            canNext={!!data.propertyType}
            onNext={next}
            onBack={back}
          >
            <div className="grid grid-cols-2 gap-3">
              {PROPERTY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("propertyType", t.value)}
                  className={`rounded-xl py-4 px-3 border-2 transition text-left ${
                    data.propertyType === t.value
                      ? "border-emerald-400 bg-emerald-400/10"
                      : "border-white/15 hover:border-white/40 bg-white/5"
                  }`}
                >
                  <div className="text-2xl">{t.emoji}</div>
                  <div className="font-medium text-sm mt-1 text-white">{t.label}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {currentStep === "tamano" && (
          <Step
            question="¿Qué tan grande es?"
            help={
              propertyTypeMeta?.hasBedrooms
                ? "Área en metros cuadrados (m²) y cuántos dormitorios tiene."
                : "Área en metros cuadrados (m²)."
            }
            canNext={Number(data.areaM2) >= 10}
            onNext={next}
            onBack={back}
          >
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-400">Área (m²)</label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={data.areaM2}
                  onChange={(e) => set("areaM2", e.target.value)}
                  className="input-night mt-1"
                  placeholder="80"
                  autoFocus
                />
              </div>
              {propertyTypeMeta?.hasBedrooms && (
                <div>
                  <label className="text-sm text-slate-400">Dormitorios</label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={data.bedrooms}
                    onChange={(e) => set("bedrooms", e.target.value)}
                    className="input-night mt-1"
                  />
                </div>
              )}
            </div>
          </Step>
        )}

        {currentStep === "precio" && (
          <Step
            question="¿Cuánto cuesta hoy?"
            help="El precio en dólares de la propiedad. Si está en S/., divídelo por el TC del día (~3.7)."
            canNext={Number(data.priceUsd) >= 1000}
            onNext={next}
            onBack={back}
          >
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">$</span>
              <input
                type="number"
                min="1000"
                value={data.priceUsd}
                onChange={(e) => set("priceUsd", e.target.value)}
                className="input-night pl-8"
                placeholder="220000"
                autoFocus
              />
            </div>
            {Number(data.priceUsd) > 0 && Number(data.areaM2) > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                ${fmt(Number(data.priceUsd) / Number(data.areaM2))}/m² ·
                {district?.stats?.median_price_usd_per_m2_venta && (
                  <span> mediana del distrito: ${fmt(district.stats.median_price_usd_per_m2_venta)}/m²</span>
                )}
              </p>
            )}
          </Step>
        )}

        {currentStep === "entrega" && (
          <Step
            question="¿Cuándo te entregan la propiedad?"
            help="Si ya está construida, pon mes y año actuales. Si es proyecto en obra, la fecha de entrega prometida."
            canNext={true}
            onNext={next}
            onBack={back}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-400">Mes</label>
                <select
                  value={data.monthEntrega}
                  onChange={(e) => set("monthEntrega", Number(e.target.value))}
                  className="input-night mt-1"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400">Año</label>
                <input
                  type="number"
                  min={new Date().getFullYear()}
                  max={new Date().getFullYear() + 10}
                  value={data.yearEntrega}
                  onChange={(e) => set("yearEntrega", e.target.value)}
                  className="input-night mt-1"
                />
              </div>
            </div>
          </Step>
        )}

        {currentStep === "alquiler" && (
          <Step
            question="¿A cuánto piensas alquilarla?"
            help={`En USD por m² por mes. ${
              district?.stats?.median_price_usd_per_m2_alquiler
                ? `En ${district.name} el promedio actual es $${district.stats.median_price_usd_per_m2_alquiler.toFixed(1)}/m²/mes.`
                : ""
            } Si no estás seguro, deja la sugerencia.`}
            canNext={Number(suggestedAlquiler) > 0}
            onNext={next}
            onBack={back}
          >
            <div className="space-y-3">
              <input
                type="range"
                min="2"
                max="50"
                step="0.5"
                value={suggestedAlquiler}
                onChange={(e) => set("alquilerUsdM2Mes", e.target.value)}
                className="w-full accent-emerald-400"
              />
              <div className="text-center">
                <span className="text-3xl font-bold text-white">${suggestedAlquiler}</span>
                <span className="text-sm text-slate-400 ml-1">/m²/mes</span>
              </div>
              {Number(data.areaM2) > 0 && (
                <p className="text-center text-sm text-slate-400">
                  ≈ ${fmt(suggestedAlquiler * Number(data.areaM2))}/mes en alquiler bruto
                </p>
              )}
            </div>
          </Step>
        )}

        {currentStep === "horizonte" && (
          <Step
            question="¿Cuántos años piensas tenerla?"
            help="El horizonte de tu inversión. La mayoría de inversores planea 10 años."
            canNext={true}
            onNext={calculate}
            onBack={back}
            nextLabel={submitting ? "Calculando..." : "Ver mi inversión"}
            nextDisabled={submitting}
          >
            <div className="space-y-3">
              <input
                type="range"
                min="3"
                max="20"
                value={data.n}
                onChange={(e) => set("n", e.target.value)}
                className="w-full accent-emerald-400"
              />
              <div className="text-center">
                <span className="text-3xl font-bold text-white">{data.n}</span>
                <span className="text-sm text-slate-400 ml-1">años</span>
              </div>
              <p className="text-center text-xs text-slate-500">
                Te entregan en {Number(data.yearEntrega)}, vendes en {Number(data.yearEntrega) + Number(data.n)}
              </p>
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </Step>
        )}

        {currentStep === "resultado" && result && (
          <ResultWizard result={result} district={district} onReset={() => { setStep(0); setResult(null); }} />
        )}
      </div>
    </HeroLayout>
  );
}

function HeroLayout({ children }) {
  const location = useLocation();
  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${HERO_BG}')` }}
        />
        {/* Overlay oscuro: más oscuro a la izquierda y abajo (donde va el texto) */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/85 via-black/55 to-black/30" />
      </div>

      {/* Contenido — 2 columnas en desktop, apiladas en mobile */}
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 px-4 sm:px-8 lg:px-16 py-12">
          <div className="max-w-7xl mx-auto h-full grid lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Columna izquierda — copy al FONDO */}
            <div className="flex flex-col justify-end min-h-[60vh] lg:min-h-[calc(100vh-200px)]">
              <div className="max-w-xl text-white space-y-4">
                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl leading-tight"
                  style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700 }}
                >
                  Conoce si tu inversión inmobiliaria tendrá un retorno de inversión inteligente
                </h1>
                <p className="text-lg text-white/80 leading-relaxed">
                  La diferencia entre invertir bien o mal son los datos. Comparamos
                  tu propiedad contra miles de avisos reales en Lima y proyectamos
                  tu retorno real.
                </p>
              </div>
            </div>

            {/* Columna derecha — wizard, centrado verticalmente */}
            <div className="flex items-center lg:pl-8">
              <div className="w-full">{children}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-4 sm:px-8 lg:px-16 pb-6">
          <div className="max-w-7xl mx-auto">
            <p className="text-xs text-white/60 mb-2">Compara versiones de UX:</p>
            <div className="flex flex-wrap gap-2">
              {VERSIONS.map((v) => {
                const active = location.pathname === v.path;
                return (
                  <Link
                    key={v.path}
                    to={v.path}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      active
                        ? "bg-white text-slate-900 border-white"
                        : "bg-white/10 text-white/90 border-white/30 hover:bg-white/20"
                    }`}
                  >
                    {v.label}
                  </Link>
                );
              })}
            </div>
            <p className="text-[10px] text-white/40 text-center mt-4">
              Datos de urbania.pe · solo referencial
            </p>
          </div>
        </footer>
      </div>

      <style>{`
        .input-night {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgb(51 65 85);
          color: white;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-size: 1.125rem;
        }
        .input-night::placeholder {
          color: rgb(100 116 139);
        }
        .input-night:focus {
          outline: none;
          border-color: rgb(52 211 153);
          box-shadow: 0 0 0 3px rgb(52 211 153 / 0.15);
        }
      `}</style>
    </div>
  );
}

function DistrictLiveSearch({ districts, selectedSlug, loading, onSelect }) {
  const [query, setQuery] = useState("");

  const selected = districts.find((d) => d.slug === selectedSlug);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? districts.filter((d) => d.name.toLowerCase().includes(q))
      : districts;
    return list.slice(0, 8); // Top 8 por inventario (ya vienen ordenados)
  }, [query, districts]);

  // Si ya hay seleccionado, mostrar chip + botón cambiar
  if (selected) {
    return (
      <div className="bg-emerald-400/10 border border-emerald-400/30 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-emerald-400 text-xs uppercase font-semibold tracking-wide">
            Distrito seleccionado
          </p>
          <p className="text-white text-lg font-medium mt-0.5">
            {selected.name}
          </p>
          <p className="text-slate-400 text-xs">
            {selected.stats.venta_count} propiedades en venta
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect("")}
          className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/20"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loading ? "Cargando..." : "Escribe el distrito..."}
        disabled={loading}
        className="input-night"
        autoFocus
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 px-2 py-3">
          Sin resultados para "{query}"
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5 bg-slate-800/50">
          {filtered.map((d) => (
            <li key={d.slug}>
              <button
                type="button"
                onClick={() => onSelect(d.slug)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-center justify-between"
              >
                <span className="text-white text-sm font-medium">{d.name}</span>
                <span className="text-slate-400 text-xs">
                  {d.stats.venta_count} {d.stats.venta_count === 1 ? "propiedad" : "props"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Step({ question, help, children, canNext, onNext, onBack, backVisible = true, nextLabel = "Siguiente", nextDisabled }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">{question}</h2>
        {help && <p className="text-sm text-slate-400 mt-1">{help}</p>}
      </div>
      {children}
      <div className="flex justify-between pt-4">
        {backVisible ? (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white"
          >
            ← Atrás
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext || nextDisabled}
          className="px-6 py-2 bg-emerald-400 text-slate-900 rounded-lg font-semibold hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ step, total }) {
  const pct = (step / (total - 1)) * 100;
  return (
    <div className="mb-8">
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResultWizard({ result, district, onReset }) {
  const { proyeccion, verdict, verdict_tone } = result;
  const verdictMap = {
    GANANCIA_REAL: "🟢 Esta inversión te haría ganar dinero real",
    GANANCIA_NOMINAL: "🟡 Ganarías USD pero perderías contra la inflación",
    PERDIDA_REAL: "🔴 Esta inversión perdería valor real",
  };
  const toneMap = {
    green: "bg-emerald-400/10 border-emerald-400/30 text-emerald-300",
    amber: "bg-amber-400/10 border-amber-400/30 text-amber-300",
    red: "bg-rose-400/10 border-rose-400/30 text-rose-300",
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Resultado</p>
        <h2 className="text-xl font-semibold text-white mt-1">
          En {district?.name}, después de {result.input.n} años...
        </h2>
      </div>

      <div className={`rounded-xl border p-5 ${toneMap[verdict_tone]}`}>
        <p className="text-lg font-semibold">{verdictMap[verdict]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigStat
          label="Tu dinero, hoy"
          value={`$${fmt(result.input.priceUsd)}`}
        />
        <BigStat
          label={`Tu dinero en ${result.input.n} años`}
          value={`$${fmt(proyeccion.valor_total_obtenido_usd)}`}
          highlight
        />
        <BigStat
          label="Multiplicaste por"
          value={`${proyeccion.moic}x`}
        />
        <BigStat
          label="Ganancia descontada inflación"
          value={`$${fmt(proyeccion.ganancia_real_usd)}`}
          positive={proyeccion.ganancia_real_usd >= 0}
        />
      </div>

      <details className="text-sm text-slate-400">
        <summary className="cursor-pointer font-medium hover:text-white">Ver el detalle</summary>
        <div className="mt-3 space-y-1 text-slate-400">
          <p>Valor de la propiedad al final: <strong className="text-white">${fmt(proyeccion.valor_final_usd)}</strong></p>
          <p>Plusvalía acumulada: <strong className="text-white">{proyeccion.plusvalia_acum_pct}%</strong> (+${fmt(proyeccion.plusvalia_usd)})</p>
          <p>Total cobrado en alquileres: <strong className="text-white">${fmt(proyeccion.renta_acum_usd)}</strong></p>
          <p>Inflación acumulada: <strong className="text-white">{proyeccion.inflacion_acum_pct}%</strong></p>
          <p className="text-xs text-slate-500 mt-2">
            Asumimos vacancia 8%, gastos operativos 0.4% anual, plusvalía proyectada 5% anual e inflación 3%.
          </p>
        </div>
      </details>

      <button
        type="button"
        onClick={onReset}
        className="w-full py-2 text-sm text-slate-400 hover:text-white"
      >
        ↺ Empezar de nuevo
      </button>
    </div>
  );
}

function BigStat({ label, value, highlight, positive }) {
  let valueClass = "text-2xl font-bold text-white mt-1";
  if (positive === true) valueClass = "text-2xl font-bold text-emerald-400 mt-1";
  if (positive === false) valueClass = "text-2xl font-bold text-rose-400 mt-1";

  return (
    <div className={`rounded-xl p-4 ${highlight ? "bg-emerald-400 text-slate-900" : "bg-white/5 border border-white/10"}`}>
      <p className={`text-xs ${highlight ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
      <p className={highlight ? "text-2xl font-bold text-slate-900 mt-1" : valueClass}>{value}</p>
    </div>
  );
}

function round(n, d = 1) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
