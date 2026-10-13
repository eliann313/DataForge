// Adaptador DuckDB-Wasm en Worker (0A.2).
// Solo cliente: se carga con import dinámico tras la acción del usuario.
// Nunca se inicializa al abrir la página (evidencia 0A.2).
// Versiones fijadas: @duckdb/duckdb-wasm 1.33.1-dev57.0 (ver package.json).

"use client";

import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from "@duckdb/duckdb-wasm";
import type {
  EngineError,
  EngineStatus,
  PingResult,
  ResultRow,
} from "./contract";
import { escapeIdentifier } from "./contract";
import {
  MAX_CSV_BYTES,
  checkCSVFile,
  checkInputFile,
  clampPage,
  escapeStringLiteral,
  problemLabel,
} from "./csv";
import {
  validatePipeline,
  isNumericPipelineColumn,
  isNumericPipelineValue,
  isTextPipelineColumn,
  type PipelineColumn,
  type PipelineDefinition,
  type PipelineDateFormat,
  type PipelineExecutionPort,
  type PipelinePreview,
  type PipelineStep,
  type PipelineTargetType,
  type PipelineVersion,
} from "../../../modules/pipelines";
import {
  safeSqlType,
  validateAppendDefinition,
  validateJoinDefinition,
  type AppendDefinition,
  type DatasetCombinationPreview,
  type DatasetCombinationPort,
  type DatasetSource,
  type JoinDefinition,
} from "../../../modules/datasets";

interface DuckDBBundle {
  mainModule?: string;
  mainWorker?: string;
  pthreadWorker?: string;
}

const REGISTER_NAME = "df_upload.csv";
const MAX_DERIVED_VERSIONS = 32;
const DUCKDB_DATE_FORMATS: Record<PipelineDateFormat, string> = {
  "YYYY-MM-DD": "%Y-%m-%d",
  "DD/MM/YYYY": "%d/%m/%Y",
  "MM/DD/YYYY": "%m/%d/%Y",
  "DD-MM-YYYY": "%d-%m-%Y",
  "YYYY-MM-DD HH:mm:ss": "%Y-%m-%d %H:%M:%S",
};

interface StoredPipelineVersion extends PipelineVersion {
  tableName: string;
  isView: boolean;
  fileBytes?: number;
  importDurationMs?: number;
}

