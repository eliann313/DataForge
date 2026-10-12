import EnginePanel from "@/platform/engines/duckdb/EnginePanel";
import "./page.css";

export default function Home() {
  return (
    <main className="container">
      <p className="kicker">DataForge · Fase 0A — Fundamento tabular</p>
      <h1>Esqueleto técnico (spike 0A en curso)</h1>
      <p>
        Esta página verifica los ítems <strong>0A.1–0A.2 / E1</strong> del plan
        de primeras entregas: instalación reproducible, tipado estricto, lint,
        build estático, motor DuckDB-Wasm en Worker con inicio diferido y
        reinicio. No es la landing definitiva ni el workspace.
      </p>
      <EnginePanel />
      <section aria-labelledby="verifica">
        <h2 id="verifica">Qué verifica este esqueleto</h2>
        <ul>
          <li>Next.js con exportación estática (`output: &quot;export&quot;`).</li>
          <li>TypeScript estricto y lint sin errores.</li>
          <li>Pruebas unitarias con Vitest y smoke E2E con Playwright.</li>
          <li>CI básica: tipado + lint + tests + build.</li>
        </ul>
      </section>
      <section aria-labelledby="fuera">
        <h2 id="fuera">Fuera de este alcance</h2>
        <ul>
          <li>Importación CSV/XLSX y consultas de datos (0A.3 en adelante).</li>
          <li>Proyectos, Data Explorer, gráficos y Finanzas Lite (fases 1–3B).</li>
          <li>Cuentas, nube, IA remota y servidores (requieren aprobación).</li>
        </ul>
      </section>
      <p className="nota">
        Estado real del repositorio: documentación más este esqueleto. Nada de
        lo descrito en el roadmap está implementado hasta que el código y las
        pruebas lo demuestren.
      </p>
    </main>
  );
}
