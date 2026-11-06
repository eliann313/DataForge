import type { FinancialAccount } from "../domain/account";
import { formatMoney, type Currency } from "../domain/money";
import { validateDate, type FinancialTransaction, type MovementKind } from "../domain/transaction";

type AccountType = FinancialAccount["type"];

export interface FinanceReportTotal {
  currency: Currency;
  income: number;
  expense: number;
  refunds: number;
  balance: number;
}

export interface FinanceReportCategory {
  name: string;
  currency: Currency;
  kind: Exclude<MovementKind, "transferencia">;
  total: number;
}

export interface FinanceReportAccount {
  name: string;
  type: AccountType;
  currency: Currency;
  income: number;
  expense: number;
  refunds: number;
  transferIn: number;
  transferOut: number;
  netChange: number;
}

export interface FinanceReportTransfer {
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  origin: string;
  destination: string;
}

export interface FinanceReport {
  from: string;
  to: string;
  totals: FinanceReportTotal[];
  categories: FinanceReportCategory[];
  accounts: FinanceReportAccount[];
  transfers: FinanceReportTransfer[];
}

const CURRENCIES: Currency[] = ["ARS", "USD"];
const MOVEMENT_KINDS: MovementKind[] = ["ingreso", "gasto", "reintegro", "transferencia"];

function addExact(current: number, amount: number): number {
  const next = current + amount;
  if (!Number.isSafeInteger(next)) {
    throw new Error("El total del informe excede la precisión monetaria admitida.");
  }
  return next;
}

function validateReportData(rows: FinancialTransaction[], accounts: FinancialAccount[]): void {
  for (const account of accounts) {
    if (
      typeof account.id !== "string" ||
      typeof account.name !== "string" ||
      !CURRENCIES.includes(account.currency) ||
      (account.type !== "bank" && account.type !== "card")
    ) {
      throw new Error("Las cuentas guardadas contienen datos inválidos.");
    }
  }

  for (const row of rows) {
    if (
      typeof row.date !== "string" ||
      typeof row.description !== "string" ||
      typeof row.category !== "string" ||
      !CURRENCIES.includes(row.currency) ||
      !MOVEMENT_KINDS.includes(row.kind) ||
      !Number.isSafeInteger(row.amountMinor) ||
      row.amountMinor <= 0
    ) {
      throw new Error("Los movimientos guardados contienen datos inválidos.");
    }
    validateDate(row.date);
  }
}

