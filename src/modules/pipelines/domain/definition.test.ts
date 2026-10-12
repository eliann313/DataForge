import { describe, expect, it } from "vitest";
import { validatePipeline, type PipelineColumn, type PipelineDefinition } from "./definition";

const columns: PipelineColumn[] = [
  { name: "grupo", type: "VARCHAR", nullable: false },
  { name: "valor", type: "INTEGER", nullable: true },
];

function definition(steps: PipelineDefinition["steps"]): PipelineDefinition {
  return { id: "p-1", name: "Preparación", steps };
}

describe("validatePipeline", () => {
  it("valida el esquema que resulta de filtrar, renombrar y seleccionar", () => {
    const result = validatePipeline(columns, definition([
      { id: "f1", type: "filter", filter: { column: "grupo", op: "eq", value: "A" } },
      { id: "r1", type: "rename", column: "valor", newName: "importe" },
      { id: "s1", type: "select", columns: ["grupo", "importe"] },
    ]));

    expect(result.valid).toBe(true);
    expect(result.columns.map((column) => column.name)).toEqual(["grupo", "importe"]);
    expect(result.columns[1].type).toBe("INTEGER");
  });

  it("rechaza referencias borradas por pasos anteriores", () => {
    const result = validatePipeline(columns, definition([
      { id: "s1", type: "select", columns: ["grupo"] },
      { id: "f1", type: "filter", filter: { column: "valor", op: "gt", value: "2" } },
    ]));

    expect(result.valid).toBe(false);
    expect(result.stepId).toBe("f1");
    expect(result.error).toMatch(/ya no existe/);
  });

  it("rechaza selecciones vacías y nombres que colisionan", () => {
    expect(validatePipeline(columns, definition([
      { id: "s1", type: "select", columns: [] },
    ])).error).toMatch(/al menos una columna/);

    expect(validatePipeline(columns, definition([
      { id: "r1", type: "rename", column: "grupo", newName: "valor" },
    ])).error).toMatch(/Ya existe/);
  });

  it("valida las columnas elegidas para quitar filas con nulos", () => {
    expect(validatePipeline(columns, definition([
      { id: "n1", type: "dropNulls", columns: ["valor"] },
    ])).valid).toBe(true);
    expect(validatePipeline(columns, definition([
      { id: "n1", type: "dropNulls", columns: [] },
    ])).error).toMatch(/Seleccione al menos una columna/);
    expect(validatePipeline(columns, definition([
      { id: "n1", type: "dropNulls", columns: ["faltante"] },
    ])).error).toMatch(/ya no existe/);
  });

  it("exige nombre, pasos y valores para los operadores que los necesitan", () => {
    expect(validatePipeline(columns, { id: "p", name: " ", steps: [] }).error).toMatch(/nombre/);
    expect(validatePipeline(columns, definition([])).error).toMatch(/al menos un paso/);
    expect(validatePipeline(columns, definition([
      { id: "f1", type: "filter", filter: { column: "grupo", op: "contains", value: "" } },
    ])).error).toMatch(/Complete el valor/);
  });
});
