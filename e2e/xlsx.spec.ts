import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Fixture XLSX autocontenido: dos hojas y una fórmula con valor almacenado 30.
// Evita depender del parser vulnerable para generar los archivos de prueba.
const TEST_WORKBOOK_BASE64 =
  "UEsDBBQAAAAAAAAAIQAHMLe4vAIAALwCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFR5cGVzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXMiPgo8RGVmYXVsdCBFeHRlbnNpb249InJlbHMiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtcGFja2FnZS5yZWxhdGlvbnNoaXBzK3htbCIvPgo8RGVmYXVsdCBFeHRlbnNpb249InhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3htbCIvPgo8T3ZlcnJpZGUgUGFydE5hbWU9Ii94bC93b3JrYm9vay54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC5zaGVldC5tYWluK3htbCIvPgo8T3ZlcnJpZGUgUGFydE5hbWU9Ii94bC93b3Jrc2hlZXRzL3NoZWV0MS54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQuc3ByZWFkc2hlZXRtbC53b3Jrc2hlZXQreG1sIi8+CjxPdmVycmlkZSBQYXJ0TmFtZT0iL3hsL3dvcmtzaGVldHMvc2hlZXQyLnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLndvcmtzaGVldCt4bWwiLz4KPC9UeXBlcz5QSwMEFAAAAAAAAAAhAH5vwIUqAQAAKgEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+CjxSZWxhdGlvbnNoaXAgSWQ9InJJZDEiIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvb2ZmaWNlRG9jdW1lbnQiIFRhcmdldD0ieGwvd29ya2Jvb2sueG1sIi8+CjwvUmVsYXRpb25zaGlwcz5QSwMEFAAAAAAAAAAhAC+DMXhKAQAASgEAAA8AAAB4bC93b3JrYm9vay54bWw8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+Cjx3b3JrYm9vayB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluIiB4bWxuczpyPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzIj4KPHNoZWV0cz48c2hlZXQgbmFtZT0iVmVudGFzIiBzaGVldElkPSIxIiByOmlkPSJySWQxIi8+PHNoZWV0IG5hbWU9Ik1ldGEiIHNoZWV0SWQ9IjIiIHI6aWQ9InJJZDIiLz48L3NoZWV0cz4KPC93b3JrYm9vaz5QSwMEFAAAAAAAAAAhAGZS8Ie5AQAAuQEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+CjxSZWxhdGlvbnNoaXAgSWQ9InJJZDEiIFR5cGU9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9vZmZpY2VEb2N1bWVudC8yMDA2L3JlbGF0aW9uc2hpcHMvd29ya3NoZWV0IiBUYXJnZXQ9IndvcmtzaGVldHMvc2hlZXQxLnhtbCIvPgo8UmVsYXRpb25zaGlwIElkPSJySWQyIiBUeXBlPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL3dvcmtzaGVldCIgVGFyZ2V0PSJ3b3Jrc2hlZXRzL3NoZWV0Mi54bWwiLz4KPC9SZWxhdGlvbnNoaXBzPlBLAwQUAAAAAAAAACEA9hYXKqoCAACqAgAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04IiBzdGFuZGFsb25lPSJ5ZXMiPz4KPHdvcmtzaGVldCB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3NwcmVhZHNoZWV0bWwvMjAwNi9tYWluIj48c2hlZXREYXRhPgo8cm93IHI9IjEiPjxjIHI9IkExIiB0PSJpbmxpbmVTdHIiPjxpcz48dD5pZDwvdD48L2lzPjwvYz48YyByPSJCMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+cHJvZHVjdG88L3Q+PC9pcz48L2M+PGMgcj0iQzEiIHQ9ImlubGluZVN0ciI+PGlzPjx0PmltcG9ydGU8L3Q+PC9pcz48L2M+PC9yb3c+Cjxyb3cgcj0iMiI+PGMgcj0iQTIiPjx2PjE8L3Y+PC9jPjxjIHI9IkIyIiB0PSJpbmxpbmVTdHIiPjxpcz48dD5wYW48L3Q+PC9pcz48L2M+PGMgcj0iQzIiPjx2PjEwMDwvdj48L2M+PC9yb3c+Cjxyb3cgcj0iMyI+PGMgcj0iQTMiPjx2PjI8L3Y+PC9jPjxjIHI9IkIzIiB0PSJpbmxpbmVTdHIiPjxpcz48dD5sZWNoZTwvdD48L2lzPjwvYz48YyByPSJDMyI+PHY+MjAwPC92PjwvYz48L3Jvdz4KPHJvdyByPSI0Ij48YyByPSJBNCI+PHY+Mzwvdj48L2M+PGMgcj0iQjQiIHQ9ImlubGluZVN0ciI+PGlzPjx0PnBhbjwvdD48L2lzPjwvYz48YyByPSJDNCI+PGY+MTArMjA8L2Y+PHY+MzA8L3Y+PC9jPjwvcm93Pgo8L3NoZWV0RGF0YT48L3dvcmtzaGVldD5QSwMEFAAAAAAAAAAhAMjI7/m/AQAAvwEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0Mi54bWw8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCIgc3RhbmRhbG9uZT0ieWVzIj8+Cjx3b3Jrc2hlZXQgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9zcHJlYWRzaGVldG1sLzIwMDYvbWFpbiI+PHNoZWV0RGF0YT4KPHJvdyByPSIxIj48YyByPSJBMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+azwvdD48L2lzPjwvYz48YyByPSJCMSIgdD0iaW5saW5lU3RyIj48aXM+PHQ+djwvdD48L2lzPjwvYz48L3Jvdz4KPHJvdyByPSIyIj48YyByPSJBMiIgdD0iaW5saW5lU3RyIj48aXM+PHQ+YTwvdD48L2lzPjwvYz48YyByPSJCMiI+PHY+MTwvdj48L2M+PC9yb3c+Cjxyb3cgcj0iMyI+PGMgcj0iQTMiIHQ9ImlubGluZVN0ciI+PGlzPjx0PmI8L3Q+PC9pcz48L2M+PGMgcj0iQjMiPjx2PjI8L3Y+PC9jPjwvcm93Pgo8L3NoZWV0RGF0YT48L3dvcmtzaGVldD5QSwECFAAUAAAAAAAAACEABzC3uLwCAAC8AgAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAAAAAAIQB+b8CFKgEAACoBAAALAAAAAAAAAAAAAAAAAO0CAABfcmVscy8ucmVsc1BLAQIUABQAAAAAAAAAIQAvgzF4SgEAAEoBAAAPAAAAAAAAAAAAAAAAAEAEAAB4bC93b3JrYm9vay54bWxQSwECFAAUAAAAAAAAACEAZlLwh7kBAAC5AQAAGgAAAAAAAAAAAAAAAAC3BQAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAAUAAAAAAAAACEA9hYXKqoCAACqAgAAGAAAAAAAAAAAAAAAAACoBwAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAhQAFAAAAAAAAAAhAMjI7/m/AQAAvwEAABgAAAAAAAAAAAAAAAAAiAoAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbFBLBQYAAAAABgAGAIsBAAB9DAAAAAA=";

