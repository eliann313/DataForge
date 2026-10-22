// Puente cliente ↔ Worker XLSX (0A.4). Una operación a la vez por puente;
// se crea un puente por archivo y se libera al terminar.
"use client";

import { checkInputFile, problemLabel } from "./csv";

export interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
}

export interface SheetCSV {
  sheet: string;
  csv: string;
  rows: number;
  cols: number;
}

type Outbound =
  | { kind: "sheets"; id: number; sheets: SheetInfo[] }
  | { kind: "csv"; id: number; sheet: string; csv: string; rows: number; cols: number }
  | { kind: "error"; id: number; message: string };

export class XLSXBridge {
  private worker: Worker | null = null;
  private id = 0;
  private pending: ((msg: Outbound) => void) | null = null;

  /** Envía el archivo al Worker y devuelve hojas tabulares detectadas. */
  async list(file: File): Promise<SheetInfo[]> {
    this.dispose();
    const check = checkInputFile(file.name, file.size);
    if (!check.ok) throw new Error(problemLabel(check.problem!, file.name));
    const worker = new Worker(
      new URL("../../workers/xlsx.worker.ts", import.meta.url),
    );
    this.worker = worker;
    this.id += 1;
    const buffer = await file.arrayBuffer();
    const reply = await this.send({ kind: "list", id: this.id, buffer });
    if (reply.kind !== "sheets") {
      throw new Error(reply.kind === "error" ? reply.message : "Respuesta inesperada del Worker");
    }
    return reply.sheets;
  }

  async extract(sheet: string): Promise<SheetCSV> {
    const reply = await this.send({ kind: "extract", id: this.id, sheet });
    if (reply.kind !== "csv") {
      throw new Error(reply.kind === "error" ? reply.message : "Respuesta inesperada del Worker");
    }
    return { sheet: reply.sheet, csv: reply.csv, rows: reply.rows, cols: reply.cols };
  }

  dispose(): void {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p({ kind: "error", id: this.id, message: "Puente liberado" });
    }
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Liberación best-effort.
      }
      this.worker = null;
    }
  }

  private send(msg: { kind: string; id: number; buffer?: ArrayBuffer; sheet?: string }): Promise<Outbound> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("Worker XLSX no creado"));
    return new Promise<Outbound>((resolve) => {
      this.pending = resolve;
      worker.onmessage = (event: MessageEvent<Outbound>) => {
        const p = this.pending;
        this.pending = null;
        if (p) p(event.data);
      };
      worker.onerror = () => {
        const p = this.pending;
        this.pending = null;
        if (p) p({ kind: "error", id: msg.id, message: "Fallo del Worker XLSX" });
      };
      if (msg.buffer) {
        worker.postMessage(msg, [msg.buffer]);
      } else {
        worker.postMessage(msg);
      }
    });
  }
}