export function buildFinanceReport(
  rows: FinancialTransaction[],
  accounts: FinancialAccount[],
  from: string,
  to: string,
): FinanceReport {
  validateDate(from);
  validateDate(to);
  if (from > to) throw new Error("El período del informe no es válido.");
  validateReportData(rows, accounts);

  const movements = rows.filter((row) => row.date >= from && row.date <= to);
  const totals: FinanceReportTotal[] = CURRENCIES.map((currency) => {
    const total: FinanceReportTotal = { currency, income: 0, expense: 0, refunds: 0, balance: 0 };
    for (const row of movements) {
      if (row.currency !== currency || row.kind === "transferencia") continue;
      if (row.kind === "ingreso") total.income = addExact(total.income, row.amountMinor);
      if (row.kind === "gasto") total.expense = addExact(total.expense, row.amountMinor);
      if (row.kind === "reintegro") total.refunds = addExact(total.refunds, row.amountMinor);
    }
    total.balance = addExact(addExact(total.income, -total.expense), total.refunds);
    return total;
  });

  const categoryTotals = new Map<string, FinanceReportCategory>();
  for (const row of movements) {
    if (row.kind === "transferencia") continue;
    const key = JSON.stringify([row.category, row.currency, row.kind]);
    const total = categoryTotals.get(key) ?? {
      name: row.category,
      currency: row.currency,
      kind: row.kind,
      total: 0,
    };
    total.total = addExact(total.total, row.amountMinor);
    categoryTotals.set(key, total);
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountTotals = new Map<string, FinanceReportAccount>();
  const getAccountTotal = (id: string | undefined, currency: Currency): FinanceReportAccount => {
    if (!id) throw new Error("Un movimiento no tiene una cuenta asociada.");
    const account = accountById.get(id);
    if (!account || account.currency !== currency) {
      throw new Error("Un movimiento hace referencia a una cuenta inexistente o de otra moneda.");
    }
    const key = JSON.stringify([id, currency]);
    let total = accountTotals.get(key);
    if (!total) {
      total = {
        name: account.name,
        type: account.type,
        currency,
        income: 0,
        expense: 0,
        refunds: 0,
        transferIn: 0,
        transferOut: 0,
        netChange: 0,
      };
      accountTotals.set(key, total);
    }
    return total;
  };

  const transfers: FinanceReportTransfer[] = [];
  for (const row of movements) {
    const origin = getAccountTotal(row.accountId, row.currency);
    if (row.kind === "ingreso") {
      if (origin.type === "card") throw new Error("Hay ingresos asociados a una cuenta de tarjeta.");
      origin.income = addExact(origin.income, row.amountMinor);
      origin.netChange = addExact(origin.netChange, row.amountMinor);
    } else if (row.kind === "gasto") {
      origin.expense = addExact(origin.expense, row.amountMinor);
      origin.netChange = addExact(origin.netChange, origin.type === "card" ? row.amountMinor : -row.amountMinor);
    } else if (row.kind === "reintegro") {
      origin.refunds = addExact(origin.refunds, row.amountMinor);
      origin.netChange = addExact(origin.netChange, origin.type === "card" ? -row.amountMinor : row.amountMinor);
    } else {
      if (origin.type === "card" || !row.destinationAccountId || row.destinationAccountId === row.accountId) {
        throw new Error("Hay una transferencia con cuentas inválidas.");
      }
      const destination = getAccountTotal(row.destinationAccountId, row.currency);
      origin.transferOut = addExact(origin.transferOut, row.amountMinor);
      origin.netChange = addExact(origin.netChange, -row.amountMinor);
      destination.transferIn = addExact(destination.transferIn, row.amountMinor);
      destination.netChange = addExact(destination.netChange, destination.type === "card" ? -row.amountMinor : row.amountMinor);
      transfers.push({
        date: row.date,
        description: row.description,
        amountMinor: row.amountMinor,
        currency: row.currency,
        origin: origin.name,
        destination: destination.name,
      });
    }
  }

  return {
    from,
    to,
    totals,
    categories: [...categoryTotals.values()],
    accounts: [...accountTotals.values()],
    transfers,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function movementKindLabel(kind: FinanceReportCategory["kind"]): string {
  return kind === "ingreso" ? "Ingreso" : kind === "gasto" ? "Gasto" : "Reintegro";
}

export function financeReportHtml(report: FinanceReport): string {
  const totals = report.totals.map((row) => `
    <tr>
      <td>${escapeHtml(row.currency)}</td>
      <td>${escapeHtml(formatMoney(row.income, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.expense, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.refunds, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.balance, row.currency))}</td>
    </tr>`).join("");
  const categories = report.categories.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${movementKindLabel(row.kind)}</td>
      <td>${escapeHtml(row.currency)}</td>
      <td>${escapeHtml(formatMoney(row.total, row.currency))}</td>
    </tr>`).join("");
  const accounts = report.accounts.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.type === "card" ? "Tarjeta" : "Cuenta"}</td>
      <td>${escapeHtml(row.currency)}</td>
      <td>${escapeHtml(formatMoney(row.income, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.expense, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.refunds, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.transferIn, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.transferOut, row.currency))}</td>
      <td>${escapeHtml(formatMoney(row.netChange, row.currency))}</td>
    </tr>`).join("");
  const transfers = report.transfers.map((row) => `
    <li>${escapeHtml(row.date)} · ${escapeHtml(row.description)} · ${escapeHtml(row.origin)} → ${escapeHtml(row.destination)} · ${escapeHtml(formatMoney(row.amountMinor, row.currency))}</li>`).join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Informe financiero ${escapeHtml(report.from)} a ${escapeHtml(report.to)}</title>
    <style>
      body { color: #172033; font: 16px system-ui, sans-serif; margin: 2rem auto; max-width: 1000px; padding: 0 1rem; }
      table { border-collapse: collapse; margin: 1rem 0 2rem; width: 100%; }
      th, td { border: 1px solid #ccd; padding: .5rem; text-align: left; }
      @media print { button { display: none; } }
    </style>
  </head>
  <body>
    <h1>Informe financiero</h1>
    <p>Período inclusivo: ${escapeHtml(report.from)} a ${escapeHtml(report.to)}</p>
    <h2>Resumen por moneda</h2>
    <table aria-label="Resumen por moneda">
      <caption>Resumen por moneda</caption>
      <thead><tr><th>Moneda</th><th>Ingresos</th><th>Gastos</th><th>Reintegros</th><th>Saldo neto</th></tr></thead>
      <tbody>${totals}</tbody>
    </table>
    <h2>Por categoría</h2>
    <table aria-label="Totales por categoría">
      <caption>Totales por categoría</caption>
      <thead><tr><th>Categoría</th><th>Tipo</th><th>Moneda</th><th>Total</th></tr></thead>
      <tbody>${categories}</tbody>
    </table>
    <h2>Por cuenta y moneda</h2>
    <p>La variación neta suma efectivo en cuentas bancarias y deuda en tarjetas.</p>
    <table aria-label="Totales por cuenta">
      <caption>Totales por cuenta</caption>
      <thead><tr><th>Cuenta</th><th>Tipo</th><th>Moneda</th><th>Ingresos</th><th>Gastos</th><th>Reintegros</th><th>Transferencias entrantes</th><th>Transferencias salientes</th><th>Variación neta</th></tr></thead>
      <tbody>${accounts}</tbody>
    </table>
    <h2>Transferencias propias (excluidas del resumen)</h2>
    <ul>${transfers}</ul>
    <button type="button" onclick="window.print()">Imprimir / guardar PDF</button>
  </body>
</html>`;
}
