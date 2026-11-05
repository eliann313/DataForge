import type { PipelineVersion } from "../pipelines";
import { isPipelineDefinition } from "../pipelines";
import type { ProjectRepository } from "../projects";

const MAGIC = new Uint8Array([0x44, 0x46, 0x44, 0x41, 0x54, 0x41, 0x0d, 0x0a]); // DFDATA\r\n
const FORMAT = "dataforge-dataset-archive";
const FORMAT_VERSION = 1;
const HEADER_BYTES = MAGIC.byteLength + 4;
export const MAX_PORTABLE_DATASET_BYTES = 20 * 1024 * 1024;
export const MAX_PORTABLE_DATASET_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_PORTABLE_DATASET_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PORTABLE_VERSIONS = 64;
const MAX_COLUMNS = 512;

export interface PortableDatasetVersion {
  ref: string;
  identity: { sessionId: string; versionId: string };
  name: string;
  operationType: PipelineVersion["operationType"];
  sourceRefs: string[];
  parentRefs: string[];
  pipelineId: string | null;
  executedDefinition?: PipelineVersion["executedDefinition"];
  rowCount: number;
  columns: PipelineVersion["columns"];
  stepCount: number;
  createdAt: string;
  semanticRoles: Record<string, string>;
  byteLength: number;
  sha256: string;
}

export interface PortableDatasetArchiveManifest {
  format: typeof FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  archiveId: string;
  exportedAt: string;
  project: { name: string };
  versions: PortableDatasetVersion[];
}

export interface PortableDatasetArchivePort {
  init(): Promise<void>;
  getDatasetVersions(projectId: string): PipelineVersion[];
  getVersionSemanticRoles(versionId: string): Record<string, string>;
  exportPortableDatasetVersion(versionId: string, maxBytes: number): Promise<{ blob: Blob; byteLength: number }>;
  importPortableParquet(name: string, bytes: Uint8Array, projectId: string): Promise<{ versionId: string; rows: number; columns: PipelineVersion["columns"] }>;
  restorePortableVersionMetadata(versionId: string, metadata: {
    name: string;
    operationType: PipelineVersion["operationType"];
    sourceId: string;
    sourceIds: string[];
    parentIds: string[];
    pipelineId: string | null;
    executedDefinition?: PipelineVersion["executedDefinition"];
    stepCount: number;
    createdAt: string;
    semanticRoles: Record<string, string>;
  }): void;
  activateDatasetVersion(versionId: string): Promise<void>;
  getDatasetSources(projectId: string): Array<{ id: string; projectId: string | null }>;
  removeDataset(sourceId: string, projectId: string): Promise<void>;
}

export interface DatasetArchiveImportResult {
  projectId: string;
  archiveId: string;
  versionIdByRef: ReadonlyMap<string, string>;
  versionIdBySessionAndVersion: ReadonlyMap<string, string>;
}

/** Exporta las versiones materializadas de un proyecto a un contenedor binario sin compresión. */
export class DatasetArchiveService {
  constructor(
    private readonly deps: {
      projects: ProjectRepository;
      datasets: PortableDatasetArchivePort;
      now?: () => string;
      generateId?: () => string;
    },
  ) {}

