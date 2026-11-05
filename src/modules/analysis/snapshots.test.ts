import { describe, expect, it } from "vitest";
import { createAnalysisSnapshot, validateAnalysisSnapshot, type AnalysisSnapshot } from "./snapshots";

const input = {
  projectId: "p1", title: "Resumen mensual",
  source: { sessionId: "session-1", versionId: "v2", sourceId: "s1", datasetName: "ventas.csv", rowCount: 3,
    columns: [{ name: "total", type: "DOUBLE", nullable: true }] },
  parameters: { measure: "total", filters: [] },
  results: { description: { mean: 4.5, missing: 0 } },
};

describe("analysis snapshots", () => {
  it("copia una captura con procedencia y resultados, sin compartir referencias mutables", () => {
    const snapshot = createAnalysisSnapshot(input, new Date("2026-11-04T12:00:00Z"));
    input.results.description.mean = 10;
    expect(snapshot.createdAt).toBe("2026-11-04T12:00:00.000Z");
    expect((snapshot.results.description as { mean: number }).mean).toBe(4.5);
    expect(snapshot.source.versionId).toBe("v2");
    expect(validateAnalysisSnapshot(snapshot)).toBe(true);
  });

  it("rechaza registros vacíos o dañados", () => {
    const malformed = { ...createAnalysisSnapshot(input), results: {} } as AnalysisSnapshot;
    expect(validateAnalysisSnapshot(malformed)).toBe(false);
    expect(validateAnalysisSnapshot(null)).toBe(false);
  });

  it("rechaza parámetros/resultados no serializables o mayores al límite documentado", () => {
    const oversized = { ...createAnalysisSnapshot(input), results: { text: "x".repeat(2 * 1024 * 1024) } };
    expect(validateAnalysisSnapshot(oversized)).toBe(false);
    expect(validateAnalysisSnapshot({ ...createAnalysisSnapshot(input), results: { value: BigInt(1) } })).toBe(false);
  });
});
