"use client";

import { Menu, PanelLeft } from "lucide-react";
import type { RefObject } from "react";
import { useProjects } from "@/modules/projects";
import type { ViewName } from "./Sidebar";

const TITLES: Record<ViewName, string> = {
  inicio: "Inicio",
  datos: "Datos",
  analisis: "Análisis",
  finanzas: "Finanzas",
  transformaciones: "Transformaciones",
  laboratorio: "Laboratorio",
  informes: "Informes",
};

export default function TopBar({
  view,
  onToggleSidebar,
  sidebarOpen,
  toggleRef,
}: {
  view: ViewName;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
}) {
  const { active } = useProjects();
  return (
    <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <button
        ref={toggleRef}
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Cerrar navegación" : "Abrir navegación"}
        aria-expanded={sidebarOpen}
        aria-controls="secciones"
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-indigo-500 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-2 text-xs text-slate-500 sm:text-[13px]">
          <PanelLeft aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
          <span className="truncate">{active ? `Proyecto: ${active.name}` : "Workspace"}</span>
          <span aria-hidden="true" className="text-slate-300">/</span>
          <span className="truncate font-semibold text-slate-800">{TITLES[view]}</span>
        </nav>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Datos en este dispositivo
        </span>
        <span className="rounded-md bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700">Local</span>
      </div>
    </header>
  );
}
