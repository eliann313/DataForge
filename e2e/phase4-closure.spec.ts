import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("importa, transforma, compara períodos y exporta la versión derivada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "periodos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,fecha,importe\n1,2024-01-01,100\n2,2024-01-31,50\n1,2024-02-01,120\n3,2024-02-29,25\n"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("periodos.csv: 4 filas, 3 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /calcular columna/i }).click();
  await page.getByRole("button", { name: /^vista previa$/i }).click();
  await expect(page.locator('section[aria-labelledby="pipeline-vista-previa"]').getByRole("columnheader", { name: "id_calculado" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText("Preparación · versión 1 (activa)")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Primera versión para comparar").selectOption({ label: "Preparación · versión 1" });
  await page.getByLabel("Segunda versión para comparar").selectOption({ label: "Preparación · versión 1" });
  await page.getByLabel("Columna de fecha para períodos").selectOption("fecha");
  await page.getByLabel("Medida para períodos").selectOption("importe");
  await page.getByLabel("Primer período desde").fill("2024-01-01");
  await page.getByLabel("Primer período hasta").fill("2024-01-31");
  await page.getByLabel("Segundo período desde").fill("2024-02-01");
  await page.getByLabel("Segundo período hasta").fill("2024-02-29");
  await page.getByLabel("Clave para comparar períodos").selectOption("id");
  await page.getByLabel(/Confirmo que todos los valores/).check();
  await page.getByRole("button", { name: "Comparar períodos", exact: true }).click();
  const result = page.getByRole("table", { name: "Resultados por período" });
  await expect(result.getByRole("row", { name: /Suma exacta/ }).locator("td")).toHaveText(["150", "145"], { timeout: 30_000 });
  await expect(page.getByText("Claves agregadas: 1 · eliminadas: 1 · modificadas: 1 · sin cambios: 0")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await versions.getByRole("button", { name: "Exportar Preparación · versión 1 a CSV" }).click();
  const download = await downloadPromise;
  const content = await readFile(await download.path(), "utf8");
  expect(content).toContain("id_calculado");
  expect(content).toContain("2024-02-29");
  await expect(versions.getByText("Preparación · versión 1 (activa)")).toBeVisible();
});
