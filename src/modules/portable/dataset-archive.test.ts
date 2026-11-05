import { describe, expect, it, vi } from "vitest";
import type { PipelineVersion } from "../pipelines";
import { DatasetArchiveService, identityKey, readArchiveManifest, type PortableDatasetArchivePort } from "./dataset-archive";

const column = { name: "importe", type: "DECIMAL(38,2)", nullable: false };
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];

function versions(): PipelineVersion[] {
  return [
    { id: "source-1", sourceId: "source-1", sourceIds: ["source-1"], projectId: "p1", name: "Origen", parentId: null, parentIds: [], operationType: "source", pipelineId: null, rowCount: 1, columns: [column], stepCount: 0, createdAt: "2026-11-01T00:00:00.000Z" },
    { id: "version-pipeline-2", sourceId: "source-1", sourceIds: ["source-1"], projectId: "p1", name: "Derivada", parentId: "source-1", parentIds: ["source-1"], operationType: "pipeline", pipelineId: "recipe-1", executedDefinition: { id: "recipe-1", name: "Receta", steps: [{ id: "step-1", type: "deduplicate" }] }, rowCount: 1, columns: [column], stepCount: 1, createdAt: "2026-11-01T00:01:00.000Z" },
  ];
}

function projectRepository() {
  return {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => ({ id, name: "Proyecto", folderId: null, kind: "general" as const, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" })),
    list: vi.fn(async () => []),
    listByFolder: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
  };
}

function datasetPort(options: { mismatchRows?: boolean; currentProjectId?: string | null; switchProjectDuringImportTo?: string | null } = {}) {
  let currentProjectId: string | null = options.currentProjectId ?? null;
  let imported = 0;
  const importedVersions: PipelineVersion[] = [];
  const sourceIds: string[] = [];
  const restored: Array<{ versionId: string; metadata: Parameters<PortableDatasetArchivePort["restorePortableVersionMetadata"]>[1] }> = [];
  const datasets = {
    init: vi.fn(async () => undefined),
    selectProject: vi.fn((id: string | null) => { currentProjectId = id; }),
    getCurrentProjectId: () => currentProjectId,
    getDatasetVersions: vi.fn((projectId: string) => projectId === "p2" ? importedVersions : versions()),
    getVersionSemanticRoles: vi.fn(() => ({ importe: "medida" })),
    exportPortableDatasetVersion: vi.fn(async (versionId: string) => { const blob = new Blob([`PAR1:${versionId}:PAR1`]); return { blob, byteLength: blob.size }; }),
    importPortableParquet: vi.fn(async (_name: string, _bytes: Uint8Array, projectId: string) => {
      imported += 1;
      if (imported === 1 && options.switchProjectDuringImportTo !== undefined) currentProjectId = options.switchProjectDuringImportTo;
      const versionId = `new-${imported}`;
      const version: PipelineVersion = { id: versionId, sourceId: versionId, sourceIds: [versionId], projectId, name: "import", parentId: null, parentIds: [], operationType: "source", pipelineId: null, rowCount: 1, columns: [column], stepCount: 0, createdAt: "2026-11-01T00:00:00.000Z" };
      importedVersions.push(version);
      sourceIds.push(versionId);
      return { versionId, rows: options.mismatchRows ? 2 : 1, columns: [column] };
    }),
    restorePortableVersionMetadata: vi.fn((versionId: string, metadata: Parameters<PortableDatasetArchivePort["restorePortableVersionMetadata"]>[1]) => { restored.push({ versionId, metadata }); }),
    activateDatasetVersion: vi.fn(async () => undefined),
    getDatasetSources: vi.fn(() => sourceIds.map((id) => ({ id, projectId: "p2" }))),
    removeDataset: vi.fn(async () => undefined),
  };
  return { datasets, restored };
}

describe("archivo portable opcional de versiones de dataset", () => {
  it("exporta y restaura por refs explícitas, remapea padres y mantiene session/version como identidad histórica", async () => {
    const port = datasetPort({ currentProjectId: "p1", switchProjectDuringImportTo: "p3" });
    const service = new DatasetArchiveService({
      projects: projectRepository(),
      datasets: port.datasets,
      now: () => "2026-11-04T12:00:00.000Z",
      generateId: (() => { let index = 0; return () => ids[index++]; })(),
    });
    const blob = await service.exportProject("p1", "session-uuid");
    const file = new File([await blob.arrayBuffer()], "project.dfdataset");
    const parsed = await readArchiveManifest(file);
    expect(parsed.manifest.versions.map((item) => item.identity.versionId)).toEqual(["source-1", "version-pipeline-2"]);

    const imported = await service.importIntoProject(file, "p2", true);
    expect(imported.versionIdByRef.get(ids[0])).toBe("new-2");
    expect(imported.versionIdByRef.get(ids[1])).toBe("new-1");
    expect(imported.versionIdBySessionAndVersion.get(identityKey("session-uuid", "version-pipeline-2"))).toBe("new-1");
    expect(port.datasets.restorePortableVersionMetadata).toHaveBeenNthCalledWith(2, "new-1", expect.objectContaining({
      parentIds: ["new-2"],
      sourceIds: ["new-2"],
      sourceId: "new-2",
      operationType: "pipeline",
    }));
    expect(port.datasets.selectProject).not.toHaveBeenCalled();
    expect(port.datasets.getCurrentProjectId()).toBe("p3");
  });

  it("exige consentimiento de destino y valida todos los checksums antes de importar", async () => {
    const port = datasetPort();
    const service = new DatasetArchiveService({ projects: projectRepository(), datasets: port.datasets, generateId: (() => { let index = 0; return () => ids[index++]; })() });
    const blob = await service.exportProject("p1", "session-uuid");
    const fileBytes = new Uint8Array(await blob.arrayBuffer());
    fileBytes[fileBytes.length - 1] ^= 0xff;
    const tampered = new File([fileBytes], "tampered.dfdataset");
    await expect(service.importIntoProject(tampered, "p2", false)).rejects.toThrow(/Confirme/);
    await expect(service.importIntoProject(tampered, "p2", true)).rejects.toThrow(/checksum/);
    expect(port.datasets.importPortableParquet).not.toHaveBeenCalled();
  });

  it("retira la versión recién importada cuando falla la validación del manifiesto", async () => {
    const port = datasetPort({ mismatchRows: true });
    const service = new DatasetArchiveService({ projects: projectRepository(), datasets: port.datasets, generateId: (() => { let index = 0; return () => ids[index++]; })() });
    const blob = await service.exportProject("p1", "session-uuid");
    const file = new File([await blob.arrayBuffer()], "project.dfdataset");
    await expect(service.importIntoProject(file, "p2", true)).rejects.toThrow(/no coincide con el manifiesto/);
    expect(port.datasets.removeDataset).toHaveBeenCalledWith("new-1", "p2");
  });
});
