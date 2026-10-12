"use client";

import EnginePanel from "@/platform/engines/duckdb/EnginePanel";
import ImportPanel, { type ExampleRequest } from "@/platform/engines/duckdb/ImportPanel";
import { useProjects } from "@/modules/projects";

// Vista Datos (E3): motor + importación general. El dataset importado es de la
// sesión (en memoria) y aún no queda ligado al proyecto activo (fase 2).
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
          ? `Trabajando en el proyecto «${active.name}». El dataset importado es de la sesión y todavía no se guarda en el proyecto.`
          : "Sin proyecto abierto: puede importar igual; abra o cree uno en Inicio para organizarse."}
      </p>
      <EnginePanel />
      <ImportPanel example={example} />
    </div>
  );
}
