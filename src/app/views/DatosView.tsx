"use client";

import EnginePanel from "@/platform/engines/duckdb/EnginePanel";
import ImportPanel, { type ExampleRequest } from "@/platform/engines/duckdb/ImportPanel";
import { useProjects } from "@/modules/projects";

// Vista Datos: fuentes del proyecto activo durante esta sesión; sus archivos
// siguen en memoria y deben importarse de nuevo después de recargar.
export default function DatosView({
  example,
}: {
  example?: ExampleRequest | null;
}) {
  const { active } = useProjects();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        {active
          ? `Proyecto activo: «${active.name}». Sus datasets quedan disponibles durante esta sesión; no se guardan sus archivos.`
          : "Sin proyecto abierto: puede importar a una sesión sin proyecto; cree uno en Inicio para organizar sus datasets."}
      </p>
      <EnginePanel />
      <ImportPanel example={example} projectId={active?.id ?? null} />
    </div>
  );
}
