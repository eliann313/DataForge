"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import {
  FinanceService,
  formatMoney,
  type Currency,
  type CurrencyTotal,
  type CategoryTotal,
  type FinancialTransaction,
  type MonthPoint,
  type MovementKind,
} from "@/modules/finance";
import { IndexedDBTransactionRepository } from "@/modules/finance";
import { WalletCards, Plus, Tag } from "lucide-react";

const ChartView = dynamic(() => import("@/app/components/ChartView"), {
  ssr: false,
  loading: () => <p>Cargando gráfico…</p>,
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth(): { y: number; m: number } {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

interface FormState {
  date: string;
  description: string;
  kind: MovementKind;
  amount: string;
  currency: Currency;
  category: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  date: todayISO(),
  description: "",
  kind: "gasto",
  amount: "",
  currency: "ARS",
  category: "",
  notes: "",
});

// Finanzas Lite (E6 / 3B): registro manual, resumen mensual por moneda
// (ARS y USD por separado, sin conversión) y gráficos básicos.
export default function FinanceView() {
  const service = useMemo(
    () => new FinanceService({ transactions: new IndexedDBTransactionRepository() }),
    [],
  );
  const [list, setList] = useState<FinancialTransaction[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<CurrencyTotal[]>([]);
  const [breakdown, setBreakdown] = useState<CategoryTotal[]>([]);
  const [evolution, setEvolution] = useState<MonthPoint[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh(y = month.y, m = month.m) {
    // Nunca "Guardado" antes de confirmar: todo pasa por await + refresh.
    const [l, s, b, e] = await Promise.all([
      service.list(),
      service.monthlySummary(y, m),
      service.categoryBreakdown(y, m),
      service.evolution(y, m, 6),
    ]);
    setList(l);
    setSummary(s);
    setBreakdown(b);
    setEvolution(e);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        if (!cancelled) await refresh();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Error de almacenamiento");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (editingId) {
        await service.update({ id: editingId, ...form });
      } else {
        await service.create(form);
      }
      await refresh();
      setSaved(true);
      setForm(emptyForm());
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(tx: FinancialTransaction) {
    setEditingId(tx.id);
    setForm({
      date: tx.date,
      description: tx.description,
      kind: tx.kind,
      amount: String(tx.amountMinor / 100).replace(".", ","),
      currency: tx.currency,
      category: tx.category,
      notes: tx.notes,
    });
    setSaved(false);
    setError(null);
  }

  async function changeMonth(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return;
    setMonth({ y, m });
    setBusy(true);
    try {
      await refresh(y, m);
    } finally {
      setBusy(false);
    }
  }

  const categories = [...new Set(list.map((t) => t.category))].sort();
  const gastosARS = breakdown.filter((b) => b.kind === "gasto" && b.currency === "ARS");
  const gastosUSD = breakdown.filter((b) => b.kind === "gasto" && b.currency === "USD");
  const evoARS = evolution.filter((p) => p.currency === "ARS");
  const evoUSD = evolution.filter((p) => p.currency === "USD");
  const hasEvoARS = evoARS.some((p) => p.income > 0 || p.expense > 0);
  const hasEvoUSD = evoUSD.some((p) => p.income > 0 || p.expense > 0);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" })
    .format(new Date(month.y, month.m - 1, 1));
  const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50";

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-violet-700">Finanzas personales</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Finanzas</h1>
          <p className="mt-1 text-sm text-slate-600">Registra y consulta tus ingresos y gastos en este dispositivo.</p></div>
        <label className="text-sm font-medium text-slate-600">Mes
          <input id="mes" type="month" disabled={busy} value={`${month.y}-${String(month.m).padStart(2, "0")}`}
            onChange={(e) => void changeMonth(e.target.value)} className={`${input} mt-1 w-auto`} />
        </label>
      </header>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {saved ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Movimiento guardado correctamente.</p> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <section aria-labelledby="movimiento" className={card}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div>
              <h2 id="movimiento" className="text-lg font-bold">{editingId ? "Editar movimiento" : "Nuevo movimiento"}</h2>
              <p className="mt-1 text-xs text-slate-500">Los datos se guardan solo en este dispositivo.</p></div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800">Registro manual</span></div>
            <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Fecha<input type="date" required value={form.date} disabled={busy}
                onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} /></label>
              <label className="text-sm font-medium">Tipo<select value={form.kind} disabled={busy}
                onChange={(e) => setForm({ ...form, kind: e.target.value as MovementKind })} className={input}>
                <option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></label>
              <label className="text-sm font-medium sm:col-span-2">Descripción<input type="text" required maxLength={200}
                value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej.: Supermercado" className={input} /></label>
              <label className="text-sm font-medium">Importe<input type="text" required inputMode="decimal" value={form.amount}
                disabled={busy} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1.234,56"
                aria-describedby="formato-importe" className={input} /><span id="formato-importe" className="mt-1 block text-xs font-normal text-slate-500">Formato es-AR: 1234,56 o 1.234,56.</span></label>
              <label className="text-sm font-medium">Moneda<select value={form.currency} disabled={busy}
                onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })} className={input}>
                <option value="ARS">ARS · Peso argentino</option><option value="USD">USD · Dólar estadounidense</option></select></label>
              <label className="text-sm font-medium sm:col-span-2">Categoría<input type="text" required maxLength={60} list="categorias"
                value={form.category} disabled={busy} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej.: Alimentos" className={input} /><datalist id="categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="text-sm font-medium sm:col-span-2">Notas <span className="font-normal text-slate-500">(opcional)</span>
                <textarea maxLength={500} rows={2} value={form.notes} disabled={busy} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Agrega una nota" className={input} /></label>
              <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={busy}
                className="flex-1 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-60">
                {busy ? "Guardando…" : editingId ? "Guardar cambios" : <><Plus aria-hidden="true" className="mr-1 inline size-4" />Guardar movimiento</>}</button>
                {editingId ? <button type="button" disabled={busy} onClick={() => { setEditingId(null); setForm(emptyForm()); }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium">Cancelar</button> : null}</div>
            </form>
          </section>
          <section aria-labelledby="evolucion" className={card}>
            <h2 id="evolucion" className="text-lg font-bold">Evolución del saldo</h2>
            <p className="mb-3 text-sm text-slate-500">Últimos seis meses · ARS y USD por separado</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {hasEvoARS ? <div><h3 className="mb-2 text-sm font-semibold">Saldo mensual ARS</h3><ChartView title="Saldo mensual ARS" kind="line" points={evoARS.map((p) => ({ label: p.month, value: p.balance / 100 }))} /></div> : null}
              {hasEvoUSD ? <div><h3 className="mb-2 text-sm font-semibold">Saldo mensual USD</h3><ChartView title="Saldo mensual USD" kind="line" points={evoUSD.map((p) => ({ label: p.month, value: p.balance / 100 }))} /></div> : null}
              {!hasEvoARS && !hasEvoUSD ? <p role="status" className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-600 lg:col-span-2">Sin movimientos en los últimos seis meses.</p> : null}
              {hasEvoARS && !hasEvoUSD ? <p role="status" className="self-center rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">Sin movimientos en USD durante este período.</p> : null}
              {!hasEvoARS && hasEvoUSD ? <p role="status" className="self-center rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">Sin movimientos en ARS durante este período.</p> : null}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="resumen" className={card}>
            <div className="mb-4 flex items-center justify-between"><div><h2 id="resumen" className="text-lg font-bold">Resumen del mes</h2>
              <p className="text-sm capitalize text-slate-500">{monthLabel}</p></div><span className="text-xs text-slate-500">Sin conversión</span></div>
            <div className="grid gap-3 sm:grid-cols-2">{summary.map((s) => (
              <article key={s.currency} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-bold"><span className="grid size-8 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-800">{s.currency}</span>{s.currency === "ARS" ? "Pesos argentinos" : "Dólares"}</h3>
                <dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-600">Ingresos</dt><dd className="font-semibold tabular-nums">{formatMoney(s.income, s.currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-600">Gastos</dt><dd className="font-semibold tabular-nums">{formatMoney(s.expense, s.currency)}</dd></div>
                  <div className="mt-3 flex justify-between gap-3 rounded-lg bg-violet-100 px-3 py-2 text-violet-900"><dt className="font-bold">Saldo</dt><dd className="font-bold tabular-nums">{formatMoney(s.balance, s.currency)}</dd></div></dl>
              </article>))}</div>
          </section>
          <section aria-labelledby="por-categoria" className={card}>
            <h2 id="por-categoria" className="text-lg font-bold">Gastos por categoría</h2>
            {gastosARS.length ? <div className="mt-3"><h3 className="mb-2 text-sm font-semibold">ARS</h3><ChartView title={`Gastos por categoría ARS ${month.y}-${month.m}`} kind="bar" points={gastosARS.map((g) => ({ label: g.category, value: g.total / 100 }))} /></div> : null}
            {gastosUSD.length ? <div className="mt-3"><h3 className="mb-2 text-sm font-semibold">USD</h3><ChartView title={`Gastos por categoría USD ${month.y}-${month.m}`} kind="bar" points={gastosUSD.map((g) => ({ label: g.category, value: g.total / 100 }))} /></div> : null}
            {!gastosARS.length && !gastosUSD.length ? <div className="mt-4 rounded-xl bg-slate-50 p-8 text-center"><div aria-hidden="true" className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-violet-100 text-violet-700"><Tag className="size-6" /></div><h3 className="font-semibold">Aún no hay gastos</h3><p className="mt-1 text-sm text-slate-600">Registra un gasto para ver su distribución por categoría.</p></div> : null}
          </section>
        </div>
      </div>

      <section aria-labelledby="movimientos" className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 id="movimientos" className="text-lg font-bold">Movimientos recientes</h2>
          <p className="text-sm text-slate-500">{list.length} movimiento{list.length === 1 ? "" : "s"}</p></div></div>
        {list.length === 0 ? (
          <div role="status" className="rounded-xl bg-slate-50 px-5 py-10 text-center"><WalletCards aria-hidden="true" className="mx-auto mb-2 size-7 text-violet-700" />
            <p className="font-semibold">Todavía no registraste movimientos</p><p className="mt-1 text-sm text-slate-500">Cuando agregues un ingreso o un gasto, lo verás aquí.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-3 py-3">Fecha</th><th scope="col" className="px-3 py-3">Descripción</th>
                <th scope="col" className="px-3 py-3">Tipo</th><th scope="col" className="px-3 py-3 text-right">Importe</th>
                <th scope="col" className="px-3 py-3">Categoría</th><th scope="col" className="px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600"><time dateTime={t.date}>{formatDate(t.date)}</time></td>
                  <td className="px-3 py-3 font-medium">{t.description}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.kind === "ingreso" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{t.kind === "ingreso" ? "Ingreso" : "Gasto"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(t.amountMinor, t.currency)}</td>
                  <td className="px-3 py-3 text-slate-600">{t.category}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <button type="button" disabled={busy} onClick={() => startEdit(t)} className="mr-3 font-medium text-violet-700 underline-offset-2 hover:underline">
                      Editar
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmId(t.id)}
                      className="font-medium text-red-700 underline-offset-2 hover:underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <ConfirmDialog
        open={confirmId !== null}
        title="Eliminar movimiento"
        message="El movimiento se eliminará del almacenamiento local."
        confirmLabel="Eliminar"
        onConfirm={() => {
          const id = confirmId;
          if (id) {
            setBusy(true);
            service.remove(id).then(() => refresh()).catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "Error al eliminar");
            }).finally(() => setBusy(false));
          }
        }}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
