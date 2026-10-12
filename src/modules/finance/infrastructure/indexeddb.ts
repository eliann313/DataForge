// Adaptador IndexedDB de Finanzas Lite (E6). Base propia `dataforge-finance`
// v1, tienda `transactions`. Una transacción por operación; errores tipados y
// visibles. Nunca "Guardado" antes de confirmar la escritura (la UI espera).
import { FinanceError } from "../domain/money";
import type { FinancialTransaction } from "../domain/transaction";
import type { TransactionRepository } from "../application/ports";

const DB_NAME = "dataforge-finance";
const VERSION = 1;
const STORE = "transactions";

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
      const idbTx = db.transaction(STORE, "readwrite");
      idbTx.objectStore(STORE).put({ ...tx });
      await transactionDone(idbTx);
    } catch (cause) {
      throw failed("escritura de movimiento", cause);
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
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id" });
            store.createIndex("by-date", "date", { unique: false });
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
