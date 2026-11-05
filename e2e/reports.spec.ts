import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { validateAnalysisSnapshot } from "../src/modules/analysis/snapshots";

test("permite crear un informe local y exportar HTML imprimible", async ({ page }) => {
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & {
      __holdReportQueries?: boolean;
      __delayedReportCallbacks?: Array<() => void>;
      __releaseReportQueries?: () => void;
    };
    browserWindow.__delayedReportCallbacks = [];
    browserWindow.__releaseReportQueries = () => {
      browserWindow.__holdReportQueries = false;
      for (const release of browserWindow.__delayedReportCallbacks ?? []) release();
      browserWindow.__delayedReportCallbacks = [];
    };
    const originalGetAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      const request = originalGetAll.apply(this, args);
      if (!browserWindow.__holdReportQueries || !["reports", "snapshots"].includes(this.objectStore.name)) return request;
      return new Proxy(request, {
        get(target, property) {
          if (property === "onsuccess") return null;
          return Reflect.get(target, property, target);
        },
        set(target, property, value) {
          if (property === "onsuccess") {
            target.addEventListener("success", (event) => {
              browserWindow.__delayedReportCallbacks?.push(() => value.call(target, event));
            }, { once: true });
            return true;
          }
          return Reflect.set(target, property, value);
        },
      });
    };
  });
  await page.goto("/");
  const project = `Reports-${Date.now()}`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${project}`)).toBeVisible({ timeout: 15_000 });
  const projectId = await page.evaluate(() => localStorage.getItem("df-active-project"));
  expect(projectId).toBeTruthy();
  const snapshotRecord = {
    id: "snapshot-e2e", projectId: projectId!, createdAt: "2026-11-05T00:00:00.000Z", title: "Ventas guardadas",
    source: {
      sessionId: "session-e2e", versionId: "version-e2e", sourceId: "source-e2e", datasetName: "Ventas",
      rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
      lineage: { rootVersionId: "version-e2e", nodes: [{
        versionId: "version-e2e", projectId: projectId!, name: "Ventas", operationType: "source" as const, sourceIds: ["source-e2e"], parentIds: [],
        pipelineId: null, executedDefinition: null, rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
        stepCount: 0, createdAt: "2026-11-05T00:00:00.000Z",
      }] },
    },
    parameters: { x: "canal" },
    results: {
      description: { column: "ventas", valid: 2, mean: 15 },
      chart: { title: "Ventas por canal", kind: "bar", points: [{ label: "web", value: 20 }, { label: "tienda", value: 10 }] },
    },
  };
  expect(validateAnalysisSnapshot(snapshotRecord)).toBe(true);
  await page.evaluate(async (snapshotRecord) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-analysis-snapshots", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("snapshots", { keyPath: ["projectId", "id"] });
        store.createIndex("by-project", "projectId", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").add(snapshotRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, snapshotRecord);
  const seededCount = await page.evaluate(async (projectId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-analysis-snapshots", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction("snapshots", "readonly").objectStore("snapshots").index("by-project").count(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  }, projectId!);
  expect(seededCount).toBe(1);

  await page.getByRole("button", { name: /^informes$/i }).click();
  await expect(page.getByText("Todavía no hay informes.")).toBeVisible();
  await page.getByRole("button", { name: /nuevo informe/i }).click();
  await page.getByLabel(/título del informe/i).fill("Resumen de prueba");
  await page.getByRole("button", { name: /^actualizar$/i }).click();
  await expect(page.getByLabel(/agregar snapshot guardado/i).locator('option[value="snapshot-e2e"]')).toHaveCount(1);
  await expect(page.getByLabel(/título del informe/i)).toHaveValue("Resumen de prueba");
  await page.getByLabel(/agregar snapshot guardado/i).selectOption("snapshot-e2e");
  await expect(page.getByText("Ventas por canal")).toBeVisible();
  await expect(page.getByText(/Linaje de 1 versiones/)).toBeVisible();
  await page.getByRole("button", { name: /\+ observaciones/i }).click();
  await page.getByRole("textbox", { name: "Observaciones" }).fill("Revisar el comportamiento del trimestre.");
  await page.getByRole("button", { name: /^guardar$/i }).click();
  await expect(page.getByRole("status")).toContainText("guardado en este dispositivo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /exportar html/i }).click();
  const download = await downloadPromise;
  const contents = await readFile(await download.path(), "utf8");
  expect(contents).toContain("Resumen de prueba");
  expect(contents).toContain("window.print()");
  expect(contents).toContain("Ventas por canal");
  expect(contents).toContain("<svg");
  expect(contents).toContain("source-e2e");
  expect(contents).toContain("Revisar el comportamiento del trimestre.");

  // Hold project A's load, switch to B while ReportsView stays mounted, then
  // release both responses. A's late result must never appear in B's workspace.
  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.evaluate(() => {
    (window as typeof window & { __holdReportQueries?: boolean }).__holdReportQueries = true;
  });
  await page.getByRole("button", { name: /^informes$/i }).click();
  await page.waitForFunction(() => (window as typeof window & { __delayedReportCallbacks?: unknown[] }).__delayedReportCallbacks?.length === 2);
  await page.getByRole("button", { name: /^inicio$/i }).click();
  const otherProject = `${project}-other`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(otherProject);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${otherProject}`)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^informes$/i }).click();
  await expect(page.getByText(/Cargando informes de este proyecto/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^guardar$/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /exportar html/i })).toBeDisabled();
  await expect(page.getByText("Resumen de prueba", { exact: true })).toHaveCount(0);
  await page.waitForFunction(() => (window as typeof window & { __delayedReportCallbacks?: unknown[] }).__delayedReportCallbacks?.length === 4);
  await page.evaluate(() => (window as typeof window & { __releaseReportQueries?: () => void }).__releaseReportQueries?.());
  await expect(page.getByText("Todavía no hay informes.")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.getByRole("radio", { name: `Abrir ${project}`, exact: true }).check();
  await expect(page.getByText(`Proyecto: ${project}`)).toBeVisible();
  await page.getByRole("button", { name: /^informes$/i }).click();
  await expect(page.getByRole("button", { name: "Resumen de prueba" })).toBeVisible();
});
