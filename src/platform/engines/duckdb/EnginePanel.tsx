"use client";

import { useState } from "react";
import { Cpu, Play, RotateCcw, Settings2, Square } from "lucide-react";
import { engine } from "./manager";
import { useEngineSnapshot } from "./useEngine";

export default function EnginePanel() {
  const snap = useEngineSnapshot();
  const [busy, setBusy] = useState(false);

  async function run(op: () => Promise<void>) {
    setBusy(true);
    try {
      await op();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="motor" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-white text-violet-700 shadow-sm"><Cpu size={23} /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="motor" className="text-lg font-semibold text-slate-900">Motor analítico</h2>
            <span role="status" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${snap.status === "ready" ? "bg-emerald-100 text-emerald-800" : snap.status === "error" || snap.status === "closed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{snap.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Estado: {snap.label}</p>
          <p className="mt-1 text-sm text-slate-600">{snap.status === "ready" ? "Listo para explorar tus datos." : "Inicia el motor para importar, explorar y analizar tus datos."}</p>
          {snap.version ? <p className="mt-1 text-xs text-slate-500">Versión DuckDB: {snap.version}</p> : null}
        </div>
      </div>
      {snap.error ? (
        <p role="alert">
          {snap.error} — puede reintentar o reiniciar el motor y volver a
          importar.
        </p>
      ) : null}
      {snap.status === "closed" ? (
        <p>
          El Worker se terminó: los datos en memoria se liberaron. Reinicie el
          motor para continuar.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Inicializar motor"
          disabled={busy || snap.status === "initializing" || snap.status === "ready"}
          onClick={() => void run(() => engine.init())}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={17} aria-hidden="true" />
          Iniciar motor
        </button>{" "}
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-800 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
            <Settings2 size={17} aria-hidden="true" /> Opciones del motor
          </summary>
          <div className="absolute right-0 z-10 mt-1 flex min-w-48 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <button
              type="button"
              disabled={busy || snap.status !== "ready"}
              onClick={() => void run(() => engine.close())}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            ><Square size={15} aria-hidden="true" /> Cerrar motor</button>
            <button
              type="button"
              disabled={busy || snap.status === "initializing" || snap.status === "idle"}
              onClick={() => void run(() => engine.restart())}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            ><RotateCcw size={15} aria-hidden="true" /> Reiniciar motor</button>
          </div>
        </details>
      </div>
    </section>
  );
}
