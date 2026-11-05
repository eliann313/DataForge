import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FinanceService } from "./service";
import { IndexedDBTransactionRepository } from "../infrastructure/indexeddb";
import { FinanceImportService } from "./import-service";

async function reset(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = globalThis.indexedDB.deleteDatabase("dataforge-finance");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Borrado bloqueado"));
  });
}

describe("adaptador IndexedDB de finanzas", () => {
  beforeEach(async () => {
    await reset();
  });

  it("persiste movimientos tras reapertura con totales exactos", async () => {
    const repo = new IndexedDBTransactionRepository();
    const svc = new FinanceService({ transactions: repo });
    try {
      await svc.create({ date: "2024-03-01", description: "A", kind: "ingreso", amount: "0,10", currency: "ARS", category: "c" });
      await svc.create({ date: "2024-03-02", description: "B", kind: "ingreso", amount: "0,20", currency: "ARS", category: "c" });
    } finally {
      repo.close();
    }
    const repo2 = new IndexedDBTransactionRepository();
    try {
      const svc2 = new FinanceService({ transactions: repo2 });
      const [ars] = await svc2.monthlySummary(2024, 3);
      expect(ars.income).toBe(30);
    } finally {
      repo2.close();
    }
  });

  it("migra v1 creando cuentas por moneda y conserva movimientos existentes", async () => {
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("dataforge-finance", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("transactions", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = legacy.transaction("transactions", "readwrite");
    tx.objectStore("transactions").put({ id: "legacy-usd", date: "2024-03-01", description: "A", kind: "ingreso", amountMinor: 1000, currency: "USD", category: "c", notes: "", createdAt: "2024-03-01", updatedAt: "2024-03-01" });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    legacy.close();
    const repo = new IndexedDBTransactionRepository();
    try {
      const rows = await repo.list();
      const accounts = await repo.listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0].accountId).toBe("account-default-usd");
      expect(accounts.map((account) => account.currency).sort()).toEqual(["ARS", "USD"]);
      expect(accounts.every((account) => account.type === "bank")).toBe(true);
    } finally { repo.close(); }
  });

  it("migra las cuentas v2 asignando tipo bancaria en v3", async () => {
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("dataforge-finance", 2);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("transactions", { keyPath: "id" });
        req.result.createObjectStore("accounts", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = legacy.transaction("accounts", "readwrite");
    tx.objectStore("accounts").put({ id: "legacy", name: "Cuenta antigua", currency: "ARS", createdAt: "2024-01-01" });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    legacy.close();
    const repo = new IndexedDBTransactionRepository();
    try { expect(await repo.findAccountById("legacy")).toMatchObject({ id: "legacy", type: "bank" }); }
    finally { repo.close(); }
  });

  it("guarda un lote completo en una transacción y conserva centavos tras reabrir", async () => {
    const repo = new IndexedDBTransactionRepository();
    const service = new FinanceImportService(repo, (() => { let i = 0; return () => `batch-${++i}`; })(), () => "2024-03-01T00:00:00Z");
    const preview = await service.preview([["2024-03-01", "A", "ingreso", "0,10", "Trabajo"], ["2024-03-02", "B", "gasto", "0,20", "Comida"]], { date: 0, description: 1, kind: 2, amount: 3, category: 4 }, "ARS", { id: "account-default", name: "Cuenta principal", currency: "ARS", type: "bank", createdAt: "2024-01-01" });
    await expect(service.confirm(preview)).resolves.toBe(2);
    repo.close();
    const reopened = new IndexedDBTransactionRepository();
    try { expect((await reopened.list()).map((tx) => tx.amountMinor).sort((a, b) => a - b)).toEqual([10, 20]); }
    finally { reopened.close(); }
  });

  it("revierte el lote entero si una inserción falla", async () => {
    const repo = new IndexedDBTransactionRepository();
    const service = new FinanceImportService(repo, (() => { let i = 0; return () => `same-${i++}`; })(), () => "2024-03-01T00:00:00Z");
    const preview = await service.preview([["2024-03-01", "A", "ingreso", "1", "Trabajo"], ["2024-03-02", "B", "gasto", "2", "Comida"]], { date: 0, description: 1, kind: 2, amount: 3, category: 4 }, "ARS", { id: "account-default", name: "Cuenta principal", currency: "ARS", type: "bank", createdAt: "2024-01-01" });
    const first = preview.rows[0].transaction!;
    const second = { ...preview.rows[1].transaction!, id: first.id };
    preview.rows[1].transaction = second;
    await expect(service.confirm(preview)).rejects.toThrow(/almacenamiento|importación/i);
    try { expect(await repo.list()).toEqual([]); }
    finally { repo.close(); }
  });
});
