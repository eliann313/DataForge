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

interface DuckDBBundle {
  mainModule?: string;
  mainWorker?: string;
  pthreadWorker?: string;
}

/** Tabla activa del spike. Nombre interno fijo: nunca usa el nombre del archivo. */
export const DATASET_TABLE = "df_dataset";
const STAGING_TABLE = "df_dataset_next";
const REGISTER_NAME = "df_upload.csv";

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface ImportSummary {
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
export function buildWhere(filters: DataFilter[]): string {
  if (filters.length === 0) return "";
  const parts = filters.map((f) => {
    const col = escapeIdentifier(f.column);
    switch (f.op) {
      case "isnull":
        return `${col} IS NULL`;
      case "notnull":
        return `${col} IS NOT NULL`;
      case "contains": {
        const pattern = escapeLike(requireValue(f));
        return `CAST(${col} AS VARCHAR) ILIKE ${escapeStringLiteral(`%${pattern}%`)} ESCAPE '\\'`;
      }
      case "eq":
        return `${col} = ${literalValue(requireValue(f))}`;
      case "gt":
        return `${col} > ${literalValue(requireValue(f))}`;
      case "gte":
        return `${col} >= ${literalValue(requireValue(f))}`;
      case "lt":
        return `${col} < ${literalValue(requireValue(f))}`;
      case "lte":
        return `${col} <= ${literalValue(requireValue(f))}`;
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

/** Escapa %, _ y \ para ILIKE. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class DuckDBManager {
  private status: EngineStatus = "idle";
  private lastError: EngineError | null = null;
  private lastPing: PingResult | null = null;
  private worker: Worker | null = null;
  private db: AsyncDuckDB | null = null;
  private conn: AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();

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
      throw {
        code: "query-failed",
        message: "El motor no está listo. Inicialícelo antes de importar.",
      } satisfies EngineError;
    }
    return this.conn;
  }

  /**
   * Importa un CSV (UTF-8). Opciones: delimitador autodetectado (coma/punto
   * y coma) o explícito, con o sin encabezados. Un archivo por vez; la fuente
   * original no se modifica. Ante fallo conserva la tabla activa anterior.
   */
  async importCSV(
    file: File,
    opts?: { delimiter?: "auto" | "," | ";"; header?: boolean },
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
    );
  }

  /** Importa texto CSV ya extraído (p. ej. hoja XLSX vía Worker). */
  async importCSVText(displayName: string, csv: string): Promise<ImportSummary> {
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
    );
  }

  /**
   * Importa JSON tabular (arreglo de objetos; se aceptan campos anidados,
   * que llegan como STRUCT). Formas no tabulares se rechazan con mensaje.
   */
  async importJSON(file: File): Promise<ImportSummary> {
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
    );
  }

  /** Importa Parquet vía lectura nativa de DuckDB. */
  async importParquet(file: File): Promise<ImportSummary> {
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
    await db.registerFileBuffer(registerName, bytes);
    try {
      await conn.query(
        `CREATE OR REPLACE TABLE ${escapeIdentifier(STAGING_TABLE)} AS ${sourceSQL}`,
      );
      const columns = await this.readSchema(conn, STAGING_TABLE);
      const rows = await this.readCount(conn, STAGING_TABLE);
      await conn.query(`DROP TABLE IF EXISTS ${escapeIdentifier(DATASET_TABLE)}`);
      await conn.query(
        `ALTER TABLE ${escapeIdentifier(STAGING_TABLE)} RENAME TO ${escapeIdentifier(DATASET_TABLE)}`,
      );
      return { fileName: displayName, bytes: size, rows, columns, durationMs: Math.round(performance.now() - started) };
    } catch (cause) {
      try {
        await conn.query(`DROP TABLE IF EXISTS ${escapeIdentifier(STAGING_TABLE)}`);
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

  hasDataset(): Promise<boolean> {
    return this.readCount(this.requireConn(), DATASET_TABLE)
      .then(() => true)
      .catch(() => false);
  }

  getSchema(): Promise<ColumnInfo[]> {
    return this.readSchema(this.requireConn(), DATASET_TABLE);
  }

  getCount(): Promise<number> {
    return this.readCount(this.requireConn(), DATASET_TABLE);
  }

  // ---- E4: filtros y orden sobre el dataset completo, profiling ----

  async getPage(
    page: number,
    pageSize: number,
    opts?: { filters?: DataFilter[]; sort?: DataSort | null },
  ): Promise<PageResult> {
    const conn = this.requireConn();
    const c = clampPage(page, pageSize);
    const where = buildWhere(opts?.filters ?? []);
    const order = buildOrderBy(opts?.sort ?? null);
    const [table, total, filtered] = await Promise.all([
      conn.query(
        `SELECT * FROM ${escapeIdentifier(DATASET_TABLE)}${where} ${order} LIMIT ${c.pageSize} OFFSET ${c.offset}`,
      ),
      this.readCount(conn, DATASET_TABLE),
      where
        ? this.readCountWhere(conn, where)
        : this.readCount(conn, DATASET_TABLE),
    ]);
    return { rows: toJSONRows(table), total, filtered };
  }

  async countFiltered(filters: DataFilter[]): Promise<number> {
    const conn = this.requireConn();
    const where = buildWhere(filters);
    return where
      ? this.readCountWhere(conn, where)
      : this.readCount(conn, DATASET_TABLE);
  }

  /** Perfil de una columna: nulos, cardinalidad, rango y frecuencias. */
  async profileColumn(column: string): Promise<ColumnProfile> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const table = escapeIdentifier(DATASET_TABLE);
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
      `SELECT COUNT(*) AS n FROM (SELECT * FROM ${escapeIdentifier(DATASET_TABLE)} GROUP BY ALL HAVING COUNT(*) > 1)`,
    );
    const row = toJSONRows(table)[0] as Record<string, unknown> | undefined;
    const groups = row ? Number(row.n) : NaN;
    if (!Number.isInteger(groups) || groups < 0) throw new Error("Conteo inválido");
    return groups;
  }

  /** Agregación sobre una columna (nombre escapado; sin SQL arbitraria). */
  async summarizeNumeric(column: string): Promise<NumericSummary> {
    const conn = this.requireConn();
    const col = escapeIdentifier(column);
    const table = await conn.query(
      `SELECT COUNT(${col}) AS n, SUM(${col}) AS s, AVG(${col}) AS a, MIN(${col}) AS mn, MAX(${col}) AS mx FROM ${escapeIdentifier(DATASET_TABLE)}`,
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

  private async readCountWhere(
    conn: AsyncDuckDBConnection,
    where: string,
  ): Promise<number> {
    const counted = await conn.query(
      `SELECT COUNT(*) AS n FROM ${escapeIdentifier(DATASET_TABLE)}${where}`,
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
  }
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
