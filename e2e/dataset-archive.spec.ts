import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm/node";

test("respaldo .dfdataset exporta/importa versiones y rechaza un payload alterado antes de escribir", async ({ page }) => {
  test.setTimeout(120_000);
  const project = `Respaldo datasets ${Date.now()}`;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(project, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  const csv = "id,importe\n1,19.50\n2,82.75\n2,82.75\n";
  await page.locator("#csv-file").setInputFiles({ name: "respaldo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("respaldo.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /eliminar duplicados/i }).click();
  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  await expect(page.locator('section[aria-labelledby="pipeline-versiones"]').getByText(/Preparación · versión 1/)).toBeVisible({ timeout: 30_000 });
  const derived = page.locator('section[aria-labelledby="pipeline-versiones"]').getByRole("row").filter({ hasText: "Preparación" });
  const parquetPromise = page.waitForEvent("download");
  await derived.getByRole("button", { name: /Copia portable.*Parquet/ }).click();
  const parquetDownload = await parquetPromise;
  const parquetTable = tableFromIPC(readParquet(new Uint8Array(await readFile(await parquetDownload.path()))).intoIPCStream());
  expect(parquetTable.numRows).toBe(2);

  await page.getByRole("button", { name: /^inicio$/i }).click();
  const projectRow = page.getByRole("listitem").filter({ hasText: project });
  const downloadPromise = page.waitForEvent("download");
  await projectRow.getByRole("button", { name: /descargar datasets/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.dfdataset$/);
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();
  const archiveBytes = new Uint8Array(await readFile(archivePath!));
  const manifestLength = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(archiveBytes.slice(12, 12 + manifestLength))) as { versions: Array<{ name: string; operationType: string; byteLength: number; rowCount: number }> };
  let payloadOffset = 12 + manifestLength;
  for (const version of manifest.versions) {
    const payload = archiveBytes.slice(payloadOffset, payloadOffset + version.byteLength);
    expect(tableFromIPC(readParquet(payload).intoIPCStream()).numRows, version.name).toBe(version.rowCount);
    if (version.operationType === "pipeline") {
      await page.getByRole("button", { name: /^datos$/i }).click();
      await page.locator("#csv-file").setInputFiles({ name: "derivada.parquet", mimeType: "application/octet-stream", buffer: Buffer.from(payload) });
      await page.getByRole("button", { name: /importar archivo/i }).click();
      await expect(page.getByText("derivada.parquet: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: /^inicio$/i }).click();
    }
    payloadOffset += version.byteLength;
  }

  await page.reload();
  await page.getByRole("button", { name: /^inicio$/i }).click();
  const restoredProject = page.getByRole("listitem").filter({ hasText: project });
  const original = archiveBytes;
  const tampered = Uint8Array.from(original);
  tampered[tampered.length - 1] ^= 0xff;
  await restoredProject.locator('input[type="file"]').setInputFiles({ name: "alterado.dfdataset", mimeType: "application/vnd.dataforge.dataset-archive", buffer: Buffer.from(tampered) });
  await page.getByRole("button", { name: "Importar datasets", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(/checksum/i, { timeout: 30_000 });

  await restoredProject.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: "application/vnd.dataforge.dataset-archive", buffer: Buffer.from(original) });
  await page.getByRole("button", { name: "Importar datasets", exact: true }).click();
  const importMessage = page.getByText(/^Se importaron 2 versiones/);
  await expect(importMessage).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(page.locator('section[aria-labelledby="datasets-sesion"]')).toContainText("respaldo.csv", { timeout: 30_000 });
  const preview = page.locator("table.df-table").last();
  await expect(preview.getByRole("cell", { name: "19.5", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "82.75", exact: true })).toBeVisible();
  await expect(page.getByText("Vista previa (página 1 de 1 · 2 de 2 filas)")).toBeVisible();
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const restoredVersions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(restoredVersions.getByText(/Preparación · versión 1/)).toBeVisible();
  await expect(restoredVersions.getByRole("row").filter({ hasText: "Preparación" }).getByRole("cell").nth(3)).toContainText("respaldo.csv");
  await page.getByRole("button", { name: /^datos$/i }).click();
  const sources = page.locator('section[aria-labelledby="datasets-sesion"]');
  page.once("dialog", (dialog) => void dialog.accept());
  await sources.getByRole("button", { name: /quitar de la sesión/i }).click();
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await expect(page.getByRole("heading", { name: "Crea tu primer pipeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar archivo" })).toBeVisible();
});

test("restaura el linaje materializado de APPEND y JOIN con varias fuentes", async ({ page }) => {
  test.setTimeout(120_000);
  const project = `Respaldo grafo ${Date.now()}`;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(project, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "origen-a.csv", mimeType: "text/csv", buffer: Buffer.from("id,valor\n1,10\n2,20\n"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("origen-a.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "origen-b.csv", mimeType: "text/csv", buffer: Buffer.from("customer_id,region\n1,Norte\n2,Sur\n"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("origen-b.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const combinations = page.locator('section[aria-labelledby="combinaciones-datasets"]');
  await combinations.getByLabel("Fuente izquierda").selectOption({ label: "origen-a.csv · 2 filas" });
  await combinations.getByLabel("Fuente derecha").selectOption({ label: "origen-b.csv · 2 filas" });
  await combinations.getByRole("button", { name: /vista previa append/i }).click();
  await expect(combinations.locator('section[aria-labelledby="append-vista-previa"]').getByText(/resultado: 4/)).toBeVisible({ timeout: 30_000 });
  await combinations.getByRole("button", { name: /crear versión append/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText(/Anexar fuentes · APPEND/)).toBeVisible({ timeout: 30_000 });

  await combinations.getByRole("button", { name: /^join$/i }).click();
  await combinations.getByLabel("Fuente izquierda").selectOption({ label: "origen-a.csv · 2 filas" });
  await combinations.getByLabel("Fuente derecha").selectOption({ label: "origen-b.csv · 2 filas" });
  await combinations.getByLabel("Tipo de JOIN").selectOption("inner");
  await combinations.getByLabel("Cardinalidad del JOIN").selectOption("one-to-one");
  await combinations.getByRole("button", { name: /agregar par de claves/i }).click();
  await combinations.getByLabel("Clave izquierda JOIN 1").selectOption("id");
  await combinations.getByLabel("Clave derecha JOIN 1").selectOption("customer_id");
  await combinations.getByRole("button", { name: /vista previa join/i }).click();
  await expect(combinations.locator('section[aria-labelledby="join-vista-previa"]').getByText(/resultado: 2/)).toBeVisible({ timeout: 30_000 });
  await combinations.getByRole("button", { name: /crear versión join/i }).click();
  await expect(versions.getByText(/Relacionar fuentes · JOIN/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^inicio$/i }).click();
  const projectRow = page.getByRole("listitem").filter({ hasText: project });
  const downloadPromise = page.waitForEvent("download");
  await projectRow.getByRole("button", { name: /descargar datasets/i }).click();
  const download = await downloadPromise;
  const archiveBytes = new Uint8Array(await readFile((await download.path())!));
  const manifestLength = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(archiveBytes.slice(12, 12 + manifestLength))) as {
    versions: Array<{ name: string; operationType: string; sourceRefs: string[]; parentRefs: string[] }>;
  };
  const append = manifest.versions.find((item) => item.operationType === "append");
  const join = manifest.versions.find((item) => item.operationType === "join");
  expect(append?.sourceRefs).toHaveLength(2);
  expect(append?.parentRefs).toHaveLength(2);
  expect(join?.sourceRefs).toHaveLength(2);
  expect(join?.parentRefs).toHaveLength(2);

  await page.reload();
  const restoredProject = page.getByRole("listitem").filter({ hasText: project });
  await restoredProject.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: "application/vnd.dataforge.dataset-archive", buffer: Buffer.from(archiveBytes),
  });
  await page.getByRole("button", { name: "Importar datasets", exact: true }).click();
  await expect(page.getByText(/^Se importaron 4 versiones/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const restoredVersions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  const restoredAppend = restoredVersions.getByRole("row").filter({ hasText: "Anexar fuentes" });
  const restoredJoin = restoredVersions.getByRole("row").filter({ hasText: "Relacionar fuentes" });
  await expect(restoredAppend).toContainText("origen-a.csv + origen-b.csv");
  await expect(restoredJoin).toContainText("origen-a.csv + origen-b.csv");
  await expect(restoredVersions.getByRole("row")).toHaveCount(5);

  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(page.locator('section[aria-labelledby="datasets-sesion"]')).toContainText("origen-a.csv");
  await expect(page.locator('section[aria-labelledby="datasets-sesion"]')).toContainText("origen-b.csv");
  await expect(page.locator("h3").filter({ hasText: /^Vista previa \(página 1 de 1 · 2 de 2 filas\)$/ })).toBeVisible();
  const restoredJoinPreview = page.locator("table.df-table").last();
  await expect(restoredJoinPreview.getByRole("row")).toHaveCount(3);
  await expect(restoredJoinPreview.getByRole("cell", { name: "10", exact: true })).toBeVisible();
  await expect(restoredJoinPreview.getByRole("cell", { name: "Norte", exact: true })).toBeVisible();
  await expect(restoredJoinPreview.getByRole("cell", { name: "20", exact: true })).toBeVisible();
  await expect(restoredJoinPreview.getByRole("cell", { name: "Sur", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const restoredAppendRow = page.locator('section[aria-labelledby="pipeline-versiones"]').getByRole("row").filter({ hasText: "Anexar fuentes" });
  await restoredAppendRow.getByRole("button", { name: "Usar versión" }).click();
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(page.locator("h3").filter({ hasText: /^Vista previa \(página 1 de 1 · 4 de 4 filas\)$/ })).toBeVisible();
  const restoredAppendPreview = page.locator("table.df-table").last();
  await expect(restoredAppendPreview.getByRole("row")).toHaveCount(5);
  const restoredAppendRows = (await restoredAppendPreview.getByRole("row").allTextContents()).join(" ");
  for (const value of ["1", "2", "10", "20"]) {
    expect(restoredAppendRows).toContain(value);
  }
});
