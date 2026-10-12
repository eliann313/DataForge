// Contrato del motor tabular (0A.2).
// Dominio/plataforma neutro: no importa React, Next.js ni DuckDB.
// La SQL la controla la aplicación; sin editor de SQL arbitrario en este spike.

export type EngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "error"
  | "closed";

export type EngineErrorCode =
  | "init-failed"
  | "query-failed"
  | "worker-failed"
  | "used-after-close";

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export interface PingResult {
  ok: 1;
  version: string;
}

/** Fila tabular genérica serializable a JSON. */
export type ResultRow = Record<string, unknown>;

/**
 * Escapa un identificador SQL (tabla/columna) entrecomillándolo.
 * Duplica las comillas internas y rechaza NUL. Nunca interpola valores:
 * los valores se parametrizan aparte.
 */
export function escapeIdentifier(name: string): string {
  if (name.length === 0) {
    throw new Error("Identificador SQL vacío no permitido");
  }
  if (name.includes("\0")) {
    throw new Error("Identificador SQL con NUL no permitido");
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Mensaje de estado legible en español para la UI técnica. */
export function statusLabel(status: EngineStatus): string {
  switch (status) {
    case "idle":
      return "Motor no inicializado";
    case "initializing":
      return "Inicializando motor…";
    case "ready":
      return "Motor listo";
    case "error":
      return "Error del motor";
    case "closed":
      return "Motor cerrado";
  }
}
