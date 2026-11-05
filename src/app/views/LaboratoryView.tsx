"use client";

import {
  Braces, ChartNoAxesColumnIncreasing,
  ChevronDown, Code2, Database, Download, FileCode2, FlaskConical,
  LineChart, LockKeyhole, Monitor, Play, Save, Search, Settings2,
  Sparkles, Table2, TrendingUp, type LucideIcon,
} from "lucide-react";

type Tool = { label: string; icon: LucideIcon; status: "Disponible en una fase futura" };

const tools: Tool[] = [
  { label: "SQL", icon: Database, status: "Disponible en una fase futura" },
  { label: "Python", icon: Braces, status: "Disponible en una fase futura" },
  { label: "Series temporales", icon: LineChart, status: "Disponible en una fase futura" },
  { label: "Pronósticos", icon: TrendingUp, status: "Disponible en una fase futura" },
  { label: "Optimización", icon: Settings2, status: "Disponible en una fase futura" },
  { label: "Rust / DTW", icon: Code2, status: "Disponible en una fase futura" },
];

function UpcomingBadge({ children = "Próximamente" }: { children?: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"><LockKeyhole size={12} aria-hidden="true" />{children}</span>;
}

function DisabledButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <button type="button" disabled aria-disabled="true" className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400 opacity-80 ${className}`}>{children}</button>;
}

export default function LaboratoryView() {
  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="mb-1 text-sm font-medium text-violet-700">Workspace / Laboratorio</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Laboratorio</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800"><FlaskConical size={15} aria-hidden="true" />Diseño conceptual · fase futura</span>
          </div>
          <p className="mt-1 text-slate-600">Consultas y herramientas avanzadas para profundizar en tus datos.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800"><Monitor size={16} aria-hidden="true" />Local y privado</div>
      </header>

      <nav aria-label="Herramientas del laboratorio" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tools.map(({ label, icon: Icon }) => (
          <button key={label} type="button" disabled aria-disabled="true" title={`${label}: disponible en una fase futura`} className="flex min-h-[68px] cursor-not-allowed items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left opacity-75 shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><Icon size={21} aria-hidden="true" /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-1 block"><UpcomingBadge /></span></span>
          </button>
        ))}
      </nav>

      <section aria-labelledby="sql-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white p-3 sm:px-4">
          <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400" aria-disabled="true"><Database size={17} aria-hidden="true" />Seleccionar dataset<ChevronDown className="ml-auto" size={16} aria-hidden="true" /></div>
          <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"><FileCode2 size={17} aria-hidden="true" />Consulta SQL<UpcomingBadge /></div>
          <DisabledButton><Save size={15} aria-hidden="true" />Guardar</DisabledButton>
          <DisabledButton className="border-violet-200 bg-violet-100 text-violet-500"><Play size={15} aria-hidden="true" />Ejecutar consulta</DisabledButton>
        </div>

        <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#111a2e]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="h-2.5 w-2.5 rounded-full bg-slate-600" /><span className="ml-2">Editor SQL</span></div>
                <UpcomingBadge>Vista conceptual</UpcomingBadge>
              </div>
              <div className="grid min-h-[190px] place-items-center p-6 text-center sm:min-h-[230px]">
                <div className="max-w-md">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-violet-400/10 text-violet-300"><Code2 size={24} aria-hidden="true" /></span>
                  <h2 id="sql-heading" className="mt-3 text-lg font-semibold text-white">El editor SQL llegará más adelante</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Esta sección es una vista conceptual. La ejecución de consultas SQL libres todavía no está disponible.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2 text-xs text-slate-400"><span className="flex items-center gap-1.5"><LockKeyhole size={13} aria-hidden="true" />Sin ejecución ni acceso a datasets desde esta vista</span><span>Editor no disponible</span></div>
            </div>

            <section aria-labelledby="results-heading" className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2"><Table2 size={18} className="text-slate-500" aria-hidden="true" /><h2 id="results-heading" className="font-semibold text-slate-900">Resultados</h2><span className="hidden text-slate-300 sm:inline" aria-hidden="true">|</span><span className="text-sm text-slate-500">Sin resultados</span></div>
                <DisabledButton><Download size={15} aria-hidden="true" />Exportar<ChevronDown size={14} aria-hidden="true" /></DisabledButton>
              </div>
              <div className="m-3 grid min-h-[140px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
                <div><Table2 size={25} className="mx-auto text-slate-300" aria-hidden="true" /><p className="mt-2 font-semibold text-slate-700">Aún no hay resultados</p><p className="mt-1 text-sm text-slate-500">Cuando las consultas estén disponibles, sus resultados aparecerán aquí.</p></div>
              </div>
            </section>
          </div>

          <aside aria-labelledby="schema-heading" className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Database size={18} className="text-slate-600" aria-hidden="true" /><h2 id="schema-heading" className="font-semibold text-slate-900">Esquema del dataset</h2><button type="button" disabled aria-label="Buscar columnas (no disponible)" className="ml-auto rounded-md border border-slate-200 p-2 text-slate-400"><Search size={16} aria-hidden="true" /></button></div>
            <div className="grid min-h-[245px] place-items-center p-6 text-center">
              <div><div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-violet-50 text-violet-600"><Database size={38} strokeWidth={1.5} aria-hidden="true" /></div><p className="mt-4 font-semibold text-slate-800">Selecciona un dataset</p><p className="mt-1 max-w-[220px] text-sm leading-5 text-slate-500">El esquema aparecerá aquí cuando esta función esté implementada.</p></div>
            </div>
          </aside>
        </div>
      </section>

      <section aria-label="Herramientas avanzadas planificadas" className="grid gap-3 md:grid-cols-2">
        <FutureCard icon={Braces} title="Python científico" text="Análisis estadístico avanzado con herramientas científicas de Python." />
        <FutureCard icon={ChartNoAxesColumnIncreasing} title="Series temporales" text="Herramientas especializadas para explorar datos ordenados en el tiempo." />
      </section>

      <p className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm leading-5 text-slate-600"><LockKeyhole size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-violet-700" />Las herramientas de esta pantalla son una propuesta para fases futuras. No se ejecutan consultas ni análisis avanzados desde aquí.</p>
    </section>
  );
}

function FutureCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <article className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Icon size={23} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{title}</h2><UpcomingBadge>Fase futura</UpcomingBadge></div><p className="mt-1 text-sm leading-5 text-slate-600">{text}</p></div><Sparkles size={17} className="mt-1 shrink-0 text-violet-300" aria-hidden="true" /></article>;
}
