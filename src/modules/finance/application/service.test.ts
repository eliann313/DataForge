import { describe, expect, it } from "vitest";
import { FinanceService } from "./service";
import { MemoryTransactionRepository } from "../infrastructure/memory";
import { formatMoney, parseAmount } from "../domain/money";

describe("parseAmount", () => {
  it("interpreta formatos es-AR y punto decimal", () => {
    expect(parseAmount("1500")).toBe(150000);
    expect(parseAmount("150,50")).toBe(15050);
    expect(parseAmount("150.50")).toBe(15050);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount(" 2.500 ")).toBe(250000);
  });

  it("suma centavos sin error binario (0,10 + 0,20 = 0,30)", () => {
    expect(parseAmount("0,10") + parseAmount("0,20")).toBe(30);
  });

  it("redondea mitad hacia arriba y rechaza inválidos", () => {
    expect(parseAmount("10,255")).toBe(1026);
    expect(() => parseAmount("")).toThrow();
    expect(() => parseAmount("abc")).toThrow();
    expect(() => parseAmount("0")).toThrow();
    expect(() => parseAmount("-5")).toThrow();
    expect(() => parseAmount("1,2,3")).toThrow();
  });

  it("formatea es-AR por moneda", () => {
    expect(formatMoney(15050, "ARS")).toMatch(/150/);
    expect(formatMoney(15050, "ARS")).toMatch(/50/);
  });
});

function service() {
  let n = 0;
  return new FinanceService({
    transactions: new MemoryTransactionRepository(),
    now: () => "2024-03-15T12:00:00.000Z",
    generateId: () => `tx-${++n}`,
  });
}

describe("FinanceService", () => {
  it("resume el mes por moneda sin mezclar", async () => {
    const svc = service();
    await svc.create({ date: "2024-03-03", description: "Sueldo", kind: "ingreso", amount: "1000", currency: "ARS", category: "trabajo" });
    await svc.create({ date: "2024-03-05", description: "Nafta", kind: "gasto", amount: "250,50", currency: "ARS", category: "transporte" });
    await svc.create({ date: "2024-03-06", description: "Freelance", kind: "ingreso", amount: "200", currency: "USD", category: "trabajo" });
    await svc.create({ date: "2024-02-28", description: "Viejo", kind: "ingreso", amount: "999", currency: "ARS", category: "x" });
    const [ars, usd] = await svc.monthlySummary(2024, 3);
    expect(ars).toEqual({ currency: "ARS", income: 100000, expense: 25050, balance: 74950 });
    expect(usd).toEqual({ currency: "USD", income: 20000, expense: 0, balance: 20000 });
  });

  it("corta por mes contable y valida", async () => {
    const svc = service();
    await svc.create({ date: "2024-03-31", description: "A", kind: "ingreso", amount: "10", currency: "ARS", category: "c" });
    const [ars] = await svc.monthlySummary(2024, 3);
    expect(ars.income).toBe(1000);
    const [arsApr] = await svc.monthlySummary(2024, 4);
    expect(arsApr.income).toBe(0);
    await expect(
      svc.create({ date: "2024-02-30", description: "B", kind: "ingreso", amount: "10", currency: "ARS", category: "c" }),
    ).rejects.toThrow(/inexistente/);
    await expect(
      svc.create({ date: "2024-03-01", description: "  ", kind: "ingreso", amount: "10", currency: "ARS", category: "c" }),
    ).rejects.toThrow();
  });

  it("edita y elimina con persistencia del resto", async () => {
    const svc = service();
    const tx = await svc.create({ date: "2024-03-01", description: "A", kind: "gasto", amount: "100", currency: "ARS", category: "c" });
    await svc.update({ id: tx.id, date: "2024-03-02", description: "A2", kind: "gasto", amount: "150,25", currency: "ARS", category: "c" });
    expect((await svc.get(tx.id)).amountMinor).toBe(15025);
    await svc.remove(tx.id);
    await expect(svc.get(tx.id)).rejects.toThrow(/inexistente/);
  });

  it("propaga fallos de escritura sin estado parcial", async () => {
    const svc = new FinanceService({
      transactions: {
        save: () => Promise.reject(new Error("cuota excedida")),
        findById: () => Promise.resolve(null),
        list: () => Promise.resolve([]),
        delete: () => Promise.resolve(),
      },
      now: () => "2024-03-15T12:00:00.000Z",
    });
    await expect(
      svc.create({ date: "2024-03-01", description: "A", kind: "ingreso", amount: "10", currency: "ARS", category: "c" }),
    ).rejects.toThrow("cuota excedida");
    expect(await svc.list()).toEqual([]);
  });
});