function buildWorkbook(): Buffer {
  return Buffer.from(TEST_WORKBOOK_BASE64, "base64");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
});

async function chooseFile(page: Page, filePath: string) {
  await page.locator("#csv-file").setInputFiles(filePath);
  await page.getByRole("button", { name: /importar archivo/i }).click();
}

test("registra la sonda de lectura nativa (ruta A)", async ({ page }) => {
  await page.getByRole("button", { name: /probar lectura nativa/i }).click();
  // Veredicto honesto cualquiera sea el soporte; el detalle queda visible.
  await expect(page.getByText(/Lectura nativa \(read_xlsx\)/)).toBeVisible({
    timeout: 30_000,
  });
});

test("importa la primera hoja y permite elegir otra", async ({ page }, testInfo) => {
  const target = testInfo.outputPath("multi.xlsx");
  writeFileSync(target, buildWorkbook());
  await chooseFile(page, target);

  const sheet = page.locator("#sheet");
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toContainText(/Ventas/);
  await expect(sheet).toContainText(/Meta/);

  await page.getByRole("button", { name: /importar hoja/i }).click();
  await expect(page.getByText("#Ventas: 3 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  // importe llega BIGINT (valores enteros); se elige explícito.
  // La fórmula aporta su valor almacenado (30), no se ejecuta nada.
  await page.locator("#num-col").selectOption("importe");
  await expect(page.getByText("Suma: 330")).toBeVisible();

  await sheet.selectOption("Meta");
  await page.getByRole("button", { name: /importar hoja/i }).click();
  await expect(page.getByText("#Meta: 2 filas, 2 columnas")).toBeVisible({
    timeout: 30_000,
  });
});

test("rechaza XLSX corrupto y se recupera", async ({ page }, testInfo) => {
  const target = testInfo.outputPath("corrupto.xlsx");
  // ZIP truncado determinista (fixture versionado cortado a 200 bytes):
  // falla al descomprimir de forma reproducible.
  writeFileSync(target, readFileSync("public/demo-data/sonda.xlsx").slice(0, 200));
  const panel = page.locator('section[aria-labelledby="importar"]');
  await chooseFile(page, target);
  await expect(panel.getByRole("alert")).toBeVisible({ timeout: 30_000 });

  const valid = testInfo.outputPath("multi.xlsx");
  writeFileSync(valid, buildWorkbook());
  await chooseFile(page, valid);
  await expect(page.locator("#sheet")).toBeVisible({ timeout: 30_000 });
});
