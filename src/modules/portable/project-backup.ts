import type { PipelineDefinition, PipelineDefinitionRepository } from "../pipelines";
import { isPipelineDefinition, MAX_PIPELINE_STEPS } from "../pipelines";
import type { Project, ProjectRepository } from "../projects";
import { validateProjectName } from "../projects";

const FORMAT = "dataforge-project-backup";
const FORMAT_VERSION = 1;
export const MAX_PROJECT_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_PIPELINES = 500;

export interface PortableProjectBackup {
  format: typeof FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  exportedAt: string;
  contents: { projectName: true; pipelineDefinitions: true; folderLocation: false; datasetBytes: false; analysisSnapshots: false };
  project: { name: string };
  pipelineDefinitions: PipelineDefinition[];
}

export interface ProjectBackupDependencies {
  projects: ProjectRepository;
  definitions: PipelineDefinitionRepository;
  now?: () => string;
  generateId?: () => string;
}

/** Portable v1 deliberately contains metadata and declarative pipeline recipes only. */
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
    const definitions = await this.deps.definitions.list(projectId);
    const backup: PortableProjectBackup = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      exportedAt: this.now(),
      contents: { projectName: true, pipelineDefinitions: true, folderLocation: false, datasetBytes: false, analysisSnapshots: false },
      project: { name: validateProjectName(project.name) },
      pipelineDefinitions: definitions,
    };
    assertBackupSize(backup);
    return backup;
  }

  async importProject(input: unknown): Promise<Project> {
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

    const saved: string[] = [];
    try {
      for (const definition of backup.pipelineDefinitions) {
        await this.deps.definitions.save(project.id, definition);
        saved.push(definition.id);
      }
      // Publish the project only after its definitions are present.
      await this.deps.projects.save(project);
      return project;
    } catch (cause) {
      // The stores are separate IndexedDB databases, so compensate explicitly.
      // If compensation itself fails, keep the original failure visible with context.
      try {
        for (const id of saved) await this.deps.definitions.delete(project.id, id);
      } catch (rollbackCause) {
        throw new Error(`Falló la importación y también su reversión: ${errorText(rollbackCause)}. Error original: ${errorText(cause)}`);
      }
      throw new Error(`Falló la importación; se revirtió el proyecto nuevo: ${errorText(cause)}`);
    }
  }
}

export function serializeProjectBackup(backup: PortableProjectBackup): string {
  assertBackupSize(backup);
  return JSON.stringify(backup, null, 2);
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
  if (!isRecord(value.contents) || value.contents.projectName !== true || value.contents.pipelineDefinitions !== true || value.contents.folderLocation !== false || value.contents.datasetBytes !== false || value.contents.analysisSnapshots !== false) {
    throw new Error("El manifiesto del respaldo no coincide con el alcance portable v1.");
  }
  if (!isRecord(value.project) || typeof value.project.name !== "string" || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error("Los metadatos del proyecto están dañados.");
  }
  try { validateProjectName(value.project.name); }
  catch { throw new Error("El nombre del proyecto del respaldo no es válido."); }
  if (!Array.isArray(value.pipelineDefinitions) || value.pipelineDefinitions.length > MAX_PIPELINES || !value.pipelineDefinitions.every(isPortableDefinition)) {
    throw new Error("Las definiciones de pipeline están dañadas o superan el máximo de 500.");
  }
  const ids = new Set<string>();
  for (const definition of value.pipelineDefinitions) {
    if (ids.has(definition.id)) throw new Error("El respaldo contiene identificadores de pipeline duplicados.");
    ids.add(definition.id);
  }
  const normalized: PortableProjectBackup = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: value.exportedAt,
    contents: { projectName: true, pipelineDefinitions: true, folderLocation: false, datasetBytes: false, analysisSnapshots: false },
    project: { name: value.project.name.trim() },
    pipelineDefinitions: value.pipelineDefinitions,
  };
  assertBackupSize(normalized);
  return normalized;
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
  if (byteLength(JSON.stringify(value)) > MAX_PROJECT_BACKUP_BYTES) throw new Error("El respaldo supera el límite de 5 MiB.");
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