  async exportProject(projectId: string, sessionId: string): Promise<Blob> {
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new Error("No se encontró el proyecto para respaldar sus datasets.");
    if (!sessionId.trim() || sessionId.length > 256) throw new Error("La identidad de sesión no es válida.");
    await this.deps.datasets.init();
    const versions = this.deps.datasets.getDatasetVersions(projectId);
      validateVersionGraph(versions, projectId);
      if (versions.length === 0) throw new Error("Este proyecto no tiene versiones de datasets en la sesión.");
      if (versions.length > MAX_PORTABLE_VERSIONS) throw new Error(`El respaldo admite hasta ${MAX_PORTABLE_VERSIONS} versiones de dataset.`);

      const refByVersion = new Map(versions.map((version) => [version.id, createId(this.deps.generateId)]));
      const assets: Blob[] = [];
      let totalBytes = 0;
      const portableVersions: PortableDatasetVersion[] = [];
      for (const version of versions) {
        const exported = await this.deps.datasets.exportPortableDatasetVersion(version.id, MAX_PORTABLE_DATASET_BYTES);
        if (exported.byteLength === 0 || exported.byteLength > MAX_PORTABLE_DATASET_BYTES) {
          throw new Error(`La versión «${version.name}» supera el límite de ${MAX_PORTABLE_DATASET_BYTES / 1024 / 1024} MiB.`);
        }
        totalBytes += exported.byteLength;
        if (totalBytes > MAX_PORTABLE_DATASET_ARCHIVE_BYTES) throw new Error("Los datasets superan el límite total de 50 MiB por respaldo.");
        assets.push(exported.blob);
        portableVersions.push({
          ref: refByVersion.get(version.id)!,
          identity: { sessionId, versionId: version.id },
          name: version.name,
          operationType: version.operationType,
          sourceRefs: version.sourceIds.map((id) => requireMappedRef(refByVersion, id)),
          parentRefs: version.parentIds.map((id) => requireMappedRef(refByVersion, id)),
          pipelineId: version.pipelineId,
          ...(version.executedDefinition ? { executedDefinition: version.executedDefinition } : {}),
          rowCount: version.rowCount,
          columns: version.columns.map((column) => ({ ...column })),
          stepCount: version.stepCount,
          createdAt: version.createdAt,
          semanticRoles: this.deps.datasets.getVersionSemanticRoles(version.id),
          byteLength: exported.byteLength,
          sha256: await sha256(exported.blob),
        });
      }
      const manifest: PortableDatasetArchiveManifest = {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        archiveId: createId(this.deps.generateId),
        exportedAt: this.deps.now?.() ?? new Date().toISOString(),
        project: { name: project.name },
        versions: portableVersions,
      };
    return createArchiveBlob(manifest, assets);
  }

  /** Restaura solo al proyecto elegido expresamente; no busca por nombre. */
  async importIntoProject(file: File, targetProjectId: string, userConfirmed: boolean): Promise<DatasetArchiveImportResult> {
    if (!userConfirmed) throw new Error("Confirme el proyecto de destino antes de importar los datasets.");
    if (!targetProjectId.trim()) throw new Error("Seleccione un proyecto de destino.");
    if (!await this.deps.projects.findById(targetProjectId)) throw new Error("El proyecto de destino ya no existe.");
    const { manifest, payloadOffset } = await readArchiveManifest(file);
    const payloadOffsets = calculateOffsets(manifest, payloadOffset);

    // Verifica el archivo entero antes de modificar el Worker. Solo retiene un asset (máx. 20 MiB).
    for (const item of manifest.versions) {
      const range = payloadOffsets.get(item.ref)!;
      const bytes = new Uint8Array(await file.slice(range.start, range.end).arrayBuffer());
      if (await sha256(bytes) !== item.sha256) throw new Error(`El Parquet de «${item.name}» no coincide con su checksum.`);
    }

    await this.deps.datasets.init();
    const versionIdByRef = new Map<string, string>();
    const importedSourceIds = new Set<string>();
    try {
      for (const item of [...manifest.versions].reverse()) {
        const range = payloadOffsets.get(item.ref)!;
        const bytes = new Uint8Array(await file.slice(range.start, range.end).arrayBuffer());
        let imported: Awaited<ReturnType<PortableDatasetArchivePort["importPortableParquet"]>>;
        try { imported = await this.deps.datasets.importPortableParquet(item.name, bytes, targetProjectId); }
        catch (cause) { throw new Error(`No se pudo recuperar «${item.name}»: ${errorText(cause)}`); }
        // Register the new root for rollback before validation can throw.
        importedSourceIds.add(imported.versionId);
        const actual = this.deps.datasets.getDatasetVersions(targetProjectId).find((version) => version.id === imported.versionId);
        if (!actual || imported.rows !== item.rowCount || !sameSchema(imported.columns, item.columns)) {
          throw new Error(`El esquema o la cantidad de filas importada de «${item.name}» no coincide con el manifiesto.`);
        }
        versionIdByRef.set(item.ref, imported.versionId);
      }

      for (const item of manifest.versions) {
        const versionId = requireMappedRef(versionIdByRef, item.ref);
        const sourceIds = item.sourceRefs.map((ref) => requireMappedRef(versionIdByRef, ref));
        const parentIds = item.parentRefs.map((ref) => requireMappedRef(versionIdByRef, ref));
        const sourceId = item.operationType === "source" ? versionId : sourceIds[0];
        this.deps.datasets.restorePortableVersionMetadata(versionId, {
          name: item.name,
          operationType: item.operationType,
          sourceId,
          sourceIds,
          parentIds,
          pipelineId: item.pipelineId,
          ...(item.executedDefinition ? { executedDefinition: item.executedDefinition } : {}),
          stepCount: item.stepCount,
          createdAt: item.createdAt,
          semanticRoles: item.semanticRoles,
        });
      }
      const last = manifest.versions.at(-1);
      if (last) await this.deps.datasets.activateDatasetVersion(requireMappedRef(versionIdByRef, last.ref));
      const versionIdBySessionAndVersion = new Map<string, string>();
      for (const item of manifest.versions) {
        versionIdBySessionAndVersion.set(identityKey(item.identity.sessionId, item.identity.versionId), requireMappedRef(versionIdByRef, item.ref));
      }
      return { projectId: targetProjectId, archiveId: manifest.archiveId, versionIdByRef, versionIdBySessionAndVersion };
    } catch (cause) {
      const rollbackErrors: string[] = [];
      for (const source of this.deps.datasets.getDatasetSources(targetProjectId).filter((item) => importedSourceIds.has(item.id))) {
        try { await this.deps.datasets.removeDataset(source.id, targetProjectId); }
        catch (rollbackCause) { rollbackErrors.push(errorText(rollbackCause)); }
      }
      const detail = errorText(cause);
      throw new Error(rollbackErrors.length
        ? `Falló la importación («${detail}») y la reversión quedó incompleta: ${rollbackErrors.join("; ")}`
        : `Falló la importación y se quitaron las versiones nuevas: ${detail}`);
    }
  }
}

