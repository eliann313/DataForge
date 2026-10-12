// Worker de parseo XLSX (0A.4, ruta B).
// Corre fuera del hilo principal para no bloquear la UI con ZIP/XML grandes.
// No ejecuta fórmulas: SheetJS entrega el valor almacenado (cached).
/// <reference lib="webworker" />

import { read, utils } from "xlsx";

export interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
}

type Inbound =
  | { kind: "list"; id: number; buffer: ArrayBuffer }
  | { kind: "extract"; id: number; sheet: string }
  | { kind: "release"; id: number };

type Outbound =
  | { kind: "sheets"; id: number; sheets: SheetInfo[] }
  | { kind: "csv"; id: number; sheet: string; csv: string; rows: number; cols: number }
  | { kind: "error"; id: number; message: string };

const cache = new Map<number, ReturnType<typeof read>>();

function dimsOf(name: string, wb: ReturnType<typeof read>): SheetInfo {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"];
  if (!ref) return { name, rows: 0, cols: 0 };
  const range = utils.decode_range(ref);
  return {
    name,
    rows: range.e.r - range.s.r + 1,
    cols: range.e.c - range.s.c + 1,
  };
}

self.onmessage = (event: MessageEvent<Inbound>) => {
  const msg = event.data;
  const fail = (message: string) => {
    const out: Outbound = { kind: "error", id: msg.id, message };
    self.postMessage(out);
  };
  try {
    if (msg.kind === "list") {
      const wb = read(msg.buffer, { type: "array" });
      cache.set(msg.id, wb);
      const out: Outbound = {
        kind: "sheets",
        id: msg.id,
        sheets: wb.SheetNames.map((name) => dimsOf(name, wb)),
      };
      self.postMessage(out);
    } else if (msg.kind === "extract") {
      const wb = cache.get(msg.id);
      if (!wb) throw new Error("Archivo no cargado en el Worker");
      if (!wb.SheetNames.includes(msg.sheet)) {
        throw new Error(`Hoja inexistente: ${msg.sheet}`);
      }
      const info = dimsOf(msg.sheet, wb);
      const csv = utils.sheet_to_csv(wb.Sheets[msg.sheet], { FS: ",", RS: "\n" });
      const out: Outbound = {
        kind: "csv",
        id: msg.id,
        sheet: msg.sheet,
        csv,
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

export {};
