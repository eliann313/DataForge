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
   * Importa un CSV (UTF-8, con encabezados, coma o punto y coma por
   * autodetección). Un archivo por vez; la fuente original no se modifica.
   * Ante fallo conserva la tabla activa anterior.
   */
  async importCSV(file: File): Promise<ImportSummary> {
    this.requireConn();
    const check = checkCSVFile(file.name, file.size);
    if (!check.ok) {
      throw {
        code: "query-failed",
        message: problemLabel(check.problem!),
      } satisfies EngineError;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.importBuffer(file.name, file.size, bytes);
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
    return this.importBuffer(displayName, bytes.byteLength, bytes);
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

  private async importBuffer(
    displayName: string,
    size: number,
    bytes: Uint8Array,
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
    await db.registerFileBuffer(REGISTER_NAME, bytes);
    try {
      await conn.query(
        `CREATE OR REPLACE TABLE ${escapeIdentifier(STAGING_TABLE)} AS SELECT * FROM read_csv(${escapeStringLiteral(REGISTER_NAME)}, header = true, auto_detect = true)`,
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
        message: `No se pudo importar el CSV: ${messageOf(cause)}`,
      } satisfies EngineError;
    } finally {
      try {
        await db.dropFile(REGISTER_NAME);
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

  async getPage(page: number, pageSize: number): Promise<ResultRow[]> {
    const conn = this.requireConn();
    const c = clampPage(page, pageSize);
    const table = await conn.query(
      `SELECT * FROM ${escapeIdentifier(DATASET_TABLE)} LIMIT ${c.pageSize} OFFSET ${c.offset}`,
    );
    return toJSONRows(table);
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
