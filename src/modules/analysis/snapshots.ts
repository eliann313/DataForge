/** Datos JSON guardables de resultados de análisis; no contiene archivos fuente. */
export type SnapshotValue = null | boolean | number | string | SnapshotValue[] | { [key: string]: SnapshotValue };

export interface SnapshotLineageNode {
  versionId: string;
  projectId: string;
  name: string;
  operationType: "source" | "pipeline" | "append" | "join";
  sourceIds: string[];
  parentIds: string[];
  pipelineId: string | null;
  /** Copia JSON de la definición ejecutada, cuando corresponde. */
  executedDefinition: SnapshotValue | null;
  rowCount: number;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  stepCount: number;
  createdAt: string;
}

export interface SnapshotLineage {
  rootVersionId: string;
  /** Orden topológico: los padres preceden a sus hijos. */
  nodes: SnapshotLineageNode[];
}

export type SnapshotVersionReference = SnapshotLineageNode;

export interface AnalysisSnapshot {
  id: string;
  projectId: string;
  createdAt: string;
  title: string;
  source: {
    sessionId: string;
    versionId: string;
    sourceId: string;
    datasetName: string;
    rowCount: number;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    lineage: SnapshotLineage;
  };
  parameters: { [key: string]: SnapshotValue };
  results: { [key: string]: SnapshotValue };
}

export interface AnalysisSnapshotRepository {
  save(snapshot: AnalysisSnapshot): Promise<void>;
  list(projectId: string): Promise<AnalysisSnapshot[]>;
  findById(projectId: string, snapshotId: string): Promise<AnalysisSnapshot | null>;
  delete(projectId: string, snapshotId: string): Promise<void>;
}

export function validateAnalysisSnapshot(value: unknown): value is AnalysisSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AnalysisSnapshot>;
  if (typeof item.id !== "string" || item.id.length === 0
    || typeof item.projectId !== "string" || item.projectId.length === 0
    || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
    || typeof item.title !== "string" || item.title.trim().length === 0 || item.title.length > 120
    || !item.source || !isRecord(item.parameters) || !isRecord(item.results) || Object.keys(item.results).length === 0
    || !isJsonValue(item.parameters) || !isJsonValue(item.results)) return false;
  const source = item.source;
  if (typeof source.sessionId !== "string" || source.sessionId.length === 0
    || typeof source.versionId !== "string" || source.versionId.length === 0
    || typeof source.sourceId !== "string" || source.sourceId.length === 0
    || typeof source.datasetName !== "string" || source.datasetName.length > 1024
    || !Number.isSafeInteger(source.rowCount) || source.rowCount < 0
    || !Array.isArray(source.columns) || !source.columns.every((c) => c && typeof c.name === "string" && typeof c.type === "string" && typeof c.nullable === "boolean")
    || !isValidLineage(source.lineage, item.projectId)
    || source.lineage.rootVersionId !== source.versionId
    || !source.lineage.nodes.find((node) => node.versionId === source.versionId)?.sourceIds.includes(source.sourceId)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2 * 1024 * 1024;
  } catch { return false; }
}

