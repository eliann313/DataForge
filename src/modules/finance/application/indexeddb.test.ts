import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FinanceService } from "./service";
import { IndexedDBTransactionRepository } from "../infrastructure/indexeddb";

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
    } finally { repo.close(); }
  });
});
