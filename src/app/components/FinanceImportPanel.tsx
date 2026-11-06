"use client";

import { useMemo, useState } from "react";
import { FinanceImportService, readFinanceFile, type Currency, type FinancialAccount, type ImportField, type ImportMapping, type ImportPreview, IndexedDBTransactionRepository, formatMoney } from "@/modules/finance";

const fields: Array<{ key: ImportField; label: string }> = [
  { key: "date", label: "Fecha" }, { key: "description", label: "Descripción" },
  { key: "kind", label: "Tipo (ingreso/gasto)" }, { key: "amount", label: "Importe" }, { key: "category", label: "Categoría" },
];
const baseMapping: ImportMapping = { date: 0, description: 0, kind: 0, amount: 0, category: 0 };

export default function FinanceImportPanel({ accounts, onImported }: { accounts: FinancialAccount[]; onImported: () => Promise<void> }) {
  const service = useMemo(() => new FinanceImportService(new IndexedDBTransactionRepository()), []);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportMapping>(baseMapping);
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eligible = accounts
    .filter((account) => account.currency === currency)
    .sort((left, right) => Number(left.type === "card") - Number(right.type === "card"));
  async function chooseFile(file?: File) {
    setError(null); setMessage(null); setPreview(null); setHeaders([]); setRows([]); setMapping(baseMapping);
    if (!file) return;
    setBusy(true);
    try {
      const table = await readFinanceFile(file);
      setHeaders(table.headers); setRows(table.rows);
      const initial: ImportMapping = { date: 0, description: Math.min(1, table.headers.length - 1), kind: Math.min(2, table.headers.length - 1), amount: Math.min(3, table.headers.length - 1), category: Math.min(4, table.headers.length - 1) };
      setMapping(initial);
      setMessage(`${table.rows.length} fila${table.rows.length === 1 ? "" : "s"} leída${table.rows.length === 1 ? "" : "s"} de ${file.name}. Asigna cada columna y genera la vista previa.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo leer el archivo."); }
    finally { setBusy(false); }
  }
  async function makePreview() {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (new Set(Object.values(mapping)).size !== fields.length) throw new Error("Asigna una columna distinta a cada campo requerido.");
      const account = eligible.find((item) => item.id === accountId) ?? eligible[0];
      if (!account) throw new Error("No hay una cuenta disponible para esta moneda.");
      const result = await service.preview(rows, mapping, currency, account);
      setPreview(result);
      setPreviewPage(0);
      setMessage(`Vista previa: ${result.validCount} nuevos, ${result.duplicateCount} duplicados y ${result.errorCount} errores.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo validar el lote."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const imported = await service.confirm(preview);
      await onImported();
      setHeaders([]); setRows([]); setPreview(null);
      setMessage(`Se importaron ${imported} movimientos correctamente.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo importar el lote."); }
    finally { setBusy(false); }
  }
  const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <section aria-labelledby="importar-movimientos" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="importar-movimientos" className="text-lg font-bold">Importar movimientos</h2><p className="mt-1 text-sm text-slate-600">CSV o XLSX local. El archivo no se envía a ningún servidor.</p></div>
      <label className={`${input} cursor-pointer font-semibold text-violet-800`}>Seleccionar archivo<input className="sr-only" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} /></label></div>
    {headers.length > 0 ? <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(({ key, label }) => <label key={key} className="text-xs font-semibold text-slate-700">Columna: {label}<select aria-label={`Columna: ${label}`} className={`${input} mt-1 w-full`} value={mapping[key]} disabled={busy} onChange={(event) => { setMapping({ ...mapping, [key]: Number(event.target.value) }); setPreview(null); setMessage(null); }}>{headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}</select></label>)}
        <label className="text-xs font-semibold text-slate-700">Moneda<select className={`${input} mt-1 w-full`} value={currency} disabled={busy} onChange={(event) => { const next = event.target.value as Currency; setCurrency(next); setAccountId(accounts.find((account) => account.currency === next)?.id ?? ""); setPreview(null); }}><option value="ARS">ARS</option><option value="USD">USD</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Cuenta<select className={`${input} mt-1 w-full`} value={accountId || eligible[0]?.id || ""} disabled={busy} onChange={(event) => { setAccountId(event.target.value); setPreview(null); }}>{eligible.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      </div>
      <button type="button" disabled={busy} onClick={() => void makePreview()} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Procesando…" : "Validar y ver vista previa"}</button>
    </div> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    {preview ? <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{preview.validCount} nuevos · {preview.duplicateCount} duplicados excluidos · {preview.errorCount} errores</p><button type="button" disabled={busy || preview.errorCount > 0 || preview.validCount === 0} onClick={() => void confirm()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirmar importación</button></div>
      {Math.ceil(preview.rows.length / 50) > 1 ? <nav aria-label="Paginación de vista previa" className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage(previewPage - 1)} className="rounded border px-3 py-1.5 disabled:opacity-50">Filas anteriores</button><span aria-live="polite">Página {previewPage + 1} de {Math.ceil(preview.rows.length / 50)}</span><button type="button" disabled={(previewPage + 1) * 50 >= preview.rows.length} onClick={() => setPreviewPage(previewPage + 1)} className="rounded border px-3 py-1.5 disabled:opacity-50">Filas siguientes</button></nav> : null}
      <div className="max-h-80 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">Fila</th><th className="p-2">Fecha</th><th className="p-2">Descripción</th><th className="p-2">Tipo</th><th className="p-2">Importe</th><th className="p-2">Estado</th></tr></thead><tbody>{preview.rows.slice(previewPage * 50, (previewPage + 1) * 50).map((row) => <tr key={row.line} className="border-t"><td className="p-2">{row.line}</td><td className="p-2">{row.transaction?.date ?? "—"}</td><td className="p-2">{row.transaction?.description ?? "—"}</td><td className="p-2">{row.transaction?.kind ?? "—"}</td><td className="p-2">{row.transaction ? formatMoney(row.transaction.amountMinor, row.transaction.currency) : "—"}</td><td className="p-2">{row.error ? <span className="text-red-700">{row.error}</span> : row.duplicate ? <span className="text-amber-700">Duplicado</span> : <span className="text-emerald-700">Nuevo</span>}</td></tr>)}</tbody></table></div>
    </div> : null}
  </section>;
}
