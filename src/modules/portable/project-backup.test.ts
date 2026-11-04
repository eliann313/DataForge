import { describe, expect, it, vi } from "vitest";
import { MemoryProjectRepository } from "../projects";
import { MemoryPipelineDefinitionRepository } from "../pipelines";
import { parseProjectBackup, ProjectBackupService, serializeProjectBackup } from "./project-backup";

const definition = { id: "recipe-1", name: "Limpiar", steps: [{ id: "s1", type: "deduplicate" as const }] };
const validBackup = {
  format: "dataforge-project-backup",
  formatVersion: 1,
  exportedAt: "2026-11-04T00:00:00.000Z",
  contents: { projectName: true, pipelineDefinitions: true, folderLocation: false, datasetBytes: false, analysisSnapshots: false },
  project: { name: "Muestra" },
  pipelineDefinitions: [definition],
};

describe("respaldo portable v1 de proyecto", () => {
  it("exporta metadata y recetas, declarando los datos omitidos", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    await projects.save({ id: "p1", name: "Muestra", folderId: null, kind: "general", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
    await definitions.save("p1", definition);
    const backup = await new ProjectBackupService({ projects, definitions }).exportProject("p1");
    expect(backup.contents).toEqual({ projectName: true, pipelineDefinitions: true, folderLocation: false, datasetBytes: false, analysisSnapshots: false });
    expect(backup.pipelineDefinitions).toEqual([definition]);
    expect(parseProjectBackup(serializeProjectBackup(backup))).toEqual(backup);
  });

  it("restaura como proyecto nuevo sin sobrescribir el existente", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    await projects.save({ id: "p1", name: "Muestra", folderId: null, kind: "general", createdAt: "old", updatedAt: "old" });
    const service = new ProjectBackupService({ projects, definitions, generateId: () => "p2", now: () => "2026-11-04T01:00:00.000Z" });
    const restored = await service.importProject(validBackup);
    expect(restored.id).toBe("p2");
    expect(restored.folderId).toBeNull();
    expect(await definitions.list("p2")).toEqual([definition]);
    expect((await projects.findById("p1"))?.name).toBe("Muestra");
  });

  it("rechaza versiones/manifiestos/recetas inválidos antes de escribir", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    const save = vi.spyOn(projects, "save");
    expect(() => parseProjectBackup(JSON.stringify({ ...validBackup, formatVersion: 2 }))).toThrow("no es compatible");
    expect(() => parseProjectBackup(JSON.stringify({ ...validBackup, contents: { ...validBackup.contents, datasetBytes: true } }))).toThrow("manifiesto");
    expect(() => parseProjectBackup(JSON.stringify({ ...validBackup, pipelineDefinitions: [{ ...definition, steps: [{ id: "x", type: "sql", query: "DROP TABLE" }] }] }))).toThrow("dañadas");
    expect(save).not.toHaveBeenCalled();
    expect(await definitions.list("p2")).toEqual([]);
  });

  it("revierte el proyecto nuevo si falla al persistir una definición", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    vi.spyOn(definitions, "save").mockRejectedValueOnce(new Error("cuota"));
    const service = new ProjectBackupService({ projects, definitions, generateId: () => "new" });
    await expect(service.importProject(validBackup)).rejects.toThrow("se revirtió");
    expect(await projects.findById("new")).toBeNull();
  });

  it("rechaza una colisión de ID antes de escribir recetas", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    await projects.save({ id: "taken", name: "Existente", folderId: null, kind: "general", createdAt: "old", updatedAt: "old" });
    const save = vi.spyOn(definitions, "save");
    const service = new ProjectBackupService({ projects, definitions, generateId: () => "taken" });
    await expect(service.importProject(validBackup)).rejects.toThrow("identificador nuevo");
    expect(save).not.toHaveBeenCalled();
    expect((await projects.findById("taken"))?.name).toBe("Existente");
  });

  it("compensa definiciones ya guardadas si falla una posterior", async () => {
    const projects = new MemoryProjectRepository();
    const definitions = new MemoryPipelineDefinitionRepository();
    const save = vi.spyOn(definitions, "save");
    const originalSave = definitions.save.bind(definitions);
    save.mockImplementationOnce(originalSave);
    // Fail after one successful write to exercise compensation of prior records.
    save.mockImplementationOnce(async () => { throw new Error("cuota"); });
    const service = new ProjectBackupService({ projects, definitions, generateId: () => "new" });
    const backup = { ...validBackup, pipelineDefinitions: [definition, { ...definition, id: "recipe-2", name: "Otra" }] };
    await expect(service.importProject(backup)).rejects.toThrow("se revirtió");
    expect(save).toHaveBeenCalledTimes(2);
    expect(await definitions.list("new")).toEqual([]);
    expect(await projects.findById("new")).toBeNull();
  });

  it("rechaza archivos demasiado grandes", () => {
    expect(() => parseProjectBackup(" ".repeat(5 * 1024 * 1024 + 1))).toThrow("5 MiB");
  });
});
