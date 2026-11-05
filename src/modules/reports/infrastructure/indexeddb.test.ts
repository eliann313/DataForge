import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createReport } from "../domain/report";
import { IndexedDBReportRepository } from "./indexeddb";

const repositories: IndexedDBReportRepository[] = [];
function repository() {
  const repo = new IndexedDBReportRepository();
  repositories.push(repo);
  return repo;
}

afterEach(() => {
  repositories.forEach((repo) => repo.close());
});

describe("IndexedDBReportRepository", () => {
  it("stores definitions isolated by project and retains only snapshot references", async () => {
    const repo = repository();
    const report = createReport("project-a", "Ventas");
    report.sections = [{ id: "s1", kind: "snapshot", title: "Análisis", snapshotId: "snapshot-1" }];
    await repo.save(report);
    const sameIdOtherProject = { ...report, projectId: "project-b", title: "Otro informe" };
    await repo.save(sameIdOtherProject);
    expect(await repo.list("project-a")).toEqual([report]);
    expect(await repo.list("project-b")).toEqual([sameIdOtherProject]);
    await repo.delete("project-a", report.id);
    expect(await repo.list("project-a")).toEqual([]);
    expect(await repo.list("project-b")).toEqual([sameIdOtherProject]);

    const more = createReport("project-a", "Otra página");
    await repo.save(more);
    await repo.deleteProject("project-a");
    expect(await repo.list("project-a")).toEqual([]);
    expect(await repo.list("project-b")).toEqual([sameIdOtherProject]);
  });

  it("rejects malformed records instead of returning a partial list", async () => {
    const repo = repository();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-reports", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("reports", "readwrite");
      tx.objectStore("reports").put({ id: "broken", projectId: "project-x" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await expect(repo.list("project-x")).rejects.toThrow("dañado");
  });
});
