import { beforeEach, describe, expect, it } from "vitest";
import {
  MemoryFolderRepository,
  MemoryProjectRepository,
  ProjectError,
  ProjectsService,
} from "./index";

function service() {
  let n = 0;
  return new ProjectsService({
    projects: new MemoryProjectRepository(),
    folders: new MemoryFolderRepository(),
    now: () => "2026-10-12T00:00:00.000Z",
    generateId: () => `id-${++n}`,
  });
}

describe("proyectos", () => {
  let svc: ReturnType<typeof service>;
  beforeEach(() => {
    svc = service();
  });

  it("crea, renombra, mueve y elimina con aislamiento por carpeta", async () => {
    const a = await svc.createFolder({ name: "A" });
    const b = await svc.createFolder({ name: "B" });
    const p = await svc.createProject({ name: "Ventas 2024", folderId: a.id });
    expect(p).toMatchObject({ id: "id-3", name: "Ventas 2024", folderId: a.id });

    await svc.moveProject(p.id, b.id);
    expect(await svc.listProjectsIn(a.id)).toEqual([]);
    expect((await svc.listProjectsIn(b.id)).map((x) => x.id)).toEqual([p.id]);

    const renamed = await svc.renameProject(p.id, "Ventas 2025");
    expect(renamed.name).toBe("Ventas 2025");

    await svc.deleteProject(p.id);
    await expect(svc.getProject(p.id)).rejects.toMatchObject({
      code: "project-not-found",
    });
  });

  it("valida nombres y referencias", async () => {
    await expect(svc.createProject({ name: "  " })).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      svc.createProject({ name: "x", folderId: "inexistente" }),
    ).rejects.toMatchObject({ code: "folder-not-found" });
    await expect(svc.renameProject("inexistente", "y")).rejects.toMatchObject({
      code: "project-not-found",
    });
  });

  it("busca por subcadena insensible a mayúsculas", async () => {
    await svc.createProject({ name: "Ventas Q1" });
    await svc.createProject({ name: "ventas q2" });
    await svc.createProject({ name: "Encuesta" });
    expect((await svc.listProjects("VENTAS")).map((p) => p.name).sort()).toEqual([
      "Ventas Q1",
      "ventas q2",
    ]);
  });
});

describe("carpetas", () => {
  let svc: ReturnType<typeof service>;
  beforeEach(() => {
    svc = service();
  });

  it("impide ciclos y autocontención", async () => {
    const root = await svc.createFolder({ name: "root" });
    const child = await svc.createFolder({ name: "hija", parentId: root.id });
    await expect(svc.moveFolder(root.id, child.id)).rejects.toMatchObject({
      code: "validation",
    });
    await expect(svc.moveFolder(child.id, child.id)).rejects.toMatchObject({
      code: "validation",
    });
    // Mover a la raíz sí vale.
    expect((await svc.moveFolder(child.id, null)).parentId).toBeNull();
  });

  it("bloquea eliminar carpeta no vacía y libera al vaciarla", async () => {
    const folder = await svc.createFolder({ name: "con cosas" });
    const p = await svc.createProject({ name: "p", folderId: folder.id });
    await expect(svc.deleteFolder(folder.id)).rejects.toMatchObject({
      code: "folder-not-empty",
    });
    await svc.deleteProject(p.id);
    await svc.deleteFolder(folder.id);
    await expect(svc.getFolder(folder.id)).rejects.toMatchObject({
      code: "folder-not-found",
    });
  });

  it("propaga fallos de escritura sin estado parcial", async () => {
    const failing = {
      save: () => Promise.reject(new Error("cuota excedida")),
      findById: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      listByFolder: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
    };
    const svc2 = new ProjectsService({
      projects: failing,
      folders: new MemoryFolderRepository(),
      now: () => "2026-10-12T00:00:00.000Z",
      generateId: () => "id-x",
    });
    await expect(svc2.createProject({ name: "p" })).rejects.toThrow(
      "cuota excedida",
    );
    expect(await svc2.listProjects()).toEqual([]);
    expect(svc2).toBeDefined();
    expect(ProjectError).toBeDefined();
  });
});