function toPublicPipelineVersion(version: StoredPipelineVersion): PipelineVersion {
  return {
    id: version.id,
    sourceId: version.sourceId,
    sourceIds: [...version.sourceIds],
    projectId: version.projectId,
    name: version.name,
    parentId: version.parentId,
    parentIds: [...version.parentIds],
    operationType: version.operationType,
    pipelineId: version.pipelineId,
    rowCount: version.rowCount,
    columns: version.columns.map((column) => ({ ...column })),
    stepCount: version.stepCount,
    createdAt: version.createdAt,
  };
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface ImportSummary {
  datasetId: string;
  versionId: string;
  projectId: string | null;
  fileName: string;
  bytes: number;
  rows: number;
  columns: ColumnInfo[];
  /** Tiempo real de CREATE+consultas en el motor (ms, sin diálogo de archivo). */
  durationMs: number;
}

export interface NumericSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export type FilterOp =
  | "contains"
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isnull"
  | "notnull";

export interface DataFilter {
  column: string;
  op: FilterOp;
  value?: string;
}

export interface DataSort {
  column: string;
  dir: "asc" | "desc";
}

export interface PageResult {
  rows: ResultRow[];
  /** Filas totales del dataset (sin filtros). */
  total: number;
  /** Filas tras aplicar filtros. */
  filtered: number;
}

export interface Frequency {
  value: unknown;
  count: number;
}

export interface FrequencyRow {
  value: unknown;
  count: number;
  pct: number;
}

export interface FrequencyTable {
  column: string;
  valid: number;
  rows: FrequencyRow[];
}

export interface GroupedRow {
  x: unknown;
  y: number | null;
}

export interface Histogram {
  column: string;
  bins: number;
  lo: number;
  hi: number;
  width: number;
  counts: number[];
}

export interface Correlation {
  colA: string;
  colB: string;
  r: number | null;
  pairs: number;
}

export interface NumericDescription {
  column: string;
  total: number;
  valid: number;
  missing: number;
  sum: number | null;
  mean: number | null;
  median: number | null;
  mode: number | string | null;
  min: number | null;
  max: number | null;
  range: number | null;
  variance: number | null;
  stddev: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
}

export interface ColumnProfile {
  column: string;
  total: number;
  nulls: number;
  nullPct: number;
  distinct: number;
  min: unknown;
  max: unknown;
  top: Frequency[];
}

/**
 * Construye el WHERE a partir de filtros declarativos. Identificadores
 * escapados, literales saneados; valores numéricos validados. Sin SQL
 * arbitraria: operadores cerrados y dirección validada.
 */
export function buildWhere(
  filters: DataFilter[],
  columns?: readonly PipelineColumn[],
): string {
  if (filters.length === 0) return "";
  const parts = filters.map((f) => {
    const col = escapeIdentifier(f.column);
    const column = columns?.find((candidate) => candidate.name === f.column);
    const value = f.op === "isnull" || f.op === "notnull" ? null : requireValue(f);
    const comparison = f.op === "gt" || f.op === "gte" || f.op === "lt" || f.op === "lte";
    if (column && comparison && !isNumericPipelineColumn(column)) {
      throw new Error(`Los filtros de comparación requieren una columna numérica: ${f.column}.`);
    }
    const filterValue = value === null
      ? ""
      : column && f.op !== "contains"
        ? typedFilterValue(value, column)
        : literalValue(value);
    switch (f.op) {
      case "isnull":
        return `${col} IS NULL`;
      case "notnull":
        return `${col} IS NOT NULL`;
      case "contains": {
        const pattern = escapeLike(value ?? "");
        return `CAST(${col} AS VARCHAR) ILIKE ${escapeStringLiteral(`%${pattern}%`)} ESCAPE '\\'`;
      }
      case "eq":
        return `${col} = ${filterValue}`;
      case "gt":
        return `${col} > ${filterValue}`;
      case "gte":
        return `${col} >= ${filterValue}`;
      case "lt":
        return `${col} < ${filterValue}`;
      case "lte":
        return `${col} <= ${filterValue}`;
    }
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

export function buildOrderBy(sort: DataSort | null): string {
  if (!sort) return "";
  if (sort.dir !== "asc" && sort.dir !== "desc") {
    throw new Error("Dirección de orden inválida");
  }
  return `ORDER BY ${escapeIdentifier(sort.column)} ${sort.dir === "asc" ? "ASC" : "DESC"}`;
}

function requireValue(f: DataFilter): string {
  if (f.value === undefined || f.value === "") {
    throw new Error(`El filtro sobre ${f.column} necesita un valor.`);
  }
  return f.value;
}

/** Número validado o literal de texto escapado. */
function literalValue(raw: string): string {
  if (/^-?\d+(\.\d+)?$/.test(raw.trim())) return raw.trim();
  return escapeStringLiteral(raw);
}

function typedFilterValue(raw: string, column: PipelineColumn): string {
  if (!isNumericPipelineColumn(column)) return escapeStringLiteral(raw);
  const value = raw.trim();
  if (!isNumericPipelineValue(value)) {
    throw new Error(`Ingrese un valor numérico válido para ${column.name}.`);
  }
  return value;
}

/** Escapa %, _ y \ para ILIKE. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildAppendQuery(
  leftTable: string,
  rightTable: string,
  definition: AppendDefinition,
  columns: readonly { name: string; type: string; nullable: boolean }[],
): string {
  const project = (side: "left" | "right", table: string) => {
    const projections = definition.columns.map((mapping, index) => {
      const targetType = safeSqlType(columns[index]?.type ?? "");
      if (!targetType) throw new Error("El tipo de salida del APPEND no está permitido.");
      const sourceName = side === "left" ? mapping.leftColumn : mapping.rightColumn;
      const value = sourceName === null
        ? `CAST(NULL AS ${targetType})`
        : `CAST(${escapeIdentifier(sourceName)} AS ${targetType})`;
      return `${value} AS ${escapeIdentifier(mapping.outputName.trim())}`;
    });
    return `SELECT ${projections.join(", ")} FROM ${escapeIdentifier(table)}`;
  };
  return `${project("left", leftTable)} UNION ALL ${project("right", rightTable)}`;
}

function buildJoinQuery(leftTable: string, rightTable: string, definition: JoinDefinition): string {
  const leftAlias = escapeIdentifier("df_left");
  const rightAlias = escapeIdentifier("df_right");
  const projections = definition.columns.map((output) => {
    const alias = output.side === "left" ? leftAlias : rightAlias;
    return `${alias}.${escapeIdentifier(output.column)} AS ${escapeIdentifier(output.outputName.trim())}`;
  });
  const conditions = definition.keys.map((key) =>
    `${leftAlias}.${escapeIdentifier(key.leftColumn)} = ${rightAlias}.${escapeIdentifier(key.rightColumn)}`,
  );
  const joinType = definition.joinType === "left" ? "LEFT JOIN" : "INNER JOIN";
  return `SELECT ${projections.join(", ")} FROM ${escapeIdentifier(leftTable)} AS ${leftAlias} ${joinType} ${escapeIdentifier(rightTable)} AS ${rightAlias} ON ${conditions.join(" AND ")}`;
}

async function assertJoinCardinality(
  conn: AsyncDuckDBConnection,
  leftTable: string,
  rightTable: string,
  definition: JoinDefinition,
): Promise<void> {
  const checkLeft = definition.cardinality === "one-to-one" || definition.cardinality === "one-to-many";
  const checkRight = definition.cardinality === "one-to-one" || definition.cardinality === "many-to-one";
  if (checkLeft) await assertUniqueJoinKeys(conn, leftTable, definition.keys.map((key) => key.leftColumn), "izquierda");
  if (checkRight) await assertUniqueJoinKeys(conn, rightTable, definition.keys.map((key) => key.rightColumn), "derecha");
}

async function assertUniqueJoinKeys(
  conn: AsyncDuckDBConnection,
  table: string,
  keys: readonly string[],
  side: string,
): Promise<void> {
  const columns = keys.map(escapeIdentifier);
  const nonNull = columns.map((column) => `${column} IS NOT NULL`).join(" AND ");
  const grouped = columns.join(", ");
  const result = await conn.query(
    `SELECT COUNT(*) AS n FROM (SELECT ${grouped} FROM ${escapeIdentifier(table)} WHERE ${nonNull} GROUP BY ${grouped} HAVING COUNT(*) > 1) AS ${escapeIdentifier("df_duplicate_keys")}`,
  );
  const row = toJSONRows(result)[0] as Record<string, unknown> | undefined;
  const duplicates = row ? Number(row.n) : NaN;
  if (!Number.isSafeInteger(duplicates) || duplicates < 0) throw new Error("No se pudo comprobar la cardinalidad del JOIN.");
  if (duplicates > 0) {
    throw new Error(`La cardinalidad declarada requiere claves únicas en el lado ${side}; se encontraron ${duplicates} grupos duplicados.`);
  }
}

async function countJoinFanout(
  conn: AsyncDuckDBConnection,
  leftTable: string,
  rightTable: string,
  keys: JoinDefinition["keys"],
): Promise<number> {
  const leftGrouped = keys.map((key, index) =>
    `${escapeIdentifier(key.leftColumn)} AS ${escapeIdentifier(`k${index}`)}`,
  );
  const rightGrouped = keys.map((key, index) =>
    `${escapeIdentifier(key.rightColumn)} AS ${escapeIdentifier(`k${index}`)}`,
  );
  const leftColumns = keys.map((key) => escapeIdentifier(key.leftColumn));
  const rightColumns = keys.map((key) => escapeIdentifier(key.rightColumn));
  const leftAlias = escapeIdentifier("df_left_counts");
  const rightAlias = escapeIdentifier("df_right_counts");
  const keyAliases = keys.map((_, index) => escapeIdentifier(`k${index}`));
  const conditions = keyAliases.map((key) => `${leftAlias}.${key} = ${rightAlias}.${key}`);
  const query = `SELECT COALESCE(SUM(${leftAlias}.${escapeIdentifier("left_count")} * GREATEST(${rightAlias}.${escapeIdentifier("right_count")} - 1, 0)), 0) AS n FROM (SELECT ${leftGrouped.join(", ")}, COUNT(*) AS ${escapeIdentifier("left_count")} FROM ${escapeIdentifier(leftTable)} WHERE ${leftColumns.map((column) => `${column} IS NOT NULL`).join(" AND ")} GROUP BY ${leftColumns.join(", ")}) AS ${leftAlias} INNER JOIN (SELECT ${rightGrouped.join(", ")}, COUNT(*) AS ${escapeIdentifier("right_count")} FROM ${escapeIdentifier(rightTable)} WHERE ${rightColumns.map((column) => `${column} IS NOT NULL`).join(" AND ")} GROUP BY ${rightColumns.join(", ")}) AS ${rightAlias} ON ${conditions.join(" AND ")}`;
  const result = await conn.query(query);
  const row = toJSONRows(result)[0] as Record<string, unknown> | undefined;
  const fanout = row ? Number(row.n) : NaN;
  if (!Number.isSafeInteger(fanout) || fanout < 0) throw new Error("No se pudo contar la multiplicación de filas del JOIN.");
  return fanout;
}

export class DuckDBManager implements PipelineExecutionPort, DatasetCombinationPort {
  private status: EngineStatus = "idle";
  private lastError: EngineError | null = null;
  private lastPing: PingResult | null = null;
  private worker: Worker | null = null;
  private db: AsyncDuckDB | null = null;
  private conn: AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private activeTable: string | null = null;
  private currentProjectId: string | null = null;
  private activeVersionByProject = new Map<string | null, string>();
  private datasetSequence = 0;
  private versionSequence = 0;
  private versions: StoredPipelineVersion[] = [];

  /** Suscripción a cambios de estado (paneles sincronizados). */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Un panel roto no rompe el motor.
      }
    }
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getLastError(): EngineError | null {
    return this.lastError;
  }

  getLastPing(): PingResult | null {
    return this.lastPing;
  }

  /** Inicialización diferida. Concurrente-segura: llamadas simultáneas comparten el intento. */
  init(): Promise<void> {
    if (this.status === "ready") return Promise.resolve();
    if (this.status === "initializing" && this.initPromise) {
      return this.initPromise;
    }
    this.status = "initializing";
    this.lastError = null;
    this.emit();
    this.initPromise = this.doInit().then(
      () => {
        this.status = "ready";
        this.initPromise = null;
        this.emit();
      },
      (cause: unknown) => {
        this.status = "error";
        this.lastError = {
          code: "init-failed",
          message: messageOf(cause),
        };
        this.initPromise = null;
        this.emit();
        void this.release();
      },
    );
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const duckdb = await import("@duckdb/duckdb-wasm");
    // Bundle local autocontenido (public/vendor/duckdb, generado por
    // scripts/vendor-duckdb.mjs desde node_modules). El Worker cross-origin
    // vía CDN lo bloquea el navegador; mismo origen sí está permitido.
    // Sabor "eh" monohilo: no exige COOP/COEP (ADR-0001/0002, por medir).
    const base = new URL("vendor/duckdb/", document.baseURI);
    const bundle: DuckDBBundle = {
      mainModule: new URL("duckdb-eh.wasm", base).toString(),
      mainWorker: new URL("duckdb-browser-eh.worker.js", base).toString(),
    };
    if (!bundle.mainModule || !bundle.mainWorker) {
      throw new Error("Sin bundle DuckDB utilizable en este navegador");
    }
    const worker = new Worker(bundle.mainWorker);
    this.worker = worker;
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    this.db = db;
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();
    this.conn = conn;
    this.lastPing = await this.runPing(conn);
  }

  private async runPing(
    conn: AsyncDuckDBConnection,
  ): Promise<PingResult> {
    let version = "desconocida";
    try {
      const vTable = await conn.query("SELECT version() AS v");
      const vRows = vTable.toArray().map((r) => r.toJSON());
      const v = (vRows[0] as Record<string, unknown> | undefined)?.v;
      if (typeof v === "string" && v.length > 0) version = v;
    } catch {
      // La versión es informativa; el ping real es SELECT 1.
    }
    const table = await conn.query("SELECT 1 AS ok");
    const rows = table.toArray().map((r) => r.toJSON());
    const ok = (rows[0] as Record<string, unknown> | undefined)?.ok;
    if (String(ok) !== "1") {
      throw new Error(`Ping inesperado: ${String(ok)}`);
    }
    return { ok: 1, version };
  }

  /** Cierra conexión y termina el Worker, liberando recursos. */
  async close(): Promise<void> {
    await this.release();
    this.lastPing = null;
    this.status = "closed";
    this.emit();
  }

  // ---- 0A.3: importación CSV y consultas internas (SQL controlada por la app) ----

  private requireConn(): AsyncDuckDBConnection {
    if (this.status !== "ready" || !this.conn) {
      // Error real (no objeto plano): todos los paneles lo muestran tal cual.
      throw new Error("El motor no está listo. Inicialícelo antes de operar.");
    }
    return this.conn;
  }

  private resolveProjectId(projectId: string | null | undefined): string | null {
    return projectId === undefined ? this.currentProjectId : projectId;
  }

  private requireVersion(versionId: string): StoredPipelineVersion {
    const version = this.versions.find((candidate) => candidate.id === versionId);
    if (!version || version.projectId !== this.currentProjectId) {
      throw new Error("La versión de datos no está disponible en el proyecto activo.");
    }
    return version;
  }

  /**
   * Importa un CSV (UTF-8). Opciones: delimitador autodetectado (coma/punto
   * y coma) o explícito, con o sin encabezados. Agrega una fuente inmutable a
   * la sesión del proyecto; ante fallo conserva todas las fuentes anteriores.
   */
  async importCSV(
    file: File,
    opts?: { delimiter?: "auto" | "," | ";"; header?: boolean; projectId?: string | null },
  ): Promise<ImportSummary> {
    this.requireConn();
    const check = checkCSVFile(file.name, file.size);
    if (!check.ok || !file.name.toLowerCase().endsWith(".csv")) {
      throw {
        code: "query-failed",
        message: check.ok
          ? "Tipo no soportado: se esperaba un .csv."
          : problemLabel(check.problem!),
      } satisfies EngineError;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const delimiter = opts?.delimiter ?? "auto";
    const header = opts?.header ?? true;
    const options =
      delimiter === "auto"
        ? `header = ${header}, auto_detect = true`
        : `header = ${header}, delim = ${escapeStringLiteral(delimiter)}, auto_detect = false`;
    return this.materialize(
      file.name,
      file.size,
      bytes,
      REGISTER_NAME,
      `SELECT * FROM read_csv(${escapeStringLiteral(REGISTER_NAME)}, ${options})`,
      this.resolveProjectId(opts?.projectId),
    );
  }

  /** Importa texto CSV ya extraído (p. ej. hoja XLSX vía Worker). */
  async importCSVText(
    displayName: string,
    csv: string,
    opts?: { projectId?: string | null },
  ): Promise<ImportSummary> {
    this.requireConn();
    const bytes = new TextEncoder().encode(csv);
    if (bytes.byteLength === 0) {
      throw {
        code: "query-failed",
        message: problemLabel("empty"),
      } satisfies EngineError;
    }
    if (bytes.byteLength > MAX_CSV_BYTES) {
      throw {
        code: "query-failed",
        message: problemLabel("too-large"),
      } satisfies EngineError;
    }
    return this.materialize(
      displayName,
      bytes.byteLength,
      bytes,
      REGISTER_NAME,
      `SELECT * FROM read_csv(${escapeStringLiteral(REGISTER_NAME)}, header = true, auto_detect = true)`,
      this.resolveProjectId(opts?.projectId),
    );
  }

  /**
   * Importa JSON tabular (arreglo de objetos; se aceptan campos anidados,
   * que llegan como STRUCT). Formas no tabulares se rechazan con mensaje.
   */
  async importJSON(file: File, opts?: { projectId?: string | null }): Promise<ImportSummary> {
    this.requireConn();
    const check = checkInputFile(file.name, file.size);
    if (!check.ok || !file.name.toLowerCase().endsWith(".json")) {
      throw {
        code: "query-failed",
        message: check.ok
          ? "Tipo no soportado en este spike: JSON tabular (.json)."
          : problemLabel(check.problem!),
      } satisfies EngineError;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const head = new TextDecoder().decode(bytes.slice(0, 4096)).trimStart();
    if (!head.startsWith("[")) {
      throw {
        code: "query-failed",
        message:
          "JSON no tabular: se espera un arreglo de objetos [{...}, ...] (NDJSON en fase 2).",
      } satisfies EngineError;
    }
    return this.materialize(
      file.name,
      file.size,
      bytes,
      "df_upload.json",
      `SELECT * FROM read_json(${escapeStringLiteral("df_upload.json")}, format = 'array')`,
      this.resolveProjectId(opts?.projectId),
    );
  }

  /** Importa Parquet vía lectura nativa de DuckDB. */
  async importParquet(file: File, opts?: { projectId?: string | null }): Promise<ImportSummary> {
    this.requireConn();
    const check = checkInputFile(file.name, file.size);
    if (!check.ok || !file.name.toLowerCase().endsWith(".parquet")) {
      throw {
        code: "query-failed",
        message: check.ok
          ? "Tipo no soportado en este spike: Parquet (.parquet)."
          : problemLabel(check.problem!),
      } satisfies EngineError;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.materialize(
      file.name,
      file.size,
      bytes,
      "df_upload.parquet",
      `SELECT * FROM read_parquet(${escapeStringLiteral("df_upload.parquet")})`,
      this.resolveProjectId(opts?.projectId),
    );
  }

  /**
   * Sonda de ruta A (0A.4): lectura XLSX directa con DuckDB-Wasm en la
   * versión fijada. Registra el resultado sin asumir soporte.
   */
  async probeXLSXNative(
    xlsxBytes: Uint8Array,
  ): Promise<{ supported: boolean; detail: string }> {
    const conn = this.requireConn();
    const db = this.db;
    if (!db) throw new Error("Motor no listo");
    const name = "df_probe.xlsx";
    await db.registerFileBuffer(name, xlsxBytes);
    try {
      const table = await conn.query(
        `SELECT * FROM read_xlsx(${escapeStringLiteral(name)}) LIMIT 5`,
      );
      const rows = toJSONRows(table);
      return {
        supported: true,
        detail: `read_xlsx directo leyó ${rows.length} filas (límite 5)`,
      };
    } catch (cause) {
      return { supported: false, detail: messageOf(cause) };
    } finally {
      try {
        await db.dropFile(name);
      } catch {
        // Liberación best-effort.
      }
    }
  }

  private async materialize(
    displayName: string,
    size: number,
    bytes: Uint8Array,
    registerName: string,
    sourceSQL: string,
    projectId: string | null,
  ): Promise<ImportSummary> {
    const conn = this.requireConn();
    if (bytes.byteLength === 0) {
      throw {
        code: "query-failed",
        message: problemLabel("empty"),
      } satisfies EngineError;
    }
    const started = performance.now();
    const db = this.db;
    if (!db) {
      throw {
        code: "query-failed",
        message: "El motor no está listo. Inicialícelo antes de importar.",
      } satisfies EngineError;
    }
    const sequence = this.datasetSequence + 1;
    const stagingName = `df_dataset_next_${sequence}`;
    const tableName = `df_dataset_${sequence}`;
    await db.registerFileBuffer(registerName, bytes);
    try {
      await conn.query(
        `CREATE OR REPLACE TABLE ${escapeIdentifier(stagingName)} AS ${sourceSQL}`,
      );
      const columns = await this.readSchema(conn, stagingName);
      const rows = await this.readCount(conn, stagingName);
      await conn.query("BEGIN TRANSACTION");
      try {
        await conn.query(
          `ALTER TABLE ${escapeIdentifier(stagingName)} RENAME TO ${escapeIdentifier(tableName)}`,
        );
        await conn.query("COMMIT");
      } catch (cause) {
        try {
          await conn.query("ROLLBACK");
        } catch {
          // Conserva el fallo original; DuckDB descarta la transacción al cerrar.
        }
        throw cause;
      }
      this.datasetSequence = sequence;
      const sourceId = `source-${sequence}`;
      const createdAt = new Date().toISOString();
      const durationMs = Math.round(performance.now() - started);
      this.versions.push({
        id: sourceId,
        sourceId,
        sourceIds: [sourceId],
        projectId,
        name: displayName,
        parentId: null,
        parentIds: [],
        operationType: "source",
        pipelineId: null,
        rowCount: rows,
        columns,
        stepCount: 0,
        createdAt,
        tableName,
        isView: false,
        fileBytes: size,
        importDurationMs: durationMs,
      });
      this.currentProjectId = projectId;
      this.activeTable = tableName;
      this.activeVersionByProject.set(projectId, sourceId);
      this.emit();
      return {
        datasetId: sourceId,
        versionId: sourceId,
        projectId,
        fileName: displayName,
        bytes: size,
        rows,
        columns,
        durationMs,
      };
    } catch (cause) {
      try {
        await conn.query(`DROP TABLE IF EXISTS ${escapeIdentifier(stagingName)}`);
      } catch {
        // Limpieza best-effort tras fallo.
      }
      throw {
        code: "query-failed",
        message: `No se pudo importar el archivo: ${messageOf(cause)}`,
      } satisfies EngineError;
    } finally {
      try {
        await db.dropFile(registerName);
      } catch {
        // Liberación best-effort del buffer registrado.
      }
    }
  }

  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /** Cambia el espacio de trabajo sin exponer tablas de otro proyecto. */
  selectProject(projectId: string | null): void {
    if (this.currentProjectId === projectId) return;
    this.currentProjectId = projectId;
    const rememberedId = this.activeVersionByProject.get(projectId);
    const remembered = rememberedId
      ? this.versions.find((version) => version.id === rememberedId && version.projectId === projectId)
      : undefined;
    const latestSource = [...this.versions].reverse().find(
      (version) => version.projectId === projectId && version.operationType === "source",
    );
    const active = remembered ?? latestSource;
    this.activeTable = active?.tableName ?? null;
    if (active) this.activeVersionByProject.set(projectId, active.id);
    else this.activeVersionByProject.delete(projectId);
    this.emit();
  }

  getDatasetSources(): DatasetSource[] {
    return this.versions
      .filter((version) => version.projectId === this.currentProjectId && version.operationType === "source")
      .map((version) => ({
        id: version.id,
        projectId: version.projectId,
        name: version.name,
        rowCount: version.rowCount,
        columns: version.columns.map((column) => ({ ...column })),
        bytes: version.fileBytes ?? 0,
        durationMs: version.importDurationMs ?? 0,
        createdAt: version.createdAt,
      }));
  }

  getActiveSourceId(): string | null {
    const active = this.versions.find((version) => version.tableName === this.activeTable);
    return active?.sourceId ?? null;
  }

  getActiveDatasetSummary(): ImportSummary | null {
    const active = this.versions.find((version) => version.tableName === this.activeTable);
    if (!active) return null;
    const source = this.versions.find((version) => version.id === active.sourceId);
    if (!source) return null;
    return {
      datasetId: source.id,
      versionId: active.id,
      projectId: source.projectId,
      fileName: active.name,
      bytes: source.fileBytes ?? 0,
      rows: active.rowCount,
      columns: active.columns.map((column) => ({ ...column })),
      durationMs: source.importDurationMs ?? 0,
    };
  }

  /** Libera una fuente y todas sus vistas derivadas sin tocar otras fuentes. */
  async removeDataset(sourceId: string): Promise<void> {
    const source = this.versions.find(
      (version) => version.id === sourceId && version.operationType === "source" && version.projectId === this.currentProjectId,
    );
    if (!source) throw new Error("La fuente ya no está disponible en el proyecto activo.");
    const related = this.versions.filter((version) => version.sourceIds.includes(sourceId));
    const conn = this.requireConn();
    try {
      await conn.query("BEGIN TRANSACTION");
      for (const version of [...related].reverse()) {
        if (version.isView) await conn.query(`DROP VIEW ${escapeIdentifier(version.tableName)}`);
      }
      await conn.query(`DROP TABLE ${escapeIdentifier(source.tableName)}`);
      await conn.query("COMMIT");
    } catch (cause) {
      try {
        await conn.query("ROLLBACK");
      } catch {
        // Conserva el fallo original; no cambia el catálogo de sesión.
      }
      throw new Error(`No se pudo quitar la fuente «${source.name}»: ${messageOf(cause)}`);
    }

    this.versions = this.versions.filter((version) => !version.sourceIds.includes(sourceId));
    const activeWasRemoved = related.some((version) => version.tableName === this.activeTable);
    if (activeWasRemoved) {
      const next = [...this.versions].reverse().find(
        (version) => version.projectId === this.currentProjectId,
      );
      this.activeTable = next?.tableName ?? null;
      if (next) this.activeVersionByProject.set(this.currentProjectId, next.id);
      else this.activeVersionByProject.delete(this.currentProjectId);
    }
    this.emit();
  }

  private requireActiveTable(): string {
    if (!this.activeTable) throw new Error("No hay un dataset en el proyecto activo. Importe un archivo primero.");
    return this.activeTable;
  }

  hasDataset(): Promise<boolean> {
    const activeTable = this.activeTable;
    if (!activeTable) return Promise.resolve(false);
    return this.readCount(this.requireConn(), activeTable)
      .then(() => true)
      .catch(() => false);
  }

  getSchema(): Promise<ColumnInfo[]> {
    return this.readSchema(this.requireConn(), this.requireActiveTable());
  }

  getCount(): Promise<number> {
    return this.readCount(this.requireConn(), this.requireActiveTable());
  }

  getDatasetVersions(): PipelineVersion[] {
    return this.versions
      .filter((version) => version.projectId === this.currentProjectId)
      .map(toPublicPipelineVersion);
  }

  getActiveDatasetVersionId(): string | null {
    return this.versions.find((version) => version.tableName === this.activeTable)?.id ?? null;
  }

  async getVersionColumns(versionId: string): Promise<PipelineColumn[]> {
    const version = this.requireVersion(versionId);
    return this.readSchema(this.requireConn(), version.tableName);
  }

  async previewPipeline(
    baseVersionId: string,
    steps: PipelineStep[],
    limit: number,
  ): Promise<PipelinePreview> {
    const conn = this.requireConn();
    const base = this.requireVersion(baseVersionId);
    const validation = validatePipeline(base.columns, {
      id: "preview",
      name: "Vista previa",
      steps,
    });
    if (!validation.valid) throw new Error(validation.error ?? "El pipeline no es válido.");
    await assertPipelineConversions(conn, base, { id: "preview", name: "Vista previa", steps });
    const query = buildPipelineQuery(base.tableName, base.columns, steps);
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const [countTable, previewTable] = await Promise.all([
      conn.query(`SELECT COUNT(*) AS n FROM (${query}) AS ${escapeIdentifier("df_preview_count")}`),
      conn.query(`SELECT * FROM (${query}) AS ${escapeIdentifier("df_preview_rows")} LIMIT ${safeLimit}`),
    ]);
    const countRow = toJSONRows(countTable)[0] as Record<string, unknown> | undefined;
    const outputRowCount = countRow ? Number(countRow.n) : NaN;
    if (!Number.isInteger(outputRowCount) || outputRowCount < 0) {
      throw new Error("No se pudo contar el resultado de la vista previa.");
    }
    return {
      inputRowCount: base.rowCount,
      outputRowCount,
      columns: validation.columns,
      rows: toJSONRows(previewTable),
    };
  }

  async executePipeline(
    baseVersionId: string,
    definition: PipelineDefinition,
  ): Promise<PipelineVersion> {
    const conn = this.requireConn();
    const base = this.requireVersion(baseVersionId);
    const validation = validatePipeline(base.columns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "El pipeline no es válido.");
    const derivedCount = this.versions.filter(
      (version) => version.sourceIds.includes(base.sourceId) && version.isView,
    ).length;
    if (derivedCount >= MAX_DERIVED_VERSIONS) {
      throw new Error(`Se alcanzó el límite de ${MAX_DERIVED_VERSIONS} versiones derivadas para esta fuente. Quite la fuente para liberar sus versiones.`);
    }

    const sequence = ++this.versionSequence;
    const tableName = `df_pipeline_${sequence}`;
    const query = buildPipelineQuery(base.tableName, base.columns, definition.steps);
    try {
      await assertPipelineConversions(conn, base, definition);
      await conn.query(`CREATE VIEW ${escapeIdentifier(tableName)} AS ${query}`);
      const [rowCount, columns] = await Promise.all([
        this.readCount(conn, tableName),
        this.readSchema(conn, tableName),
      ]);
      const version: StoredPipelineVersion = {
        id: `version-${base.sourceId}-${sequence}`,
        sourceId: base.sourceId,
        sourceIds: [...base.sourceIds],
        projectId: base.projectId,
        name: `${definition.name.trim()} · versión ${derivedCount + 1}`,
        parentId: base.id,
        parentIds: [base.id],
        operationType: "pipeline",
        pipelineId: definition.id,
        rowCount,
        columns,
        stepCount: definition.steps.length,
        createdAt: new Date().toISOString(),
        tableName,
        isView: true,
      };
      this.versions.push(version);
      this.activeTable = tableName;
      this.activeVersionByProject.set(base.projectId, version.id);
      this.emit();
      return toPublicPipelineVersion(version);
    } catch (cause) {
      try {
        await conn.query(`DROP VIEW IF EXISTS ${escapeIdentifier(tableName)}`);
      } catch {
        // El error de la ejecución tiene prioridad sobre la limpieza.
      }
      throw new Error(`No se pudo crear la versión derivada: ${messageOf(cause)}`);
    }
  }

  async previewAppend(definition: AppendDefinition, limit: number): Promise<DatasetCombinationPreview> {
    const conn = this.requireConn();
    const left = this.requireVersion(definition.leftVersionId);
    const right = this.requireVersion(definition.rightVersionId);
    const validation = validateAppendDefinition(left.columns, right.columns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "El mapeo APPEND no es válido.");
    const query = buildAppendQuery(left.tableName, right.tableName, definition, validation.columns);
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const [outputRowCount, rows] = await Promise.all([
      this.readQueryCount(conn, query),
      conn.query(`SELECT * FROM (${query}) AS ${escapeIdentifier("df_append_preview")} LIMIT ${safeLimit}`),
    ]);
    return {
      leftRowCount: left.rowCount,
      rightRowCount: right.rowCount,
      outputRowCount,
      fanoutRowCount: 0,
      columns: validation.columns,
      rows: toJSONRows(rows),
    };
  }

  async executeAppend(definition: AppendDefinition): Promise<PipelineVersion> {
    const left = this.requireVersion(definition.leftVersionId);
    const right = this.requireVersion(definition.rightVersionId);
    const validation = validateAppendDefinition(left.columns, right.columns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "El mapeo APPEND no es válido.");
    const query = buildAppendQuery(left.tableName, right.tableName, definition, validation.columns);
    return this.createCombinedVersion("append", definition.name, left, right, query);
  }

  async previewJoin(definition: JoinDefinition, limit: number): Promise<DatasetCombinationPreview> {
    const conn = this.requireConn();
    const left = this.requireVersion(definition.leftVersionId);
    const right = this.requireVersion(definition.rightVersionId);
    const validation = validateJoinDefinition(left.columns, right.columns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "La definición del JOIN no es válida.");
    await assertJoinCardinality(conn, left.tableName, right.tableName, definition);
    const fanoutRowCount = await countJoinFanout(conn, left.tableName, right.tableName, definition.keys);
    const query = buildJoinQuery(left.tableName, right.tableName, definition);
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const [outputRowCount, rows] = await Promise.all([
      this.readQueryCount(conn, query),
      conn.query(`SELECT * FROM (${query}) AS ${escapeIdentifier("df_join_preview")} LIMIT ${safeLimit}`),
    ]);
    return {
      leftRowCount: left.rowCount,
      rightRowCount: right.rowCount,
      outputRowCount,
      fanoutRowCount,
      columns: validation.columns,
      rows: toJSONRows(rows),
    };
  }

  async executeJoin(definition: JoinDefinition): Promise<PipelineVersion> {
    const conn = this.requireConn();
    const left = this.requireVersion(definition.leftVersionId);
    const right = this.requireVersion(definition.rightVersionId);
    const validation = validateJoinDefinition(left.columns, right.columns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "La definición del JOIN no es válida.");
    await assertJoinCardinality(conn, left.tableName, right.tableName, definition);
    const fanoutRowCount = await countJoinFanout(conn, left.tableName, right.tableName, definition.keys);
    if (fanoutRowCount > 0 && !definition.confirmFanout) {
      throw new Error(`El JOIN repetiría ${fanoutRowCount} filas por coincidencias uno-a-muchos. Revise la vista previa y confirme expresamente la multiplicación antes de crear la versión.`);
    }
    const query = buildJoinQuery(left.tableName, right.tableName, definition);
    return this.createCombinedVersion("join", definition.name, left, right, query);
  }

  private async createCombinedVersion(
    operationType: "append" | "join",
    name: string,
    left: StoredPipelineVersion,
    right: StoredPipelineVersion,
    query: string,
  ): Promise<PipelineVersion> {
    if (left.projectId !== right.projectId || left.projectId !== this.currentProjectId) {
      throw new Error("No se pueden combinar versiones de proyectos distintos.");
    }
    const sourceIds = [...new Set([...left.sourceIds, ...right.sourceIds])];
    if (sourceIds.some((sourceId) => this.versions.filter(
      (version) => version.isView && version.sourceIds.includes(sourceId),
    ).length >= MAX_DERIVED_VERSIONS)) {
      throw new Error(`Se alcanzó el límite de ${MAX_DERIVED_VERSIONS} versiones derivadas para una de las fuentes. Quite esa fuente para liberar sus versiones.`);
    }
    const sequence = ++this.versionSequence;
    const tableName = `df_${operationType}_${sequence}`;
    const conn = this.requireConn();
    try {
      await conn.query(`CREATE VIEW ${escapeIdentifier(tableName)} AS ${query}`);
      const [rowCount, columns] = await Promise.all([
        this.readCount(conn, tableName),
        this.readSchema(conn, tableName),
      ]);
      const version: StoredPipelineVersion = {
        id: `version-${operationType}-${sequence}`,
        sourceId: sourceIds[0],
        sourceIds,
        projectId: left.projectId,
        name: `${name.trim()} · ${operationType === "append" ? "APPEND" : "JOIN"}`,
        parentId: left.id,
        parentIds: [...new Set([left.id, right.id])],
        operationType,
        pipelineId: null,
        rowCount,
        columns,
        stepCount: 0,
        createdAt: new Date().toISOString(),
        tableName,
        isView: true,
      };
      this.versions.push(version);
      this.activeTable = tableName;
      this.activeVersionByProject.set(version.projectId, version.id);
      this.emit();
      return toPublicPipelineVersion(version);
    } catch (cause) {
      try {
        await conn.query(`DROP VIEW IF EXISTS ${escapeIdentifier(tableName)}`);
      } catch {
        // El error original tiene prioridad sobre la limpieza.
      }
      throw new Error(`No se pudo crear la versión ${operationType.toUpperCase()}: ${messageOf(cause)}`);
    }
  }

  async activateDatasetVersion(versionId: string): Promise<void> {
    const version = this.requireVersion(versionId);
    this.requireConn();
    this.activeTable = version.tableName;
    this.activeVersionByProject.set(version.projectId, version.id);
    this.emit();
  }

  // ---- E4: filtros y orden sobre el dataset completo, profiling ----

  async getPage(
    page: number,
    pageSize: number,
    opts?: { filters?: DataFilter[]; sort?: DataSort | null },
  ): Promise<PageResult> {
    const conn = this.requireConn();
    const c = clampPage(page, pageSize);
    const schema = await this.getSchema();
    const where = buildWhere(opts?.filters ?? [], schema);
    const order = buildOrderBy(opts?.sort ?? null);
    const activeTable = this.requireActiveTable();
    const [table, total, filtered] = await Promise.all([
      conn.query(
        `SELECT * FROM ${escapeIdentifier(activeTable)}${where} ${order} LIMIT ${c.pageSize} OFFSET ${c.offset}`,
      ),
      this.readCount(conn, activeTable),
      where
        ? this.readCountWhere(conn, where, activeTable)
        : this.readCount(conn, activeTable),
    ]);
    return { rows: toJSONRows(table), total, filtered };
  }

  async countFiltered(filters: DataFilter[]): Promise<number> {
    const conn = this.requireConn();
    const schema = await this.getSchema();
    const where = buildWhere(filters, schema);
    const activeTable = this.requireActiveTable();
    return where
      ? this.readCountWhere(conn, where, activeTable)
      : this.readCount(conn, activeTable);
  }

  /** Perfil de una columna: nulos, cardinalidad, rango y frecuencias. */
  async profileColumn(column: string): Promise<ColumnProfile> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const table = escapeIdentifier(this.requireActiveTable());
    const stats = toJSONRows(
      await conn.query(
        `SELECT COUNT(*) AS total, COUNT(${col}) AS nonnull, COUNT(DISTINCT ${col}) AS distinct_n, MIN(${col}) AS mn, MAX(${col}) AS mx FROM ${table}`,
      ),
    )[0] as Record<string, unknown>;
    const total = Number(stats.total);
    const nonnull = Number(stats.nonnull);
    const top = toJSONRows(
      await conn.query(
        `SELECT ${col} AS v, COUNT(*) AS c FROM ${table} GROUP BY ${col} ORDER BY c DESC, v LIMIT 5`,
      ),
    ).map((r) => ({ value: r.v ?? null, count: Number(r.c) }));
    return {
      column,
      total,
      nulls: total - nonnull,
      nullPct: total === 0 ? 0 : Math.round(((total - nonnull) / total) * 1000) / 10,
      distinct: Number(stats.distinct_n),
      min: (stats.mn as unknown) ?? null,
      max: (stats.mx as unknown) ?? null,
      top,
    };
  }

  /**
   * Duplicados potenciales: filas idénticas en TODAS las columnas.
   * Definición visible en la UI; detectar ≠ eliminar (limpiar es R2).
   */
  async duplicateCount(): Promise<number> {
    const conn = this.requireConn();
    const table = await conn.query(
      `SELECT COUNT(*) AS n FROM (SELECT * FROM ${escapeIdentifier(this.requireActiveTable())} GROUP BY ALL HAVING COUNT(*) > 1)`,
    );
    const row = toJSONRows(table)[0] as Record<string, unknown> | undefined;
    const groups = row ? Number(row.n) : NaN;
    if (!Number.isInteger(groups) || groups < 0) throw new Error("Conteo inválido");
    return groups;
  }

  // ---- E5: estadística descriptiva y agregados para gráficos ----
  // Definiciones: varianza/desvío MUESTRALES (n−1); cuantiles continuos
  // (interpolación lineal); mediana = cuantil 0.5; nulos siempre excluidos.

  async describeNumeric(column: string): Promise<NumericDescription> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const table = escapeIdentifier(this.requireActiveTable());
    const row = toJSONRows(
      await conn.query(
        `SELECT COUNT(*) AS total, COUNT(${col}) AS valid, SUM(${col}) AS s, AVG(${col}) AS a, MEDIAN(${col}) AS med, MODE(${col}) AS mode, MIN(${col}) AS mn, MAX(${col}) AS mx, VAR_SAMP(${col}) AS var, STDDEV_SAMP(${col}) AS std, QUANTILE_CONT(${col}, 0.25) AS q1, QUANTILE_CONT(${col}, 0.75) AS q3 FROM ${table}`,
      ),
    )[0] as Record<string, unknown>;
    if (!row) throw new Error(`Sin filas para describir ${column}`);
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const total = Number(row.total);
    const valid = Number(row.valid);
    return {
      column,
      total,
      valid,
      missing: total - valid,
      sum: num(row.s),
      mean: num(row.a),
      median: num(row.med),
      mode: row.mode === null || row.mode === undefined ? null : (row.mode as number | string),
      min: num(row.mn),
      max: num(row.mx),
      range: num(row.mn) !== null && num(row.mx) !== null ? (num(row.mx) as number) - (num(row.mn) as number) : null,
      variance: num(row.var),
      stddev: num(row.std),
      q1: num(row.q1),
      q3: num(row.q3),
      iqr: num(row.q1) !== null && num(row.q3) !== null ? (num(row.q3) as number) - (num(row.q1) as number) : null,
    };
  }

  /** Frecuencias de una columna con porcentaje sobre válidos. */
  async frequencies(column: string, limit = 20): Promise<FrequencyTable> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const activeTable = this.requireActiveTable();
    const table = escapeIdentifier(activeTable);
    const valid = await this.readCountWhere(conn, ` WHERE ${col} IS NOT NULL`, activeTable);
    const rows = toJSONRows(
      await conn.query(
        `SELECT ${col} AS v, COUNT(*) AS c FROM ${table} WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY c DESC, v LIMIT ${Math.min(Math.max(1, limit), 100)}`,
      ),
    );
    return {
      column,
      valid,
      rows: rows.map((r) => ({
        value: r.v ?? null,
        count: Number(r.c),
        pct: valid === 0 ? 0 : Math.round((Number(r.c) / valid) * 1000) / 10,
      })),
    };
  }

  /** Agregación por grupo para gráficos (barras/líneas sobre agregados). */
  async groupedStat(
    groupCol: string,
    numCol: string | null,
    agg: "count" | "sum" | "mean",
  ): Promise<GroupedRow[]> {
    const conn = this.requireConn();
    const g = escapeIdentifier(groupCol);
    const table = escapeIdentifier(this.requireActiveTable());
    const select =
      agg === "count"
        ? "COUNT(*) AS y"
        : numCol
          ? `${agg === "sum" ? "SUM" : "AVG"}(${escapeIdentifier(numCol)}) AS y`
          : "COUNT(*) AS y";
    const rows = toJSONRows(
      await conn.query(
        `SELECT ${g} AS x, ${select} FROM ${table} GROUP BY ${g} ORDER BY x LIMIT 500`,
      ),
    );
    return rows.map((r) => ({ x: r.x ?? null, y: r.y === null ? null : Number(r.y) }));
  }

  /** Histograma por bines iguales (conteo por intervalo, límites visibles). */
  async histogram(column: string, bins = 20): Promise<Histogram> {
    const conn = this.requireConn();
    const b = Math.min(Math.max(5, Math.floor(bins)), 50);
    const desc = await this.describeNumeric(column);
    if (desc.min === null || desc.max === null || desc.valid === 0) {
      throw new Error(`Sin valores numéricos en ${column}`);
    }
    const col = escapeIdentifier(column);
    const table = escapeIdentifier(this.requireActiveTable());
    if (desc.min === desc.max) {
      return { column, bins: b, lo: desc.min, hi: desc.max, width: 0, counts: [desc.valid] };
    }
    const width = (desc.max - desc.min) / b;
    const rows = toJSONRows(
      await conn.query(
        `SELECT LEAST(CAST(FLOOR((${col} - ${desc.min}) / ${width}) AS INTEGER), ${b - 1}) AS bin, COUNT(*) AS c FROM ${table} WHERE ${col} IS NOT NULL GROUP BY bin ORDER BY bin`,
      ),
    );
    const counts = new Array<number>(b).fill(0);
    for (const r of rows) counts[Number(r.bin)] = Number(r.c);
    return { column, bins: b, lo: desc.min, hi: desc.max, width, counts };
  }

  /**
   * Correlación lineal de Pearson entre dos columnas numéricas.
   * Se informa n de pares válidos y la advertencia: correlación ≠ causalidad.
   */
  async correlation(colA: string, colB: string): Promise<Correlation> {
    const conn = this.requireConn();
    const a = escapeIdentifier(colA);
    const b = escapeIdentifier(colB);
    const table = escapeIdentifier(this.requireActiveTable());
    const row = toJSONRows(
      await conn.query(
        `SELECT CORR(${a}, ${b}) AS r, COUNT(*) AS n FROM ${table} WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL`,
      ),
    )[0] as Record<string, unknown>;
    const r = row.r === null ? null : Number(row.r);
    return { colA, colB, r: r !== null && Number.isFinite(r) ? r : null, pairs: Number(row.n) };
  }

  /** Agregación sobre una columna (nombre escapado; sin SQL arbitraria). */
  async summarizeNumeric(column: string): Promise<NumericSummary> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const table = await conn.query(
      `SELECT COUNT(${col}) AS n, SUM(${col}) AS s, AVG(${col}) AS a, MIN(${col}) AS mn, MAX(${col}) AS mx FROM ${escapeIdentifier(this.requireActiveTable())}`,
    );
    const row = toJSONRows(table)[0] as Record<string, unknown> | undefined;
    const num = (v: unknown): number => {
      const n = typeof v === "bigint" ? Number(v) : Number(v);
      if (!Number.isFinite(n)) throw new Error(`Agregado no numérico en ${column}`);
      return n;
    };
    if (!row) throw new Error(`Sin filas para resumir ${column}`);
    return {
      count: num(row.n),
      sum: num(row.s),
      avg: num(row.a),
      min: num(row.mn),
      max: num(row.mx),
    };
  }

  private async readSchema(
    conn: AsyncDuckDBConnection,
    table: string,
  ): Promise<ColumnInfo[]> {
    const described = await conn.query(
      `DESCRIBE ${escapeIdentifier(table)}`,
    );
    return toJSONRows(described).map((r) => ({
      name: String(r.column_name),
      type: String(r.column_type),
      nullable: String(r.null).toUpperCase() === "YES",
    }));
  }

  private async readCount(
    conn: AsyncDuckDBConnection,
    table: string,
  ): Promise<number> {
    const counted = await conn.query(
      `SELECT COUNT(*) AS n FROM ${escapeIdentifier(table)}`,
    );
    const row = toJSONRows(counted)[0] as Record<string, unknown> | undefined;
    const n = row ? Number(row.n) : NaN;
    if (!Number.isInteger(n) || n < 0) throw new Error("Conteo inválido");
    return n;
  }

  private async readQueryCount(
    conn: AsyncDuckDBConnection,
    query: string,
  ): Promise<number> {
    const counted = await conn.query(
      `SELECT COUNT(*) AS n FROM (${query}) AS ${escapeIdentifier("df_combination_count")}`,
    );
    const row = toJSONRows(counted)[0] as Record<string, unknown> | undefined;
    const n = row ? Number(row.n) : NaN;
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Conteo de combinación inválido o fuera de rango seguro.");
    return n;
  }

  private async readCountWhere(
    conn: AsyncDuckDBConnection,
    where: string,
    table = this.requireActiveTable(),
  ): Promise<number> {
    const counted = await conn.query(
      `SELECT COUNT(*) AS n FROM ${escapeIdentifier(table)}${where}`,
    );
    const row = toJSONRows(counted)[0] as Record<string, unknown> | undefined;
    const n = row ? Number(row.n) : NaN;
    if (!Number.isInteger(n) || n < 0) throw new Error("Conteo inválido");
    return n;
  }

  /** Reinicia el Worker. Si cerrar exige reimportar, la UI lo indica. */
  async restart(): Promise<void> {
    await this.release();
    this.lastPing = null;
    this.status = "idle";
    this.emit();
    await this.init();
  }

  private async release(): Promise<void> {
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      try {
        await conn.close();
      } catch {
        // Cierre best-effort: no oculta el error original.
      }
    }
    const db = this.db;
    this.db = null;
    if (db) {
      try {
        await db.terminate();
      } catch {
        // Ídem.
      }
    }
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // Ídem.
      }
    }
    this.activeTable = null;
    this.versions = [];
    this.activeVersionByProject.clear();
  }
}

