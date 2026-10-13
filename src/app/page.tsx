"use client";

import { useEffect, useState } from "react";
import { ProjectsProvider, useProjects } from "@/modules/projects";
import { engine } from "@/platform/engines/duckdb/manager";
import Inspector from "./components/Inspector";
import Sidebar, { type ViewName } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DatosView from "./views/DatosView";
import AnalysisView from "./views/AnalysisView";
import FinanceView from "./views/FinanceView";
import InicioView, { type ExampleDataset } from "./views/InicioView";
import TransformationsView from "./views/TransformationsView";
import type { ExampleRequest } from "@/platform/engines/duckdb/ImportPanel";

// Shell E3: sidebar oscura, contenido claro, inspector contextual.
// Sin rutas dinámicas (exportación estática): la vista es estado local.
export default function Home() {
  return (
    <ProjectsProvider>
      <WorkspaceHome />
    </ProjectsProvider>
  );
}

function WorkspaceHome() {
  const { activeId } = useProjects();
  const [view, setView] = useState<ViewName>("inicio");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [example, setExample] = useState<ExampleRequest | null>(null);

  useEffect(() => {
    engine.selectProject(activeId);
  }, [activeId]);

  function navigate(v: ViewName) {
    setView(v);
    setSidebarOpen(false);
  }

  function tryExample(ex: ExampleDataset) {
    setExample({ url: ex.file, name: ex.file.split("/").pop() ?? ex.file, nonce: Date.now() });
    setView("datos");
    setSidebarOpen(false);
  }

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:bg-white focus:p-2"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-screen bg-gray-50 font-sans text-gray-900">
        <div
          className={`fixed inset-y-0 left-0 z-20 w-60 bg-gray-900 p-4 text-gray-100 transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <p className="mb-4 text-lg font-bold">DataForge</p>
          <Sidebar view={view} onNavigate={navigate} />
        </div>
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Cerrar navegación"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-10 bg-black/40 lg:hidden"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar view={view} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
          <div className="grid flex-1 gap-6 p-4 lg:grid-cols-[1fr_16rem] lg:p-6">
            <main id="contenido" tabIndex={-1} className="min-w-0">
              {view === "inicio" ? (
                <InicioView onNavigate={navigate} onTryExample={tryExample} />
              ) : view === "datos" ? (
                <DatosView example={example} />
              ) : view === "analisis" ? (
                <AnalysisView />
              ) : view === "finanzas" ? (
                <FinanceView />
              ) : view === "transformaciones" ? (
                <TransformationsView onImportData={() => navigate("datos")} />
              ) : null}
            </main>
            <Inspector />
          </div>
        </div>
      </div>
    </>
  );
}