export function identityKey(sessionId: string, versionId: string): string {
  return `${sessionId.length}:${sessionId}${versionId.length}:${versionId}`;
}

export async function readArchiveManifest(file: File): Promise<{ manifest: PortableDatasetArchiveManifest; payloadOffset: number }> {
  if (file.size < HEADER_BYTES || file.size > HEADER_BYTES + MAX_PORTABLE_DATASET_MANIFEST_BYTES + MAX_PORTABLE_DATASET_ARCHIVE_BYTES) {
    throw new Error("El respaldo de datasets está vacío o supera el límite de 52 MiB.");
  }
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (!MAGIC.every((byte, index) => header[index] === byte)) throw new Error("El archivo no es un respaldo de datasets DataForge.");
  const manifestLength = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(MAGIC.byteLength, true);
  if (manifestLength < 2 || manifestLength > MAX_PORTABLE_DATASET_MANIFEST_BYTES) throw new Error("El manifiesto supera el límite de 2 MiB.");
  const payloadOffset = HEADER_BYTES + manifestLength;
  if (payloadOffset > file.size) throw new Error("El manifiesto del respaldo está truncado.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await file.slice(HEADER_BYTES, payloadOffset).arrayBuffer())) as unknown; }
  catch { throw new Error("El manifiesto del respaldo no es JSON UTF-8 válido."); }
  const manifest = validateManifest(raw);
  const expected = payloadOffset + manifest.versions.reduce((total, item) => total + item.byteLength, 0);
  if (expected !== file.size) throw new Error("El tamaño del archivo no coincide con las longitudes del manifiesto.");
  return { manifest, payloadOffset };
}

export async function createArchiveBlob(manifest: PortableDatasetArchiveManifest, assets: Array<Blob | Uint8Array>): Promise<Blob> {
  const normalized = validateManifest(manifest);
  if (assets.length !== normalized.versions.length || assets.some((asset, index) => assetSize(asset) !== normalized.versions[index].byteLength)) {
    throw new Error("Los payloads no coinciden con el manifiesto del respaldo.");
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(normalized));
  if (manifestBytes.byteLength > MAX_PORTABLE_DATASET_MANIFEST_BYTES) throw new Error("El manifiesto supera el límite de 2 MiB.");
  const total = HEADER_BYTES + manifestBytes.byteLength + assets.reduce((sum, asset) => sum + assetSize(asset), 0);
  if (total > MAX_PORTABLE_DATASET_ARCHIVE_BYTES + HEADER_BYTES + MAX_PORTABLE_DATASET_MANIFEST_BYTES) throw new Error("El respaldo supera el límite total de 50 MiB más su manifiesto.");
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC);
  new DataView(header.buffer).setUint32(MAGIC.byteLength, manifestBytes.byteLength, true);
  return new Blob([header as unknown as BlobPart, manifestBytes as unknown as BlobPart, ...assets.map((asset) => asset as unknown as BlobPart)], { type: "application/vnd.dataforge.dataset-archive" });
}

