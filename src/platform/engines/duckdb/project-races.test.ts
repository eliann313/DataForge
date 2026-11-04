import { describe, expect, it, vi } from "vitest";
import { DuckDBManager } from "./manager";
import type { AppendDefinition, JoinDefinition } from "../../../modules/datasets";

const columns = [{ name: "id", type: "INTEGER", nullable: false }];
const row = (value: number) => ({ toArray: () => [{ toJSON: () => ({ n: value }) }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function source(id: string, projectId: string) {
  return {
    id, sourceId: id, sourceIds: [id], projectId, name: `${id}.csv`,
    parentId: null, parentIds: [], operationType: "source", pipelineId: null,
    rowCount: 1, columns, stepCount: 0, createdAt: "2026-01-01T00:00:00.000Z",
    tableName: `table_${id}`, isView: false,
  };
}
function setup(query: (sql: string) => Promise<ReturnType<typeof row>> = async () => row(0)) {
  const manager = new DuckDBManager();
  Object.assign(manager, {
    status: "ready", currentProjectId: "a", activeTable: "table_a1",
    activeVersionByProject: new Map([["a", "a1"], ["b", "b1"]]),
    versions: [source("a1", "a"), source("a2", "a"), source("b1", "b")],
    conn: { query },
    db: { registerFileBuffer: vi.fn(async () => {}), dropFile: vi.fn(async () => {}) },
    readSchema: vi.fn(async () => columns), readCount: vi.fn(async () => 1),
  });
  return manager;
}
function expectProjectB(manager: DuckDBManager) {
  expect(manager.getCurrentProjectId()).toBe("b");
  expect(manager.getActiveDatasetVersionId()).toBe("b1");
  expect(manager.getDatasetVersions().map((version) => version.id)).toEqual(["b1"]);
}

describe("operaciones en vuelo al cambiar de proyecto", () => {
  it("valida períodos, unidad y aislamiento antes de ejecutar consultas", async () => {
    const query = vi.fn(async () => row(0));
    const manager = setup(query);
    const periodColumns = [
      { name: "fecha", type: "DATE", nullable: false },
      { name: "importe", type: "DECIMAL(10,2)", nullable: false },
      { name: "id", type: "INTEGER", nullable: false },
    ];
    Object.assign(manager, { versions: [{ ...source("a1", "a"), columns: periodColumns }, { ...source("a2", "a"), columns: [...periodColumns, { name: "extra", type: "VARCHAR", nullable: true }] }, source("b1", "b")] });
    const request = { leftVersionId: "a1", rightVersionId: "a1", dateColumn: "fecha", leftFrom: "2024-01-01", leftTo: "2024-01-31", rightFrom: "2024-02-01", rightTo: "2024-02-29", measureColumn: "importe", keyColumn: null, sameUnitsConfirmed: true };
    await expect(manager.comparePeriods({ ...request, sameUnitsConfirmed: false })).rejects.toThrow(/misma unidad/);
    await expect(manager.comparePeriods({ ...request, leftFrom: "2024-02-30" })).rejects.toThrow(/períodos válidos/);
    await expect(manager.comparePeriods({ ...request, leftFrom: "2024-01-01' OR TRUE --" })).rejects.toThrow(/períodos válidos/);
    await expect(manager.comparePeriods({ ...request, measureColumn: "id" })).rejects.toThrow(/rol de medida/);
    await expect(manager.comparePeriods({ ...request, rightVersionId: "b1" })).rejects.toThrow(/proyecto activo/);
    await expect(manager.comparePeriods({ ...request, rightVersionId: "a2", keyColumn: "id" })).rejects.toThrow(/esquemas idénticos/);
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue(row(1));
    await expect(manager.comparePeriods(request)).rejects.toThrow(/precisión numérica segura/);
  });
  it("conserva una copia de la definición ejecutada para repetirla sin mutar el linaje", async () => {
    const manager = setup();
    const definition = { id: "p", name: "Preparar", steps: [{ id: "step-1", type: "deduplicate" as const }] };
    const created = await manager.executePipeline("a1", definition);
    definition.name = "Cambiado";
    definition.steps[0].id = "otro";
    if (created.executedDefinition) created.executedDefinition.name = "Mutado desde afuera";
    const saved = manager.getDatasetVersions().find((version) => version.id === created.id);
    expect(saved?.executedDefinition).toEqual({ id: "p", name: "Preparar", steps: [{ id: "step-1", type: "deduplicate" }] });
  });
  it("guarda roles editados por versión y conserva las sugerencias de otras versiones", async () => {
    const manager = setup();
    expect(manager.getSemanticRoles().id).toBe("identificador");
    manager.setSemanticRole("id", "medida");
    expect(manager.getSemanticRoles().id).toBe("medida");
    await manager.activateDatasetVersion("a2");
    expect(manager.getSemanticRoles().id).toBe("identificador");
    manager.selectProject("b");
    expect(manager.getSemanticRoles().id).toBe("identificador");
    manager.selectProject("a");
    await manager.activateDatasetVersion("a1");
    expect(manager.getSemanticRoles().id).toBe("medida");
    expect(() => manager.setSemanticRole("ausente", "medida")).toThrow();
  });

  it("impide resúmenes y correlaciones de identificadores hasta declararlos medida", async () => {
    const query = vi.fn(async () => row(0));
    const manager = setup(query);
    await expect(manager.describeNumeric("id")).rejects.toThrow(/medida numérica/);
    await expect(manager.summarizeNumeric("id")).rejects.toThrow(/medida numérica/);
    await expect(manager.histogram("id")).rejects.toThrow(/medida numérica/);
    await expect(manager.correlation("id", "id")).rejects.toThrow(/medida numérica/);
    await expect(manager.groupedStat("id", "id", "mean")).rejects.toThrow(/medida numérica/);
    expect(query).not.toHaveBeenCalled();
    manager.setSemanticRole("id", "medida");
    await manager.describeNumeric("id");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("COUNT(*) AS total"));
  });
  it.each(["csv", "json", "parquet"] as const)("importa %s en el proyecto inicial aunque cambie durante la lectura", async (format) => {
    const manager = setup();
    const bytes = deferred<ArrayBuffer>();
    const file = { name: `archivo.${format}`, size: 16, arrayBuffer: () => bytes.promise } as File;
    const operation = format === "csv" ? manager.importCSV(file)
      : format === "json" ? manager.importJSON(file) : manager.importParquet(file);
    manager.selectProject("b");
    bytes.resolve(new TextEncoder().encode(format === "json" ? '[{"id":1}]' : "id\n1\n").buffer);
    const summary = await operation;
    expect(summary.projectId).toBe("a");
    expectProjectB(manager);
    manager.selectProject("a");
    expect(manager.getActiveDatasetVersionId()).toBe(summary.versionId);
  });

  it("conserva el proyecto al finalizar la materialización de una hoja", async () => {
    const entered = deferred<void>();
    const gate = deferred<void>();
    const manager = setup(async (sql) => {
      if (sql.startsWith("CREATE OR REPLACE TABLE")) {
        entered.resolve();
        await gate.promise;
      }
      return row(0);
    });
    const operation = manager.importCSVText("hoja.xlsx#Hoja1", "id\n1\n");
    await entered.promise;
    manager.selectProject("b");
    gate.resolve();
    const summary = await operation;
    expect(summary.projectId).toBe("a");
    expectProjectB(manager);
    manager.selectProject("a");
    expect(manager.getActiveDatasetVersionId()).toBe(summary.versionId);
  });

  it("mantiene el proyecto visible cuando termina un pipeline", async () => {
    const gate = deferred<void>();
    const query = vi.fn(async (sql: string) => { if (sql.startsWith("CREATE VIEW")) await gate.promise; return row(0); });
    const manager = setup(query);
    const operation = manager.executePipeline("a1", { id: "p", name: "Preparación", steps: [{ id: "s", type: "deduplicate" }] });
    manager.selectProject("b");
    gate.resolve();
    const version = await operation;
    expect(version.projectId).toBe("a");
    expectProjectB(manager);
    manager.selectProject("a");
    expect(manager.getActiveDatasetVersionId()).toBe(version.id);
  });

  it.each(["append", "join"] as const)("mantiene el proyecto visible cuando termina %s", async (kind) => {
    const gate = deferred<void>();
    let blocked = false;
    const query = vi.fn(async (sql: string) => {
      if (!blocked && (kind === "join" ? sql.startsWith("SELECT COUNT(*)") : sql.startsWith("CREATE VIEW"))) {
        blocked = true;
        await gate.promise;
      }
      return row(0);
    });
    const manager = setup(query);
    const append: AppendDefinition = { id: "c", name: "Unión", leftVersionId: "a1", rightVersionId: "a2", columns: [{ outputName: "id", leftColumn: "id", rightColumn: "id" }] };
    const join: JoinDefinition = { id: "c", name: "Unión", leftVersionId: "a1", rightVersionId: "a2", joinType: "inner", cardinality: "many-to-one", confirmFanout: true, keys: [{ leftColumn: "id", rightColumn: "id" }], columns: [{ side: "left", column: "id", outputName: "id" }] };
    const operation = kind === "append" ? manager.executeAppend(append) : manager.executeJoin(join);
    manager.selectProject("b");
    gate.resolve();
    const version = await operation;
    expect(version.projectId).toBe("a");
    expectProjectB(manager);
    manager.selectProject("a");
    expect(manager.getActiveDatasetVersionId()).toBe(version.id);
  });
});
