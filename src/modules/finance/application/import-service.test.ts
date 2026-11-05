import { describe, expect, it } from "vitest";
import { FinanceImportService } from "./import-service";
import { parseCsv } from "./import-file";
import { cellToText } from "./import-file";
import { MemoryTransactionRepository } from "../infrastructure/memory";

const account = { id: "ars", name: "Banco", currency: "ARS" as const, type: "bank" as const, createdAt: "2024-01-01" };
const mapping = { date: 0, description: 1, kind: 2, amount: 3, category: 4 } as const;

describe("importación financiera local", () => {
  it("normaliza fechas XLSX desde UTC sin desplazarlas por zona local", () => {
    expect(cellToText(new Date("2024-03-01T00:00:00.000Z"))).toBe("2024-03-01");
  });

  it("lee CSV delimitado, comillas, saltos de línea y acentos", () => {
    expect(parseCsv('\ufefffecha;descripcion;tipo;importe;categoria\r\n2024-01-02;"Café; molido";gasto;1.234,56;Alimentos\r\n'))
      .toEqual({ headers: ["fecha", "descripcion", "tipo", "importe", "categoria"], rows: [["2024-01-02", "Café; molido", "gasto", "1.234,56", "Alimentos"]] });
  });

  it("ignora delimitadores dentro de un encabezado entrecomillado al detectar el separador", () => {
    expect(parseCsv('"fecha, operación";descripcion;tipo;importe;categoria\n2024-01-02;Compra;gasto;10;General').headers)
      .toEqual(["fecha, operación", "descripcion", "tipo", "importe", "categoria"]);
  });

  it("rechaza filas con columnas extra sin encabezado y comillas sin cerrar", () => {
    expect(() => parseCsv("fecha,descripcion\n2024-01-01,A,oculto")).toThrow(/no tienen encabezado/);
    expect(() => parseCsv('fecha,descripcion\n2024-01-01,"sin cierre')).toThrow(/sin cerrar/);
  });

  it("valida todo el lote, conserva centavos y marca duplicados del lote y existentes", async () => {
    const repo = new MemoryTransactionRepository();
    const service = new FinanceImportService(repo, (() => { let i = 0; return () => `id-${++i}`; })(), () => "2024-01-01T00:00:00Z");
    const rows = [["2024-01-02", "Café", "gasto", "0,10", "Alimentos"], ["2024-01-02", "Café", "gasto", "0,10", "Alimentos"], ["2024-02-30", "Roto", "gasto", "2", "Varios"]];
    const preview = await service.preview(rows, mapping, "ARS", account);
    expect(preview).toMatchObject({ validCount: 1, duplicateCount: 1, errorCount: 1 });
    expect(preview.rows[0].transaction?.amountMinor).toBe(10);
    await expect(service.confirm(preview)).rejects.toThrow(/Corrige todas/);
    expect(await repo.list()).toHaveLength(0);
  });

  it("confirma solo nuevos movimientos y no persiste dos veces un movimiento idéntico", async () => {
    const repo = new MemoryTransactionRepository();
    const service = new FinanceImportService(repo, (() => { let i = 0; return () => `id-${++i}`; })(), () => "2024-01-01T00:00:00Z");
    const preview = await service.preview([["2024-01-02", "Café", "gasto", "0,10", "Alimentos"], ["2024-01-02", "Café", "gasto", "0,10", "Alimentos"]], mapping, "ARS", account);
    expect(await service.confirm(preview)).toBe(1);
    expect((await repo.list()).map((tx) => tx.amountMinor)).toEqual([10]);
  });

  it("rechaza ingresos en extractos de tarjeta y admite gastos", async () => {
    const repo = new MemoryTransactionRepository();
    const service = new FinanceImportService(repo, () => "card-row", () => "2024-01-01T00:00:00Z");
    const card = { ...account, id: "card", type: "card" as const };
    const preview = await service.preview([["2024-01-02", "Devolución", "credit", "10", "Otro"], ["2024-01-03", "Compra", "debit", "10", "Compras"]], mapping, "ARS", card);
    expect(preview).toMatchObject({ validCount: 1, errorCount: 1 });
    expect(preview.rows[0].error).toMatch(/No se pueden importar ingresos/);
    expect(preview.rows[1].transaction?.kind).toBe("gasto");
  });
});
