import { useEffect, useMemo, useState } from "react";

const PROPERTY_TYPES = [
  { value: "departamento", label: "Departamento", hasBedrooms: true },
  { value: "casa", label: "Casa", hasBedrooms: true },
  { value: "oficina", label: "Oficina", hasBedrooms: false },
  { value: "local", label: "Local comercial", hasBedrooms: false },
  { value: "terreno", label: "Terreno", hasBedrooms: false },
  { value: "cochera", label: "Cochera", hasBedrooms: false },
  { value: "deposito", label: "Depósito", hasBedrooms: false },
  { value: "habitacion", label: "Habitación", hasBedrooms: false },
  { value: "edificio", label: "Edificio", hasBedrooms: false },
  { value: "quinta", label: "Quinta", hasBedrooms: true },
];

const OPERATIONS = [
  { value: "venta", label: "Comprar" },
  { value: "alquiler", label: "Alquilar" },
];

function fmt(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmt2(n) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function App() {
  const [districts, setDistricts] = useState([]);
  const [loadingDistricts, setLoadingDistricts] = useState(true);
  const [form, setForm] = useState({
    district: "",
    propertyType: "departamento",
    operation: "venta",
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
      const payload = {
        district: form.district,
        propertyType: form.propertyType,
        operation: form.operation,
        area: Number(form.area),
        bedrooms: Number(form.bedrooms),
      };
      // El precio es opcional: solo lo enviamos si el usuario lo ingresó.
      // Sin precio, el backend devuelve solo los percentiles de la zona.
      if (form.priceUsd !== "" && form.priceUsd != null) {
        payload.priceUsd = Number(form.priceUsd);
      }
      const res = await fetch("/api/valuar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  function setOperation(value) {
    setForm((f) => {
      const current = districts.find((d) => d.slug === f.district);
      const count =
        value === "alquiler"
          ? current?.stats?.alquiler_count
          : current?.stats?.venta_count;
      return {
        ...f,
        operation: value,
        district: count > 0 ? f.district : "",
      };
    });
  }

  const propertyTypeMeta = useMemo(
    () => PROPERTY_TYPES.find((t) => t.value === form.propertyType),
    [form.propertyType]
  );
  const showBedrooms = propertyTypeMeta?.hasBedrooms ?? false;
  const isAlquiler = form.operation === "alquiler";
  const priceLabel = isAlquiler ? "Renta mensual (USD)" : "Precio (USD)";
  const pricePlaceholder = isAlquiler ? "1500" : "220000";

  const visibleDistricts = districts.filter((d) => {
    const count = isAlquiler ? d.stats?.alquiler_count : d.stats?.venta_count;
    return count > 0;
  });

  const selectedDistrict = districts.find((d) => d.slug === form.district);

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
          <Field label="Operación">
            <div className="flex gap-2">
              {OPERATIONS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setOperation(op.value)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium border transition ${
                    form.operation === op.value
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Distrito">
            <select
              required
              value={form.district}
              onChange={update("district")}
              className="input"
              disabled={loadingDistricts}
            >
              <option value="">
                {loadingDistricts
                  ? "Cargando..."
                  : visibleDistricts.length
                  ? "Elige un distrito"
                  : `Sin distritos con inventario de ${isAlquiler ? "alquiler" : "venta"}`}
              </option>
              {visibleDistricts.map((d) => {
                const count = isAlquiler
                  ? d.stats?.alquiler_count
                  : d.stats?.venta_count;
                return (
                  <option key={d.slug} value={d.slug}>
                    {d.name} · {count} {count === 1 ? "propiedad" : "propiedades"}
                  </option>
                );
              })}
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

          <div className={showBedrooms ? "grid grid-cols-2 gap-4" : ""}>
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
            {showBedrooms && (
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
            )}
          </div>

          <Field
            label={`${priceLabel} (opcional)`}
            hint="Déjalo vacío para ver solo el precio por m² de la zona."
          >
            <input
              type="number"
              min="100"
              value={form.priceUsd}
              onChange={update("priceUsd")}
              className="input"
              placeholder={pricePlaceholder}
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

        {/* La calculadora de inversión aplica solo a venta y necesita los inputs cargados. */}
        {result?.ok && result.has_price && form.operation === "venta" && (
          <InvestmentSection
            district={selectedDistrict}
            priceUsd={Number(form.priceUsd)}
            areaM2={Number(form.area)}
          />
        )}

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
        .input-sm {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.375rem;
          padding: 0.375rem 0.5rem;
          font-size: 0.875rem;
          background: white;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
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

  const { verdict, diff_pct, market, input, n_comps, strategy, operation } = result;

  const verdictMeta = {
    BAJO_MERCADO: {
      label: "Está más barato que la zona",
      tone: "emerald",
      hint: "Cuesta menos que la mayoría de propiedades parecidas del distrito. Puede ser una buena oportunidad — verifica que el aviso sea confiable.",
    },
    DENTRO_RANGO: {
      label: "Es un precio justo",
      tone: "slate",
      hint: "Está en línea con lo que cuestan propiedades parecidas en el mismo distrito.",
    },
    SOBRE_MERCADO: {
      label: "Está más caro que la zona",
      tone: "rose",
      hint: "Cuesta más que la mayoría de propiedades parecidas del distrito. Hay margen para negociar el precio.",
    },
  }[verdict];

  // Frase clara para la diferencia vs el precio típico (mediana).
  const absDiff = Math.abs(diff_pct);
  const diffText =
    diff_pct > 0
      ? `${absDiff}% más caro que lo normal en la zona`
      : diff_pct < 0
      ? `${absDiff}% más barato que lo normal en la zona`
      : "igual al precio normal de la zona";

  const toneMap = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
  };

  const opLabel = operation === "alquiler" ? "alquiler" : "venta";

  // Sin precio ingresado: mostramos solo el precio/m² de la zona, sin veredicto.
  if (!result.has_price) {
    return (
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 text-sm">
        <p className="text-slate-500 mb-1">
          Precios {opLabel === "alquiler" ? "de alquiler" : "de venta"} en{" "}
          <span className="font-medium text-slate-900">{result.district}</span>
        </p>
        <p className="text-slate-500 mb-3">
          Esto es lo que cuestan propiedades parecidas a la tuya, por m²:
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Las más baratas" value={`$${fmt(market.p25)}/m²`} />
          <Stat label="Lo más común" value={`$${fmt(market.p50)}/m²`} highlight />
          <Stat label="Las más caras" value={`$${fmt(market.p75)}/m²`} />
        </div>
        <p className="text-sm text-emerald-700 font-medium mt-4">
          Calculado con {n_comps}{" "}
          {strategy === "similares"
            ? "propiedades de área y dormitorios similares"
            : "propiedades del distrito (había pocas del mismo tamaño)"}
          .
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Ingresa un precio arriba y te decimos si está caro o barato para la zona.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className={`rounded-xl border p-5 ${toneMap[verdictMeta.tone]}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">
          {opLabel === "alquiler" ? "En alquiler" : "En venta"} · {result.district}
        </p>
        <p className="text-xl font-semibold mt-1">{verdictMeta.label}</p>
        <p className="text-sm font-medium mt-1">{diffText}</p>
        <p className="text-sm mt-2 opacity-80">{verdictMeta.hint}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm">
        <p className="text-slate-500 mb-1">
          El precio de esta propiedad es{" "}
          <span className="font-medium text-slate-900">${fmt(input.price_usd_per_m2)} por m²</span>
        </p>
        <p className="text-slate-500 mb-3">
          Así se compara con propiedades parecidas en {result.district}:
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Las más baratas" value={`$${fmt(market.p25)}/m²`} />
          <Stat label="Lo más común" value={`$${fmt(market.p50)}/m²`} highlight />
          <Stat label="Las más caras" value={`$${fmt(market.p75)}/m²`} />
        </div>
        <p className="text-sm text-emerald-700 font-medium mt-4">
          Comparado con {n_comps}{" "}
          {strategy === "similares"
            ? "propiedades de área y dormitorios similares"
            : "propiedades del distrito (había pocas del mismo tamaño)"}
          .
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div
      className={`rounded-lg py-2 ${
        highlight ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
      }`}
    >
      <p className="text-xs opacity-70">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

/* ============================================================
   Calculadora de inversión — Replica del Excel "Calculadora v6.0"
   ============================================================ */

function InvestmentSection({ district, priceUsd, areaM2 }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-slate-100 text-slate-900 rounded-lg py-2.5 font-medium hover:bg-slate-200 border border-slate-200"
      >
        {open ? "Cerrar análisis de inversión ▲" : "Analizar como inversión ▼"}
      </button>
      {open && (
        <InvestmentCalculator
          district={district}
          priceUsd={priceUsd}
          areaM2={areaM2}
        />
      )}
    </div>
  );
}

function defaultsFromDistrict(district, priceUsd) {
  const stats = district?.stats || {};
  // Si tenemos stats reales de alquiler para este distrito, las usamos como
  // pesimista/promedio/optimista (p25/median/p75).
  const alqP25 = stats.p25_price_usd_per_m2_alquiler;
  const alqMed = stats.median_price_usd_per_m2_alquiler;
  const alqP75 = stats.p75_price_usd_per_m2_alquiler;

  // Fallback: defaults conservadores típicos de Lima si no hay data.
  const alquiler = {
    pesimista: alqP25 ?? 10,
    promedio: alqMed ?? 15,
    optimista: alqP75 ?? 22,
  };

  const today = new Date();
  return {
    plusvaliaInmediataUsd: 0,
    yearCompra: today.getFullYear(),
    monthCompra: today.getMonth() + 1,
    yearEntrega: today.getFullYear() + 2,
    monthEntrega: 12,
    alquilerPorM2Mes: alquiler,
    vacancia: { pesimista: 0.10, promedio: 0.08, optimista: 0.05 },
    gastosOperativosUsd: {
      pesimista: Math.round(priceUsd * 0.006),
      promedio: Math.round(priceUsd * 0.004),
      optimista: Math.round(priceUsd * 0.003),
    },
    g: 0.05,
    n: 10,
    inflacion: 0.035,
    tipoCambio: 3.5,
  };
}

function InvestmentCalculator({ district, priceUsd, areaM2 }) {
  const [inputs, setInputs] = useState(() => defaultsFromDistrict(district, priceUsd));
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Si el distrito o el precio cambian (ej. user revaluó), reseteamos defaults.
  useEffect(() => {
    setInputs(defaultsFromDistrict(district, priceUsd));
    setResult(null);
  }, [district?.slug, priceUsd]);

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

  async function onCalculate() {
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceUsd,
          areaM2,
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
          tipoCambio: Number(inputs.tipoCambio) || undefined,
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

  return (
    <div className="mt-3 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          Análisis de inversión
        </p>
        <p className="text-sm text-slate-600 mt-1">
          Replica la calculadora del inversionista: rentas, plusvalía, inflación y ganancia real.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Precio: ${fmt(priceUsd)} · {areaM2} m² · {district?.name || "—"}
        </p>
      </div>

      {/* Sección 1: datos del proyecto */}
      <Section title="Proyecto y fechas">
        <Field
          label="Plusvalía inmediata a la entrega (USD)"
          hint="Diferencia precio lista vs precio socio fundador. 0 si compras al precio público."
        >
          <input
            type="number"
            min="0"
            value={inputs.plusvaliaInmediataUsd}
            onChange={(e) => setField("plusvaliaInmediataUsd", e.target.value)}
            className="input-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Año compra">
            <input
              type="number"
              min="2000"
              max="2100"
              value={inputs.yearCompra}
              onChange={(e) => setField("yearCompra", e.target.value)}
              className="input-sm"
            />
          </Field>
          <Field label="Mes compra (1-12)">
            <input
              type="number"
              min="1"
              max="12"
              value={inputs.monthCompra}
              onChange={(e) => setField("monthCompra", e.target.value)}
              className="input-sm"
            />
          </Field>
          <Field label="Año entrega">
            <input
              type="number"
              min="2000"
              max="2100"
              value={inputs.yearEntrega}
              onChange={(e) => setField("yearEntrega", e.target.value)}
              className="input-sm"
            />
          </Field>
          <Field label="Mes entrega (1-12)">
            <input
              type="number"
              min="1"
              max="12"
              value={inputs.monthEntrega}
              onChange={(e) => setField("monthEntrega", e.target.value)}
              className="input-sm"
            />
          </Field>
        </div>
      </Section>

      {/* Sección 2: alquiler */}
      <Section
        title="Alquiler esperado"
        hint={
          district?.stats?.median_price_usd_per_m2_alquiler
            ? `Pre-llenado con p25/mediana/p75 reales de ${district.name}.`
            : "Sin datos del distrito — defaults genéricos."
        }
      >
        <ScenarioRow
          label="USD/m²/mes"
          values={inputs.alquilerPorM2Mes}
          onChange={(esc, val) => setField(`alquilerPorM2Mes.${esc}`, val)}
          step="0.5"
        />
        <ScenarioRow
          label="Vacancia (decimal)"
          values={inputs.vacancia}
          onChange={(esc, val) => setField(`vacancia.${esc}`, val)}
          step="0.01"
          hint="0.10 = 10% (1.2 meses sin alquilar/año)"
        />
        <ScenarioRow
          label="Gastos operativos anuales (USD)"
          values={inputs.gastosOperativosUsd}
          onChange={(esc, val) => setField(`gastosOperativosUsd.${esc}`, val)}
          step="50"
          hint="Mantenimiento + impuestos + admin"
        />
      </Section>

      {/* Sección 3: supuestos */}
      <Section title="Supuestos del inversionista">
        <div className="grid grid-cols-3 gap-3">
          <Field label="g (plusvalía/año)" hint="0.05 = 5%">
            <input
              type="number"
              step="0.005"
              min="-0.5"
              max="1"
              value={inputs.g}
              onChange={(e) => setField("g", e.target.value)}
              className="input-sm"
            />
          </Field>
          <Field label="n (años)">
            <input
              type="number"
              min="1"
              max="50"
              value={inputs.n}
              onChange={(e) => setField("n", e.target.value)}
              className="input-sm"
            />
          </Field>
          <Field label="π (inflación)" hint="0.035 = 3.5%">
            <input
              type="number"
              step="0.005"
              min="0"
              max="0.5"
              value={inputs.inflacion}
              onChange={(e) => setField("inflacion", e.target.value)}
              className="input-sm"
            />
          </Field>
        </div>
        <Field
          label="Tipo de cambio (S/. por USD)"
          hint="Para mostrar también los montos en soles. Actualizar al TC del mes (BCRP/SBS)."
        >
          <input
            type="number"
            step="0.01"
            min="1"
            max="10"
            value={inputs.tipoCambio}
            onChange={(e) => setField("tipoCambio", e.target.value)}
            className="input-sm"
          />
        </Field>
        <CagrHelper onUseG={(g) => setField("g", g)} />
      </Section>

      <button
        type="button"
        onClick={onCalculate}
        disabled={submitting}
        className="w-full bg-slate-900 text-white rounded-lg py-2.5 font-medium hover:bg-slate-800 disabled:opacity-60"
      >
        {submitting ? "Calculando..." : "Calcular inversión"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.ok && <InvestmentResult result={result} />}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ScenarioRow({ label, values, onChange, step, hint }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-700 mb-1">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {["pesimista", "promedio", "optimista"].map((esc) => (
          <div key={esc}>
            <p className="text-[10px] uppercase text-slate-500 mb-0.5">{esc}</p>
            <input
              type="number"
              step={step}
              value={values[esc]}
              onChange={(e) => onChange(esc, e.target.value)}
              className="input-sm"
            />
          </div>
        ))}
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function InvestmentResult({ result }) {
  const { verdict, verdict_tone, ratios, proyeccion, tiempos } = result;

  const verdictMeta = {
    GANANCIA_REAL: {
      label: "Ganancia real — buena inversión",
      hint: "La rentabilidad total supera la inflación acumulada: ganas poder adquisitivo.",
    },
    NEUTRO: {
      label: "Neutro — empatas con la inflación",
      hint: "La rentabilidad iguala a la inflación acumulada: ni ganas ni pierdes en términos reales.",
    },
    GANANCIA_NOMINAL: {
      label: "Ganancia nominal — pierde contra inflación",
      hint: "Hay ganancia en USD pero por debajo del costo de oportunidad inflacionario.",
    },
    PERDIDA_REAL: {
      label: "Pérdida real",
      hint: "La rentabilidad no cubre la inflación acumulada: pierdes poder adquisitivo.",
    },
  }[verdict] || { label: verdict, hint: "" };

  const toneMap = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-rose-50 border-rose-200 text-rose-900",
  };

  return (
    <div className="space-y-4 mt-2">
      {/* Veredicto */}
      <div className={`rounded-xl border p-5 ${toneMap[verdict_tone]}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">Veredicto</p>
        <p className="text-xl font-semibold mt-1">{verdictMeta.label}</p>
        <p className="text-sm mt-1 opacity-80">{verdictMeta.hint}</p>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <p className="opacity-70 text-xs">Rentabilidad total proyectada</p>
            <p className="font-semibold">{proyeccion.rentabilidad_total_pct}%</p>
          </div>
          <div>
            <p className="opacity-70 text-xs">Inflación acumulada</p>
            <p className="font-semibold">{proyeccion.inflacion_acum_pct}%</p>
          </div>
        </div>
      </div>

      {/* Ratios por escenario */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-800 mb-3">Ratios de rentabilidad</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase">
              <th className="text-left font-medium pb-2"></th>
              <th className="text-right font-medium pb-2">Pesim.</th>
              <th className="text-right font-medium pb-2">Prom.</th>
              <th className="text-right font-medium pb-2">Optim.</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            <RatioRow label="CAP rate (bruto)" values={["cap_rate", "%"]} ratios={ratios} bench="cap_rate" />
            <RatioRow label="NET CAP rate" values={["net_cap_rate", "%"]} ratios={ratios} bench="net_cap_rate" />
            <RatioRow label="PER bruto (años)" values={["per", ""]} ratios={ratios} bench="per" />
            <RatioRow label="PER neto (años)" values={["per_neto", ""]} ratios={ratios} bench="per_neto" />
            <RatioRow label="Renta neta anual (USD)" values={["ing_neto_anual_usd", "$"]} ratios={ratios} />
          </tbody>
        </table>
        {result.benchmarks && (
          <p className="text-xs text-slate-500 mt-3">
            ✅ cumple benchmark (escenario promedio) · CAP &gt;{result.benchmarks.cap_rate}% ·
            NET &gt;{result.benchmarks.net_cap_rate}% · PER &lt;{result.benchmarks.per} ·
            PER neto &lt;{result.benchmarks.per_neto}
          </p>
        )}
      </div>

      {/* Proyección */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-800 mb-3">
          Proyección a {result.input.n} años · MOIC {proyeccion.moic}x
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {tiempos.años_sin_renta} años en preventa · {tiempos.años_con_renta} años con renta
        </p>
        <div className="space-y-2 text-sm">
          {proyeccion.plusvalia_inmediata_usd > 0 && (
            <ProyRow
              label="Plusvalía inmediata (día 1)"
              value={`+$${fmt(proyeccion.plusvalia_inmediata_usd)} (${proyeccion.plusvalia_inmediata_pct}%)`}
              positive
            />
          )}
          <ProyRow label="Valor a la entrega" value={`$${fmt(proyeccion.valor_entrega_usd)}`} />
          <ProyRow label={`Valor final (${result.input.n}a)`} value={`$${fmt(proyeccion.valor_final_usd)}`} />
          <ProyRow label="Plusvalía acumulada" value={`+$${fmt(proyeccion.plusvalia_usd)} (${proyeccion.plusvalia_acum_pct}%)`} />
          <ProyRow label="Rentas acumuladas" value={`$${fmt(proyeccion.renta_acum_usd)} (${proyeccion.renta_acum_pct}%)`} />
          <ProyRow label="Total obtenido" value={`$${fmt(proyeccion.valor_total_obtenido_usd)}`} bold />
          <ProyRow label="Mínimo anti-inflación" value={`$${fmt(proyeccion.inversion_ajustada_usd)}`} muted />
          <ProyRow label="Ganancia real (vs inflación)" value={`$${fmt(proyeccion.ganancia_real_usd)}`} bold positive={proyeccion.ganancia_real_usd >= 0} />
        </div>
        {result.soles && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2">
              Equivalente en soles (TC S/.{result.soles.tipo_cambio}/USD):
            </p>
            <div className="space-y-1 text-sm">
              <ProyRow label="Total obtenido (S/.)" value={`S/.${fmt(result.soles.valor_total_obtenido)}`} />
              <ProyRow
                label="Ganancia real (S/.)"
                value={`S/.${fmt(result.soles.ganancia_real)}`}
                bold
                positive={result.soles.ganancia_real >= 0}
              />
            </div>
          </div>
        )}
      </div>

      {/* Proyección año a año */}
      {Array.isArray(result.proyeccion_anual) && result.proyeccion_anual.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-800 mb-1">Año a año</p>
          <p className="text-xs text-slate-500 mb-3">
            Rentas = $0 durante la preventa. La renta crece con inflación (π).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase">
                  <th className="text-left font-medium pb-2">Año</th>
                  <th className="text-right font-medium pb-2">Valor inmueble</th>
                  <th className="text-right font-medium pb-2">Renta neta</th>
                  <th className="text-right font-medium pb-2">Rent. total</th>
                  <th className="text-right font-medium pb-2">Inflación</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {result.proyeccion_anual.map((f) => (
                  <tr key={f.anio} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-700">{f.anio}</td>
                    <td className="py-1.5 text-right">${fmt(f.valor_inmueble_usd)}</td>
                    <td className="py-1.5 text-right">${fmt(f.renta_anual_neta_usd)}</td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        f.rentabilidad_total_pct >= f.inflacion_acum_pct
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {f.rentabilidad_total_pct}%
                    </td>
                    <td className="py-1.5 text-right text-slate-500">{f.inflacion_acum_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RatioRow({ label, values, ratios, bench }) {
  const [field, suffix] = values;
  const renderVal = (v) => {
    if (v == null) return "—";
    if (suffix === "%") return `${v}%`;
    if (suffix === "$") return `$${fmt(v)}`;
    return fmt2(v);
  };
  const ok = bench ? ratios.promedio.cumple?.[bench] : null;
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 text-slate-700">{label}</td>
      <td className="py-2 text-right">{renderVal(ratios.pesimista[field])}</td>
      <td className="py-2 text-right font-medium">
        {renderVal(ratios.promedio[field])}
        {ok != null && <span className="ml-1">{ok ? "✅" : "⚠️"}</span>}
      </td>
      <td className="py-2 text-right">{renderVal(ratios.optimista[field])}</td>
    </tr>
  );
}

/**
 * Calcula la `g` recomendada desde el CAGR histórico de la zona (Excel "Plusvalía
 * Zona"). Opcional: si el user no tiene datos, igual devuelve la regla conservadora.
 */
function CagrHelper({ onUseG }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    ubicacion: "Lima",
    anioInicial: "",
    precioInicial: "",
    anioActual: "",
    precioActual: "",
  });
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const upd = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function calc() {
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch("/api/tasa-g", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      setRes(await r.json());
    } catch {
      setRes({ ok: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-slate-700"
      >
        {open ? "▲ " : "▼ "}Calcular g desde el histórico de la zona (CAGR)
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ubicación">
              <input value={f.ubicacion} onChange={upd("ubicacion")} className="input-sm" placeholder="Lima / provincia" />
            </Field>
            <Field label="Año precio inicial">
              <input type="number" value={f.anioInicial} onChange={upd("anioInicial")} className="input-sm" placeholder="2019" />
            </Field>
            <Field label="Precio inicial">
              <input type="number" value={f.precioInicial} onChange={upd("precioInicial")} className="input-sm" placeholder="120000" />
            </Field>
            <Field label="Año actual">
              <input type="number" value={f.anioActual} onChange={upd("anioActual")} className="input-sm" placeholder="2025" />
            </Field>
            <Field label="Precio actual">
              <input type="number" value={f.precioActual} onChange={upd("precioActual")} className="input-sm" placeholder="235000" />
            </Field>
          </div>
          <button
            type="button"
            onClick={calc}
            disabled={loading}
            className="w-full bg-slate-200 text-slate-900 rounded-lg py-2 text-sm font-medium hover:bg-slate-300 disabled:opacity-60"
          >
            {loading ? "Calculando..." : "Calcular tasa recomendada"}
          </button>
          {res?.ok && (
            <div className="text-sm text-slate-700 space-y-1">
              <p>
                CAGR histórico: <b>{res.cagr_pct != null ? `${res.cagr_pct}%` : "sin dato propio"}</b>
              </p>
              <p>
                g recomendada (conservadora): <b>{res.g_recomendada_pct}%</b>
              </p>
              <p className="text-xs text-slate-500">{res.regla}</p>
              <button
                type="button"
                onClick={() => onUseG(res.g_recomendada)}
                className="mt-1 bg-slate-900 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-800"
              >
                Usar {res.g_recomendada_pct}% como g
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProyRow({ label, value, bold, muted, positive }) {
  let valueClass = "text-slate-900";
  if (bold) valueClass = "text-slate-900 font-semibold";
  if (muted) valueClass = "text-slate-500";
  if (positive === true) valueClass = "text-emerald-700 font-semibold";
  if (positive === false) valueClass = "text-rose-700 font-semibold";

  return (
    <div className="flex justify-between items-baseline">
      <span className="text-slate-600">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
