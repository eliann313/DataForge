import type { AnalysisSnapshot, AnalysisSnapshotRepository } from "../analysis";
import { validateAnalysisSnapshot } from "../analysis";
import type { Report } from "../reports/domain/report";
import { isReport } from "../reports/domain/report";
import type { ReportRepository } from "../reports/application/ports";
import type { PipelineDefinition, PipelineDefinitionRepository } from "../pipelines";
import { isPipelineDefinition, MAX_PIPELINE_STEPS } from "../pipelines";
import type { Project, ProjectRepository } from "../projects";
import { validateProjectName } from "../projects";

const FORMAT = "dataforge-project-backup";
const FORMAT_VERSION = 1;
export const MAX_PROJECT_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_PIPELINES = 500;
const MAX_SNAPSHOTS = 500;
const MAX_REPORTS = 500;

export interface PortableProjectBackup {
  format: typeof FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  exportedAt: string;
  contents: {
    projectName: true;
    pipelineDefinitions: true;
    analysisSnapshots: true;
    reports: true;
    folderLocation: false;
    datasetBytes: false;
    datasetVersions: false;
  };
  project: { sourceProjectId: string; name: string };
  pipelineDefinitions: PipelineDefinition[];
  analysisSnapshots: AnalysisSnapshot[];
  reports: Report[];
}

export interface ProjectBackupDependencies {
  projects: ProjectRepository;
  definitions: PipelineDefinitionRepository;
  snapshots: AnalysisSnapshotRepository;
  reports: ReportRepository;
  now?: () => string;
  generateId?: () => string;
}

/** JSON backup for project metadata and saved analysis artifacts; never dataset bytes. */
export class ProjectBackupService {
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(private readonly deps: ProjectBackupDependencies) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  async exportProject(projectId: string): Promise<PortableProjectBackup> {
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new Error("No se encontró el proyecto para exportar.");
    const [definitions, snapshots, reports] = await Promise.all([
      this.deps.definitions.list(projectId),
      this.deps.snapshots.list(projectId),
      this.deps.reports.list(projectId),
    ]);
    const backup: PortableProjectBackup = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      exportedAt: this.now(),
      contents: manifest(),
      project: { sourceProjectId: project.id, name: validateProjectName(project.name) },
      pipelineDefinitions: structuredClone(definitions),
      analysisSnapshots: structuredClone(snapshots),
      reports: structuredClone(reports),
    };
    assertBackupArtifacts(backup);
    assertBackupSize(backup);
    return backup;
  }

  async importProject(input: unknown): Promise<Project> {
    // Validate and clone the complete archive before touching any repository.
    const backup = validateBackup(input);
    const timestamp = this.now();
    const project: Project = {
      id: this.generateId(),
      name: validateProjectName(backup.project.name),
      folderId: null,
      kind: "general",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (await this.deps.projects.findById(project.id)) {
      throw new Error("No se pudo crear un identificador nuevo para el proyecto importado.");
    }

    const definitions = backup.pipelineDefinitions;
    const snapshots = backup.analysisSnapshots.map((snapshot) => remapSnapshot(snapshot, project.id));
    const reports = backup.reports.map((report) => ({ ...structuredClone(report), projectId: project.id }));
    const savedDefinitions: string[] = [];
    const savedSnapshots: string[] = [];
    const savedReports: string[] = [];
    let projectWriteAttempted = false;
    try {
      for (const definition of definitions) {
        await this.deps.definitions.save(project.id, definition);
        savedDefinitions.push(definition.id);
      }
      for (const snapshot of snapshots) {
        await this.deps.snapshots.save(snapshot);
        savedSnapshots.push(snapshot.id);
      }
      for (const report of reports) {
        await this.deps.reports.save(report);
        savedReports.push(report.id);
      }
      // Publish the project only after every referenced artifact is present.
      projectWriteAttempted = true;
      await this.deps.projects.save(project);
      return project;
    } catch (cause) {
      const rollbackErrors: string[] = [];
      const rollback = async (label: string, action: () => Promise<void>) => {
        try { await action(); }
        catch (error) { rollbackErrors.push(`${label}: ${errorText(error)}`); }
      };
      // Continue cleanup after an individual delete fails; report every failure.
      if (projectWriteAttempted) await rollback("proyecto", () => this.deps.projects.delete(project.id));
      for (const id of [...savedReports].reverse()) {
        await rollback(`informe ${id}`, () => this.deps.reports.delete(project.id, id));
      }
      for (const id of [...savedSnapshots].reverse()) {
        await rollback(`snapshot ${id}`, () => this.deps.snapshots.delete(project.id, id));
      }
      for (const id of [...savedDefinitions].reverse()) {
        await rollback(`pipeline ${id}`, () => this.deps.definitions.delete(project.id, id));
      }
      if (rollbackErrors.length) {
        throw new Error(`Falló la importación: ${errorText(cause)}. La reversión tuvo errores: ${rollbackErrors.join("; ")}`);
      }
      throw new Error(`Falló la importación; se intentó revertir el proyecto nuevo: ${errorText(cause)}`);
    }
  }
}

