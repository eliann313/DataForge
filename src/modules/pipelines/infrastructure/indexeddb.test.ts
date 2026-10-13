import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDBPipelineDefinitionRepository } from "./indexeddb";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("dataforge-pipelines");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("No se pudo borrar la base de prueba."));
    req.onblocked = () => reject(new Error("La base de prueba sigue abierta."));
  });
}

describe("adaptador IndexedDB de definiciones de pipelines", () => {
  beforeEach(async () => {
    await deleteDatabase();
  });

  it("recupera definiciones guardadas, las separa por proyecto y elimina por clave", async () => {
    const first = new IndexedDBPipelineDefinitionRepository();
    const second = new IndexedDBPipelineDefinitionRepository();
    const definition = {
      id: "pipeline-1",
      name: "Preparación",
      steps: [{ id: "d1", type: "deduplicate" as const }],
    };
    const other = { ...definition, id: "pipeline-2", name: "Ordenar" };

    await first.save("project-1", definition);
    await first.save("project-1", other);
    await first.save("project-2", definition);
    first.close();

    expect(await second.list("project-1")).toEqual([other, definition]);
    expect(await second.list("project-2")).toEqual([definition]);
    await second.delete("project-1", definition.id);
    expect(await second.list("project-1")).toEqual([other]);
    second.close();
  });

  it("rechaza y reporta una definición persistida con estructura desconocida", async () => {
    const repo = new IndexedDBPipelineDefinitionRepository();
    await repo.save("project-1", {
      id: "valid",
      name: "Válida",
      steps: [{ id: "d1", type: "deduplicate" }],
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("dataforge-pipelines", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("definitions", "readwrite");
    tx.objectStore("definitions").put({
      projectId: "project-1",
      id: "broken",
      definition: { id: "broken", name: "Rota", steps: [{ id: "s1", type: "sql" }] },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await expect(repo.list("project-1")).rejects.toThrow(/definición guardada dañada/);
    repo.close();
  });
});
