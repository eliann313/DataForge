import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("exporta e importa snapshots e informes sin incluir ni asociar la fuente", async ({ page }) => {
  await page.goto("/");
  const projectName = `Portable-${Date.now()}`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(projectName);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${projectName}`)).toBeVisible({ timeout: 15_000 });
  const sourceProjectId = await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<Array<{ id: string; name: string }>>((resolve, reject) => {
      const tx = db.transaction("projects", "readonly");
      const request = tx.objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return projects.find((project) => project.name === name)?.id ?? null;
  }, projectName);
  expect(sourceProjectId).toBeTruthy();

  await page.evaluate(async (projectId) => {
    const snapshotDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-analysis-snapshots", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("snapshots", { keyPath: ["projectId", "id"] });
        store.createIndex("by-project", "projectId", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = snapshotDb.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").add({
        id: "snapshot-portable-e2e", projectId, createdAt: "2026-11-05T00:00:00.000Z", title: "Ventas guardadas",
        source: {
          sessionId: "session-historica", versionId: "version-final", sourceId: "source-ventas", datasetName: "Ventas",
          rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
          lineage: { rootVersionId: "version-final", nodes: [
            {
              versionId: "version-source", projectId, name: "Ventas.csv", operationType: "source", sourceIds: ["source-ventas"], parentIds: [],
              pipelineId: null, executedDefinition: null, rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
              stepCount: 0, createdAt: "2026-11-05T00:00:00.000Z",
            },
            {
              versionId: "version-final", projectId, name: "Ventas preparadas", operationType: "pipeline", sourceIds: ["source-ventas"], parentIds: ["version-source"],
              pipelineId: "pipeline-ventas", executedDefinition: { steps: [{ id: "dedup", type: "deduplicate" }] }, rowCount: 2,
              columns: [{ name: "canal", type: "VARCHAR", nullable: false }], stepCount: 1, createdAt: "2026-11-05T00:00:00.000Z",
            },
          ] },
        },
        parameters: { dimension: "canal" },
        results: { chart: { title: "Ventas por canal", kind: "bar", points: [{ label: "web", value: 20 }] } },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    snapshotDb.close();

    const reportDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-reports", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("reports", { keyPath: ["projectId", "id"] });
        store.createIndex("by-project", "projectId", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = reportDb.transaction("reports", "readwrite");
      tx.objectStore("reports").add({
        id: "report-portable-e2e", projectId, title: "Informe portátil", createdAt: "2026-11-05T00:00:00.000Z",
        updatedAt: "2026-11-05T00:00:00.000Z",
        sections: [{ id: "section-snapshot", kind: "snapshot", title: "Ventas", snapshotId: "snapshot-portable-e2e" }],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    reportDb.close();
  }, sourceProjectId!);

  const row = page.locator("li", { hasText: projectName }).last();
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: /descargar respaldo/i }).click();
  const download = await downloadPromise;
  const backupText = await readFile(await download.path(), "utf8");
  const backup = JSON.parse(backupText) as {
    contents: Record<string, boolean>;
    analysisSnapshots: Array<{ projectId: string; source: { sessionId: string; lineage: { nodes: Array<{ projectId: string; versionId: string }> } } }>;
    reports: Array<{ projectId: string; sections: Array<{ snapshotId?: string }> }>;
  };
  expect(backup.contents.datasetBytes).toBe(false);
  expect(backup.contents.datasetVersions).toBe(false);
  expect(backup.contents.analysisSnapshots).toBe(true);
  expect(backup.contents.reports).toBe(true);
  expect(backup.analysisSnapshots[0].source.sessionId).toBe("session-historica");
  expect(backup.reports[0].sections[0].snapshotId).toBe("snapshot-portable-e2e");

  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: "proyecto.dataforge.json",
    mimeType: "application/json",
    buffer: await readFile(await download.path()),
  });
  await expect(page.getByRole("heading", { name: "Proyectos (2)" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`Proyecto: ${projectName}`).last()).toBeVisible({ timeout: 15_000 });
  const projectIds = await page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<Array<{ id: string; name: string }>>((resolve, reject) => {
      const tx = db.transaction("projects", "readonly");
      const request = tx.objectStore("projects").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return projects.filter((project) => project.name === name).map((project) => project.id);
  }, projectName);
  expect(projectIds).toHaveLength(2);
  const importedProjectId = projectIds.find((id) => id !== sourceProjectId);
  expect(importedProjectId).toBeTruthy();
  expect(importedProjectId).not.toBe(sourceProjectId);
  const restored = await page.evaluate(async (projectId) => {
    const read = async (dbName: string, storeName: string, id: string) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get([projectId, id]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return row;
    };
    return {
      snapshot: await read("dataforge-analysis-snapshots", "snapshots", "snapshot-portable-e2e"),
      report: await read("dataforge-reports", "reports", "report-portable-e2e"),
    };
  }, importedProjectId!);
  expect(restored.snapshot).toMatchObject({ projectId: importedProjectId, source: { sessionId: "session-historica", versionId: "version-final" } });
  expect((restored.snapshot as { source: { lineage: { nodes: Array<{ projectId: string }> } } }).source.lineage.nodes.every((node) => node.projectId === importedProjectId)).toBe(true);
  expect(restored.report).toMatchObject({ projectId: importedProjectId, sections: [{ snapshotId: "snapshot-portable-e2e" }] });
  await page.getByRole("button", { name: "Informes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Informes" })).toBeVisible();
  await expect(page.getByText("Linaje de 2 versiones y todas sus fuentes")).toBeVisible();
  await expect(page.getByText("Ventas por canal")).toBeVisible();

  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  const activeProjectId = await page.evaluate(() => localStorage.getItem("df-active-project"));
  expect(activeProjectId).toBe(importedProjectId);
  const importedProjectRow = page.locator("li").filter({ has: page.locator('input[type="radio"]:checked') });
  await expect(importedProjectRow).toContainText(projectName);
  await importedProjectRow.getByRole("button", { name: "Eliminar" }).click();
  const confirmation = page.getByRole("dialog", { name: "Eliminar proyecto" });
  await expect(confirmation).toContainText(/artefactos guardados en este dispositivo se eliminarán/);
  await confirmation.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("heading", { name: "Proyectos (1)" })).toBeVisible({ timeout: 15_000 });
  const remaining = await page.evaluate(async (projectId) => {
    const keys = async (dbName: string, storeName: string) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).index("by-project").getAllKeys(IDBKeyRange.only(projectId));
        request.onsuccess = () => resolve(request.result.length);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result;
    };
    return {
      snapshots: await keys("dataforge-analysis-snapshots", "snapshots"),
      reports: await keys("dataforge-reports", "reports"),
      definitions: await keys("dataforge-pipelines", "definitions"),
    };
  }, importedProjectId!);
  expect(remaining).toEqual({ snapshots: 0, reports: 0, definitions: 0 });
  const sourceStillIntact = await page.evaluate(async (projectId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-reports", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction("reports", "readonly");
      const request = tx.objectStore("reports").index("by-project").getAllKeys(IDBKeyRange.only(projectId));
      request.onsuccess = () => resolve(request.result.length);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  }, sourceProjectId!);
  expect(sourceStillIntact).toBe(1);
});
