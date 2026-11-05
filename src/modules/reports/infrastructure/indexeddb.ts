import { isReport, type Report } from "../domain/report";
import type { ReportRepository } from "../application/ports";

const DB_NAME = "dataforge-reports";
const STORE = "reports";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Solicitud IndexedDB fallida"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transacción IndexedDB fallida"));
    tx.onabort = () => reject(tx.error ?? new Error("Transacción IndexedDB cancelada"));
  });
}

/** Persists report definitions only; snapshots remain authoritative in analysis storage. */
export class IndexedDBReportRepository implements ReportRepository {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  close(): void { this.db?.close(); this.db = null; this.opening = null; }

  async list(projectId: string): Promise<Report[]> {
    if (!projectId.trim()) return [];
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const rows = await request<unknown[]>(tx.objectStore(STORE).index("by-project").getAll(projectId));
    await done(tx);
    const reports = rows.map((row) => {
      if (!isReport(row) || row.projectId !== projectId) throw new Error("Hay un informe local dañado; no se cargó la lista parcialmente.");
      return structuredClone(row);
    });
    return reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(report: Report): Promise<void> {
    if (!isReport(report)) throw new Error("El informe no tiene un formato válido.");
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(structuredClone(report));
    await done(tx);
  }

  async delete(projectId: string, reportId: string): Promise<void> {
    if (!projectId.trim() || !reportId.trim()) return;
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete([projectId, reportId]);
    await done(tx);
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!projectId.trim()) return;
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.index("by-project").getAllKeys(IDBKeyRange.only(projectId));
    request.onsuccess = () => {
      for (const key of request.result) store.delete(key);
    };
    await done(tx);
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB no está disponible.");
    if (!this.opening) this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          const store = req.result.createObjectStore(STORE, { keyPath: ["projectId", "id"] });
          store.createIndex("by-project", "projectId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB."));
      req.onblocked = () => reject(new Error("La apertura está bloqueada por otra pestaña."));
    }).then((db) => {
      db.onversionchange = () => this.close();
      this.db = db;
      return db;
    }, (cause: unknown) => { this.opening = null; throw cause; });
    return this.opening;
  }
}
