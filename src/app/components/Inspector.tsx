"use client";

import { useProjects } from "@/modules/projects/presentation/ProjectsContext";

// Inspector contextual (E3): proyecto activo y notas honestas de
// almacenamiento. Los datasets importados aún no se ligan a proyectos
// (fase 2): se indica explícitamente.
export default function Inspector() {
  const { active, folders } = useProjects();
  const folder = active
    ? (folders.find((f) => f.id === active.folderId)?.name ?? "Raíz")
    : null;
  return (
    <aside aria-label="Inspector" className="space-y-4 text-sm">
      <section aria-labelledby="insp-proyecto">
        <h2 id="insp-proyecto" className="mb-1 font-semibold">
          Proyecto
        </h2>
        {active ? (
          <dl className="space-y-1">
            <div><dt className="inline text-gray-500">Nombre: </dt><dd className="inline font-medium">{active.name}</dd></div>
            <div><dt className="inline text-gray-500">Carpeta: </dt><dd className="inline">{folder}</dd></div>
            <div><dt className="inline text-gray-500">Creado: </dt><dd className="inline">{active.createdAt.slice(0, 10)}</dd></div>
          </dl>
        ) : (
          <p className="text-gray-500">Abra o cree un proyecto en Inicio.</p>
        )}
      </section>
      <section aria-labelledby="insp-datos">
        <h2 id="insp-datos" className="mb-1 font-semibold">
          Datos y almacenamiento
        </h2>
        <ul className="list-disc space-y-1 pl-4 text-gray-700">
          <li>Proyectos y carpetas se guardan en este dispositivo (IndexedDB).</li>
          <li>Los archivos importados viven solo en memoria: al recargar se reimportan.</li>
          <li>Todavía no hay datasets ligados a proyectos ni plantillas (fases 2–3B).</li>
        </ul>
      </section>
    </aside>
  );
}
