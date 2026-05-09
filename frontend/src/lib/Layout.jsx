/**
 * Layout compartido por las 3 versiones — header simple + footer con navegación
 * cruzada para que el usuario pueda comparar UX entre versiones.
 */
import { Link, useLocation } from "react-router-dom";

const VERSIONS = [
  { path: "/", label: "Original" },
  { path: "/version1", label: "v1 · Wizard" },
  { path: "/version2", label: "v2 · Tarjetas" },
  { path: "/version3", label: "v3 · Historia" },
];

export default function Layout({ title, subtitle, children }) {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10">
      <main className="w-full max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
        </header>

        {children}

        <footer className="mt-12 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-2">Compará versiones de UX:</p>
          <div className="flex flex-wrap gap-2">
            {VERSIONS.map((v) => {
              const active = location.pathname === v.path;
              return (
                <Link
                  key={v.path}
                  to={v.path}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    active
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
                  }`}
                >
                  {v.label}
                </Link>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-6">
            Datos de urbania.pe · solo referencial
          </p>
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
        .input-lg {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-size: 1.125rem;
          background: white;
        }
        .input-inline {
          display: inline-block;
          width: auto;
          min-width: 5rem;
          border: 0;
          border-bottom: 2px solid rgb(15 23 42);
          padding: 0.125rem 0.5rem;
          font-size: inherit;
          font-weight: 600;
          background: rgb(254 252 232);
          border-radius: 0.25rem;
        }
        .input-inline:focus {
          outline: none;
          background: rgb(254 240 138);
        }
      `}</style>
    </div>
  );
}
