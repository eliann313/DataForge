import { describe, expect, it } from "vitest";
import { isNumericMeasure, suggestRole, valueHint } from "./semantics";

describe("suggestRole", () => {
  it("solo trata como medida columnas numéricas con ese rol", () => {
    expect(isNumericMeasure({ name: "id", type: "BIGINT", nullable: false }, { id: "identificador" })).toBe(false);
    expect(isNumericMeasure({ name: "id", type: "BIGINT", nullable: false }, { id: "medida" })).toBe(true);
    expect(isNumericMeasure({ name: "texto", type: "VARCHAR", nullable: false }, { texto: "medida" })).toBe(false);
  });
  it("sugiere por tipo y nombre", () => {
    expect(suggestRole("DOUBLE", "importe")).toBe("medida");
    expect(suggestRole("BIGINT", "id")).toBe("identificador");
    expect(suggestRole("DOUBLE", "cliente_id")).toBe("identificador");
    expect(suggestRole("VARCHAR", "id")).toBe("identificador");
    expect(suggestRole("BIGINT", "cantidad")).toBe("medida");
    expect(suggestRole("DATE", "fecha")).toBe("fecha");
    expect(suggestRole("VARCHAR", "producto")).toBe("texto");
    expect(suggestRole("BOOLEAN", "activo")).toBe("dimension");
    expect(suggestRole("BLOB", "x")).toBe("desconocido");
  });
});

describe("valueHint", () => {
  it("señala formatos regionales sin corregir", () => {
    expect(valueHint("12/03/2024")).toMatch(/fecha.*regional/);
    expect(valueHint("1.234,56")).toMatch(/coma/);
    expect(valueHint("150.50")).toBeNull();
    expect(valueHint(150.5)).toBeNull();
    expect(valueHint(null)).toBeNull();
  });
});
