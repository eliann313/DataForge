// Worker de parseo XLSX con un parser mantenido y límites previos a la descompresión.
// No ejecuta fórmulas: solo importa los valores ya almacenados en el archivo.
/// <reference lib="webworker" />

import readXlsxFile, { type Sheet } from "read-excel-file/web-worker";
import { assertSafeXlsxArchive } from "./xlsx-archive";

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

const cache = new Map<number, Workbook>();


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
