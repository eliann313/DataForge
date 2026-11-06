import { readSheet } from "read-excel-file/browser";
import { FinanceError } from "../domain/money";
import { assertSafeXlsxArchive } from "../../../platform/workers/xlsx-archive";

export interface TabularFile {
  headers: string[];
  rows: string[][];
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 100;

/** Lee CSV UTF-8 o XLSX (primera hoja). No ejecuta ni interpreta fórmulas. */
export async function readFinanceFile(file: File): Promise<TabularFile> {
  if (file.size > MAX_FILE_BYTES) throw new FinanceError("validation", "El archivo supera el límite de 10 MiB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsv(await file.text());
  if (extension === "xlsx") {
    try {
      const buffer = await file.arrayBuffer();
      assertSafeXlsxArchive(buffer);
      const matrix = await readSheet(file, 1);
      return fromMatrix(matrix as unknown[][]);
    } catch (cause) {
      throw new FinanceError("validation", `No se pudo leer el XLSX: ${cause instanceof Error ? cause.message : "archivo inválido"}`);
    }
  }
  throw new FinanceError("validation", "Formato no admitido. Selecciona un archivo CSV o XLSX.");
}

export function parseCsv(text: string): TabularFile {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => countOutsideQuotes(firstLine, b) - countOutsideQuotes(firstLine, a))[0];
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.length > 0)) matrix.push(row);
      row = [];
      if (matrix.length > MAX_ROWS + 1) throw new FinanceError("validation", `El archivo supera ${MAX_ROWS.toLocaleString("es-AR")} filas.`);
    } else cell += char;
  }
  if (quoted) throw new FinanceError("validation", "El CSV contiene una celda entrecomillada sin cerrar.");
  row.push(cell);
  if (row.some((value) => value.length > 0)) matrix.push(row);
  return fromMatrix(matrix);
}

function fromMatrix(matrix: unknown[][]): TabularFile {
  const clean = matrix.map((row) => row.map(cellToText));
  const headerIndex = clean.findIndex((row) => row.some((value) => value.trim() !== ""));
  if (headerIndex < 0 || clean.length <= headerIndex + 1) throw new FinanceError("validation", "El archivo debe incluir encabezados y al menos una fila.");
  const headers = clean[headerIndex].map((value) => value.trim());
  if (headers.length > MAX_COLUMNS) throw new FinanceError("validation", `El archivo supera ${MAX_COLUMNS} columnas.`);
  if (headers.some((header) => !header) || new Set(headers.map((h) => h.toLocaleLowerCase())).size !== headers.length) {
    throw new FinanceError("validation", "Los encabezados deben estar completos y no repetirse.");
  }
  const rows = clean.slice(headerIndex + 1).filter((row) => row.some((value) => value.trim() !== ""));
  if (rows.some((row) => row.length > headers.length)) {
    throw new FinanceError("validation", "Hay filas con datos en columnas que no tienen encabezado.");
  }
  if (rows.length > MAX_ROWS) throw new FinanceError("validation", `El archivo supera ${MAX_ROWS.toLocaleString("es-AR")} filas.`);
  if (!rows.length) throw new FinanceError("validation", "El archivo no contiene movimientos.");
  return { headers, rows: rows.map((row) => headers.map((_, index) => row[index] ?? "")) };
}

export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear(); const m = String(value.getUTCMonth() + 1).padStart(2, "0"); const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}
function countOutsideQuotes(value: string, delimiter: string): number {
  let quoted = false; let total = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && quoted && value[i + 1] === '"') i++;
    else if (value[i] === '"') quoted = !quoted;
    else if (!quoted && value[i] === delimiter) total++;
  }
  return total;
}
