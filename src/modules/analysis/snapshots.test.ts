import { describe, expect, it } from "vitest";
import { captureSnapshotLineage, createAnalysisSnapshot, validateAnalysisSnapshot, type AnalysisSnapshot, type SnapshotLineageNode, type SnapshotVersionReference } from "./snapshots";

const sourceNode = (versionId: string, sourceId: string): SnapshotVersionReference => ({
  versionId, projectId: "p1", name: `${sourceId}.csv`, operationType: "source", sourceIds: [sourceId], parentIds: [],
  pipelineId: null, executedDefinition: null, rowCount: 2, columns: [{ name: "id", type: "INTEGER", nullable: false }], stepCount: 0,
  createdAt: "2026-11-04T12:00:00.000Z",
});
const lineage: SnapshotLineageNode[] = [sourceNode("source-a", "a"), sourceNode("source-b", "b"), {
  versionId: "join-1", projectId: "p1", name: "Unir · JOIN", operationType: "join", sourceIds: ["a", "b"],
  parentIds: ["source-a", "source-b"], pipelineId: null, executedDefinition: null, rowCount: 3,
  columns: [{ name: "id", type: "INTEGER", nullable: false }], stepCount: 0, createdAt: "2026-11-04T12:00:01.000Z",
}];

const input = {
  projectId: "p1", title: "Resumen mensual",
  source: { sessionId: "session-1", versionId: "join-1", sourceId: "a", datasetName: "ventas.csv", rowCount: 3,
    columns: [{ name: "total", type: "DOUBLE", nullable: true }], lineage: { rootVersionId: "join-1", nodes: lineage } },
  parameters: { measure: "total", filters: [] },
  results: { description: { mean: 4.5, missing: 0 } },
};

describe("analysis snapshots", () => {
  it("copia una captura con procedencia y resultados, sin compartir referencias mutables", () => {
    const snapshot = createAnalysisSnapshot(input, new Date("2026-11-04T12:00:00Z"));
    input.results.description.mean = 10;
    expect(snapshot.createdAt).toBe("2026-11-04T12:00:00.000Z");
    expect((snapshot.results.description as { mean: number }).mean).toBe(4.5);
    expect(snapshot.source.versionId).toBe("join-1");
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

  it("captura todos los padres de JOIN/APPEND y copia las definiciones ejecutadas en orden topológico", () => {
    const pipeline = {
      ...sourceNode("pipeline-a", "a"), operationType: "pipeline" as const, name: "Filtrar · versión 1", parentIds: ["source-a"],
      pipelineId: "pipeline-1", executedDefinition: { id: "pipeline-1", name: "Filtrar", steps: [{ id: "filter-1", type: "filter" }] }, stepCount: 1,
    };
    const joined = { ...lineage[2], parentIds: ["pipeline-a", "source-b"] };
    const appended = { ...joined, versionId: "append-1", name: "Anexar · APPEND", operationType: "append" as const, parentIds: ["join-1", "source-b"] };
    const captured = captureSnapshotLineage("append-1", "p1", [sourceNode("source-a", "a"), sourceNode("source-b", "b"), pipeline, joined, appended]);
    const snapshot = createAnalysisSnapshot({ ...input, source: { ...input.source, versionId: "append-1", lineage: captured } });
    expect(captured.nodes.map((node) => node.versionId)).toEqual(["source-a", "pipeline-a", "source-b", "join-1", "append-1"]);
    expect(captured.nodes.find((node) => node.versionId === "join-1")?.parentIds).toEqual(["pipeline-a", "source-b"]);
    expect(captured.nodes.find((node) => node.versionId === "append-1")?.sourceIds).toEqual(["a", "b"]);
    expect(captured.nodes.find((node) => node.versionId === "pipeline-a")?.executedDefinition).toEqual(pipeline.executedDefinition);
    expect(validateAnalysisSnapshot(snapshot)).toBe(true);
  });

  it("rechaza linajes con padres ausentes o proyectos ajenos", () => {
    expect(() => captureSnapshotLineage("join-1", "p1", [sourceNode("source-a", "a"), { ...lineage[2], projectId: "p2" }])).toThrow(/padre/);
    const invalid = createAnalysisSnapshot(input);
    invalid.source.lineage.nodes[2].parentIds = ["missing"];
    expect(validateAnalysisSnapshot(invalid)).toBe(false);
  });

  it("aplica el límite de linaje durante el recorrido de cadenas largas", () => {
    const chain: SnapshotVersionReference[] = [sourceNode("v0", "a")];
    for (let index = 1; index <= 257; index += 1) {
      chain.push({ ...sourceNode(`v${index}`, "a"), operationType: "pipeline", parentIds: [`v${index - 1}`], stepCount: 1 });
    }
    expect(() => captureSnapshotLineage("v257", "p1", chain)).toThrow(/256 versiones/);
  });
});
