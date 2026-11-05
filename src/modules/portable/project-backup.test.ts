import { describe, expect, it, vi } from "vitest";
import type { AnalysisSnapshot, AnalysisSnapshotRepository } from "../analysis";
import { MemoryProjectRepository } from "../projects";
import { MemoryPipelineDefinitionRepository } from "../pipelines";
import type { Report, ReportRepository } from "../reports";
import { parseProjectBackup, ProjectBackupService, serializeProjectBackup } from "./project-backup";

const definition = { id: "recipe-1", name: "Limpiar", steps: [{ id: "s1", type: "deduplicate" as const }] };
const snapshot: AnalysisSnapshot = {
  id: "snapshot-1",
  projectId: "p1",
  createdAt: "2026-11-04T00:00:00.000Z",
  title: "Resumen",
  source: {
    sessionId: "session-old",
    versionId: "version-joined",
    sourceId: "source-a",
    datasetName: "clientes.csv",
    rowCount: 2,
    columns: [{ name: "id", type: "INTEGER", nullable: false }],
    lineage: {
      rootVersionId: "version-joined",
      nodes: [
        {
          versionId: "version-a",
          projectId: "p1",
          name: "clientes.csv",
          operationType: "source",
          sourceIds: ["source-a"],
          parentIds: [],
          pipelineId: null,
          executedDefinition: null,
          rowCount: 2,
          columns: [{ name: "id", type: "INTEGER", nullable: false }],
          stepCount: 0,
          createdAt: "2026-11-04T00:00:00.000Z",
        },
        {
          versionId: "version-joined",
          projectId: "p1",
          name: "Clientes con región",
          operationType: "join",
          sourceIds: ["source-a", "source-b"],
          parentIds: ["version-a"],
          pipelineId: "pipeline-1",
          executedDefinition: { steps: [{ type: "join" }] },
          rowCount: 2,
          columns: [{ name: "id", type: "INTEGER", nullable: false }],
          stepCount: 1,
          createdAt: "2026-11-04T00:00:00.000Z",
        },
      ],
    },
  },
  parameters: { threshold: 5 },
  results: { count: 2 },
};
const report: Report = {
  id: "report-1",
  projectId: "p1",
  title: "Informe",
  createdAt: "2026-11-04T00:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
  sections: [{ id: "section-1", kind: "snapshot", title: "Resultado", snapshotId: snapshot.id }],
};
const validBackup = {
  format: "dataforge-project-backup",
  formatVersion: 1,
  exportedAt: "2026-11-04T00:00:00.000Z",
  contents: {
    projectName: true,
    pipelineDefinitions: true,
    analysisSnapshots: true,
    reports: true,
    folderLocation: false,
    datasetBytes: false,
    datasetVersions: false,
  },
  project: { sourceProjectId: "p1", name: "Muestra" },
  pipelineDefinitions: [definition],
  analysisSnapshots: [snapshot],
  reports: [report],
};

class MemorySnapshotRepository implements AnalysisSnapshotRepository {
  records = new Map<string, AnalysisSnapshot>();
  async save(value: AnalysisSnapshot) { this.records.set(`${value.projectId}:${value.id}`, structuredClone(value)); }
  async list(projectId: string) { return [...this.records.values()].filter((row) => row.projectId === projectId).map((row) => structuredClone(row)); }
  async findById(projectId: string, id: string) { return this.records.get(`${projectId}:${id}`) ?? null; }
  async delete(projectId: string, id: string) { this.records.delete(`${projectId}:${id}`); }
}

class MemoryReportRepository implements ReportRepository {
  records = new Map<string, Report>();
  async save(value: Report) { this.records.set(`${value.projectId}:${value.id}`, structuredClone(value)); }
  async list(projectId: string) { return [...this.records.values()].filter((row) => row.projectId === projectId).map((row) => structuredClone(row)); }
  async delete(projectId: string, id: string) { this.records.delete(`${projectId}:${id}`); }
}

function repositories() {
  return {
    projects: new MemoryProjectRepository(),
    definitions: new MemoryPipelineDefinitionRepository(),
    snapshots: new MemorySnapshotRepository(),
    reports: new MemoryReportRepository(),
  };
}

