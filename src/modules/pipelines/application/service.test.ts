import { describe, expect, it, vi } from "vitest";
import { PipelineService } from "./service";
import type { PipelineExecutionPort } from "./ports";
import type { PipelineVersion } from "../domain/definition";

const source: PipelineVersion = {
  id: "source-1",
  name: "datos.csv",
  parentId: null,
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
    const service = new PipelineService(adapter);
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
    const service = new PipelineService(adapter);

    await expect(service.execute("source-1", {
      id: "p-1",
      name: "Vacío",
      steps: [],
    })).rejects.toThrow(/al menos un paso/);
    expect(adapter.executePipeline).not.toHaveBeenCalled();
  });
});
