// Utilidades puras de importación CSV (0A.3). Sin dependencias de plataforma:
// se prueban en Node con Vitest.

export const MAX_CSV_BYTES = 20 * 1024 * 1024; // Límite inicial orientativo (README/R1).
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export type FileProblem =
  | "empty"
  | "too-large"
  | "unsupported-type";

export interface FileCheck {
  ok: boolean;
  problem?: FileProblem;
}

/** Validación previa: tipo, vacío y límite. El contenido lo valida DuckDB. */
export function checkCSVFile(name: string, bytes: number): FileCheck {
  if (!/\.csv$/i.test(name)) return { ok: false, problem: "unsupported-type" };
  if (bytes === 0) return { ok: false, problem: "empty" };
  if (bytes > MAX_CSV_BYTES) return { ok: false, problem: "too-large" };
  return { ok: true };
}

export function problemLabel(problem: FileProblem): string {
  switch (problem) {
    case "empty":
      return "El archivo está vacío.";
    case "too-large":
      return `Supera el límite orientativo de ${MAX_CSV_BYTES / (1024 * 1024)} MB por archivo.`;
    case "unsupported-type":
      return "Tipo no soportado en este spike: solo .csv (XLSX llega en 0A.4).";
  }
}

/** Escapa un literal de texto SQL duplicando comillas simples. */
export function escapeStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Sanea paginación: enteros, página ≥ 1, tamaño 1..MAX_PAGE_SIZE. */
export function clampPage(page: number, pageSize: number): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const p = Number.isInteger(page) && page >= 1 ? page : 1;
  const s =
    Number.isInteger(pageSize) && pageSize >= 1
      ? Math.min(pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page: p, pageSize: s, offset: (p - 1) * s };
}
