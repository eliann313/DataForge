import { describe, expect, it, vi } from "vitest";
import { PipelineService } from "./service";
import type { PipelineExecutionPort } from "./ports";
import type { PipelineVersion } from "../domain/definition";
import { MemoryPipelineDefinitionRepository } from "../infrastructure/memory";

const source: PipelineVersion = {
  id: "source-1",
  sourceId: "source-1",
  sourceIds: ["source-1"],
  projectId: "project-1",
  name: "datos.csv",
  parentId: null,
  parentIds: [],
  operationType: "source",
  pipelineId: null,
  rowCount: 3,
  columns: [{ name: "valor", type: "INTEGER", nullable: false }],
  stepCount: 0,
  createdAt: "2026-10-12T00:00:00.000Z",
};

function port(): PipelineExecutionPort {
  return {
    getDatasetVersions: () => [source],
    getActiveDatasetVersionId: () => source.id,
    getVersionColumns: async () => source.columns,
    previewPipeline: vi.fn(async () => ({
      inputRowCount: 3,
      outputRowCount: 2,
      columns: source.columns,
      rows: [{ valor: 1 }, { valor: 2 }],
    })),
    executePipeline: vi.fn(async () => ({ ...source, id: "version-1", parentId: source.id })),
    activateDatasetVersion: vi.fn(async () => undefined),
  };
}

describe("PipelineService", () => {
  it("valida antes de pedir la vista previa", async () => {
    const adapter = port();
    const service = new PipelineService(adapter, new MemoryPipelineDefinitionRepository());
    const result = await service.preview("source-1", {
      id: "p-1",
      name: "Filtrar",
      steps: [{ id: "f1", type: "filter", filter: { column: "valor", op: "gt", value: "1" } }],
    });

    expect(result.outputRowCount).toBe(2);
    expect(adapter.previewPipeline).toHaveBeenCalledOnce();
  });

  it("no ejecuta una definición inválida", async () => {
    const adapter = port();
    const service = new PipelineService(adapter, new MemoryPipelineDefinitionRepository());

    await expect(service.execute("source-1", {
      id: "p-1",
      name: "Vacío",
      steps: [],
    })).rejects.toThrow(/al menos un paso/);
    expect(adapter.executePipeline).not.toHaveBeenCalled();
  });

  it("guarda definiciones solo si son válidas para la versión de origen", async () => {
    const definitions = new MemoryPipelineDefinitionRepository();
    const service = new PipelineService(port(), definitions);
    const valid = {
      id: "p-1",
      name: "Sin nulos",
      steps: [{ id: "n1", type: "dropNulls" as const, columns: ["valor"] }],
    };

    await service.saveDefinition("project-1", "source-1", valid);
    expect(await service.listDefinitions("project-1")).toEqual([valid]);
    await expect(service.saveDefinition("project-1", "source-1", {
      ...valid,
      id: "p-2",
      steps: [{ id: "s1", type: "select", columns: ["inexistente"] }],
    })).rejects.toThrow(/no existe/);
    expect(await service.listDefinitions("project-1")).toEqual([valid]);
  });

  it("mantiene las definiciones separadas por proyecto y permite eliminarlas", async () => {
    const definitions = new MemoryPipelineDefinitionRepository();
    const service = new PipelineService(port(), definitions);
    const saved = {
      id: "p-1",
      name: "Sin duplicados",
      steps: [{ id: "d1", type: "deduplicate" as const }],
    };

    await service.saveDefinition("project-1", "source-1", saved);
    expect(await service.listDefinitions("project-2")).toEqual([]);
    await service.deleteDefinition("project-1", saved.id);
    expect(await service.listDefinitions("project-1")).toEqual([]);
  });
});
