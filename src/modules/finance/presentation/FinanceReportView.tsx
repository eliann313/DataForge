"use client";

import { useState } from "react";
import {
  buildFinanceReport,
  FinanceService,
  financeReportHtml,
  IndexedDBTransactionRepository,
} from "@/modules/finance";

function todayISO(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function monthStartISO(): string {
  return `${todayISO().slice(0, 7)}-01`;
}

export default function FinanceReportView() {
  const [from, setFrom] = useState(monthStartISO);
  const [to, setTo] = useState(todayISO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    // Open the popup during the click gesture so browsers do not block it after IndexedDB reads.
    const output = window.open("about:blank", "_blank");
    if (!output) {
      setError("El navegador bloqueó la ventana del informe.");
      return;
    }

    setBusy(true);
    setError(null);
    const repository = new IndexedDBTransactionRepository();
    try {
      const service = new FinanceService({ transactions: repository });
      const [movements, accounts] = await Promise.all([service.list(), service.accounts()]);
      const report = buildFinanceReport(movements, accounts, from, to);
      output.document.open();
      output.document.write(financeReportHtml(report));
      output.document.close();
      output.focus();
    } catch (cause) {
      output.close();
      setError(cause instanceof Error ? cause.message : "No se pudo crear el informe.");
    } finally {
      repository.close();
      setBusy(false);
    }
  }

  const invalidRange = !from || !to || from > to;

  return (
    <section aria-labelledby="finance-report-title" className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="finance-report-title" className="text-2xl font-bold">Informe financiero</h2>
      <p className="mt-1 text-sm text-slate-600">
        Genera un informe desde los datos de este dispositivo. El rango incluye ambas fechas; ARS y USD se muestran por separado.
      </p>

      {error ? <p role="alert" className="my-3 text-sm text-red-700">{error}</p> : null}

      <div className="my-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium" htmlFor="informe-desde">
          Fecha inicial
          <input
            id="informe-desde"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 p-2"
          />
        </label>
        <label className="text-sm font-medium" htmlFor="informe-hasta">
          Fecha final
          <input
            id="informe-hasta"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 p-2"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={busy || invalidRange}
        onClick={() => void generateReport()}
        className="rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Preparando informe…" : "Generar e imprimir informe"}
      </button>
    </section>
  );
}
