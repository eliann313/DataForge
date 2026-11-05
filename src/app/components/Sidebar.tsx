"use client";

import {
  ChartNoAxesCombined,
  FileChartColumn,
  FlaskConical,
  GitBranch,
  House,
  PanelLeftClose,
  PanelLeftOpen,
  Table2,
  WalletCards,
} from "lucide-react";

// Navegación documentada (docs/design/README.md §3).
export type ViewName =
  | "inicio"
  | "datos"
  | "analisis"
  | "finanzas"
  | "transformaciones"
  | "laboratorio"
  | "informes";

const ITEMS = [
  { id: "inicio", label: "Inicio", ready: true, icon: House },
  { id: "datos", label: "Datos", ready: true, icon: Table2 },
  { id: "analisis", label: "Análisis", ready: true, icon: ChartNoAxesCombined },
  { id: "finanzas", label: "Finanzas", ready: true, icon: WalletCards },
  { id: "transformaciones", label: "Transformaciones", ready: true, icon: GitBranch },
  { id: "laboratorio", label: "Laboratorio", ready: false, icon: FlaskConical },
  { id: "informes", label: "Informes", ready: true, icon: FileChartColumn },
] satisfies { id: ViewName; label: string; ready: boolean; icon: typeof House }[];

export default function Sidebar({
  view,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: {
  view: ViewName;
  onNavigate: (v: ViewName) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <nav id="secciones" aria-label="Secciones" className="flex h-full min-h-0 flex-col">
      <div className={`mb-8 flex h-10 items-center ${collapsed ? "lg:justify-center" : "gap-3 px-2"}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-sm" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
            <path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z" />
            <path d="m4 7.4 8 4.7 8-4.7M12 12.1v9.1M8 5.1l8 4.7" />
          </svg>
        </span>
        <span className={collapsed ? "text-lg font-semibold tracking-tight text-white lg:sr-only" : "text-lg font-semibold tracking-tight text-white"}>DataForge</span>
      </div>

      <div className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ${collapsed ? "lg:sr-only" : ""}`}>
        Workspace
      </div>
      <div className="space-y-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const classes = `group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition-colors ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          } ${view === item.id ? "bg-violet-500/20 font-semibold text-white ring-1 ring-inset ring-violet-300/25" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"}`;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              onClick={() => onNavigate(item.id)}
              className={classes}
              title={collapsed && !item.ready ? `${item.label}: en preparación` : collapsed ? item.label : undefined}
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.7} />
              <span className={collapsed ? "truncate lg:sr-only" : "truncate"}>{item.label}</span>
              {view === item.id && !collapsed ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300" aria-hidden="true" /> : !item.ready && !collapsed ? <span className="ml-auto text-[10px] text-slate-500">En preparación</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-auto border-t border-white/10 pt-4">
        <div className={`mb-3 flex items-center rounded-xl bg-white/[0.06] p-2 ${collapsed ? "lg:justify-center" : "gap-3"}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-700 text-[10px] font-semibold text-slate-200" aria-hidden="true">LOCAL</span>
          <span className={collapsed ? "min-w-0 lg:sr-only" : "min-w-0"}>
            <span className="block text-xs font-medium text-slate-200">En este dispositivo</span>
            <span className="block text-[10px] text-slate-400">Datos locales</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
          aria-expanded={!collapsed}
          className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-xs text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-white ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.7} /> : <PanelLeftClose aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.7} />}
          <span className={collapsed ? "lg:sr-only" : ""}>{collapsed ? "Expandir menú" : "Contraer menú"}</span>
        </button>
      </div>
    </nav>
  );
}
