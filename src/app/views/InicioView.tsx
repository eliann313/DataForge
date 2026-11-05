"use client";

import type { ReactNode } from "react";
import ProjectsPanel from "@/modules/projects/presentation/ProjectsPanel";
import { useProjects } from "@/modules/projects/presentation/ProjectsContext";
import { ArrowRight, ChartNoAxesColumnIncreasing, Database, Folder, LockKeyhole, Monitor, ShoppingCart, UsersRound, WalletCards } from "lucide-react";
import type { ViewName } from "../components/Sidebar";

export interface ExampleDataset {
  file: string;
  name: string;
  description: string;
}

export const EXAMPLES: ExampleDataset[] = [
  {
    file: "demo-data/ventas-demo.csv",
    name: "Ventas",
    description: "Productos, categorías, cantidades e importes.",
  },
  {
    file: "demo-data/finanzas-demo.csv",
    name: "Finanzas",
    description: "Movimientos con tipo, categoría, importe y moneda.",
  },
  {
    file: "demo-data/encuestas-demo.csv",
    name: "Encuestas",
    description: "Respuestas con edad, satisfacción y canal.",
  },
];

export default function InicioView({
  onNavigate,
  onTryExample,
}: {
  onNavigate: (v: ViewName) => void;
  onTryExample: (example: ExampleDataset) => void;
}) {
  const { projects, folders, loaded, active } = useProjects();

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="mb-1 text-sm font-medium text-violet-700">DataForge / Inicio</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Tu espacio de trabajo</h1>
          <p className="mt-1 text-slate-600">Analiza tus datos sin salir del navegador.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
          <Monitor size={16} aria-hidden="true" />
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
          Local y privado
        </div>
      </header>

      <section aria-labelledby="bienvenida" className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-100 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Bienvenido a DataForge</p>
          <h2 id="bienvenida" className="mt-2 max-w-2xl text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl">
            Importa tus archivos, analízalos con DuckDB y explora tus datos de forma local y privada.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Empieza con un archivo propio o prueba un conjunto ficticio. Tus archivos se procesan en este dispositivo.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => onNavigate("datos")} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
              <Database size={16} aria-hidden="true" /> Importar datos
            </button>
            <a href="#ejemplos" className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white/90 px-4 py-2.5 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
              <ChartNoAxesColumnIncreasing size={16} aria-hidden="true" /> Probar un ejemplo
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-5 right-8 hidden h-36 w-52 rotate-[-5deg] place-items-center rounded-xl border border-white bg-white/70 text-violet-600 shadow-xl backdrop-blur-sm lg:grid">
          <ChartNoAxesColumnIncreasing size={76} strokeWidth={1.2} />
        </div>
      </section>

      <section aria-label="Resumen del espacio de trabajo" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<Folder size={21} />} value={loaded ? String(projects.length) : "—"} label="Proyectos" />
        <SummaryCard icon={<Folder size={21} />} value={loaded ? String(folders.length) : "—"} label="Carpetas" />
        <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 shadow-sm">
          <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><Monitor size={21} /></span>
          <div><p className="font-semibold text-slate-900">{active?.name ?? "Almacenamiento local"}</p><p className="text-sm text-slate-500">{active ? "Proyecto activo" : "Tus datos permanecen en este dispositivo"}</p></div>
        </div>
      </section>

      <section aria-labelledby="mis-proyectos" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 id="mis-proyectos" className="text-xl font-bold tracking-tight text-slate-950">Mis proyectos</h2><p className="mt-0.5 text-sm text-slate-500">Organiza tu trabajo y continúa donde lo dejaste.</p></div>
        </div>
        <ProjectsPanel />
      </section>

      <section id="ejemplos" aria-labelledby="ejemplos-titulo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><h2 id="ejemplos-titulo" className="text-xl font-bold tracking-tight text-slate-950">Empieza con un ejemplo</h2><p className="mt-1 text-sm text-slate-600">Prueba la importación y exploración con datos ficticios.</p></div>
          <span className="text-xs text-slate-500">Se importan como archivos tabulares</span>
        </div>
        <ul className="grid gap-3 md:grid-cols-3">
          {EXAMPLES.map((example, index) => (
            <li key={example.file} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">{[<ShoppingCart key="ventas" size={21} />, <WalletCards key="finanzas" size={21} />, <UsersRound key="encuestas" size={21} />][index]}</span>
              <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{example.name}</h3><p className="mt-0.5 text-sm leading-5 text-slate-500">{example.description}</p><p className="mt-1 text-xs text-slate-400">Datos ficticios</p></div>
              <button type="button" onClick={() => onTryExample(example)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">Explorar <ArrowRight size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      </section>
      <p className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-slate-600"><LockKeyhole size={16} aria-hidden="true" className="shrink-0 text-violet-700" />Privacidad por diseño: tus archivos se procesan localmente durante esta sesión. No se suben a la nube.</p>
    </div>
  );
}

function SummaryCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 shadow-sm"><span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700">{icon}</span><div><p className="text-2xl font-bold leading-none text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div></div>;
}
