import { isPipelineDefinition, type PipelineDefinition } from "../domain/definition";
import type { PipelineDefinitionRepository } from "../application/ports";

const DB_NAME = "dataforge-pipelines";
const DB_VERSION = 1;
const STORE = "definitions";

interface StoredDefinition {
  projectId: string;
  id: string;
  definition: unknown;
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storageError(operation: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`No se pudo ${operation} la definición local: ${detail || "fallo de IndexedDB"}`);
}

/** Guarda solo los pasos declarativos en IndexedDB, separados por proyecto. */
export class IndexedDBPipelineDefinitionRepository implements PipelineDefinitionRepository {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  close(): void {
    this.db?.close();
    this.db = null;
    this.opening = null;
  }

  async save(projectId: string, definition: PipelineDefinition): Promise<void> {
    if (!projectId.trim()) throw new Error("Abra un proyecto para guardar la definición.");
    if (!isPipelineDefinition(definition)) throw new Error("La definición del pipeline no tiene un formato válido.");
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readwrite");
      const record: StoredDefinition = {
        projectId,
        id: definition.id,
        definition: clone(definition),
      };
      tx.objectStore(STORE).put(record);
      await transactionDone(tx);
    } catch (cause) {
      throw storageError("guardar", cause);
    }
  }

  async list(projectId: string): Promise<PipelineDefinition[]> {
    if (!projectId.trim()) return [];
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readonly");
      const rows = await request<StoredDefinition[]>(
        tx.objectStore(STORE).index("by-project").getAll(projectId),
      );
      await transactionDone(tx);
      return rows.map((row) => {
        if (row.projectId !== projectId || !isPipelineDefinition(row.definition)) {
          throw new Error("Hay una definición guardada dañada; no se cargó ninguna definición parcialmente.");
        }
        return clone(row.definition);
      }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (cause) {
      throw storageError("leer", cause);
    }
  }

  async delete(projectId: string, definitionId: string): Promise<void> {
    if (!projectId.trim() || !definitionId.trim()) return;
    try {
      const db = await this.open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete([projectId, definitionId]);
      await transactionDone(tx);
    } catch (cause) {
      throw storageError("eliminar", cause);
    }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB no está disponible en este entorno.");
    }
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: ["projectId", "id"] });
            store.createIndex("by-project", "projectId", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Apertura de IndexedDB fallida"));
        req.onblocked = () => reject(new Error("La apertura está bloqueada por otra pestaña."));
      }).then(
        (db) => {
          db.onversionchange = () => {
            db.close();
            this.db = null;
            this.opening = null;
          };
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
