import { describe, expect, it } from "vitest";
import { buildOrderBy, buildPipelineQuery, buildWhere } from "./manager";

describe("buildWhere", () => {
  it("vacío no filtra", () => {
    expect(buildWhere([])).toBe("");
  });

  it("escapa identificadores y literales", () => {
    expect(
      buildWhere([{ column: 'a"; DROP TABLE t; --', op: "eq", value: "x" }]),
    ).toBe(` WHERE "a""; DROP TABLE t; --" = 'x'`);
  });

  it("contiene usa ILIKE escapando comodines", () => {
    expect(buildWhere([{ column: "producto", op: "contains", value: "100%" }])).toBe(
      ` WHERE CAST("producto" AS VARCHAR) ILIKE '%100\\%%' ESCAPE '\\'`,
    );
  });

  it("numéricos van sin comillas, nulos sin valor", () => {
    expect(buildWhere([{ column: "id", op: "gt", value: " 5 " }])).toBe(
      ` WHERE "id" > 5`,
    );
    expect(buildWhere([{ column: "promo", op: "isnull" }])).toBe(
      ` WHERE "promo" IS NULL`,
    );
  });

  it("respeta el tipo de columna al codificar el valor", () => {
    expect(buildWhere([{ column: "codigo", op: "eq", value: "00123" }], [
      { name: "codigo", type: "VARCHAR", nullable: false },
    ])).toBe(` WHERE "codigo" = '00123'`);
    expect(buildWhere([{ column: "importe", op: "eq", value: "00123" }], [
      { name: "importe", type: "DECIMAL(12,2)", nullable: false },
    ])).toBe(` WHERE "importe" = 00123`);
    expect(() => buildWhere([{ column: "codigo", op: "gt", value: "123" }], [
      { name: "codigo", type: "VARCHAR", nullable: false },
    ])).toThrow(/columna numérica/);
    expect(() => buildWhere([{ column: "importe", op: "eq", value: "doce" }], [
      { name: "importe", type: "INTEGER", nullable: false },
    ])).toThrow(/valor numérico válido/);
  });

  it("exige valor donde corresponde", () => {
    expect(() => buildWhere([{ column: "a", op: "eq" }])).toThrow();
  });
});

describe("buildOrderBy", () => {
  it("valida dirección", () => {
    expect(buildOrderBy({ column: "id", dir: "desc" })).toBe(
      `ORDER BY "id" DESC`,
    );
    expect(buildOrderBy(null)).toBe("");
    expect(() =>
      buildOrderBy({ column: "id", dir: "up" as "asc" }),
    ).toThrow();
  });
});

describe("buildPipelineQuery", () => {
  it("compone operaciones tipadas y escapa valores e identificadores", () => {
    const query = buildPipelineQuery(
      'source"; DROP TABLE x; --',
      [
        { name: "producto", type: "VARCHAR", nullable: false },
        { name: "valor", type: "INTEGER", nullable: true },
      ],
      [
        { id: "filter-1", type: "filter", filter: { column: "producto", op: "eq", value: "x' OR 1=1 --" } },
        { id: "nulls-1", type: "dropNulls", columns: ["producto", "valor"] },
        { id: "rename-1", type: "rename", column: "valor", newName: 'importe"; DROP TABLE x; --' },
        { id: "select-1", type: "select", columns: ["producto", 'importe"; DROP TABLE x; --'] },
        { id: "dedupe-1", type: "deduplicate" },
        { id: "sort-1", type: "sort", column: "producto", direction: "desc" },
      ],
    );

    expect(query).toContain('FROM "source""; DROP TABLE x; --"');
    expect(query).toContain(`= 'x'' OR 1=1 --'`);
    expect(query).toContain('"producto" IS NOT NULL AND "valor" IS NOT NULL');
    expect(query).toContain('AS "importe""; DROP TABLE x; --"');
    expect(query).toContain("SELECT DISTINCT *");
    expect(query).toContain('ORDER BY "producto" DESC');
  });

  it("rechaza una selección sin columnas", () => {
    expect(() => buildPipelineQuery("df_dataset", [
      { name: "grupo", type: "VARCHAR", nullable: false },
    ], [
      { id: "select-1", type: "select", columns: [] },
    ])).toThrow(/al menos una columna/);
  });
});