describe("respaldo portable v1 de proyecto", () => {
  it("exporta metadata, recetas, snapshots e informes y excluye explícitamente las fuentes", async () => {
    const repos = repositories();
    await repos.projects.save({ id: "p1", name: "Muestra", folderId: null, kind: "general", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
    await repos.definitions.save("p1", definition);
    await repos.snapshots.save(snapshot);
    await repos.reports.save(report);
    const backup = await new ProjectBackupService(repos).exportProject("p1");
    expect(backup.contents).toEqual({
      projectName: true,
      pipelineDefinitions: true,
      analysisSnapshots: true,
      reports: true,
      folderLocation: false,
      datasetBytes: false,
      datasetVersions: false,
    });
    expect(backup.analysisSnapshots).toEqual([snapshot]);
    expect(backup.reports).toEqual([report]);
    expect(parseProjectBackup(serializeProjectBackup(backup))).toEqual(backup);
  });

  it("restaura un proyecto nuevo y remapea snapshots, lineage nodes e informes sin perder IDs históricos", async () => {
    const repos = repositories();
    await repos.projects.save({ id: "p1", name: "Muestra", folderId: null, kind: "general", createdAt: "old", updatedAt: "old" });
    const service = new ProjectBackupService({ ...repos, generateId: () => "p2", now: () => "2026-11-04T01:00:00.000Z" });
    const restored = await service.importProject(validBackup);
    const restoredSnapshot = await repos.snapshots.findById("p2", snapshot.id);
    const restoredReport = (await repos.reports.list("p2"))[0];
    expect(restored.id).toBe("p2");
    expect(restored.folderId).toBeNull();
    expect(await repos.definitions.list("p2")).toEqual([definition]);
    expect(restoredSnapshot?.projectId).toBe("p2");
    expect(restoredSnapshot?.source.sessionId).toBe("session-old");
    expect(restoredSnapshot?.source.versionId).toBe("version-joined");
    expect(restoredSnapshot?.source.lineage.nodes.map((node) => node.projectId)).toEqual(["p2", "p2"]);
    expect(restoredSnapshot?.source.lineage.nodes.map((node) => node.versionId)).toEqual(["version-a", "version-joined"]);
    expect(restoredReport).toMatchObject({ id: "report-1", projectId: "p2", sections: [{ snapshotId: "snapshot-1" }] });
    expect((await repos.projects.findById("p1"))?.name).toBe("Muestra");
  });

  it("rechaza manifiestos inválidos, fuentes incluidas y recetas dañadas antes de escribir", async () => {
    const repos = repositories();
    const saveProject = vi.spyOn(repos.projects, "save");
    const saveDefinition = vi.spyOn(repos.definitions, "save");
    const saveSnapshot = vi.spyOn(repos.snapshots, "save");
    const saveReport = vi.spyOn(repos.reports, "save");
    const service = new ProjectBackupService({ ...repos, generateId: () => "p2" });
    await expect(service.importProject({ ...validBackup, contents: { ...validBackup.contents, datasetBytes: true } })).rejects.toThrow("manifiesto");
    await expect(service.importProject({ ...validBackup, pipelineDefinitions: [{ ...definition, steps: [{ id: "x", type: "sql", query: "DROP TABLE" }] }] })).rejects.toThrow("pipeline");
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("rechaza una referencia de snapshot rota y lineage inválido antes de cualquier escritura", async () => {
    const repos = repositories();
    const saveProject = vi.spyOn(repos.projects, "save");
    const saveDefinition = vi.spyOn(repos.definitions, "save");
    const saveSnapshot = vi.spyOn(repos.snapshots, "save");
    const saveReport = vi.spyOn(repos.reports, "save");
    const service = new ProjectBackupService({ ...repos, generateId: () => "p2" });
    const brokenReference = { ...validBackup, reports: [{ ...report, sections: [{ ...report.sections[0], snapshotId: "missing" }] }] };
    await expect(service.importProject(brokenReference)).rejects.toThrow("no está incluido");
    const brokenLineage = structuredClone(validBackup);
    brokenLineage.analysisSnapshots[0].source.lineage.nodes[0].projectId = "some-other-project";
    await expect(service.importProject(brokenLineage)).rejects.toThrow("snapshots están dañados");
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveDefinition).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("no exporta un informe local cuyo snapshot ya no existe", async () => {
    const repos = repositories();
    await repos.projects.save({ id: "p1", name: "Muestra", folderId: null, kind: "general", createdAt: "old", updatedAt: "old" });
    await repos.reports.save({ ...report, sections: [{ ...report.sections[0], snapshotId: "deleted-snapshot" }] });
    await expect(new ProjectBackupService(repos).exportProject("p1")).rejects.toThrow("no está incluido");
  });

  it("revierte todos los stores si falla publicar el proyecto y sigue aunque falle una eliminación", async () => {
    const repos = repositories();
    const projectSave = vi.spyOn(repos.projects, "save").mockRejectedValueOnce(new Error("cuota"));
    const reportDelete = vi.spyOn(repos.reports, "delete").mockRejectedValueOnce(new Error("bloqueado"));
    const service = new ProjectBackupService({ ...repos, generateId: () => "p2" });
    await expect(service.importProject(validBackup)).rejects.toThrow("reversión tuvo errores: informe report-1: bloqueado");
    expect(projectSave).toHaveBeenCalledTimes(1);
    expect(await repos.projects.findById("p2")).toBeNull();
    expect(await repos.definitions.list("p2")).toEqual([]);
    expect(await repos.snapshots.list("p2")).toEqual([]);
    expect(await repos.reports.list("p2")).toHaveLength(1);
    expect(reportDelete).toHaveBeenCalledOnce();
  });

  it("compensa todos los artefactos si falla al guardar un informe", async () => {
    const repos = repositories();
    vi.spyOn(repos.reports, "save").mockRejectedValueOnce(new Error("cuota"));
    const service = new ProjectBackupService({ ...repos, generateId: () => "p2" });
    await expect(service.importProject(validBackup)).rejects.toThrow("se intentó revertir");
    expect(await repos.projects.findById("p2")).toBeNull();
    expect(await repos.definitions.list("p2")).toEqual([]);
    expect(await repos.snapshots.list("p2")).toEqual([]);
    expect(await repos.reports.list("p2")).toEqual([]);
  });

  it("rechaza una colisión de ID antes de escribir cualquier artefacto", async () => {
    const repos = repositories();
    await repos.projects.save({ id: "taken", name: "Existente", folderId: null, kind: "general", createdAt: "old", updatedAt: "old" });
    const save = vi.spyOn(repos.definitions, "save");
    const service = new ProjectBackupService({ ...repos, generateId: () => "taken" });
    await expect(service.importProject(validBackup)).rejects.toThrow("identificador nuevo");
    expect(save).not.toHaveBeenCalled();
    expect((await repos.projects.findById("taken"))?.name).toBe("Existente");
  });

  it("rechaza archivos demasiado grandes", () => {
    expect(() => parseProjectBackup(" ".repeat(5 * 1024 * 1024 + 1))).toThrow("5 MiB");
  });
});
