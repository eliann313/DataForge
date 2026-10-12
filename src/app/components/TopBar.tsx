"use client";

import { useProjects } from "@/modules/projects/presentation/ProjectsContext";
import type { ViewName } from "./Sidebar";

const TITLES: Record<ViewName, string> = {
  inicio: "Inicio",
  datos: "Datos",
  analisis: "Análisis",
  transformaciones: "Transformaciones",
  laboratorio: "Laboratorio",
  informes: "Informes",
};

export default function TopBar({
  view,
  onToggleSidebar,
}: {
  view: ViewName;
  onToggleSidebar: () => void;
}) {
  const { active } = useProjects();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Mostrar u ocultar navegación"
        className="rounded border border-gray-300 px-2 py-1 text-sm lg:hidden"
      >
        ☰
      </button>
      <nav aria-label="Ubicación" className="text-sm text-gray-600">
        DataForge / <strong className="text-gray-900">{TITLES[view]}</strong>
      </nav>
      <span className="ml-auto flex items-center gap-2 text-sm">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          En este dispositivo
        </span>
        <span aria-live="polite" className="text-gray-700">
          {active ? `Proyecto: ${active.name}` : "Sin proyecto abierto"}
        </span>
      </span>
    </header>
  );
}
