import { describe, expect, it } from "vitest";
import { suggestRole, valueHint } from "./semantics";

describe("suggestRole", () => {
  it("sugiere por tipo y nombre", () => {
    expect(suggestRole("DOUBLE", "importe")).toBe("medida");
    expect(suggestRole("BIGINT", "id")).toBe("identificador");
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