/** Construye SQL cerrado desde operaciones validadas; nunca recibe SQL del usuario. */
export function buildPipelineQuery(
  baseTable: string,
  baseColumns: readonly PipelineColumn[],
  steps: PipelineStep[],
): string {
  const validation = validatePipeline(baseColumns, {
    id: "sql-builder",
    name: "Pipeline",
    steps,
  });
  if (!validation.valid) throw new Error(validation.error ?? "El pipeline no es válido.");

  let query = `SELECT * FROM ${escapeIdentifier(baseTable)}`;
  let columns = baseColumns.map((column) => ({ ...column }));
  let finalSort: Extract<PipelineStep, { type: "sort" }> | null = null;

  for (const [index, step] of steps.entries()) {
    const alias = escapeIdentifier(`df_step_${index + 1}`);
    switch (step.type) {
      case "filter":
        query = `SELECT * FROM (${query}) AS ${alias}${buildWhere([step.filter], columns)}`;
        break;
      case "select":
        query = `SELECT ${step.columns.map(escapeIdentifier).join(", ")} FROM (${query}) AS ${alias}`;
        columns = step.columns.map((name) => ({ ...columns.find((column) => column.name === name)! }));
        break;
      case "dropNulls": {
        const predicates = step.columns
          .map((name) => `${escapeIdentifier(name)} IS NOT NULL`)
          .join(" AND ");
        query = `SELECT * FROM (${query}) AS ${alias} WHERE ${predicates}`;
        break;
      }
      case "fillNull": {
        if (step.value === null) throw new Error("Ingrese el valor para reemplazar los nulos.");
        const column = columns.find((candidate) => candidate.name === step.column);
        if (!column) throw new Error(`La columna ya no existe: ${step.column}.`);
        const replacement = typedFilterValue(step.value, column);
        const projected = columns.map((candidate) =>
          candidate.name === step.column
            ? `COALESCE(${escapeIdentifier(candidate.name)}, ${replacement}) AS ${escapeIdentifier(candidate.name)}`
            : escapeIdentifier(candidate.name),
        );
        query = `SELECT ${projected.join(", ")} FROM (${query}) AS ${alias}`;
        break;
      }
      case "convertType": {
        const column = columns.find((candidate) => candidate.name === step.column);
        if (!column) throw new Error(`La columna ya no existe: ${step.column}.`);
        const type = pipelineCastSqlType(step.targetType, step.precision, step.scale);
        const projected = columns.map((candidate) =>
          candidate.name === column.name
            ? `CAST(${escapeIdentifier(candidate.name)} AS ${type}) AS ${escapeIdentifier(candidate.name)}`
            : escapeIdentifier(candidate.name),
        );
        query = `SELECT ${projected.join(", ")} FROM (${query}) AS ${alias}`;
        columns = columns.map((candidate) =>
          candidate.name === column.name ? { ...candidate, type } : candidate,
        );
        break;
      }
      case "normalizeDate": {
        const column = columns.find((candidate) => candidate.name === step.column);
        if (!column) throw new Error(`La columna ya no existe: ${step.column}.`);
        const source = escapeIdentifier(column.name);
        const expression = isTextPipelineColumn(column)
          ? `CAST(STRPTIME(${source}, ${escapeStringLiteral(DUCKDB_DATE_FORMATS[step.inputFormat])}) AS DATE)`
          : `CAST(${source} AS DATE)`;
        const projected = columns.map((candidate) =>
          candidate.name === column.name
            ? `${expression} AS ${escapeIdentifier(candidate.name)}`
            : escapeIdentifier(candidate.name),
        );
        query = `SELECT ${projected.join(", ")} FROM (${query}) AS ${alias}`;
        columns = columns.map((candidate) =>
          candidate.name === column.name ? { ...candidate, type: "DATE" } : candidate,
        );
        break;
      }
      case "normalizeText": {
        const column = columns.find((candidate) => candidate.name === step.column);
        if (!column) throw new Error(`La columna ya no existe: ${step.column}.`);
        let expression = escapeIdentifier(column.name);
        if (step.trimWhitespace) expression = `TRIM(${expression})`;
        if (step.letterCase === "lower") expression = `LOWER(${expression})`;
        if (step.letterCase === "upper") expression = `UPPER(${expression})`;
        if (step.emptyToNull) expression = `NULLIF(${expression}, '')`;
        const projected = columns.map((candidate) =>
          candidate.name === column.name
            ? `${expression} AS ${escapeIdentifier(candidate.name)}`
            : escapeIdentifier(candidate.name),
        );
        query = `SELECT ${projected.join(", ")} FROM (${query}) AS ${alias}`;
        if (step.emptyToNull) {
          columns = columns.map((candidate) =>
            candidate.name === column.name ? { ...candidate, nullable: true } : candidate,
          );
        }
        break;
      }
      case "rename": {
        const newName = step.newName.trim();
        const projected = columns.map((column) =>
          column.name === step.column
            ? `${escapeIdentifier(column.name)} AS ${escapeIdentifier(newName)}`
            : escapeIdentifier(column.name),
        );
        query = `SELECT ${projected.join(", ")} FROM (${query}) AS ${alias}`;
        columns = columns.map((column) =>
          column.name === step.column ? { ...column, name: newName } : column,
        );
        break;
      }
      case "deduplicate":
        query = `SELECT DISTINCT * FROM (${query}) AS ${alias}`;
        break;
      case "sort":
        finalSort = step;
        break;
    }
  }
  if (finalSort) {
    query = `SELECT * FROM (${query}) AS ${escapeIdentifier("df_sorted")} ORDER BY ${escapeIdentifier(finalSort.column)} ${finalSort.direction === "asc" ? "ASC" : "DESC"}`;
  }
  return query;
}

