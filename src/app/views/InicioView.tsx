"use client";

import ProjectsPanel from "@/modules/projects/presentation/ProjectsPanel";
import type { ViewName } from "../components/Sidebar";

export interface ExampleDataset {
  file: string;
  name: string;
  description: string;
}

export const EXAMPLES: ExampleDataset[] = [
  {
    file: "demo-data/ventas-demo.csv",
    name: "Ventas de ejemplo",
    description: "12 operaciones con producto, categoría, cantidad e importe.",
  },
  {
    file: "demo-data/finanzas-demo.csv",
    name: "Finanzas de ejemplo",
    description: "10 movimientos con tipo, categoría, importe y moneda (ARS/USD por separado).",
  },
  {
    file: "demo-data/encuestas-demo.csv",
    name: "Encuesta de ejemplo",
    description: "10 respuestas con edad, satisfacción (1–5) y canal.",
  },
];

// Portada (E3): qué es DataForge hoy, dos CTAs solo con capacidades
// existentes, proyectos locales y ejemplos ficticios reutilizando la
// importación general (no habilitan plantillas posteriores).
export default function InicioView({
  onNavigate,
  onTryExample,
}: {
  onNavigate: (v: ViewName) => void;
  onTryExample: (example: ExampleDataset) => void;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="bienvenida">
        <p className="text-sm font-semibold text-violet-900">
          DataForge · Análisis de datos local
        </p>
        <h1 id="bienvenida" className="mb-2 text-2xl font-bold">
          Analice sus archivos en el navegador, sin cuenta
        </h1>
        <p className="mb-4 max-w-2xl text-gray-700">
          Importe un CSV o XLSX y explórelo con DuckDB en su propio equipo:
          esquema, conteos, agregados y vista previa. Nada sale del navegador.
          Estado: fase 1 en curso (proyectos locales e importación general).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate("datos")}
            className="rounded bg-violet-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Importar mis datos
          </button>
          <a
            href="#ejemplos"
            className="rounded border border-violet-800 px-4 py-2 text-sm font-semibold text-violet-900"
          >
            Probar un ejemplo
          </a>
        </div>
      </section>

      <section aria-labelledby="mis-proyectos">
        <h2 id="mis-proyectos" className="mb-2 text-lg font-bold">
          Mis proyectos
        </h2>
        <ProjectsPanel />
      </section>

      <section aria-labelledby="ejemplos">
        <h2 id="ejemplos" className="mb-1 text-lg font-bold">
          Ejemplos con datos ficticios
        </h2>
        <p className="mb-3 text-sm text-gray-600">
          Se importan con el mismo motor general. No habilitan plantillas
          especializadas (fases 3B–7B).
        </p>
        <ul className="grid gap-3 md:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <li key={ex.file} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-semibold">{ex.name}</p>
              <p className="mb-1 text-sm text-gray-600">{ex.description}</p>
              <p className="mb-2 text-xs text-gray-500">Datos ficticios.</p>
              <button
                type="button"
                onClick={() => onTryExample(ex)}
                className="rounded border border-violet-800 px-3 py-1.5 text-sm font-medium text-violet-900"
              >
                Probar este ejemplo
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
