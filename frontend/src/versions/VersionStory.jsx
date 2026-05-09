/**
 * Versión 3 — Storytelling / Mad Libs financiero.
 * Filosofía: el usuario lee una narrativa y completa los blanks inline.
 * Sin tablas técnicas. Resultado contado como una historia.
 * Para usuarios muy no-técnicos sin paciencia para forms.
 */
import { useEffect, useMemo, useState } from "react";
import Layout from "../lib/Layout.jsx";
import {
  PROPERTY_TYPES,
  MONTHS,
  useDistricts,
  buildDefaults,
  calcular,
  fmt,
} from "../lib/calculatorApi.js";

export default function VersionStory() {
  const { districts, loading } = useDistricts();
  const [districtSlug, setDistrictSlug] = useState("");
  const [propertyType, setPropertyType] = useState("departamento");
  const [areaM2, setAreaM2] = useState(80);
  const [priceUsd, setPriceUsd] = useState(220000);
  const [plusvalia, setPlusvalia] = useState(0);
  const [yearEntrega, setYearEntrega] = useState(new Date().getFullYear() + 2);
  const [monthEntrega, setMonthEntrega] = useState(12);
  const [alquilerUsd, setAlquilerUsd] = useState("");
  const [horizonte, setHorizonte] = useState(10);

  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const district = districts.find((d) => d.slug === districtSlug);
  const visibleDistricts = districts.filter((d) => d.stats?.venta_count > 0);

  // Sugerencia automática de alquiler basada en el distrito.
  const suggestedAlquiler = useMemo(() => {
    if (alquilerUsd) return Number(alquilerUsd);
    return district?.stats?.median_price_usd_per_m2_alquiler ?? 15;
  }, [district, alquilerUsd]);

  // Si cambia el distrito, vaciamos el alquiler manual para que tome la nueva sugerencia.
  useEffect(() => {
    setAlquilerUsd("");
  }, [districtSlug]);

  const propertyTypeMeta = PROPERTY_TYPES.find((t) => t.value === propertyType);

  async function tellMyFuture() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const today = new Date();
      const defaults = buildDefaults(district, Number(priceUsd), Number(areaM2));
      const med = Number(suggestedAlquiler);
      const payload = {
        ...defaults,
        priceUsd: Number(priceUsd),
        areaM2: Number(areaM2),
        plusvaliaInmediataUsd: Number(plusvalia) || 0,
        yearCompra: today.getFullYear(),
        monthCompra: today.getMonth() + 1,
        yearEntrega: Number(yearEntrega),
        monthEntrega: Number(monthEntrega),
        n: Number(horizonte),
        alquilerPorM2Mes: {
          pesimista: round(med * 0.85, 1),
          promedio: med,
          optimista: round(med * 1.15, 1),
        },
      };
      const res = await calcular(payload);
      setResult(res);
      // Scroll al resultado
      setTimeout(() => {
        document.getElementById("story-result")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Calculadora de inversión · Historia">
        <p className="text-center text-slate-500">Cargando...</p>
      </Layout>
    );
  }

  return (
    <Layout
      title="Calculadora de inversión · Historia"
      subtitle="Completá los espacios resaltados como un cuento. Click sobre el subrayado amarillo para editar."
    >
      <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-lg leading-loose text-slate-800">
        <p>
          Imaginá que comprás un{" "}
          <Inline>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="input-inline"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label.toLowerCase()}</option>
              ))}
            </select>
          </Inline>
          {" "}en{" "}
          <Inline>
            <select
              value={districtSlug}
              onChange={(e) => setDistrictSlug(e.target.value)}
              className="input-inline"
              required
            >
              <option value="">_______</option>
              {visibleDistricts.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </select>
          </Inline>
          {" "}de{" "}
          <Inline>
            <input
              type="number"
              min="10"
              max="5000"
              value={areaM2}
              onChange={(e) => setAreaM2(e.target.value)}
              className="input-inline"
              style={{ width: "5rem" }}
            />
          </Inline>
          {" "}m².
        </p>

        <p className="mt-4">
          Te cuesta{" "}
          <Inline>
            <span className="text-slate-500">USD</span>{" "}
            <input
              type="number"
              min="1000"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              className="input-inline"
              style={{ width: "8rem" }}
            />
          </Inline>
          {" "}hoy.
        </p>

        <p className="mt-4 text-base text-slate-600">
          <span className="text-xs uppercase tracking-wide opacity-60">opcional · </span>
          ¿Te dieron precio de socio fundador? Te ahorraste{" "}
          <Inline>
            <span className="text-slate-500">USD</span>{" "}
            <input
              type="number"
              min="0"
              value={plusvalia}
              onChange={(e) => setPlusvalia(e.target.value)}
              className="input-inline"
              style={{ width: "5rem" }}
            />
          </Inline>
          .
        </p>

        <p className="mt-6">
          Te entregan la propiedad en{" "}
          <Inline>
            <select
              value={monthEntrega}
              onChange={(e) => setMonthEntrega(Number(e.target.value))}
              className="input-inline"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label.toLowerCase()}</option>
              ))}
            </select>
            {" "}de{" "}
            <input
              type="number"
              min={new Date().getFullYear()}
              max={new Date().getFullYear() + 10}
              value={yearEntrega}
              onChange={(e) => setYearEntrega(e.target.value)}
              className="input-inline"
              style={{ width: "5rem" }}
            />
          </Inline>
          .
        </p>

        <p className="mt-4">
          Para entonces, vas a poder alquilarla a{" "}
          <Inline>
            <span className="text-slate-500">USD</span>{" "}
            <input
              type="number"
              step="0.5"
              min="2"
              value={alquilerUsd || suggestedAlquiler}
              onChange={(e) => setAlquilerUsd(e.target.value)}
              className="input-inline"
              style={{ width: "4rem" }}
            />
          </Inline>
          {" "}por m² al mes.
          {district?.stats?.median_price_usd_per_m2_alquiler && (
            <span className="block text-sm text-slate-500 mt-1 italic">
              💡 En {district.name} el promedio actual es ${district.stats.median_price_usd_per_m2_alquiler.toFixed(1)}/m²/mes.
            </span>
          )}
        </p>

        <p className="mt-6">
          Pensás tenerla por{" "}
          <Inline>
            <input
              type="number"
              min="3"
              max="30"
              value={horizonte}
              onChange={(e) => setHorizonte(e.target.value)}
              className="input-inline"
              style={{ width: "4rem" }}
            />
          </Inline>
          {" "}años antes de venderla.
        </p>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={tellMyFuture}
            disabled={submitting || !districtSlug || !priceUsd || !areaM2}
            className="w-full bg-slate-900 text-white rounded-lg py-3 font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Calculando tu futuro..." : "¿Cómo me va? →"}
          </button>
          {error && <p className="text-red-600 text-sm text-center mt-3">{error}</p>}
        </div>
      </article>

      {result?.ok && (
        <ResultStory
          result={result}
          district={district}
          propertyType={propertyTypeMeta.label.toLowerCase()}
          alquilerUsd={Number(suggestedAlquiler)}
        />
      )}
    </Layout>
  );
}