/** Rechaza conversiones inválidas o con pérdida antes de mostrar o crear una versión. */
async function assertPipelineConversions(
  conn: AsyncDuckDBConnection,
  base: StoredPipelineVersion,
  definition: PipelineDefinition,
): Promise<void> {
  for (const [index, step] of definition.steps.entries()) {
    if (step.type !== "convertType" && step.type !== "normalizeDate") continue;
    const previousSteps = definition.steps.slice(0, index);
    const previousValidation = validatePipeline(base.columns, {
      ...definition,
      steps: previousSteps,
    });
    const sourceColumn = previousValidation.columns.find((column) => column.name === step.column);
    if (!sourceColumn) throw new Error(`La columna ya no existe: ${step.column}.`);
    const input = previousSteps.length === 0
      ? `SELECT * FROM ${escapeIdentifier(base.tableName)}`
      : buildPipelineQuery(base.tableName, base.columns, previousSteps);
    const source = escapeIdentifier(step.column);
    let targetType: string;
    let invalidConditions: string[];
    if (step.type === "normalizeDate") {
      targetType = "DATE";
      const parseFormat = escapeStringLiteral(DUCKDB_DATE_FORMATS[step.inputFormat]);
      invalidConditions = [isTextPipelineColumn(sourceColumn)
        ? `TRY_STRPTIME(${source}, ${parseFormat}) IS NULL`
        : `TRY_CAST(${source} AS DATE) IS NULL`];
    } else {
      targetType = pipelineCastSqlType(step.targetType, step.precision, step.scale);
      const converted = `TRY_CAST(${source} AS ${targetType})`;
      invalidConditions = [`${converted} IS NULL`];

      if (step.targetType === "INTEGER" || step.targetType === "BIGINT") {
        if (isTextPipelineColumn(sourceColumn)) {
          invalidConditions.push(
            `NOT regexp_full_match(TRIM(CAST(${source} AS VARCHAR)), '^[+-]?[0-9]+$')`,
          );
        } else if (isNumericPipelineColumn(sourceColumn)) {
          invalidConditions.push(`${source} <> ${converted}`);
        }
      } else if (step.targetType === "DECIMAL") {
        if (isTextPipelineColumn(sourceColumn)) {
          const textValue = `TRIM(CAST(${source} AS VARCHAR))`;
          const significantFraction = `regexp_replace(regexp_extract(${textValue}, '[.]([0-9]+)$', 1), '0+$', '')`;
          invalidConditions.push(
            `NOT regexp_full_match(${textValue}, '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$')`,
            `length(${significantFraction}) > ${step.scale}`,
          );
        } else if (isNumericPipelineColumn(sourceColumn)) {
          invalidConditions.push(`${source} <> ${converted}`);
        }
      } else if (step.targetType === "BOOLEAN") {
        if (isTextPipelineColumn(sourceColumn)) {
          invalidConditions.push(
            `LOWER(TRIM(CAST(${source} AS VARCHAR))) NOT IN ('true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0')`,
          );
        } else if (isNumericPipelineColumn(sourceColumn)) {
          invalidConditions.push(`${source} NOT IN (0, 1)`);
        }
      }
    }

    const check = await conn.query(
      `SELECT COUNT(*) AS n FROM (${input}) AS ${escapeIdentifier("df_cast_check")} WHERE ${source} IS NOT NULL AND (${invalidConditions.join(" OR ")})`,
    );
    const row = toJSONRows(check)[0] as Record<string, unknown> | undefined;
    const invalidCount = row ? Number(row.n) : NaN;
    if (!Number.isSafeInteger(invalidCount) || invalidCount < 0) {
      throw new Error(`No se pudo validar la conversión de «${step.column}».`);
    }
    if (invalidCount > 0) {
      const action = step.type === "normalizeDate" ? "La normalización" : "La conversión";
      throw new Error(
        `${action} de «${step.column}» a ${targetType} se rechazó: ${invalidCount} fila(s) contiene(n) valores inválidos o perdería(n) precisión. Revise los datos, el formato o el tipo de destino.`,
      );
    }
  }
}

function pipelineCastSqlType(
  targetType: PipelineTargetType,
  precision: number,
  scale: number,
): string {
  return targetType === "DECIMAL" ? `DECIMAL(${precision},${scale})` : targetType;
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return "Fallo desconocido al inicializar DuckDB-Wasm";
}

/** Convierte una tabla Arrow a filas JSON; BigInt → Number (conteos) o texto. */
function toJSONRows(table: { toArray(): Array<{ toJSON(): unknown }> }): ResultRow[] {
  return table.toArray().map((r) => {
    const row = r.toJSON() as Record<string, unknown>;
    const out: ResultRow = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] =
        typeof v === "bigint"
          ? Number.isSafeInteger(Number(v))
            ? Number(v)
            : String(v)
          : v;
    }
    return out;
  });
}

// Instancia compartida por la UI técnica del spike.
export const engine = new DuckDBManager();
