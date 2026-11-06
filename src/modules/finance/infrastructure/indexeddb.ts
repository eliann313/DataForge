// Adaptador IndexedDB de Finanzas Lite (E6). Base propia `dataforge-finance`
// v1, tienda `transactions`. Una transacción por operación; errores tipados y
// visibles. Nunca "Guardado" antes de confirmar la escritura (la UI espera).
import { FinanceError } from "../domain/money";
import type { FinancialTransaction } from "../domain/transaction";
import type { TransactionRepository } from "../application/ports";
import type { FinancialAccount } from "../domain/account";

const DB_NAME = "dataforge-finance";
const VERSION = 4;
const STORE = "transactions";
const ACCOUNTS = "accounts";
const CATEGORIES = "categories";
const DEFAULT_ACCOUNT: FinancialAccount = { id: "account-default", name: "Cuenta principal", currency: "ARS", type: "bank", createdAt: "2026-01-01T00:00:00.000Z" };
const DEFAULT_USD_ACCOUNT: FinancialAccount = { id: "account-default-usd", name: "Cuenta en dólares", currency: "USD", type: "bank", createdAt: "2026-01-01T00:00:00.000Z" };

function failed(operation: string, cause: unknown): FinanceError {
  if (cause instanceof FinanceError) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new FinanceError(
    "storage-failed",
    `Fallo de almacenamiento en ${operation}: ${detail || "sin detalle"}`,
  );
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDBRequest fallido"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transacción fallida"));
    tx.onabort = () => reject(tx.error ?? new Error("Transacción abortada"));
  });
}

