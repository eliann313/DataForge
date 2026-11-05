// Adaptadores IndexedDB de metadatos de projects (fase 1 / E3).
// - Solo navegador: `typeof indexedDB === "undefined"` → error explícito
//   (nunca se toca en SSR/build).
// - Esquema versionado (hoy v2) con registro en `meta`; si el almacenado es
//   mayor que el soportado se rechaza (sin migraciones silenciosas).
// - Cada método = una transacción (sin estados parciales por operación).
import { ProjectError } from "../domain/errors";
import type { Folder } from "../domain/folder";
import type { Project } from "../domain/project";
import type { FolderRepository, ProjectCleanupIntent, ProjectCleanupJournal, ProjectRepository } from "../application/ports";
import { matchesQuery } from "./memory";

const DB_NAME = "dataforge";
const SCHEMA_VERSION = 2;
const PROJECTS = "projects";
const FOLDERS = "folders";
const META = "meta";
const CLEANUP_INTENTS = "cleanup-intents";

function failed(operation: string, cause: unknown): ProjectError {
  if (cause instanceof ProjectError) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ProjectError(
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

/** Conexión compartida: apertura diferida, esquema y utilidades. */
class Connection {
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

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === "undefined") {
      throw new ProjectError(
        "storage-unavailable",
        "IndexedDB no está disponible en este entorno.",
      );
    }
    if (!this.opening) {
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(PROJECTS)) {
            const store = db.createObjectStore(PROJECTS, { keyPath: "id" });
            store.createIndex("by-folder", "folderId", { unique: false });
          }
          if (!db.objectStoreNames.contains(FOLDERS)) {
            const store = db.createObjectStore(FOLDERS, { keyPath: "id" });
            store.createIndex("by-parent", "parentId", { unique: false });
          }
          if (!db.objectStoreNames.contains(META)) {
            db.createObjectStore(META, { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains(CLEANUP_INTENTS)) {
            db.createObjectStore(CLEANUP_INTENTS, { keyPath: "projectId" });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => this.close();
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error("Apertura fallida"));
        req.onblocked = () =>
          reject(new Error("Apertura bloqueada por otra pestaña"));
      }).then(async (db) => {
          await this.checkSchemaVersion(db);
          this.db = db;
          return db;
        }).catch((cause: unknown) => {
          this.opening = null;
          throw cause;
        });
    }
    return this.opening;
  }

  private async checkSchemaVersion(db: IDBDatabase): Promise<void> {
    const tx = db.transaction(META, "readwrite");
    const store = tx.objectStore(META);
    let existing: { key: string; version: number } | undefined;
    try {
      existing = await request(store.get("schemaVersion"));
    } catch {
      existing = undefined;
    }
    if (existing && existing.version > SCHEMA_VERSION) {
      try {
        tx.abort();
      } catch {
        // Aborto best-effort.
      }
      db.close();
      this.db = null;
      this.opening = null;
      throw new ProjectError(
        "schema-too-new",
        `Esquema v${existing.version} mayor que el soportado (v${SCHEMA_VERSION}).`,
      );
    }
    try {
      if (!existing || existing.version < SCHEMA_VERSION) store.put({ key: "schemaVersion", version: SCHEMA_VERSION });
      await transactionDone(tx);
    } catch (cause) {
      throw failed("versionado de esquema", cause);
    }
  }

  /** Copia JSON profunda: el llamador nunca muta el registro almacenado. */
  protected clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

export class IndexedDBProjectRepository
  extends Connection
  implements ProjectRepository
{
  async save(project: Project): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(PROJECTS, "readwrite");
      tx.objectStore(PROJECTS).put(this.clone(project));
      await transactionDone(tx);
    } catch (cause) {
      throw failed("escritura de proyecto", cause);
    }
  }

  async findById(id: string): Promise<Project | null> {
    try {
      const db = await this.open();
      const tx = db.transaction(PROJECTS, "readonly");
      const found = await request<Project | undefined>(
        tx.objectStore(PROJECTS).get(id),
      );
      await transactionDone(tx);
      return found === undefined ? null : this.clone(found);
    } catch (cause) {
      throw failed("lectura de proyecto", cause);
    }
  }

  async list(query?: string): Promise<Project[]> {
    try {
      const db = await this.open();
      const tx = db.transaction(PROJECTS, "readonly");
      const rows = await request<Project[]>(
        tx.objectStore(PROJECTS).getAll(),
      );
      await transactionDone(tx);
      return this.clone(rows).filter((p) => matchesQuery(p.name, query));
    } catch (cause) {
      throw failed("listado de proyectos", cause);
    }
  }

  async listByFolder(folderId: string | null): Promise<Project[]> {
    try {
      const db = await this.open();
      const tx = db.transaction(PROJECTS, "readonly");
      const store = tx.objectStore(PROJECTS);
      // Los índices omiten claves null: raíz se filtra del listado total.
      const rows =
        folderId === null
          ? (await request<Project[]>(store.getAll())).filter(
              (p) => p.folderId === null,
            )
          : await request<Project[]>(store.index("by-folder").getAll(folderId));
      await transactionDone(tx);
      return this.clone(rows);
    } catch (cause) {
      throw failed("proyectos por carpeta", cause);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(PROJECTS, "readwrite");
      tx.objectStore(PROJECTS).delete(id);
      await transactionDone(tx);
    } catch (cause) {
      throw failed("baja de proyecto", cause);
    }
  }
}

