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

  it("valida reemplazos de nulos según el tipo físico", () => {
    expect(validatePipeline(columns, definition([
      { id: "fill-text", type: "fillNull", column: "grupo", value: "00123" },
    ])).valid).toBe(true);
    expect(validatePipeline(columns, definition([
      { id: "fill-number", type: "fillNull", column: "valor", value: "0.5" },
    ])).valid).toBe(true);
    expect(validatePipeline(columns, definition([
      { id: "fill-number", type: "fillNull", column: "valor", value: "cero" },
    ])).error).toMatch(/valor numérico válido/);
    expect(validatePipeline(columns, definition([
      { id: "fill-missing", type: "fillNull", column: "valor", value: null },
    ])).error).toMatch(/reemplazar los nulos/);
  });

  it("normaliza texto y marca la columna anulable al convertir vacíos en nulos", () => {
    const result = validatePipeline(columns, definition([
      {
        id: "normalize-text",
        type: "normalizeText",
        column: "grupo",
        trimWhitespace: true,
        letterCase: "lower",
        emptyToNull: true,
      },
    ]));

    expect(result.valid).toBe(true);
    expect(result.columns[0].nullable).toBe(true);
    expect(validatePipeline(columns, definition([
      {
        id: "normalize-number",
        type: "normalizeText",
        column: "valor",
        trimWhitespace: true,
        letterCase: "preserve",
        emptyToNull: false,
      },
    ])).error).toMatch(/columna de texto/);
    expect(validatePipeline(columns, definition([
      {
        id: "normalize-noop",
        type: "normalizeText",
        column: "grupo",
        trimWhitespace: false,
        letterCase: "preserve",
        emptyToNull: false,
      },
    ])).error).toMatch(/al menos una regla/);
    expect(validatePipeline(columns, definition([
      {
        id: "normalize-malformed",
        type: "normalizeText",
        column: "grupo",
        trimWhitespace: true,
        letterCase: "lower",
        emptyToNull: "yes",
      } as unknown as PipelineDefinition["steps"][number],
    ])).error).toMatch(/opciones de normalización/);
  });

  it("exige nombre, pasos y valores para los operadores que los necesitan", () => {
    expect(validatePipeline(columns, { id: "p", name: " ", steps: [] }).error).toMatch(/nombre/);
    expect(validatePipeline(columns, definition([])).error).toMatch(/al menos un paso/);
    expect(validatePipeline(columns, definition([
      { id: "f1", type: "filter", filter: { column: "grupo", op: "contains", value: "" } },
    ])).error).toMatch(/Complete el valor/);
  });
});
