/** Datos JSON guardables de resultados de análisis; no contiene archivos fuente. */
export type SnapshotValue = null | boolean | number | string | SnapshotValue[] | { [key: string]: SnapshotValue };

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
  if (!(typeof item.id === "string" && item.id.length > 0
    && typeof item.projectId === "string" && item.projectId.length > 0
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
    && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 120
    && Boolean(item.source && typeof item.source.sessionId === "string" && item.source.sessionId
      && typeof item.source.versionId === "string" && item.source.versionId
      && typeof item.source.sourceId === "string" && item.source.sourceId
      && typeof item.source.datasetName === "string" && item.source.datasetName.length <= 1024
      && Number.isSafeInteger(item.source.rowCount) && item.source.rowCount >= 0
      && Array.isArray(item.source.columns) && item.source.columns.every((c) => c && typeof c.name === "string" && typeof c.type === "string" && typeof c.nullable === "boolean"))
    && isRecord(item.parameters) && isRecord(item.results) && Object.keys(item.results).length > 0
    && isJsonValue(item.parameters) && isJsonValue(item.results))) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2 * 1024 * 1024;
  } catch { return false; }
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
