// Worker de parseo XLSX con un parser mantenido y límites previos a la descompresión.
// No ejecuta fórmulas: solo importa los valores ya almacenados en el archivo.
/// <reference lib="webworker" />

import readXlsxFile, { type Sheet } from "read-excel-file/web-worker";
import { MAX_XLSX_UNCOMPRESSED_BYTES } from "../engines/duckdb/csv";

export interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
}

type Workbook = Sheet<string>[];
type Inbound =
  | { kind: "list"; id: number; buffer: ArrayBuffer }
  | { kind: "extract"; id: number; sheet: string }
  | { kind: "release"; id: number };

type Outbound =
  | { kind: "sheets"; id: number; sheets: SheetInfo[] }
  | { kind: "csv"; id: number; sheet: string; csv: string; rows: number; cols: number }
  | { kind: "error"; id: number; message: string };

const MAX_XLSX_ENTRIES = 4096;
const cache = new Map<number, Workbook>();

/** Revisa el directorio central ZIP antes de que el parser descomprima el archivo. */
function assertSafeXlsxArchive(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const firstEocd = Math.max(0, buffer.byteLength - 22 - 0xffff);
  let eocd = -1;

  for (let offset = buffer.byteLength - 22; offset >= firstEocd; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === buffer.byteLength) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no contiene un ZIP XLSX válido.");

  const diskNumber = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || directoryDisk !== 0 || diskEntries !== entryCount) {
    throw new Error("No se admiten archivos XLSX ZIP divididos en varios volúmenes.");
  }
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("No se admiten archivos XLSX ZIP64.");
  }
  if (entryCount === 0) throw new Error("El XLSX no contiene archivos.");
  if (entryCount > MAX_XLSX_ENTRIES) {
    throw new Error(`El XLSX contiene más de ${MAX_XLSX_ENTRIES} entradas ZIP.`);
  }

  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > eocd || directoryEnd > buffer.byteLength) {
    throw new Error("El directorio del XLSX está malformado.");
  }

  let offset = directoryOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("El directorio del XLSX está malformado.");
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryDisk = view.getUint16(offset + 34, true);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > directoryEnd) throw new Error("El directorio del XLSX está malformado.");
    if (entryDisk !== 0) {
      throw new Error("No se admiten archivos XLSX ZIP divididos en varios volúmenes.");
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("No se admiten archivos XLSX ZIP64.");
    }

    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("El XLSX supera el límite de expansión de 64 MiB.");
    }
    offset = entryEnd;
  }
  if (offset !== directoryEnd) throw new Error("El directorio del XLSX está malformado.");
}

function dimsOf(entry: Workbook[number]): SheetInfo {
  return {
    name: entry.sheet,
    rows: entry.data.length,
    cols: entry.data.reduce((max, row) => Math.max(max, row.length), 0),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : String(value);
  return /[,"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toCSV(data: Workbook[number]["data"]): string {
  return data.map((row) => row.map(csvCell).join(",")).join("\n");
}

const handleMessage = async (msg: Inbound) => {
  const fail = (message: string) => {
    const out: Outbound = { kind: "error", id: msg.id, message };
    self.postMessage(out);
  };
  try {
    if (msg.kind === "list") {
      assertSafeXlsxArchive(msg.buffer);
      const workbook = await readXlsxFile<string>(msg.buffer, {
        trim: false,
        parseNumber: (value) => value,
      });
      cache.set(msg.id, workbook);
      const out: Outbound = {
        kind: "sheets",
        id: msg.id,
        sheets: workbook.map(dimsOf),
      };
      self.postMessage(out);
    } else if (msg.kind === "extract") {
      const workbook = cache.get(msg.id);
      if (!workbook) throw new Error("Archivo no cargado en el Worker");
      const entry = workbook.find((item) => item.sheet === msg.sheet);
      if (!entry) throw new Error(`Hoja inexistente: ${msg.sheet}`);
      const info = dimsOf(entry);
      const out: Outbound = {
        kind: "csv",
        id: msg.id,
        sheet: entry.sheet,
        csv: toCSV(entry.data),
        rows: info.rows,
        cols: info.cols,
      };
      self.postMessage(out);
    } else {
      cache.delete(msg.id);
    }
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : "Fallo al leer el XLSX");
  }
};

self.onmessage = (event: MessageEvent<Inbound>) => {
  void handleMessage(event.data);
};

export {};
