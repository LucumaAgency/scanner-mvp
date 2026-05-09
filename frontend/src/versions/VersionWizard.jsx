/**
 * Versión 1 — Wizard paso a paso.
 * Filosofía: una pregunta por pantalla, sin jerga financiera.
 * Para usuarios que se pierden con forms largos.
 *
 * Pantallas: distrito → tipo → tamaño → precio → entrega → alquiler estimado → años → resultado.
 * Defaults ocultos: vacancia, gastos, plusvalía inmediata, g, π — el user no los ve.
 */
import { useMemo, useState } from "react";
import Layout from "../lib/Layout.jsx";
import {
  PROPERTY_TYPES,
  MONTHS,
  useDistricts,
  buildDefaults,
  calcular,
  fmt,
} from "../lib/calculatorApi.js";

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

  // Cuando el user llega al paso "alquiler", pre-llenamos con la mediana del distrito
  // si todavía no eligió un valor.
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
      // Sobreescribimos solo lo que el wizard captura. El resto queda con defaults.
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
    <Layout
      title="Calculadora de inversión · Wizard"
      subtitle={`Paso ${step + 1} de ${STEPS.length} — sin tecnicismos`}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <ProgressBar step={step} total={STEPS.length} />

        {currentStep === "distrito" && (
          <Step
            question="¿En qué distrito está la propiedad?"
            help="Empezamos por dónde queda. Solo mostramos distritos con ventas activas."
            canNext={!!data.districtSlug}
            onNext={next}
            backVisible={false}
          >
            <select
              required
              value={data.districtSlug}
              onChange={(e) => set("districtSlug", e.target.value)}
              className="input-lg"
              disabled={loading}
            >
              <option value="">{loading ? "Cargando..." : "— Elegí —"}</option>
              {visibleDistricts.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name} ({d.stats.venta_count} en venta)
                </option>
              ))}
            </select>
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
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <div className="text-2xl">{t.emoji}</div>
                  <div className="font-medium text-sm mt-1">{t.label}</div>
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
                <label className="text-sm text-slate-600">Área (m²)</label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={data.areaM2}
                  onChange={(e) => set("areaM2", e.target.value)}
                  className="input-lg mt-1"
                  placeholder="80"
                  autoFocus
                />
              </div>
              {propertyTypeMeta?.hasBedrooms && (
                <div>
                  <label className="text-sm text-slate-600">Dormitorios</label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={data.bedrooms}
                    onChange={(e) => set("bedrooms", e.target.value)}
                    className="input-lg mt-1"
                  />
                </div>
              )}
            </div>
          </Step>
        )}

        {currentStep === "precio" && (
          <Step
            question="¿Cuánto cuesta hoy?"
            help="El precio en dólares de la propiedad. Si está en S/., dividilo por el TC del día (~3.7)."
            canNext={Number(data.priceUsd) >= 1000}
            onNext={next}
            onBack={back}
          >
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
              <input
                type="number"
                min="1000"
                value={data.priceUsd}
                onChange={(e) => set("priceUsd", e.target.value)}
                className="input-lg pl-8"
                placeholder="220000"
                autoFocus
              />
            </div>
            {Number(data.priceUsd) > 0 && Number(data.areaM2) > 0 && (
              <p className="text-xs text-slate-500 mt-2">
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
            help="Si ya está construida, poné mes y año actuales. Si es proyecto en obra, la fecha de entrega prometida."
            canNext={true}
            onNext={next}
            onBack={back}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">Mes</label>
                <select
                  value={data.monthEntrega}
                  onChange={(e) => set("monthEntrega", Number(e.target.value))}
                  className="input-lg mt-1"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">Año</label>
                <input
                  type="number"
                  min={new Date().getFullYear()}
                  max={new Date().getFullYear() + 10}
                  value={data.yearEntrega}
                  onChange={(e) => set("yearEntrega", e.target.value)}
                  className="input-lg mt-1"
                />
              </div>
            </div>
          </Step>
        )}

        {currentStep === "alquiler" && (
          <Step
            question="¿A cuánto pensás alquilarla?"
            help={`En USD por m² por mes. ${
              district?.stats?.median_price_usd_per_m2_alquiler
                ? `En ${district.name} el promedio actual es $${district.stats.median_price_usd_per_m2_alquiler.toFixed(1)}/m²/mes.`
                : ""
            } Si no estás seguro, dejá la sugerencia.`}
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
                className="w-full"
              />
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">${suggestedAlquiler}</span>
                <span className="text-sm text-slate-500 ml-1">/m²/mes</span>
              </div>
              {Number(data.areaM2) > 0 && (
                <p className="text-center text-sm text-slate-600">
                  ≈ ${fmt(suggestedAlquiler * Number(data.areaM2))}/mes en alquiler bruto
                </p>
              )}
            </div>
          </Step>
        )}

        {currentStep === "horizonte" && (
          <Step
            question="¿Cuántos años pensás tenerla?"
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
                className="w-full"
              />
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">{data.n}</span>
                <span className="text-sm text-slate-500 ml-1">años</span>
              </div>
              <p className="text-center text-xs text-slate-500">
                Te entregan en {Number(data.yearEntrega)}, vendés en {Number(data.yearEntrega) + Number(data.n) - (new Date().getFullYear() < Number(data.yearEntrega) ? 0 : 0)}
              </p>
            </div>
            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          </Step>
        )}

        {currentStep === "resultado" && result && (
          <ResultWizard result={result} district={district} onReset={() => { setStep(0); setResult(null); }} />
        )}
      </div>
    </Layout>
  );
}

