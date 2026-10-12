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
});
