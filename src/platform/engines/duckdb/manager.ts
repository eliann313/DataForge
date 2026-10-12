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
} from "./contract";

interface DuckDBBundle {
  mainModule?: string;
  mainWorker?: string;
  pthreadWorker?: string;
}

export class DuckDBManager {
  private status: EngineStatus = "idle";
  private lastError: EngineError | null = null;
  private lastPing: PingResult | null = null;
  private worker: Worker | null = null;
  private db: AsyncDuckDB | null = null;
  private conn: AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;

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
    this.initPromise = this.doInit().then(
      () => {
        this.status = "ready";
        this.initPromise = null;
      },
      (cause: unknown) => {
        this.status = "error";
        this.lastError = {
          code: "init-failed",
          message: messageOf(cause),
        };
        this.initPromise = null;
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
  }

  /** Reinicia el Worker. Si cerrar exige reimportar, la UI lo indica. */
  async restart(): Promise<void> {
    await this.release();
    this.lastPing = null;
    this.status = "idle";
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

// Instancia compartida por la UI técnica del spike.
export const engine = new DuckDBManager();
