"use client";

import EnginePanel from "@/platform/engines/duckdb/EnginePanel";
import ImportPanel, { type ExampleRequest } from "@/platform/engines/duckdb/ImportPanel";
import { useProjects } from "@/modules/projects";

// Los archivos del motor viven en memoria durante la sesión del navegador.
export default function DatosView({ example }: { example?: ExampleRequest | null }) {
  const { active } = useProjects();
  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-violet-700">Workspace / Datos</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Datos</h1>
          <p className="mt-1 text-slate-600">Importa y explora archivos en tu dispositivo.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
          {active ? `Proyecto: ${active.name}` : "Sin proyecto abierto"}
        </div>
      </header>
      <EnginePanel />
      <ImportPanel example={example} projectId={active?.id ?? null} />
    </main>
  );
}