export function serializeProjectBackup(backup: PortableProjectBackup): string {
  const normalized = validateBackup(backup);
  assertBackupSize(normalized);
  return JSON.stringify(normalized, null, 2);
}

export function parseProjectBackup(text: string): PortableProjectBackup {
  if (byteLength(text) > MAX_PROJECT_BACKUP_BYTES) throw new Error("El respaldo supera el límite de 5 MiB.");
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error("El archivo no contiene JSON válido."); }
  return validateBackup(value);
}

function validateBackup(value: unknown): PortableProjectBackup {
  if (!isRecord(value) || value.format !== FORMAT || value.formatVersion !== FORMAT_VERSION) {
    throw new Error("El formato o la versión del respaldo no es compatible.");
  }
  if (!isManifest(value.contents)) throw new Error("El manifiesto del respaldo no coincide con el alcance portable v1.");
  const projectMeta = value.project;
  if (!isRecord(projectMeta) || typeof projectMeta.sourceProjectId !== "string" || !projectMeta.sourceProjectId.trim()
    || typeof projectMeta.name !== "string" || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error("Los metadatos del proyecto están dañados.");
  }
  try { validateProjectName(projectMeta.name); }
  catch { throw new Error("El nombre del proyecto del respaldo no es válido."); }
  if (!Array.isArray(value.pipelineDefinitions) || value.pipelineDefinitions.length > MAX_PIPELINES || !value.pipelineDefinitions.every(isPortableDefinition)) {
    throw new Error("Las definiciones de pipeline están dañadas o superan el máximo de 500.");
  }
  const pipelineIds = new Set<string>();
  for (const definition of value.pipelineDefinitions) {
    if (pipelineIds.has(definition.id)) throw new Error("El respaldo contiene identificadores de pipeline duplicados.");
    pipelineIds.add(definition.id);
  }
  if (!Array.isArray(value.analysisSnapshots) || value.analysisSnapshots.length > MAX_SNAPSHOTS
    || !value.analysisSnapshots.every((snapshot) => validateAnalysisSnapshot(snapshot)
      && snapshot.projectId === projectMeta.sourceProjectId)) {
    throw new Error("Los snapshots están dañados, pertenecen a otro proyecto o superan el máximo de 500.");
  }
  if (!Array.isArray(value.reports) || value.reports.length > MAX_REPORTS
    || !value.reports.every((report) => isReport(report) && report.projectId === projectMeta.sourceProjectId)) {
    throw new Error("Los informes están dañados, pertenecen a otro proyecto o superan el máximo de 500.");
  }

  const normalized: PortableProjectBackup = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: value.exportedAt,
    contents: manifest(),
    project: { sourceProjectId: projectMeta.sourceProjectId, name: projectMeta.name.trim() },
    pipelineDefinitions: structuredClone(value.pipelineDefinitions),
    analysisSnapshots: structuredClone(value.analysisSnapshots),
    reports: structuredClone(value.reports),
  };
  assertBackupArtifacts(normalized);
  assertBackupSize(normalized);
  return normalized;
}

