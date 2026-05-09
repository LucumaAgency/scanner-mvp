/**
 * Versión 2 — Tarjetas con explicación.
 * Filosofía: form completo en una pantalla pero cada campo es una tarjeta
 * con título + breve explicación + tooltip "¿por qué importa?".
 * Para usuarios que quieren control pero necesitan entender los términos.
 */
import { useEffect, useState } from "react";
import Layout from "../lib/Layout.jsx";
import {
  PROPERTY_TYPES,
  MONTHS,
  useDistricts,
  buildDefaults,
  calcular,
  fmt,
  fmt2,
} from "../lib/calculatorApi.js";

export default function VersionCards() {
  const { districts, loading } = useDistricts();
  const [districtSlug, setDistrictSlug] = useState("");
  const [propertyType, setPropertyType] = useState("departamento");
  const [inputs, setInputs] = useState({
    priceUsd: "",
    areaM2: "",
    plusvaliaInmediataUsd: 0,
    yearCompra: new Date().getFullYear(),
    monthCompra: new Date().getMonth() + 1,
    yearEntrega: new Date().getFullYear() + 2,
    monthEntrega: 12,
    alquilerPorM2Mes: { pesimista: 10, promedio: 15, optimista: 22 },
    vacancia: { pesimista: 0.10, promedio: 0.08, optimista: 0.05 },
    gastosOperativosUsd: { pesimista: 0, promedio: 0, optimista: 0 },
    g: 0.05,
    n: 10,
    inflacion: 0.03,
  });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const district = districts.find((d) => d.slug === districtSlug);
  const visibleDistricts = districts.filter((d) => d.stats?.venta_count > 0);

  // Cuando cambia distrito o precio, reseteamos los defaults derivados.
  useEffect(() => {
    if (!district) return;
    const def = buildDefaults(district, Number(inputs.priceUsd) || 0, Number(inputs.areaM2) || 0);
    setInputs((s) => ({
      ...s,
      alquilerPorM2Mes: def.alquilerPorM2Mes,
      gastosOperativosUsd: def.gastosOperativosUsd,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtSlug, inputs.priceUsd]);

  function setField(path, value) {
    setInputs((s) => {
      const copy = { ...s };
      const keys = path.split(".");
      let cur = copy;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return copy;
    });
  }

  async function calculate(e) {
    e?.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        priceUsd: Number(inputs.priceUsd),
        areaM2: Number(inputs.areaM2),
        plusvaliaInmediataUsd: Number(inputs.plusvaliaInmediataUsd) || 0,
        yearCompra: Number(inputs.yearCompra),
        monthCompra: Number(inputs.monthCompra),
        yearEntrega: Number(inputs.yearEntrega),
        monthEntrega: Number(inputs.monthEntrega),
        alquilerPorM2Mes: {
          pesimista: Number(inputs.alquilerPorM2Mes.pesimista),
          promedio: Number(inputs.alquilerPorM2Mes.promedio),
          optimista: Number(inputs.alquilerPorM2Mes.optimista),
        },
        vacancia: {
          pesimista: Number(inputs.vacancia.pesimista),
          promedio: Number(inputs.vacancia.promedio),
          optimista: Number(inputs.vacancia.optimista),
        },
        gastosOperativosUsd: {
          pesimista: Number(inputs.gastosOperativosUsd.pesimista),
          promedio: Number(inputs.gastosOperativosUsd.promedio),
          optimista: Number(inputs.gastosOperativosUsd.optimista),
        },
        g: Number(inputs.g),
        n: Number(inputs.n),
        inflacion: Number(inputs.inflacion),
      };
      const res = await calcular(payload);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout
      title="Calculadora de inversión · Tarjetas"
      subtitle="Cada campo viene con su explicación. Haz clic en (?) para más detalle."
    >
      <form onSubmit={calculate} className="space-y-4">
        {/* === SECCIÓN 1: PROPIEDAD === */}
        <SectionHeader emoji="🏠" title="Tu propiedad" />

        <Card
          icon="📍"
          title="¿Dónde está?"
          help="El distrito donde se ubica. Algunos cuestan mucho más por m² que otros."
        >
          <select
            value={districtSlug}
            onChange={(e) => setDistrictSlug(e.target.value)}
            className="input"
            required
            disabled={loading}
          >
            <option value="">{loading ? "Cargando..." : "Elige un distrito"}</option>
            {visibleDistricts.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name} ({d.stats.venta_count} en venta)
              </option>
            ))}
          </select>
        </Card>

        <Card
          icon="🏗"
          title="Tipo"
          help="Departamento, casa, oficina, etc. Cada uno tiene dinámica de mercado distinta."
        >
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="input"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
            ))}
          </select>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card
            icon="📐"
            title="Área (m²)"
            help="Metros cuadrados techados de la propiedad."
          >
            <input
              type="number"
              min="10"
              max="5000"
              value={inputs.areaM2}
              onChange={(e) => setField("areaM2", e.target.value)}
              className="input"
              placeholder="80"
              required
            />
          </Card>
          <Card
            icon="💵"
            title="Precio (USD)"
            help="Cuánto pagas por la propiedad. Si es en S/., divide por TC ~3.7."
          >
            <input
              type="number"
              min="1000"
              value={inputs.priceUsd}
              onChange={(e) => setField("priceUsd", e.target.value)}
              className="input"
              placeholder="220000"
              required
            />
          </Card>
        </div>

        <Card
          icon="🎁"
          title="Plusvalía inmediata (USD)"
          help="¿Te dieron precio de socio fundador? La diferencia con el precio público es ganancia desde el día 1. Si pagaste el precio normal, deja 0."
        >
          <input
            type="number"
            min="0"
            value={inputs.plusvaliaInmediataUsd}
            onChange={(e) => setField("plusvaliaInmediataUsd", e.target.value)}
            className="input"
          />
        </Card>

        {/* === SECCIÓN 2: TIEMPOS === */}
        <SectionHeader emoji="📅" title="Cuándo" />

        <div className="grid grid-cols-2 gap-3">
          <Card icon="🛒" title="Compra" help="Cuándo pagas por la propiedad.">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={inputs.monthCompra}
                onChange={(e) => setField("monthCompra", e.target.value)}
                className="input text-sm"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label.slice(0, 3)}</option>
                ))}
              </select>
              <input
                type="number"
                min="2020"
                max="2030"
                value={inputs.yearCompra}
                onChange={(e) => setField("yearCompra", e.target.value)}
                className="input text-sm"
              />
            </div>
          </Card>
          <Card icon="🔑" title="Entrega" help="Cuándo te entregan la llave (en proyectos en obra puede ser 1-3 años después).">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={inputs.monthEntrega}
                onChange={(e) => setField("monthEntrega", e.target.value)}
                className="input text-sm"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label.slice(0, 3)}</option>
                ))}
              </select>
              <input
                type="number"
                min="2020"
                max="2040"
                value={inputs.yearEntrega}
                onChange={(e) => setField("yearEntrega", e.target.value)}
                className="input text-sm"
              />
            </div>
          </Card>
        </div>

        {/* === SECCIÓN 3: RENTA === */}
        <SectionHeader
          emoji="💰"
          title="Renta esperada"
          subtitle={
            district?.stats?.median_price_usd_per_m2_alquiler
              ? `Pre-llenado con valores reales de ${district.name}.`
              : "Valores por defecto genéricos. Ajusta si tienes mejor información."
          }
        />

        <Card
          icon="🏠"
          title="Alquiler por m² mensual (USD)"
          help="Cuánto cobrarías por cada m² al mes. Pesimista = lo mínimo realista, Promedio = lo típico, Optimista = lo máximo si lo decoras bien."
        >
          <ScenarioInput
            values={inputs.alquilerPorM2Mes}
            onChange={(esc, v) => setField(`alquilerPorM2Mes.${esc}`, v)}
            step="0.5"
          />
        </Card>

        <Card
          icon="🚪"
          title="Vacancia (decimal)"
          help="Fracción del año que pasará vacío. 0.08 = 8% = casi 1 mes/año sin alquilar."
        >
          <ScenarioInput
            values={inputs.vacancia}
            onChange={(esc, v) => setField(`vacancia.${esc}`, v)}
            step="0.01"
          />
        </Card>

        <Card
          icon="🔧"
          title="Gastos operativos anuales (USD)"
          help="Mantenimiento + impuesto predial + administración del edificio. Por defecto: 0.6%/0.4%/0.3% del precio."
        >
          <ScenarioInput
            values={inputs.gastosOperativosUsd}
            onChange={(esc, v) => setField(`gastosOperativosUsd.${esc}`, v)}
            step="50"
          />
        </Card>

        {/* === SECCIÓN 4: AVANZADO === */}
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="w-full py-2 text-sm text-slate-600 hover:text-slate-900 border-t border-slate-200 pt-4"
        >
          {advancedOpen ? "▲ Ocultar supuestos avanzados" : "▼ Ver supuestos avanzados (g, n, π)"}
        </button>

        {advancedOpen && (
          <>
            <Card
              icon="📈"
              title="Plusvalía proyectada (g)"
              help="Cuánto crece el valor de la propiedad por año, en decimal. 0.05 = 5%. Valor por defecto conservador para Lima."
            >
              <input
                type="number"
                step="0.005"
                min="-0.5"
                max="1"
                value={inputs.g}
                onChange={(e) => setField("g", e.target.value)}
                className="input"
              />
            </Card>
            <Card
              icon="📅"
              title="Horizonte (n años)"
              help="Cuántos años piensas tenerla. La mayoría planea 10."
            >
              <input
                type="number"
                min="1"
                max="50"
                value={inputs.n}
                onChange={(e) => setField("n", e.target.value)}
                className="input"
              />
            </Card>
            <Card
              icon="📉"
              title="Inflación proyectada (π)"
              help="Cuánto pierde valor el dólar por año. 0.03 = 3%. Promedio histórico Perú."
            >
              <input
                type="number"
                step="0.005"
                min="0"
                max="0.5"
                value={inputs.inflacion}
                onChange={(e) => setField("inflacion", e.target.value)}
                className="input"
              />
            </Card>
          </>
        )}

        <button
          type="submit"
          disabled={submitting || !districtSlug || !inputs.priceUsd || !inputs.areaM2}
          className="w-full bg-slate-900 text-white rounded-lg py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Calculando..." : "Calcular inversión"}
        </button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </form>

      {result?.ok && <ResultCards result={result} district={district} />}
    </Layout>
  );
}

