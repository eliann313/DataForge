"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProjectsProvider, useProjects } from "@/modules/projects";
import { engine } from "@/platform/engines/duckdb/manager";
import Inspector from "./components/Inspector";
import Sidebar, { type ViewName } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DatosView from "./views/DatosView";
import AnalysisView from "./views/AnalysisView";
import FinanceView from "./views/FinanceView";
import LaboratoryView from "./views/LaboratoryView";
import InicioView, { EXAMPLES, type ExampleDataset } from "./views/InicioView";
import TransformationsView from "./views/TransformationsView";
import { ReportsView, IndexedDBReportRepository } from "@/modules/reports";
import { IndexedDBAnalysisSnapshotRepository } from "@/modules/analysis";
import type { ExampleRequest } from "@/platform/engines/duckdb/ImportPanel";

const reportRepository = new IndexedDBReportRepository();
const snapshotRepository = new IndexedDBAnalysisSnapshotRepository();

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [example, setExample] = useState<ExampleRequest | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const wasSidebarOpen = useRef(false);
  const previousView = useRef(view);

  useEffect(() => {
    engine.selectProject(activeId);
  }, [activeId]);

  useLayoutEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    document.getElementById("contenido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [view]);

  useEffect(() => {
    if (sidebarOpen) {
      sidebarRef.current?.querySelector<HTMLButtonElement>("nav button")?.focus();
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setSidebarOpen(false);
          return;
        }
        if (event.key === "Tab") {
          const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      };
      window.addEventListener("keydown", closeOnEscape);
      wasSidebarOpen.current = true;
      return () => window.removeEventListener("keydown", closeOnEscape);
    }
    if (wasSidebarOpen.current) sidebarToggleRef.current?.focus();
    wasSidebarOpen.current = false;
  }, [sidebarOpen]);

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
      <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
        <aside
          ref={sidebarRef}
          role={sidebarOpen ? "dialog" : undefined}
          aria-label="Navegación principal"
          aria-modal={sidebarOpen || undefined}
          className={`fixed inset-y-0 left-0 z-30 bg-[#111d32] p-4 text-slate-100 shadow-xl transition-[width,transform] duration-200 ease-out lg:translate-x-0 ${
            sidebarCollapsed ? "w-64 lg:w-20" : "w-64"
          } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <Sidebar
            view={view}
            onNavigate={navigate}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
          />
        </aside>
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Cerrar navegación"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
          />
        ) : null}
        <div className={`min-h-screen min-w-0 transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}`}>
          <TopBar view={view} sidebarOpen={sidebarOpen} toggleRef={sidebarToggleRef} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">
            <main id="contenido" tabIndex={-1} className="min-w-0">
              {view === "inicio" ? (
                <InicioView onNavigate={navigate} onTryExample={tryExample} />
              ) : view === "datos" ? (
                <DatosView example={example} />
              ) : view === "analisis" ? (
                <AnalysisView
                  onNavigateToData={() => navigate("datos")}
                  onTryExample={() => tryExample(EXAMPLES[0]!)}
                />
              ) : view === "finanzas" ? (
                <FinanceView />
              ) : view === "transformaciones" ? (
                <TransformationsView onImportData={() => navigate("datos")} />
              ) : view === "laboratorio" ? (
                <LaboratoryView />
              ) : null}
              <div hidden={view !== "informes"}>
                <ReportsView reports={reportRepository} snapshots={snapshotRepository} active={view === "informes"} />
              </div>
            </main>
            <details className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-indigo-500 [&::-webkit-details-marker]:hidden">
                Información del proyecto y almacenamiento
              </summary>
              <div className="border-t border-slate-100 p-4 sm:p-5">
                <Inspector />
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}
