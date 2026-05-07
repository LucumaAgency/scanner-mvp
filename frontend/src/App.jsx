import { useEffect, useState } from "react";

const PROPERTY_TYPES = [
  { value: "departamento", label: "Departamento" },
  { value: "casa", label: "Casa" },
  { value: "oficina", label: "Oficina" },
  { value: "local", label: "Local" },
  { value: "terreno", label: "Terreno" },
];

export default function App() {
  const [districts, setDistricts] = useState([]);
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [form, setForm] = useState({
    district: "",
    propertyType: "departamento",
    area: "",
    bedrooms: "2",
    priceUsd: "",
  });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/distritos")
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts || []))
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/valuar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: form.district,
          propertyType: form.propertyType,
          area: Number(form.area),
          bedrooms: Number(form.bedrooms),
          priceUsd: Number(form.priceUsd),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data.errors || [data.error || "Error"]).join(", "));
      } else {
        setResult(data);
      }
    } catch {
      setError("No se pudo conectar al servidor");
    } finally {
      setSubmitting(false);
    }
  }

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10">
      <main className="w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Valuador inmobiliario</h1>
          <p className="text-sm text-slate-600 mt-1">
            Comparado con propiedades activas del mismo distrito y tamaño similar.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4"
        >
          <Field label="Distrito">
            <select
              required
              value={form.district}
              onChange={update("district")}
              className="input"
              disabled={loadingDistricts}
            >
              <option value="">{loadingDistricts ? "Cargando..." : "Elegí un distrito"}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de propiedad">
            <select value={form.propertyType} onChange={update("propertyType")} className="input">
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Área (m²)">
              <input
                required
                type="number"
                min="10"
                max="5000"
                value={form.area}
                onChange={update("area")}
                className="input"
                placeholder="80"
              />
            </Field>
            <Field label="Dormitorios">
              <input
                required
                type="number"
                min="0"
                max="15"
                value={form.bedrooms}
                onChange={update("bedrooms")}
                className="input"
              />
            </Field>
          </div>

          <Field label="Precio (USD)">
            <input
              required
              type="number"
              min="1000"
              value={form.priceUsd}
              onChange={update("priceUsd")}
              className="input"
              placeholder="220000"
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "Calculando..." : "Valuar"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        {result && <ResultCard result={result} />}

        <footer className="text-xs text-slate-400 text-center mt-10">
          Datos de urbania.pe · solo referencial
        </footer>
      </main>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.95rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: rgb(15 23 42);
          box-shadow: 0 0 0 3px rgb(15 23 42 / 0.08);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ResultCard({ result }) {
  if (!result.ok) {
    return (
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900">
        <p className="font-medium">No hay suficientes datos todavía</p>
        <p className="text-sm mt-1">{result.message}</p>
      </div>
    );
  }

  const { verdict, diff_pct, market, input, n_comps, strategy } = result;

  const verdictMeta = {
    BAJO_MERCADO: { label: "Bajo mercado", tone: "emerald", hint: "Posible oportunidad — o aviso poco confiable." },
    DENTRO_RANGO: { label: "Dentro del rango", tone: "slate", hint: "Precio alineado con comparables." },
    SOBRE_MERCADO: { label: "Sobre mercado", tone: "rose", hint: "Más caro que la mayoría de comparables." },
  }[verdict];

  const toneMap = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
  };

  return (
    <div className="mt-6 space-y-4">
      <div className={`rounded-xl border p-5 ${toneMap[verdictMeta.tone]}`}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium uppercase tracking-wide opacity-70">Veredicto</p>
          <p className="text-sm font-semibold">{diff_pct >= 0 ? "+" : ""}{diff_pct}% vs mediana</p>
        </div>
        <p className="text-xl font-semibold mt-1">{verdictMeta.label}</p>
        <p className="text-sm mt-1 opacity-80">{verdictMeta.hint}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm">
        <p className="text-slate-500 mb-3">Tu propiedad: <span className="font-medium text-slate-900">${fmt(input.price_usd_per_m2)}/m²</span></p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="P25" value={`$${fmt(market.p25)}`} />
          <Stat label="Mediana" value={`$${fmt(market.p50)}`} highlight />
          <Stat label="P75" value={`$${fmt(market.p75)}`} />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          {n_comps} comparables ·{" "}
          {strategy === "similares" ? "área y dorms similares" : "distrito completo (pocas similares)"}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-lg py-2 ${highlight ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function fmt(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
