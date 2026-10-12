import { describe, expect, it } from "vitest";
import { buildOrderBy, buildWhere } from "./manager";

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