function Inline({ children }) {
  return <span>{children}</span>;
}

function ResultStory({ result, district, propertyType, alquilerUsd }) {
  const { proyeccion, verdict, tiempos, input } = result;
  const yearFinal = input.yearCompra + input.n;

  let veredictoTexto;
  let veredictoClass;
  if (verdict === "GANANCIA_REAL") {
    veredictoTexto = "Ganaste plata REAL — más allá de la inflación.";
    veredictoClass = "text-emerald-700";
  } else if (verdict === "GANANCIA_NOMINAL") {
    veredictoTexto = "Ganaste USD nominales pero perdiste poder de compra.";
    veredictoClass = "text-amber-700";
  } else {
    veredictoTexto = "Esta inversión perdió valor real.";
    veredictoClass = "text-rose-700";
  }

  return (
    <article
      id="story-result"
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mt-6 text-lg leading-loose text-slate-800"
    >
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Tu futuro</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">
          Año {yearFinal}, {input.n} años después...
        </h2>
      </header>

      <p>
        Tu {propertyType} en {district?.name} ya no vale los{" "}
        <strong>${fmt(input.priceUsd)}</strong> que pagaste:{" "}
        ahora vale <Highlight>${fmt(proyeccion.valor_final_usd)}</Highlight>.
      </p>

      <p className="mt-4">
        En todos esos años, cobraste un total de{" "}
        <Highlight>${fmt(proyeccion.renta_acum_usd)}</Highlight> en alquileres
        ({tiempos.años_con_renta} años con renta, {tiempos.años_sin_renta} sin renta porque era preventa).
      </p>

      <p className="mt-4">
        Si vendés ahora y sumás todo lo cobrado, te quedás con{" "}
        <strong className="text-slate-900">${fmt(proyeccion.valor_total_obtenido_usd)}</strong>.
        Eso es <Highlight>{proyeccion.moic}x</Highlight> lo que pusiste originalmente.
      </p>

      <p className="mt-4 text-base text-slate-600">
        Pero ojo: la inflación también hizo lo suyo. Para no perder poder de compra,
        tu plata original debería valer hoy <strong>${fmt(proyeccion.inversion_ajustada_usd)}</strong>{" "}
        (eso es solo mantenerse).
      </p>

      <p className={`mt-6 text-xl font-bold ${veredictoClass}`}>
        {veredictoTexto}
      </p>

      <p className="mt-2">
        Tu ganancia REAL (descontando inflación) es de{" "}
        <strong className={veredictoClass}>${fmt(proyeccion.ganancia_real_usd)}</strong>.
      </p>

      <details className="mt-6 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium hover:text-slate-900">
          Ver los números completos
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3 text-base">
          <Stat label="Plusvalía acumulada" value={`${proyeccion.plusvalia_acum_pct}%`} />
          <Stat label="Renta acumulada %" value={`${proyeccion.renta_acum_pct}%`} />
          <Stat label="Rentabilidad total" value={`${proyeccion.rentabilidad_total_pct}%`} />
          <Stat label="Inflación acumulada" value={`${proyeccion.inflacion_acum_pct}%`} />
          <Stat label="CAP rate promedio" value={`${result.ratios.promedio.cap_rate}%`} />
          <Stat label="Renta neta/año" value={`$${fmt(result.ratios.promedio.ing_neto_anual_usd)}`} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Asumimos vacancia 8%, gastos operativos 0.4% anual del precio,
          plusvalía proyectada 5% anual e inflación 3%.
        </p>
      </details>
    </article>
  );
}

function Highlight({ children }) {
  return <span className="bg-yellow-100 text-slate-900 font-bold px-1 rounded">{children}</span>;
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-bold text-slate-900">{value}</p>
    </div>
  );
}

function round(n, d = 1) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