function isValidLineage(value: unknown, projectId: string): value is SnapshotLineage {
  if (!value || typeof value !== "object") return false;
  const lineage = value as Partial<SnapshotLineage>;
  if (typeof lineage.rootVersionId !== "string" || !lineage.rootVersionId || !Array.isArray(lineage.nodes)
    || lineage.nodes.length === 0 || lineage.nodes.length > 256) return false;
  const nodes = new Map<string, SnapshotLineageNode>();
  for (const candidate of lineage.nodes) {
    if (!candidate || typeof candidate !== "object") return false;
    const node = candidate as Partial<SnapshotLineageNode>;
    if (typeof node.versionId !== "string" || !node.versionId || nodes.has(node.versionId)
      || node.projectId !== projectId || typeof node.name !== "string" || node.name.length > 1024
      || !["source", "pipeline", "append", "join"].includes(node.operationType ?? "")
      || !Array.isArray(node.sourceIds) || node.sourceIds.length === 0 || node.sourceIds.length > 256
      || !node.sourceIds.every((id) => typeof id === "string" && id.length > 0)
      || !Array.isArray(node.parentIds) || node.parentIds.length > 256
      || !node.parentIds.every((id) => typeof id === "string" && id.length > 0)
      || !(node.pipelineId === null || (typeof node.pipelineId === "string" && node.pipelineId.length <= 1024))
      || !(node.executedDefinition === null || isJsonValue(node.executedDefinition))
      || typeof node.rowCount !== "number" || !Number.isSafeInteger(node.rowCount) || node.rowCount < 0
      || typeof node.stepCount !== "number" || !Number.isSafeInteger(node.stepCount) || node.stepCount < 0
      || typeof node.createdAt !== "string" || !Number.isFinite(Date.parse(node.createdAt))
      || !Array.isArray(node.columns) || node.columns.length > 10_000
      || !node.columns.every((column) => column && typeof column.name === "string" && typeof column.type === "string" && typeof column.nullable === "boolean")) return false;
    nodes.set(node.versionId, node as SnapshotLineageNode);
  }
  const root = nodes.get(lineage.rootVersionId);
  if (!root) return false;
  const indexes = new Map(lineage.nodes.map((node, index) => [node.versionId, index]));
  for (const [index, node] of lineage.nodes.entries()) {
    for (const parentId of node.parentIds) {
      const parent = nodes.get(parentId);
      if (!parent || indexes.get(parentId)! >= index || parent.sourceIds.some((id) => !node.sourceIds.includes(id))) return false;
    }
  }
  const seen = new Set<string>();
  const collect = (id: string): boolean => {
    if (seen.has(id)) return true;
    seen.add(id);
    const node = nodes.get(id);
    return Boolean(node && node.parentIds.every(collect));
  };
  return collect(lineage.rootVersionId) && seen.size === nodes.size;
}

/** Copia el subgrafo completo de padres de la versión analizada desde el catálogo de la sesión. */
export function captureSnapshotLineage(rootVersionId: string, projectId: string, versions: SnapshotVersionReference[]): SnapshotLineage {
  const byId = new Map(versions.filter((version) => version.projectId === projectId).map((version) => [version.versionId, version]));
  const ordered: SnapshotLineageNode[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (versionId: string): void => {
    if (visited.has(versionId)) return;
    if (visiting.has(versionId)) throw new Error("El linaje de la versión contiene un ciclo.");
    const version = byId.get(versionId);
    if (!version) throw new Error(`No se encontró la versión padre ${versionId} en este proyecto.`);
    visiting.add(versionId);
    if (ordered.length >= 256) throw new Error("El linaje supera el límite de 256 versiones.");
    for (const parentId of version.parentIds) visit(parentId);
    visiting.delete(versionId);
    visited.add(versionId);
    ordered.push({
      ...version,
      sourceIds: [...version.sourceIds],
      parentIds: [...version.parentIds],
      columns: version.columns.map((column) => ({ ...column })),
      executedDefinition: version.executedDefinition === null ? null : structuredClone(version.executedDefinition),
    });
  };
  visit(rootVersionId);
  return { rootVersionId, nodes: ordered };
}

function isRecord(value: unknown): value is Record<string, SnapshotValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isJsonValue(value: unknown, depth = 0): value is SnapshotValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100_000 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value === "object") return Object.getPrototypeOf(value) === Object.prototype
    && Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, depth + 1));
  return false;
}

export function createAnalysisSnapshot(input: Omit<AnalysisSnapshot, "id" | "createdAt">, now = new Date()): AnalysisSnapshot {
  const snapshot: AnalysisSnapshot = {
    ...input,
    id: `snapshot-${globalThis.crypto?.randomUUID?.() ?? `${now.getTime()}-${Math.random().toString(36).slice(2)}`}`,
    createdAt: now.toISOString(),
    source: { ...input.source, columns: input.source.columns.map((column) => ({ ...column })) },
    parameters: structuredClone(input.parameters),
    results: structuredClone(input.results),
  };
  if (!validateAnalysisSnapshot(snapshot)) throw new Error("El snapshot debe incluir título, fuente y al menos un resultado.");
  return snapshot;
}