function SectionHeader({ emoji, title, subtitle }) {
  return (
    <div className="pt-2">
      <h2 className="text-base font-semibold text-slate-800">
        {emoji} {title}
      </h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Card({ icon, title, help, children }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm font-medium text-slate-800">
          <span className="mr-1">{icon}</span>
          {title}
        </p>
        {help && (
          <button
            type="button"
            onClick={() => setTooltipOpen((o) => !o)}
            className="text-xs text-slate-400 hover:text-slate-700"
            aria-label="Ayuda"
          >
            (?)
          </button>
        )}
      </div>
      {tooltipOpen && help && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 mb-2">{help}</p>
      )}
      {children}
    </div>
  );
}

function ScenarioInput({ values, onChange, step }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {["pesimista", "promedio", "optimista"].map((esc) => (
        <div key={esc}>
          <p className="text-[10px] uppercase text-slate-500 mb-0.5">{esc}</p>
          <input
            type="number"
            step={step}
            value={values[esc]}
            onChange={(e) => onChange(esc, e.target.value)}
            className="input text-sm"
          />
        </div>
      ))}
    </div>
  );
}

function ResultCards({ result, district }) {
  const { proyeccion, ratios, verdict, verdict_tone, tiempos } = result;
  const verdictMap = {
    GANANCIA_REAL: { label: "Ganancia real", desc: "La rentabilidad supera la inflación." },
    GANANCIA_NOMINAL: { label: "Ganancia nominal", desc: "Hay ganancia en USD pero pierde contra inflación." },
    PERDIDA_REAL: { label: "Pérdida real", desc: "El total no cubre la inflación acumulada." },
  };
  const toneMap = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-rose-50 border-rose-200 text-rose-900",
  };

  return (
    <div className="space-y-4 mt-6">
      <div className={`rounded-xl border p-5 ${toneMap[verdict_tone]}`}>
        <p className="text-xs uppercase tracking-wide opacity-70">Veredicto</p>
        <p className="text-xl font-bold mt-1">{verdictMap[verdict].label}</p>
        <p className="text-sm mt-1 opacity-80">{verdictMap[verdict].desc}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigCard label="MOIC" value={`${proyeccion.moic}x`} hint="Cuántas veces multiplicás el capital" />
        <BigCard
          label="Ganancia real"
          value={`$${fmt(proyeccion.ganancia_real_usd)}`}
          positive={proyeccion.ganancia_real_usd >= 0}
          hint="Descontada inflación"
        />
        <BigCard
          label={`Valor a ${result.input.n}a`}
          value={`$${fmt(proyeccion.valor_final_usd)}`}
          hint={`Plusvalía ${proyeccion.plusvalia_acum_pct}%`}
        />
        <BigCard
          label="Rentas acumuladas"
          value={`$${fmt(proyeccion.renta_acum_usd)}`}
          hint={`${tiempos.años_con_renta} años con alquiler`}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-800 mb-3">
          Ratios — {district?.name || "—"}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase">
              <th className="text-left font-medium pb-2"></th>
              <th className="text-right font-medium pb-2">Pesim.</th>
              <th className="text-right font-medium pb-2">Prom.</th>
              <th className="text-right font-medium pb-2">Optim.</th>
            </tr>
          </thead>
          <tbody>
            <RatioRow label="CAP rate (bruto)" field="cap_rate" suffix="%" ratios={ratios} />
            <RatioRow label="NET CAP rate" field="net_cap_rate" suffix="%" ratios={ratios} />
            <RatioRow label="PER bruto" field="per" suffix=" años" ratios={ratios} />
            <RatioRow label="Renta neta anual" field="ing_neto_anual_usd" prefix="$" ratios={ratios} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BigCard({ label, value, hint, positive }) {
  let valueClass = "text-2xl font-bold text-slate-900";
  if (positive === true) valueClass = "text-2xl font-bold text-emerald-700";
  if (positive === false) valueClass = "text-2xl font-bold text-rose-700";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${valueClass} mt-1`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function RatioRow({ label, field, prefix = "", suffix = "", ratios }) {
  const renderVal = (v) => v == null ? "—" : `${prefix}${fmt2(v)}${suffix}`;
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 text-slate-700">{label}</td>
      <td className="py-2 text-right">{renderVal(ratios.pesimista[field])}</td>
      <td className="py-2 text-right font-semibold">{renderVal(ratios.promedio[field])}</td>
      <td className="py-2 text-right">{renderVal(ratios.optimista[field])}</td>
    </tr>
  );
}