function assertBackupArtifacts(backup: PortableProjectBackup): void {
  const sourceProjectId = backup.project.sourceProjectId;
  const snapshotIds = new Set<string>();
  for (const snapshot of backup.analysisSnapshots) {
    if (!validateAnalysisSnapshot(snapshot) || snapshot.projectId !== sourceProjectId || snapshotIds.has(snapshot.id)) {
      throw new Error("El respaldo contiene snapshots inválidos o con identificadores duplicados.");
    }
    // The analysis domain validator checks all node project IDs, parent links,
    // topological order, source IDs, and the complete lineage graph.
    snapshotIds.add(snapshot.id);
  }
  const reportIds = new Set<string>();
  for (const report of backup.reports) {
    if (!isReport(report) || report.projectId !== sourceProjectId || reportIds.has(report.id)) {
      throw new Error("El respaldo contiene informes inválidos o con identificadores duplicados.");
    }
    reportIds.add(report.id);
    const sectionIds = new Set<string>();
    for (const section of report.sections) {
      if (sectionIds.has(section.id)) throw new Error(`El informe ${report.id} contiene secciones duplicadas.`);
      sectionIds.add(section.id);
      if (section.kind === "snapshot" && !snapshotIds.has(section.snapshotId ?? "")) {
        throw new Error(`El informe ${report.id} referencia un snapshot que no está incluido en el respaldo.`);
      }
    }
  }
  const pipelineIds = new Set<string>();
  for (const definition of backup.pipelineDefinitions) {
    if (!isPortableDefinition(definition) || pipelineIds.has(definition.id)) {
      throw new Error("El respaldo contiene definiciones de pipeline inválidas o con identificadores duplicados.");
    }
    pipelineIds.add(definition.id);
  }
}

function remapSnapshot(snapshot: AnalysisSnapshot, projectId: string): AnalysisSnapshot {
  return {
    ...structuredClone(snapshot),
    projectId,
    source: {
      ...structuredClone(snapshot.source),
      // Keep source/version/session IDs as historical metadata. They do not
      // restore, reopen, or automatically match a source in the new project.
      lineage: {
        ...structuredClone(snapshot.source.lineage),
        nodes: snapshot.source.lineage.nodes.map((node) => ({ ...structuredClone(node), projectId })),
      },
    },
  };
}

function isManifest(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 7 && value.projectName === true && value.pipelineDefinitions === true
    && value.analysisSnapshots === true && value.reports === true && value.folderLocation === false
    && value.datasetBytes === false && value.datasetVersions === false;
}

function manifest(): PortableProjectBackup["contents"] {
  return {
    projectName: true,
    pipelineDefinitions: true,
    analysisSnapshots: true,
    reports: true,
    folderLocation: false,
    datasetBytes: false,
    datasetVersions: false,
  };
}

function isPortableDefinition(value: unknown): value is PipelineDefinition {
  if (!isPipelineDefinition(value) || !value.id.trim() || !value.name.trim() || value.name.trim().length > 80 || value.steps.length === 0 || value.steps.length > MAX_PIPELINE_STEPS) return false;
  const stepIds = new Set<string>();
  for (const step of value.steps) {
    if (!step.id.trim() || stepIds.has(step.id)) return false;
    stepIds.add(step.id);
  }
  return true;
}

function assertBackupSize(value: unknown): void {
  let serialized: string;
  try { serialized = JSON.stringify(value, null, 2); }
  catch { throw new Error("El respaldo no se puede serializar como JSON."); }
  if (byteLength(serialized) > MAX_PROJECT_BACKUP_BYTES) throw new Error("El respaldo supera el límite de 5 MiB.");
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