export class IndexedDBFolderRepository
  extends Connection
  implements FolderRepository
{
  async save(folder: Folder): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(FOLDERS, "readwrite");
      tx.objectStore(FOLDERS).put(this.clone(folder));
      await transactionDone(tx);
    } catch (cause) {
      throw failed("escritura de carpeta", cause);
    }
  }

  async findById(id: string): Promise<Folder | null> {
    try {
      const db = await this.open();
      const tx = db.transaction(FOLDERS, "readonly");
      const found = await request<Folder | undefined>(
        tx.objectStore(FOLDERS).get(id),
      );
      await transactionDone(tx);
      return found === undefined ? null : this.clone(found);
    } catch (cause) {
      throw failed("lectura de carpeta", cause);
    }
  }

  async list(query?: string): Promise<Folder[]> {
    try {
      const db = await this.open();
      const tx = db.transaction(FOLDERS, "readonly");
      const rows = await request<Folder[]>(tx.objectStore(FOLDERS).getAll());
      await transactionDone(tx);
      return this.clone(rows).filter((f) => matchesQuery(f.name, query));
    } catch (cause) {
      throw failed("listado de carpetas", cause);
    }
  }

  async listByParent(parentId: string | null): Promise<Folder[]> {
    try {
      const db = await this.open();
      const tx = db.transaction(FOLDERS, "readonly");
      const store = tx.objectStore(FOLDERS);
      const rows =
        parentId === null
          ? (await request<Folder[]>(store.getAll())).filter(
              (f) => f.parentId === null,
            )
          : await request<Folder[]>(store.index("by-parent").getAll(parentId));
      await transactionDone(tx);
      return this.clone(rows);
    } catch (cause) {
      throw failed("carpetas por padre", cause);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(FOLDERS, "readwrite");
      tx.objectStore(FOLDERS).delete(id);
      await transactionDone(tx);
    } catch (cause) {
      throw failed("baja de carpeta", cause);
    }
  }
}

/** Persist cleanup intents atomically with the user initiated project deletion. */
export class IndexedDBProjectCleanupJournal extends Connection implements ProjectCleanupJournal {
  async deleteProjectAndRecordIntent(projectId: string, createdAt: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PROJECTS, CLEANUP_INTENTS], "readwrite");
      const projects = tx.objectStore(PROJECTS);
      const request = projects.get(projectId);
      let failure: Error | null = null;
      request.onsuccess = () => {
        if (request.result === undefined) {
          failure = new ProjectError("project-not-found", "Proyecto inexistente.");
          tx.abort();
          return;
        }
        tx.objectStore(CLEANUP_INTENTS).put({ projectId, createdAt } satisfies ProjectCleanupIntent);
        projects.delete(projectId);
      };
      request.onerror = () => reject(request.error ?? new Error("No se pudo leer el proyecto para eliminarlo."));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("Se canceló la eliminación del proyecto."));
      tx.onerror = () => reject(tx.error ?? new Error("Falló la eliminación del proyecto."));
    });
  }

  async listPending(): Promise<ProjectCleanupIntent[]> {
    const db = await this.open();
    const tx = db.transaction(CLEANUP_INTENTS, "readonly");
    const rows = await request<unknown[]>(tx.objectStore(CLEANUP_INTENTS).getAll());
    await transactionDone(tx);
    const valid = rows.every((row) => {
      if (!row || typeof row !== "object") return false;
      const intent = row as Partial<ProjectCleanupIntent>;
      return typeof intent.projectId === "string" && intent.projectId.trim().length > 0
        && typeof intent.createdAt === "string" && Number.isFinite(Date.parse(intent.createdAt));
    });
    if (!valid) throw new ProjectError("storage-failed", "El registro persistente de limpieza está dañado; no se limpió ningún proyecto.");
    return rows as ProjectCleanupIntent[];
  }

  async complete(projectId: string): Promise<void> {
    if (!projectId.trim()) return;
    const db = await this.open();
    const tx = db.transaction(CLEANUP_INTENTS, "readwrite");
    tx.objectStore(CLEANUP_INTENTS).delete(projectId);
    await transactionDone(tx);
  }
}
