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

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Registro manual de ingresos y gastos (Finanzas Lite). Importes exactos
        en centavos; ARS y USD se informan por separado, sin conversión.
      </p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-green-800">Guardado.</p> : null}

      <section aria-labelledby="movimiento">
        <h2 id="movimiento" className="mb-1 text-lg font-bold">
          {editingId ? "Editar movimiento" : "Nuevo movimiento"}
        </h2>
        <form onSubmit={(e) => void submit(e)} className="grid max-w-2xl gap-2 text-sm md:grid-cols-2">
          <label>Fecha:{" "}
            <input type="date" required value={form.date} disabled={busy}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label>Tipo:{" "}
            <select value={form.kind} disabled={busy}
              onChange={(e) => setForm({ ...form, kind: e.target.value as MovementKind })}
              className="rounded border border-gray-300 px-2 py-1">
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </label>
          <label className="md:col-span-2">Descripción:{" "}
            <input type="text" required maxLength={200} value={form.description} disabled={busy}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ej.: Supermercado"
              className="w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label>Importe:{" "}
            <input type="text" required inputMode="decimal" value={form.amount} disabled={busy}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="1234,56" aria-describedby="formato-importe"
              className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <span id="formato-importe" className="text-xs text-gray-500">
            Formato es-AR: 1234,56 o 1.234,56 (punto de miles, coma decimal).
          </span>
          <label>Moneda:{" "}
            <select value={form.currency} disabled={busy}
              onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
              className="rounded border border-gray-300 px-2 py-1">
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>Categoría:{" "}
            <input type="text" required maxLength={60} list="categorias" value={form.category} disabled={busy}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej.: alimentos"
              className="rounded border border-gray-300 px-2 py-1" />
            <datalist id="categorias">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="md:col-span-2">Notas:{" "}
            <input type="text" maxLength={500} value={form.notes} disabled={busy}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <p className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={busy}
              className="rounded bg-violet-800 px-4 py-1.5 font-medium text-white">
              {editingId ? "Guardar cambios" : "Agregar"}
            </button>
            {editingId ? (
              <button type="button" disabled={busy}
                onClick={() => { setEditingId(null); setForm(emptyForm()); }}
                className="rounded border border-gray-300 px-3 py-1.5">
                Cancelar
              </button>
            ) : null}
          </p>
        </form>
      </section>

      <section aria-labelledby="resumen">
        <h2 id="resumen" className="mb-1 text-lg font-bold">Resumen mensual</h2>
        <p className="text-sm">
          <label htmlFor="mes">Mes: </label>
          <input id="mes" type="month" disabled={busy}
            value={`${month.y}-${String(month.m).padStart(2, "0")}`}
            onChange={(e) => void changeMonth(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1" />
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {summary.map((s) => (
            <div key={s.currency} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="font-semibold">{s.currency} (sin conversión)</p>
              <ul className="text-sm">
                <li>Ingresos: {formatMoney(s.income, s.currency)}</li>
                <li>Egresos: {formatMoney(s.expense, s.currency)}</li>
                <li><strong>Saldo: {formatMoney(s.balance, s.currency)}</strong></li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="por-categoria">
        <h2 id="por-categoria" className="mb-1 text-lg font-bold">Gastos por categoría</h2>
        {gastosARS.length > 0 ? (
          <ChartView title={`Gastos por categoría ARS ${month.y}-${month.m}`} kind="bar"
            points={gastosARS.map((g) => ({ label: g.category, value: g.total / 100 }))} />
        ) : <p className="text-sm text-gray-500">Sin gastos ARS este mes.</p>}
        {gastosUSD.length > 0 ? (
          <div className="mt-4">
            <ChartView title={`Gastos por categoría USD ${month.y}-${month.m}`} kind="bar"
              points={gastosUSD.map((g) => ({ label: g.category, value: g.total / 100 }))} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="evolucion">
        <h2 id="evolucion" className="mb-1 text-lg font-bold">Evolución (6 meses, saldo)</h2>
        <ChartView title="Saldo mensual ARS" kind="line"
          points={evoARS.map((p) => ({ label: p.month, value: p.balance / 100 }))} />
        <div className="mt-4">
          <ChartView title="Saldo mensual USD" kind="line"
            points={evoUSD.map((p) => ({ label: p.month, value: p.balance / 100 }))} />
        </div>
      </section>

      <section aria-labelledby="movimientos">
        <h2 id="movimientos" className="mb-1 text-lg font-bold">
          Movimientos ({list.length})
        </h2>
        {list.length === 0 ? (
          <p role="status" className="text-sm text-gray-500">
            Sin movimientos: registre el primero arriba (sin archivo).
          </p>
        ) : (
          <table className="df-table">
            <thead>
              <tr>
                <th scope="col">Fecha</th><th scope="col">Descripción</th>
                <th scope="col">Tipo</th><th scope="col">Importe</th>
                <th scope="col">Categoría</th><th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.description}</td>
                  <td>{t.kind}</td>
                  <td>{formatMoney(t.amountMinor, t.currency)}</td>
                  <td>{t.category}</td>
                  <td className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => startEdit(t)} className="underline">
                      Editar
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmId(t.id)}
                      className="text-red-700 underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