function validateManifest(value: unknown): PortableDatasetArchiveManifest {
  if (!isRecord(value) || value.format !== FORMAT || value.formatVersion !== FORMAT_VERSION
    || !isUuid(value.archiveId) || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
    || !isRecord(value.project) || typeof value.project.name !== "string" || value.project.name.trim().length === 0 || value.project.name.length > 100
    || !Array.isArray(value.versions) || value.versions.length === 0 || value.versions.length > MAX_PORTABLE_VERSIONS) {
    throw new Error("El manifiesto del respaldo no tiene una forma compatible.");
  }
  const refs = new Set<string>();
  const identities = new Set<string>();
  let totalBytes = 0;
  const versions: PortableDatasetVersion[] = [];
  for (const raw of value.versions) {
    if (!isRecord(raw)) throw new Error("Una versión o payload del manifiesto está dañado o supera sus límites.");
    const candidate = raw as unknown as PortableDatasetVersion;
    if (!isRecord(candidate) || !isUuid(candidate.ref) || refs.has(candidate.ref)
      || !isRecord(candidate.identity) || typeof candidate.identity.sessionId !== "string" || candidate.identity.sessionId.length === 0 || candidate.identity.sessionId.length > 256
      || typeof candidate.identity.versionId !== "string" || candidate.identity.versionId.length === 0 || candidate.identity.versionId.length > 256
      || typeof candidate.name !== "string" || candidate.name.length === 0 || candidate.name.length > 1024
      || !["source", "pipeline", "append", "join"].includes(String(candidate.operationType))
      || !Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length === 0 || candidate.sourceRefs.length > MAX_PORTABLE_VERSIONS
      || !candidate.sourceRefs.every(isUuid) || new Set(candidate.sourceRefs).size !== candidate.sourceRefs.length
      || !Array.isArray(candidate.parentRefs) || candidate.parentRefs.length > MAX_PORTABLE_VERSIONS
      || !candidate.parentRefs.every(isUuid) || new Set(candidate.parentRefs).size !== candidate.parentRefs.length
      || !(candidate.pipelineId === null || typeof candidate.pipelineId === "string" && candidate.pipelineId.length <= 256)
      || candidate.executedDefinition !== undefined && !isPipelineDefinition(candidate.executedDefinition)
      || !Number.isSafeInteger(candidate.rowCount) || candidate.rowCount < 0
      || !Array.isArray(candidate.columns) || candidate.columns.length === 0 || candidate.columns.length > MAX_COLUMNS
      || !candidate.columns.every((column) => isRecord(column) && typeof column.name === "string" && column.name.length <= 1024 && typeof column.type === "string" && column.type.length <= 256 && typeof column.nullable === "boolean")
      || !Number.isSafeInteger(candidate.stepCount) || candidate.stepCount < 0
      || typeof candidate.createdAt !== "string" || !Number.isFinite(Date.parse(candidate.createdAt))
      || !isRecord(candidate.semanticRoles) || Object.keys(candidate.semanticRoles).length > MAX_COLUMNS
      || !Object.entries(candidate.semanticRoles).every(([column, role]) => candidate.columns.some((item) => isRecord(item) && item.name === column) && ["fecha", "medida", "identificador", "texto", "dimension", "desconocido"].includes(String(role)))
      || !Number.isSafeInteger(candidate.byteLength) || candidate.byteLength <= 0 || candidate.byteLength > MAX_PORTABLE_DATASET_BYTES
      || typeof candidate.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(candidate.sha256)) {
      throw new Error("Una versión o payload del manifiesto está dañado o supera sus límites.");
    }
    const identity = identityKey(candidate.identity.sessionId, candidate.identity.versionId);
    if (identities.has(identity)) throw new Error("El manifiesto repite una identidad de sesión/versión.");
    refs.add(candidate.ref);
    identities.add(identity);
    totalBytes += candidate.byteLength;
    if (totalBytes > MAX_PORTABLE_DATASET_ARCHIVE_BYTES) throw new Error("Los datasets superan el límite total de 50 MiB.");
    versions.push(candidate);
  }
  const byRef = new Map(versions.map((version, index) => [version.ref, { version, index }]));
  for (const [index, version] of versions.entries()) {
    if (!version.sourceRefs.every((ref) => byRef.get(ref)?.version.operationType === "source")
      || !version.parentRefs.every((ref) => (byRef.get(ref)?.index ?? index) < index)
      || version.operationType === "source" && (version.parentRefs.length > 0 || version.sourceRefs.length !== 1 || version.sourceRefs[0] !== version.ref)
      || version.operationType !== "source" && version.parentRefs.length === 0) {
      throw new Error("El linaje del respaldo referencia versiones ausentes, cíclicas o de otro tipo.");
    }
  }
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    archiveId: value.archiveId,
    exportedAt: value.exportedAt,
    project: { name: value.project.name.trim() },
    versions,
  };
}

