import type { AnalysisSnapshot, AnalysisSnapshotRepository } from "./snapshots";
import { validateAnalysisSnapshot } from "./snapshots";

const DB_NAME = "dataforge-analysis-snapshots";
const STORE = "snapshots";
const VERSION = 1;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Guarda solo metadatos y resultados JSON; jamás conserva el archivo fuente. */
export class IndexedDBAnalysisSnapshotRepository implements AnalysisSnapshotRepository {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  close(): void {
    this.db?.close();
    this.db = null;
    this.opening = null;
  }

  async save(snapshot: AnalysisSnapshot): Promise<void> {
    if (!validateAnalysisSnapshot(snapshot)) throw new Error("Snapshot inválido.");
    await this.withStore("readwrite", (store) => store.add(clone(snapshot)));
  }

  async list(projectId: string): Promise<AnalysisSnapshot[]> {
    if (!projectId.trim()) return [];
    const rows = await this.withStore<unknown[]>("readonly", (store) => store.index("by-project").getAll(projectId));
    if (!rows.every((row) => validateAnalysisSnapshot(row) && row.projectId === projectId)) {
      throw new Error("Hay snapshots dañados; no se cargó una lista parcial.");
    }
    return (rows as AnalysisSnapshot[]).map(clone).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(projectId: string, snapshotId: string): Promise<AnalysisSnapshot | null> {
    if (!projectId.trim() || !snapshotId.trim()) return null;
    const row = await this.withStore<unknown>("readonly", (store) => store.get([projectId, snapshotId]));
    if (row === undefined) return null;
    if (!validateAnalysisSnapshot(row)) throw new Error("El snapshot guardado está dañado.");
    if (row.projectId !== projectId) return null;
    return clone(row);
  }

  async delete(projectId: string, snapshotId: string): Promise<void> {
    if (!projectId.trim() || !snapshotId.trim()) return;
    await this.withStore("readwrite", (store) => store.delete([projectId, snapshotId]));
  }

  private async withStore<T = IDBValidKey>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      let result!: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    });
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB no está disponible en este entorno.");
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: ["projectId", "id"] });
            store.createIndex("by-project", "projectId", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
        request.onblocked = () => reject(new Error("Apertura de IndexedDB bloqueada por otra pestaña."));
      }).then((db) => {
        db.onversionchange = () => {
          db.close();
          if (this.db === db) this.db = null;
          this.opening = null;
        };
        this.db = db;
        return db;
      }, (error: unknown) => { this.opening = null; throw error; });
    }
    return this.opening;
  }
}
