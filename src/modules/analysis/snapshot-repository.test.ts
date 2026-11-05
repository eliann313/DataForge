import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createAnalysisSnapshot } from "./snapshots";
import { IndexedDBAnalysisSnapshotRepository } from "./snapshot-repository";

const database = "dataforge-analysis-snapshots";
async function reset() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(database);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database remains open"));
  });
}

function snapshot(projectId: string, versionId: string) {
  const base = (id: string, sourceId: string) => ({ versionId: id, projectId, name: `${sourceId}.csv`, operationType: "source" as const,
    sourceIds: [sourceId], parentIds: [], pipelineId: null, executedDefinition: null, rowCount: 2,
    columns: [{ name: "id", type: "INTEGER", nullable: false }], stepCount: 0, createdAt: "2026-11-04T12:00:00.000Z" });
  const versions = versionId === "v1" ? [base(versionId, "source-1")] : [base(versionId, "source-1")];
  return createAnalysisSnapshot({
    projectId, title: "Resumen",
    source: { sessionId: "session-test", versionId, sourceId: "source-1", datasetName: "ventas.csv", rowCount: 2, columns: [], lineage: { rootVersionId: versionId, nodes: versions } },
    parameters: { description: { column: "importe" } }, results: { description: { mean: 3 } },
  });
}

describe("IndexedDB analysis snapshots", () => {
  beforeEach(reset);

  it("recupera resultados luego de cerrar y aísla snapshots entre proyectos", async () => {
    const first = new IndexedDBAnalysisSnapshotRepository();
    const one = snapshot("p1", "v1");
    const other = snapshot("p2", "v2");
    await first.save(one);
    await first.save(other);
    first.close();

    const reopened = new IndexedDBAnalysisSnapshotRepository();
    expect(await reopened.list("p1")).toEqual([one]);
    expect(await reopened.findById("p2", one.id)).toBeNull();
    expect(await reopened.findById("p1", one.id)).toEqual(one);
    await expect(reopened.save({ ...one, title: "No sobrescribir" })).rejects.toThrow();
    const sameIdOtherProject = { ...one, projectId: "p2", source: { ...one.source, versionId: "other-version", lineage: {
      rootVersionId: "other-version", nodes: one.source.lineage.nodes.map((node) => ({ ...node, versionId: "other-version", projectId: "p2" })),
    } } };
    await reopened.save(sameIdOtherProject);
    expect(await reopened.findById("p2", one.id)).toEqual(sameIdOtherProject);
    await reopened.delete("p2", one.id);
    expect(await reopened.list("p1")).toEqual([one]);
    reopened.close();
  });

  it("rechaza un registro persistido dañado y no entrega una lista parcial", async () => {
    const repo = new IndexedDBAnalysisSnapshotRepository();
    const valid = snapshot("p1", "v1");
    await repo.save(valid);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put({ ...valid, id: "broken", results: {} });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await expect(repo.list("p1")).rejects.toThrow(/snapshots dañados/);
    repo.close();
  });
});
