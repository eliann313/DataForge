import { describe, expect, it } from "vitest";
import type { FinancialAccount } from "../domain/account";
import type { FinancialTransaction } from "../domain/transaction";
import { buildFinanceReport, financeReportHtml } from "./report";

function movement(
  id: string,
  date: string,
  kind: FinancialTransaction["kind"],
  amountMinor: number,
  currency: FinancialTransaction["currency"] = "ARS",
  accountId = "bank",
  category = "Trabajo",
  destinationAccountId?: string,
): FinancialTransaction {
  return {
    id,
    date,
    description: "Movimiento",
    kind,
    amountMinor,
    currency,
    category,
    notes: "",
    accountId,
    ...(destinationAccountId ? { destinationAccountId } : {}),
    createdAt: date,
    updatedAt: date,
  };
}

const accounts: FinancialAccount[] = [
  { id: "bank", name: "Cuenta principal", currency: "ARS", type: "bank", createdAt: "2024-01-01" },
  { id: "savings", name: "Ahorros", currency: "ARS", type: "bank", createdAt: "2024-01-01" },
  { id: "card", name: "Visa", currency: "ARS", type: "card", createdAt: "2024-01-01" },
  { id: "usd", name: "Cuenta dólares", currency: "USD", type: "bank", createdAt: "2024-01-01" },
];

describe("finance report", () => {
  it("includes both dates, separates currencies, and excludes transfers from totals", () => {
    const rows = [
      movement("income", "2024-01-01", "ingreso", 10000),
      movement("transfer", "2024-01-02", "transferencia", 2500, "ARS", "bank", "Transferencias", "savings"),
      movement("expense", "2024-01-03", "gasto", 2000, "USD", "usd"),
      movement("outside", "2024-01-04", "gasto", 99900),
    ];
    const report = buildFinanceReport(rows, accounts, "2024-01-01", "2024-01-03");

    expect(report.totals).toEqual([
      { currency: "ARS", income: 10000, expense: 0, refunds: 0, balance: 10000 },
      { currency: "USD", income: 0, expense: 2000, refunds: 0, balance: -2000 },
    ]);
    expect(report.transfers).toEqual([
      expect.objectContaining({ description: "Movimiento", origin: "Cuenta principal", destination: "Ahorros" }),
    ]);
    expect(report.accounts.find((account) => account.name === "Cuenta principal")).toMatchObject({
      transferOut: 2500,
      netChange: 7500,
      type: "bank",
    });
    expect(report.accounts.find((account) => account.name === "Ahorros")).toMatchObject({
      transferIn: 2500,
      netChange: 2500,
    });
    expect(report.categories).toHaveLength(2);
  });

  it("computes card debt changes from purchases, refunds, and payments", () => {
    const rows = [
      movement("purchase", "2024-01-01", "gasto", 10000, "ARS", "card", "Compras"),
      movement("refund", "2024-01-02", "reintegro", 2000, "ARS", "card", "Reintegros"),
      movement("payment", "2024-01-03", "transferencia", 3000, "ARS", "bank", "Transferencias", "card"),
    ];
    const report = buildFinanceReport(rows, accounts, "2024-01-01", "2024-01-03");

    expect(report.accounts.find((account) => account.name === "Visa")).toMatchObject({
      type: "card",
      expense: 10000,
      refunds: 2000,
      transferIn: 3000,
      netChange: 5000,
    });
    expect(report.accounts.find((account) => account.name === "Cuenta principal")).toMatchObject({
      transferOut: 3000,
      netChange: -3000,
    });
  });

  it("rejects impossible dates and escapes category and account names in printable HTML", () => {
    expect(() => buildFinanceReport([], accounts, "2024-02-30", "2024-03-01")).toThrow();
    expect(() => buildFinanceReport([], accounts, "2024-03-01", "2024-02-01")).toThrow(/período/i);
    const hostileAccounts = accounts.map((account) => account.id === "bank"
      ? { ...account, name: '<img src=x onerror="alert(1)">' }
      : account);
    const hostileMovement = movement("bad", "2024-01-01", "gasto", 100, "ARS", "bank", "<script>alert(1)</script>");
    const html = financeReportHtml(buildFinanceReport([hostileMovement], hostileAccounts, "2024-01-01", "2024-01-01"));

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
  });

  it("rejects malformed persisted movement fields before generating the report", () => {
    const badCategory = { ...movement("bad", "2024-01-01", "gasto", 100), category: { hostile: true } } as unknown as FinancialTransaction;
    expect(() => buildFinanceReport([badCategory], accounts, "2024-01-01", "2024-01-01")).toThrow(/datos inválidos/i);
  });
});
