import { describe, expect, it } from "vitest";
import {
  safeSqlType,
  validateAppendDefinition,
  validateJoinDefinition,
  type AppendDefinition,
  type JoinDefinition,
} from "./combination";
import type { DatasetColumn } from "./source";

const left: DatasetColumn[] = [
  { name: "id", type: "INTEGER", nullable: false },
  { name: "importe", type: "DECIMAL(8,2)", nullable: true },
];
const right: DatasetColumn[] = [
  { name: "id", type: "BIGINT", nullable: false },
  { name: "etiqueta", type: "VARCHAR", nullable: false },
];

function append(overrides: Partial<AppendDefinition> = {}): AppendDefinition {
  return {
    id: "append-1",
    name: "Anexar",
    leftVersionId: "left-1",
    rightVersionId: "right-1",
    columns: [
      { outputName: "id", leftColumn: "id", rightColumn: "id" },
      { outputName: "importe", leftColumn: "importe", rightColumn: null },
      { outputName: "etiqueta", leftColumn: null, rightColumn: "etiqueta" },
    ],
    ...overrides,
  };
}

function join(overrides: Partial<JoinDefinition> = {}): JoinDefinition {
  return {
    id: "join-1",
    name: "Relacionar",
    leftVersionId: "left-1",
    rightVersionId: "right-1",
    joinType: "left",
    cardinality: "many-to-one",
    confirmFanout: false,
    keys: [{ leftColumn: "id", rightColumn: "id" }],
    columns: [
      { side: "left", column: "id", outputName: "id_izquierda" },
      { side: "right", column: "etiqueta", outputName: "etiqueta" },
    ],
    ...overrides,
  };
}

describe("combinaciones de datasets", () => {
  it("valida mapeos APPEND y amplía tipos enteros sin convertir filas duplicadas en DISTINCT", () => {
    const result = validateAppendDefinition(left, right, append());

    expect(result.valid).toBe(true);
    expect(result.columns.map((column) => column.type)).toEqual(["BIGINT", "DECIMAL(8,2)", "VARCHAR"]);
    expect(result.columns[1].nullable).toBe(true);
  });

  it("rechaza salida repetida y tipos que no puede ampliar de forma segura", () => {
    const duplicate = validateAppendDefinition(left, right, append({
      columns: [
        { outputName: "id", leftColumn: "id", rightColumn: "id" },
        { outputName: "ID", leftColumn: "importe", rightColumn: null },
      ],
    }));
    expect(duplicate.valid).toBe(false);
    expect(duplicate.error).toContain("repetido");

    const incompatible = validateAppendDefinition(
      [{ name: "valor", type: "DATE", nullable: false }],
      [{ name: "valor", type: "VARCHAR", nullable: false }],
      append({ columns: [{ outputName: "valor", leftColumn: "valor", rightColumn: "valor" }] }),
    );
    expect(incompatible.valid).toBe(false);
    expect(incompatible.error).toContain("sin pérdida");
  });

  it("valida tipo de clave y exige nombres de salida únicos en JOIN", () => {
    const incompatible = validateJoinDefinition(
      left,
      right.map((column) => column.name === "id" ? { ...column, type: "VARCHAR" } : column),
      join(),
    );
    expect(incompatible.valid).toBe(false);
    expect(incompatible.error).toContain("mismo tipo compatible");

    const duplicateOutput = validateJoinDefinition(left, right.map((column) => column.name === "id" ? { ...column, type: "INTEGER" } : column), join({
      columns: [
        { side: "left", column: "id", outputName: "id" },
        { side: "right", column: "etiqueta", outputName: "ID" },
      ],
    }));
    expect(duplicateOutput.valid).toBe(false);
    expect(duplicateOutput.error).toContain("repetido");
  });

  it("acepta solo tipos SQL cerrados y decimales con precisión válida", () => {
    expect(safeSqlType("int8")).toBe("BIGINT");
    expect(safeSqlType("DECIMAL(38, 4)")).toBe("DECIMAL(38,4)");
    expect(safeSqlType("DECIMAL(39, 0)")).toBeNull();
    expect(safeSqlType("INTEGER); DROP TABLE data; --")).toBeNull();
  });
});
