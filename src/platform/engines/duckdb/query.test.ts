import { describe, expect, it } from "vitest";
import { buildCsvExportHeader, buildCsvExportQuery, buildOrderBy, buildPipelineQuery, buildWhere } from "./manager";

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
        { id: "fill-1", type: "fillNull", column: "producto", value: "sin dato" },
        { id: "rename-1", type: "rename", column: "valor", newName: 'importe"; DROP TABLE x; --' },
        { id: "select-1", type: "select", columns: ["producto", 'importe"; DROP TABLE x; --'] },
        { id: "dedupe-1", type: "deduplicate" },
        { id: "sort-1", type: "sort", column: "producto", direction: "desc" },
      ],
    );

    expect(query).toContain('FROM "source""; DROP TABLE x; --"');
    expect(query).toContain(`= 'x'' OR 1=1 --'`);
    expect(query).toContain('"producto" IS NOT NULL AND "valor" IS NOT NULL');
    expect(query).toContain(`COALESCE("producto", 'sin dato') AS "producto"`);
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

  it("construye expresiones aritméticas cerradas y conserva el esquema tras renombrar", () => {
    const query = buildPipelineQuery("ventas", [
      { name: "neto", type: "DECIMAL(10,2)", nullable: false },
      { name: "impuesto", type: "DECIMAL(5,2)", nullable: true },
    ], [
      { id: "calc", type: "calculate", leftColumn: "neto", operator: "multiply", rightColumn: "impuesto", outputName: 'total"bruto' },
      { id: "rename", type: "rename", column: 'total"bruto', newName: "total" },
    ]);

    expect(query).toContain('CAST("neto" * "impuesto" AS DECIMAL(16,4)) AS "total""bruto"');
    expect(query).toContain('"total""bruto" AS "total"');
  });

  it("genera agregaciones tipadas agrupadas y totales globales", () => {
    const grouped = buildPipelineQuery("ventas", [
      { name: "categoria", type: "VARCHAR", nullable: false },
      { name: "importe", type: "DECIMAL(10,2)", nullable: true },
    ], [{
      id: "aggregate",
      type: "aggregate",
      groupBy: ["categoria"],
      aggregations: [
        { operator: "count", outputName: "filas" },
        { operator: "sum", column: "importe", outputName: "total" },
      ],
    }]);
    expect(grouped).toContain('SELECT "categoria", COUNT(*) AS "filas", SUM("importe") AS "total"');
    expect(grouped).toContain('GROUP BY "categoria"');

    const total = buildPipelineQuery("ventas", [
      { name: "importe", type: "INTEGER", nullable: true },
    ], [{
      id: "aggregate",
      type: "aggregate",
      groupBy: [],
      aggregations: [{ operator: "count", outputName: "filas" }],
    }]);
    expect(total).toContain('SELECT COUNT(*) AS "filas"');
    expect(total).not.toContain(" GROUP BY ");
  });
});

describe("buildCsvExportQuery", () => {
  it("neutraliza encabezados peligrosos y escapa comillas, comas y saltos de línea", () => {
    const names = ["=1+1", " \t@cmd", 'nombre,"x"', "línea\nnueva", "normal"];
    const columns = names.map((name) => ({ name, type: "VARCHAR", nullable: false }));
    expect(buildCsvExportHeader(columns)).toBe(`"'=1+1","' \t@cmd","nombre,""x""","línea\nnueva","normal"\n`);
  });
  it("neutraliza celdas de texto que pueden ejecutarse como fórmulas", () => {
    const query = buildCsvExportQuery("version_1", [
      { name: "grupo", type: "VARCHAR", nullable: false },
      { name: "importe", type: "DECIMAL(12,2)", nullable: false },
      { name: 'nota"hostil', type: "TEXT", nullable: true },
    ]);

    expect(query).toContain('CASE WHEN LEFT(LTRIM(CAST("grupo" AS VARCHAR)');
    expect(query).toContain("THEN CHR(39) || CAST(\"grupo\" AS VARCHAR)");
    expect(query).toContain('"importe"');
    expect(query).toContain('AS "nota""hostil"');
  });
});