function validateVersionGraph(versions: PipelineVersion[], projectId: string): void {
  const byId = new Map(versions.map((version, index) => [version.id, { version, index }]));
  if (byId.size !== versions.length || versions.some((version) => version.projectId !== projectId)) throw new Error("Las versiones del proyecto no tienen una identidad única y aislada.");
  versions.forEach((version, index) => {
    if (!Number.isSafeInteger(version.rowCount) || version.rowCount < 0 || version.columns.length === 0 || version.columns.length > MAX_COLUMNS
      || version.sourceIds.length === 0 || !version.sourceIds.every((id) => byId.get(id)?.version.operationType === "source")
      || !version.parentIds.every((id) => (byId.get(id)?.index ?? index) < index)
      || version.operationType === "source" && (version.parentIds.length > 0 || version.sourceIds.length !== 1 || version.sourceIds[0] !== version.id)
      || version.operationType !== "source" && version.parentIds.length === 0) {
      throw new Error(`El linaje de «${version.name}» no se puede respaldar con identidad segura.`);
    }
  });
}

function sameSchema(left: PipelineVersion["columns"], right: PipelineVersion["columns"]): boolean {
  return left.length === right.length && left.every((column, index) => column.name === right[index].name && column.type === right[index].type && column.nullable === right[index].nullable);
}

function calculateOffsets(manifest: PortableDatasetArchiveManifest, payloadOffset: number): Map<string, { start: number; end: number }> {
  let offset = payloadOffset;
  const ranges = new Map<string, { start: number; end: number }>();
  for (const version of manifest.versions) {
    const end = offset + version.byteLength;
    ranges.set(version.ref, { start: offset, end });
    offset = end;
  }
  return ranges;
}

async function sha256(asset: Blob | Uint8Array): Promise<string> {
  const bytes = asset instanceof Blob ? await asset.arrayBuffer() : asset as unknown as BufferSource;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createId(generate?: () => string): string {
  const value = generate?.() ?? crypto.randomUUID();
  if (!isUuid(value)) throw new Error("El generador de referencias no devolvió un UUID.");
  return value;
}
function requireMappedRef(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`No existe un mapeo portable explícito para «${key}».`);
  return value;
}
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}
function assetSize(asset: Blob | Uint8Array): number { return asset instanceof Blob ? asset.size : asset.byteLength; }
