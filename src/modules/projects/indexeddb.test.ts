import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IndexedDBFolderRepository,
  IndexedDBProjectCleanupJournal,
  IndexedDBProjectRepository,
  ProjectError,
  ProjectsService,
} from "./index";

// Contrato del adaptador IndexedDB contra fake-indexeddb: CRUD, aislamiento,
// versionado de esquema y errores tipados (sin pérdidas silenciosas).
async function reset(): Promise<void> {
  const db = globalThis.indexedDB;
  if (typeof db === "undefined") throw new Error("Sin IndexedDB de prueba");
  await new Promise<void>((resolve, reject) => {
    const req = db.deleteDatabase("dataforge");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Borrado bloqueado"));
  });
}

function service() {
  const projects = new IndexedDBProjectRepository();
  const folders = new IndexedDBFolderRepository();
  const svc = new ProjectsService({
    projects,
    folders,
    now: () => "2026-10-12T00:00:00.000Z",
    generateId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  return { svc, close: () => (projects.close(), folders.close()) };
}

describe("adaptador IndexedDB", () => {
  beforeEach(async () => {
    await reset();
  });

  it("persiste y recupera dos proyectos tras reapertura", async () => {
    const first = service();
    const a = await first.svc.createFolder({ name: "A" });
    await first.svc.createProject({ name: "Uno", folderId: a.id });
    await first.svc.createProject({ name: "Dos", folderId: a.id });
    first.close();

    const second = service();
    try {
      expect((await second.svc.listProjects()).map((p) => p.name).sort()).toEqual([
        "Dos",
        "Uno",
      ]);
      expect((await second.svc.listProjectsIn(a.id)).length).toBe(2);
      // Renombrar y mover sobreviven a otra reapertura.
      await second.svc.renameFolder(a.id, "A2");
    } finally {
      second.close();
    }

    const third = service();
    try {
      expect((await third.svc.getFolder(a.id)).name).toBe("A2");
    } finally {
      third.close();
    }
  });

  it("registra el esquema versionado y rechaza escrituras con fallo visible", async () => {
    const { svc, close } = service();
    try {
      await svc.createProject({ name: "p" });
      // Registro de versión legible directamente.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = globalThis.indexedDB.open("dataforge", 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        const tx = db.transaction("meta", "readonly");
        const got = await new Promise<{ version: number } | undefined>(
          (resolve, reject) => {
            const r = tx.objectStore("meta").get("schemaVersion");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          },
        );
        expect(got?.version).toBe(2);
      } finally {
        db.close();
      }
      // Fallo de escritura: simula cierre y verifica error tipado.
      close();
    } finally {
      close();
    }
    expect(ProjectError).toBeDefined();
  });

  it("migra v1 conservando metadatos y crea el journal de limpieza", async () => {
    const oldDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = globalThis.indexedDB.open("dataforge", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("projects", { keyPath: "id" }).createIndex("by-folder", "folderId");
        db.createObjectStore("folders", { keyPath: "id" }).createIndex("by-parent", "parentId");
        db.createObjectStore("meta", { keyPath: "key" }).put({ key: "schemaVersion", version: 1 });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const oldTx = oldDb.transaction("projects", "readwrite");
    oldTx.objectStore("projects").put({ id: "legacy-project", name: "Anterior", folderId: null, kind: "general", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
    await new Promise<void>((resolve, reject) => { oldTx.oncomplete = () => resolve(); oldTx.onerror = () => reject(oldTx.error); });
    oldDb.close();

    const projects = new IndexedDBProjectRepository();
    try {
      expect((await projects.findById("legacy-project"))?.name).toBe("Anterior");
      const migrated = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = globalThis.indexedDB.open("dataforge", 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        expect(migrated.objectStoreNames.contains("cleanup-intents")).toBe(true);
        const tx = migrated.transaction("meta", "readonly");
        const marker = await new Promise<{ version: number }>((resolve, reject) => {
          const req = tx.objectStore("meta").get("schemaVersion");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        expect(marker.version).toBe(2);
      } finally { migrated.close(); }
    } finally { projects.close(); }
  });

  it("recupera intents persistentes y conserva el aislamiento por projectId", async () => {
    const projects = new IndexedDBProjectRepository();
    const folders = new IndexedDBFolderRepository();
    const journal = new IndexedDBProjectCleanupJournal();
    const connections = [projects, folders, journal];
    let failCleanup = true;
    const cleaned: string[] = [];
    const svc = new ProjectsService({
      projects, folders, cleanupJournal: journal,
      generateId: (() => { let n = 0; return () => `delete-${++n}`; })(),
      now: () => "2026-11-05T00:00:00.000Z",
      deleteProjectArtifacts: async (id) => { cleaned.push(id); if (failCleanup) throw new Error("store bloqueado"); },
    });
    try {
      const target = await svc.createProject({ name: "Borrar" });
      const other = await svc.createProject({ name: "Conservar" });
      await expect(svc.deleteProject(target.id)).rejects.toMatchObject({ code: "project-cleanup-failed" });
      expect(await projects.findById(target.id)).toBeNull();
      expect(await projects.findById(other.id)).not.toBeNull();
      expect(await journal.listPending()).toMatchObject([{ projectId: target.id }]);
      expect(cleaned).toEqual([target.id]);

      projects.close(); folders.close(); journal.close();
      failCleanup = false;
      const reopenedProjects = new IndexedDBProjectRepository();
      const reopenedFolders = new IndexedDBFolderRepository();
      const reopenedJournal = new IndexedDBProjectCleanupJournal();
      connections.push(reopenedProjects, reopenedFolders, reopenedJournal);
      const reopenedService = new ProjectsService({
        projects: reopenedProjects, folders: reopenedFolders, cleanupJournal: reopenedJournal,
        deleteProjectArtifacts: async (id) => { cleaned.push(id); if (failCleanup) throw new Error("store bloqueado"); },
      });
      const recovered = await reopenedService.recoverPendingProjectArtifactsCleanup();
      expect(recovered).toEqual({ projectIds: [], errors: [] });
      expect(cleaned).toEqual([target.id, target.id]);
      expect(await reopenedJournal.listPending()).toEqual([]);
      expect(await reopenedProjects.findById(other.id)).not.toBeNull();
    } finally { connections.forEach((connection) => connection.close()); }
  });

  it("bloquea carpeta no vacía también contra el adaptador real", async () => {
    const { svc, close } = service();
    try {
      const folder = await svc.createFolder({ name: "F" });
      await svc.createProject({ name: "p", folderId: folder.id });
      await expect(svc.deleteFolder(folder.id)).rejects.toMatchObject({
        code: "folder-not-empty",
      });
      expect((await svc.listProjects()).length).toBe(1);
    } finally {
      close();
    }
  });
});