function Step({ question, help, children, canNext, onNext, onBack, backVisible = true, nextLabel = "Siguiente", nextDisabled }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{question}</h2>
        {help && <p className="text-sm text-slate-500 mt-1">{help}</p>}
      </div>
      {children}
      <div className="flex justify-between pt-4">
        {backVisible ? (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
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
          className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-40"
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
      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResultWizard({ result, district, onReset }) {
  const { proyeccion, verdict, verdict_tone } = result;
  const verdictMap = {
    GANANCIA_REAL: "🟢 Esta inversión te haría ganar plata real",
    GANANCIA_NOMINAL: "🟡 Ganarías USD pero perderías contra la inflación",
    PERDIDA_REAL: "🔴 Esta inversión perdería valor real",
  };
  const toneMap = {
    green: "bg-emerald-50 text-emerald-900",
    amber: "bg-amber-50 text-amber-900",
    red: "bg-rose-50 text-rose-900",
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase text-slate-500 font-semibold tracking-wide">Resultado</p>
        <h2 className="text-xl font-semibold text-slate-900 mt-1">
          En {district?.name}, después de {result.input.n} años...
        </h2>
      </div>

      <div className={`rounded-xl p-5 ${toneMap[verdict_tone]}`}>
        <p className="text-lg font-semibold">{verdictMap[verdict]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigStat
          label="Tu plata, hoy"
          value={`$${fmt(result.input.priceUsd)}`}
        />
        <BigStat
          label={`Tu plata en ${result.input.n} años`}
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

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium hover:text-slate-900">Ver el detalle</summary>
        <div className="mt-3 space-y-1">
          <p>Valor de la propiedad al final: <strong>${fmt(proyeccion.valor_final_usd)}</strong></p>
          <p>Plusvalía acumulada: <strong>{proyeccion.plusvalia_acum_pct}%</strong> (+${fmt(proyeccion.plusvalia_usd)})</p>
          <p>Total cobrado en alquileres: <strong>${fmt(proyeccion.renta_acum_usd)}</strong></p>
          <p>Inflación acumulada: <strong>{proyeccion.inflacion_acum_pct}%</strong></p>
          <p className="text-xs text-slate-400 mt-2">
            Asumimos vacancia 8%, gastos operativos 0.4% anual, plusvalía proyectada 5% anual e inflación 3%.
          </p>
        </div>
      </details>

      <button
        type="button"
        onClick={onReset}
        className="w-full py-2 text-sm text-slate-600 hover:text-slate-900"
      >
        ↺ Empezar de nuevo
      </button>
    </div>
  );
}

function BigStat({ label, value, highlight, positive }) {
  let valueClass = "text-2xl font-bold text-slate-900";
  if (highlight) valueClass = "text-2xl font-bold text-slate-900";
  if (positive === true) valueClass = "text-2xl font-bold text-emerald-700";
  if (positive === false) valueClass = "text-2xl font-bold text-rose-700";

  return (
    <div className={`rounded-xl p-4 ${highlight ? "bg-slate-900 text-white" : "bg-slate-50"}`}>
      <p className={`text-xs ${highlight ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
      <p className={highlight ? "text-2xl font-bold text-white mt-1" : `${valueClass} mt-1`}>{value}</p>
    </div>
  );
}

function round(n, d = 1) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
