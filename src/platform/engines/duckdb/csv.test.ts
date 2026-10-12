import { describe, expect, it } from "vitest";
import {
  MAX_CSV_BYTES,
  checkCSVFile,
  clampPage,
  escapeStringLiteral,
  problemLabel,
} from "./csv";

describe("checkCSVFile", () => {
  it("acepta CSV no vacío dentro del límite", () => {
    expect(checkCSVFile("ventas.csv", 100)).toEqual({ ok: true });
    expect(checkCSVFile("VENTAS.CSV", 100).ok).toBe(true);
  });

  it("rechaza vacío, excedido y otros formatos", () => {
    expect(checkCSVFile("a.csv", 0)).toEqual({ ok: false, problem: "empty" });
    expect(checkCSVFile("a.csv", MAX_CSV_BYTES + 1)).toEqual({
      ok: false,
      problem: "too-large",
    });
    expect(checkCSVFile("a.xlsx", 100)).toEqual({
      ok: false,
      problem: "unsupported-type",
    });
    expect(checkCSVFile("acsv", 100).ok).toBe(false);
  });

  it("explica cada problema en español", () => {
    expect(problemLabel("empty")).toMatch(/vacío/);
    expect(problemLabel("too-large")).toMatch(/20 MB/);
  });
});

describe("escapeStringLiteral", () => {
  it("duplica comillas simples", () => {
    expect(escapeStringLiteral("df_upload.csv")).toBe("'df_upload.csv'");
    expect(escapeStringLiteral("a'b")).toBe("'a''b'");
  });
});

describe("clampPage", () => {
  it("sanea página y tamaño", () => {
    expect(clampPage(2, 20)).toEqual({ page: 2, pageSize: 20, offset: 20 });
    expect(clampPage(0, 20).page).toBe(1);
    expect(clampPage(1, 1000).pageSize).toBe(100);
    expect(clampPage(NaN, NaN)).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });
});
