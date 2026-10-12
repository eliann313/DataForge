import { describe, expect, it } from "vitest";
import { evaluateFindings } from "./findings";

describe("evaluateFindings", () => {
  it("dispara nulos altos sobre el umbral", () => {
    const found = evaluateFindings([
      { column: "promo", total: 5, nullPct: 60, distinct: 2 },
    ]);
    expect(found.map((f) => f.rule)).toEqual(["nulos-altos"]);
    expect(found[0].text).toMatch(/60 %/);
  });

  it("detecta categoría dominante y constante", () => {
    const found = evaluateFindings([
      { column: "producto", total: 5, nullPct: 0, distinct: 2, topShare: 60 },
      { column: "fija", total: 5, nullPct: 0, distinct: 1 },
    ]);
    expect(found.map((f) => f.rule)).toEqual([
      "categoria-dominante",
      "constante",
    ]);
  });

  it("detecta asimetría por media/mediana/desvío", () => {
    // media 404.25, mediana 320, desvío ~145.28 → |84.25|/145.28 ≈ 0.58 > 0.5
    const found = evaluateFindings([
      { column: "importe", total: 5, nullPct: 0, distinct: 5, mean: 404.25, median: 320, stddev: 145.28 },
    ]);
    expect(found.map((f) => f.rule)).toEqual(["asimetria"]);
  });

  it("no inventa hallazgos bajo los umbrales", () => {
    expect(
      evaluateFindings([
        { column: "id", total: 5, nullPct: 0, distinct: 5, mean: 3, median: 3, stddev: 1.58, topShare: 20 },
      ]),
    ).toEqual([]);
  });
});
