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
    expect(parseAmount("1.234.567")).toBe(123456700);
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

  it("redondea decimales exactos sin errores de coma flotante", () => {
    expect(parseAmount("0,145")).toBe(15);
    expect(parseAmount("10,075")).toBe(1008);
    expect(parseAmount("0,1449999999999999")).toBe(14);
    expect(parseAmount("0,005")).toBe(1);
    expect(() => parseAmount("0,0049999999999999")).toThrow(/mayor que cero/);
    expect(parseAmount("0000010,075")).toBe(1008);
  });

  it("aplica el límite después del redondeo", () => {
    expect(parseAmount("999.999.999,994")).toBe(99_999_999_999);
    expect(() => parseAmount("999.999.999,995")).toThrow(/máximo/);
    expect(() => parseAmount("1.000.000.000,00")).toThrow(/máximo/);
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
  it("persiste y resume el importe redondeado en centavos exactos", async () => {
    const svc = service();
    const tx = await svc.create({ date: "2024-03-01", description: "A", kind: "gasto", amount: "0,145", currency: "ARS", category: "c" });
    expect(tx.amountMinor).toBe(15);
    expect((await svc.monthlySummary(2024, 3))[0].expense).toBe(15);
  });

  it("resume el mes por moneda sin mezclar", async () => {
    const svc = service();
    await svc.create({ date: "2024-03-03", description: "Sueldo", kind: "ingreso", amount: "1000", currency: "ARS", category: "trabajo" });
    await svc.create({ date: "2024-03-05", description: "Nafta", kind: "gasto", amount: "250,50", currency: "ARS", category: "transporte" });
    await svc.create({ date: "2024-03-06", description: "Freelance", kind: "ingreso", amount: "200", currency: "USD", category: "trabajo" });
    await svc.create({ date: "2024-02-28", description: "Viejo", kind: "ingreso", amount: "999", currency: "ARS", category: "x" });
    const [ars, usd] = await svc.monthlySummary(2024, 3);
    expect(ars).toEqual({ currency: "ARS", income: 100000, expense: 25050, refunds: 0, balance: 74950 });
    expect(usd).toEqual({ currency: "USD", income: 20000, expense: 0, refunds: 0, balance: 20000 });
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

  it("transfiere entre cuentas propias sin registrarlo como ingreso ni gasto", async () => {
    const svc = service();
    const origin = await svc.createAccount("Billetera", "ARS");
    const target = await svc.createAccount("Banco", "ARS");
    await svc.create({ date: "2024-03-01", description: "Acreditación", kind: "ingreso", amount: "100", currency: "ARS", category: "Trabajo", accountId: origin.id });
    await svc.create({ date: "2024-03-02", description: "Traspaso", kind: "transferencia", amount: "25,50", currency: "ARS", category: "Transferencia", accountId: origin.id, destinationAccountId: target.id });
    const [ars] = await svc.monthlySummary(2024, 3);
    expect(ars).toEqual({ currency: "ARS", income: 10000, expense: 0, refunds: 0, balance: 10000 });
    expect((await svc.accountBalances()).filter((account) => account.currency === "ARS").map(({ name, balanceMinor }) => [name, balanceMinor])).toEqual([["Billetera", 7450], ["Banco", 2550]]);
  });

  it("rechaza transferencias a la misma cuenta o entre monedas y no las persiste", async () => {
    const svc = service();
    const ars = await svc.createAccount("Cuenta ARS", "ARS");
    const usd = await svc.createAccount("Cuenta USD", "USD");
    const base = { date: "2024-03-02", description: "Transferencia inválida", kind: "transferencia" as const, amount: "25,50", currency: "ARS" as const, category: "Transferencias", accountId: ars.id };

    await expect(svc.create({ ...base, destinationAccountId: ars.id })).rejects.toThrow(/cuentas distintas/);
    await expect(svc.create({ ...base, destinationAccountId: usd.id })).rejects.toThrow(/misma moneda/);
    expect(await svc.list()).toEqual([]);
  });

  it("asigna una cuenta USD inicial y al editar una transferencia como gasto limpia el destino", async () => {
    const svc = service();
    const usd = await svc.create({ date: "2024-03-01", description: "USD", kind: "ingreso", amount: "10", currency: "USD", category: "Trabajo" });
    expect((await svc.get(usd.id)).currency).toBe("USD");
    const a = await svc.createAccount("A", "ARS");
    const b = await svc.createAccount("B", "ARS");
    const transfer = await svc.create({ date: "2024-03-02", description: "Pase", kind: "transferencia", amount: "2", currency: "ARS", category: "Transferencias", accountId: a.id, destinationAccountId: b.id });
    const edited = await svc.update({ id: transfer.id, date: "2024-03-02", description: "Gasto", kind: "gasto", amount: "2", currency: "ARS", category: "Varios", accountId: a.id });
    expect(edited.destinationAccountId).toBeUndefined();
  });

  it("registra compra con tarjeta, pago bank→card y reintegro parcial sin duplicar ingresos", async () => {
    const svc = service();
    const bank = await svc.createAccount("Banco", "ARS");
    const card = await svc.createAccount("Tarjeta", "ARS", "card");
    await svc.create({ date: "2024-03-01", description: "Fondos", kind: "ingreso", amount: "200", currency: "ARS", category: "Trabajo", accountId: bank.id });
    const purchase = await svc.create({ date: "2024-03-02", description: "Compra tarjeta", kind: "gasto", amount: "100", currency: "ARS", category: "Compras", accountId: card.id });
    await svc.create({ date: "2024-03-03", description: "Pago tarjeta", kind: "transferencia", amount: "60", currency: "ARS", category: "Transferencias", accountId: bank.id, destinationAccountId: card.id });
    await svc.create({ date: "2024-03-04", description: "Devolución parcial", kind: "reintegro", amount: "20", currency: "ARS", category: "", accountId: card.id, linkedTransactionId: purchase.id });
    const balances = await svc.accountBalances();
    expect(balances.find((account) => account.id === bank.id)?.balanceMinor).toBe(14000);
    expect(balances.find((account) => account.id === card.id)?.balanceMinor).toBe(2000);
    expect((await svc.monthlySummary(2024, 3))[0]).toEqual({ currency: "ARS", income: 20000, expense: 10000, refunds: 2000, balance: 12000 });
  });

  it("presenta crédito positivo si un pago supera la deuda registrada", async () => {
    const svc = service();
    const bank = await svc.createAccount("Banco", "ARS");
    const card = await svc.createAccount("Tarjeta", "ARS", "card");
    await svc.create({ date: "2024-03-01", description: "Pago", kind: "transferencia", amount: "25", currency: "ARS", category: "Transferencias", accountId: bank.id, destinationAccountId: card.id });
    expect((await svc.accountBalances()).find((account) => account.id === card.id)?.balanceMinor).toBe(-2500);
  });

  it("limita reintegros al saldo pendiente y protege el gasto enlazado", async () => {
    const svc = service();
    const account = await svc.createAccount("Banco", "ARS");
    const expense = await svc.create({ date: "2024-03-01", description: "Compra", kind: "gasto", amount: "100", currency: "ARS", category: "Varios", accountId: account.id });
    const refundInput = { date: "2024-03-02", description: "Devolución", kind: "reintegro" as const, amount: "60", currency: "ARS" as const, category: "", accountId: account.id, linkedTransactionId: expense.id };
    await svc.create(refundInput);
    await expect(svc.create({ ...refundInput, amount: "40,01" })).rejects.toThrow(/pendiente/);
    await expect(svc.update({ id: expense.id, date: expense.date, description: expense.description, kind: "gasto", amount: "50", currency: "ARS", category: "Varios", accountId: account.id })).rejects.toThrow(/invalide sus reintegros/);
    await expect(svc.remove(expense.id)).rejects.toThrow(/reintegros asociados/);
    expect(await svc.list()).toHaveLength(2);
  });

  it("limpia el vínculo al convertir un reintegro en otro movimiento", async () => {
    const svc = service();
    const account = await svc.createAccount("Banco", "ARS");
    const expense = await svc.create({ date: "2024-03-01", description: "Compra", kind: "gasto", amount: "20", currency: "ARS", category: "Varios", accountId: account.id });
    const refund = await svc.create({ date: "2024-03-02", description: "Reintegro", kind: "reintegro", amount: "5", currency: "ARS", category: "", accountId: account.id, linkedTransactionId: expense.id });
    const edited = await svc.update({ id: refund.id, date: refund.date, description: refund.description, kind: "gasto", amount: "5", currency: "ARS", category: "Varios", accountId: account.id });
    expect(edited.linkedTransactionId).toBeUndefined();
  });

  it("rechaza ingresos y transferencias de salida desde tarjeta, y reintegros en otra cuenta", async () => {
    const svc = service();
    const card = await svc.createAccount("Tarjeta", "ARS", "card");
    const bank = await svc.createAccount("Banco", "ARS");
    const purchase = await svc.create({ date: "2024-03-01", description: "Compra", kind: "gasto", amount: "10", currency: "ARS", category: "Varios", accountId: card.id });
    await expect(svc.create({ date: "2024-03-02", description: "Ingreso", kind: "ingreso", amount: "1", currency: "ARS", category: "Otro", accountId: card.id })).rejects.toThrow(/ingresos directamente/);
    await expect(svc.create({ date: "2024-03-02", description: "Anticipo", kind: "transferencia", amount: "1", currency: "ARS", category: "Transferencias", accountId: card.id, destinationAccountId: bank.id })).rejects.toThrow(/origen en una cuenta de tarjeta/);
    await expect(svc.create({ date: "2024-03-02", description: "Reintegro", kind: "reintegro", amount: "1", currency: "ARS", category: "", accountId: bank.id, linkedTransactionId: purchase.id })).rejects.toThrow(/misma cuenta y moneda/);
    expect(await svc.list()).toHaveLength(1);
  });

  it("propaga fallos de escritura sin estado parcial", async () => {
    const svc = new FinanceService({
      transactions: {
        save: () => Promise.reject(new Error("cuota excedida")),
        saveMany: () => Promise.reject(new Error("cuota excedida")),
        findById: () => Promise.resolve(null),
        list: () => Promise.resolve([]),
        delete: () => Promise.resolve(),
        saveAccount: () => Promise.resolve(),
        listAccounts: () => Promise.resolve([]),
        findAccountById: () => Promise.resolve(null),
      },
      now: () => "2024-03-15T12:00:00.000Z",
    });
    await expect(
      svc.create({ date: "2024-03-01", description: "A", kind: "ingreso", amount: "10", currency: "ARS", category: "c" }),
    ).rejects.toThrow("cuota excedida");
    expect(await svc.list()).toEqual([]);
  });
});
