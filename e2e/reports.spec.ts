import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("permite crear un informe local y exportar HTML imprimible", async ({ page }) => {
  await page.goto("/");
  const project = `Reports-${Date.now()}`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${project}`)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async (projectId) => {
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
      tx.objectStore("snapshots").add({
        id: "snapshot-e2e", projectId, createdAt: "2026-11-05T00:00:00.000Z", title: "Ventas guardadas",
        source: {
          sessionId: "session-e2e", versionId: "version-e2e", sourceId: "source-e2e", datasetName: "Ventas",
          rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
          lineage: { rootVersionId: "version-e2e", nodes: [{
            versionId: "version-e2e", projectId, name: "Ventas", operationType: "source", sourceIds: ["source-e2e"], parentIds: [],
            pipelineId: null, executedDefinition: null, rowCount: 2, columns: [{ name: "canal", type: "VARCHAR", nullable: false }],
            stepCount: 0, createdAt: "2026-11-05T00:00:00.000Z",
          }] },
        },
        parameters: { x: "canal" },
        results: {
          description: { column: "ventas", valid: 2, mean: 15 },
          chart: { title: "Ventas por canal", kind: "bar", points: [{ label: "web", value: 20 }, { label: "tienda", value: 10 }] },
        },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, project);

  await page.getByRole("button", { name: /^informes$/i }).click();
  await page.getByRole("button", { name: /nuevo informe/i }).click();
  await page.getByLabel(/título del informe/i).fill("Resumen de prueba");
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
});