export class IndexedDBTransactionRepository implements TransactionRepository {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Cierre best-effort.
      }
      this.db = null;
    }
    this.opening = null;
  }

  async save(tx: FinancialTransaction): Promise<void> {
    try {
      const db = await this.open();
      const idbTx = db.transaction([STORE, CATEGORIES], "readwrite");
      persistCategory(idbTx.objectStore(CATEGORIES), tx.category);
      idbTx.objectStore(STORE).put({ ...tx });
      await transactionDone(idbTx);
    } catch (cause) {
      throw failed("escritura de movimiento", cause);
    }
  }

  async saveMany(transactions: FinancialTransaction[]): Promise<void> {
    try {
      const db = await this.open();
      const idbTx = db.transaction([STORE, CATEGORIES], "readwrite");
      const store = idbTx.objectStore(STORE);
      const categories = idbTx.objectStore(CATEGORIES);
      persistCategories(categories, transactions.map((tx) => tx.category));
      for (const tx of transactions) store.add({ ...tx });
      await transactionDone(idbTx);
    } catch (cause) {
      throw failed("importación de movimientos", cause);
    }
  }

  async findById(id: string): Promise<FinancialTransaction | null> {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readonly");
      const found = await request<FinancialTransaction | undefined>(
        tx.objectStore(STORE).get(id),
      );
      await transactionDone(tx);
      return found === undefined ? null : clone(found);
    } catch (cause) {
      throw failed("lectura de movimiento", cause);
    }
  }

  async list(): Promise<FinancialTransaction[]> {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readonly");
      const rows = await request<FinancialTransaction[]>(
        tx.objectStore(STORE).getAll(),
      );
      await transactionDone(tx);
      return clone(rows);
    } catch (cause) {
      throw failed("listado de movimientos", cause);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await transactionDone(tx);
    } catch (cause) {
      throw failed("baja de movimiento", cause);
    }
  }

  async saveAccount(account: FinancialAccount): Promise<void> {
    try { const db = await this.open(); const tx = db.transaction(ACCOUNTS, "readwrite"); tx.objectStore(ACCOUNTS).put({ ...account }); await transactionDone(tx); }
    catch (cause) { throw failed("escritura de cuenta", cause); }
  }

  async listAccounts(): Promise<FinancialAccount[]> {
    try { const db = await this.open(); const tx = db.transaction(ACCOUNTS, "readonly"); const rows = await request<FinancialAccount[]>(tx.objectStore(ACCOUNTS).getAll()); await transactionDone(tx); return clone(rows); }
    catch (cause) { throw failed("listado de cuentas", cause); }
  }

  async findAccountById(id: string): Promise<FinancialAccount | null> {
    try { const db = await this.open(); const tx = db.transaction(ACCOUNTS, "readonly"); const row = await request<FinancialAccount | undefined>(tx.objectStore(ACCOUNTS).get(id)); await transactionDone(tx); return row ? clone(row) : null; }
    catch (cause) { throw failed("lectura de cuenta", cause); }
  }

  async listCategories(): Promise<Array<{ id: string; name: string; createdAt: string }>> {
    try { const db = await this.open(); const tx = db.transaction(CATEGORIES, "readonly"); const rows = await request<Array<{id:string;name:string;createdAt:string}>>(tx.objectStore(CATEGORIES).getAll()); await transactionDone(tx); return clone(rows).sort((a,b)=>a.name.localeCompare(b.name,"es-AR")); }
    catch (cause) { throw failed("listado de categorías", cause); }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") {
      throw new FinanceError(
        "storage-unavailable",
        "IndexedDB no está disponible en este entorno.",
      );
    }
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = (event) => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id" });
            store.createIndex("by-date", "date", { unique: false });
          }
          if (!db.objectStoreNames.contains(ACCOUNTS)) db.createObjectStore(ACCOUNTS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(CATEGORIES)) db.createObjectStore(CATEGORIES, { keyPath: "id" });
          const upgrade = req.transaction;
          if (upgrade && (event as IDBVersionChangeEvent).oldVersion < 2) {
            upgrade.objectStore(ACCOUNTS).put(DEFAULT_ACCOUNT);
            upgrade.objectStore(ACCOUNTS).put(DEFAULT_USD_ACCOUNT);
            const transactions = upgrade.objectStore(STORE);
            const cursor = transactions.openCursor();
            cursor.onsuccess = () => {
              const current = cursor.result;
              if (!current) return;
              const row = current.value as FinancialTransaction;
              if (!row.accountId) current.update({ ...row, accountId: row.currency === "USD" ? DEFAULT_USD_ACCOUNT.id : DEFAULT_ACCOUNT.id });
              current.continue();
            };
          }
          if (upgrade && (event as IDBVersionChangeEvent).oldVersion < 3) {
            const cursor = upgrade.objectStore(ACCOUNTS).openCursor();
            cursor.onsuccess = () => {
              const current = cursor.result;
              if (!current) return;
              const account = current.value as FinancialAccount;
              if (account.type !== "bank" && account.type !== "card") current.update({ ...account, type: "bank" });
              current.continue();
            };
          }
          if (upgrade && (event as IDBVersionChangeEvent).oldVersion < 4) {
            const transactions = upgrade.objectStore(STORE);
            const categories = upgrade.objectStore(CATEGORIES);
            const cursor = transactions.openCursor();
            cursor.onsuccess = () => { const current = cursor.result; if (!current) return; const row = current.value as FinancialTransaction; if (typeof row.category === "string") persistCategory(categories, row.category); current.continue(); };
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Apertura fallida"));
        req.onblocked = () =>
          reject(new Error("Apertura bloqueada por otra pestaña"));
      }).then(
        (db) => {
          this.db = db;
          return db;
        },
        (cause: unknown) => {
          this.opening = null;
          throw cause;
        },
      );
    }
    return this.opening;
  }
}

function categoryKey(name: string): string { return name.trim().toLocaleLowerCase("es-AR"); }
function persistCategory(store: IDBObjectStore, rawName: string): void {
  const name = rawName.trim(); if (!name) return;
  const id = categoryKey(name);
  const lookup = store.get(id);
  lookup.onsuccess = () => { if (lookup.result === undefined) store.put({ id, name, createdAt: new Date().toISOString() }); };
}

function persistCategories(store: IDBObjectStore, rawNames: string[]): void {
  const unique = new Map<string, string>();
  for (const rawName of rawNames) {
    const name = rawName.trim();
    const id = categoryKey(name);
    if (name && !unique.has(id)) unique.set(id, name);
  }
  for (const [id, name] of unique) {
    const lookup = store.get(id);
    lookup.onsuccess = () => { if (lookup.result === undefined) store.put({ id, name, createdAt: new Date().toISOString() }); };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
