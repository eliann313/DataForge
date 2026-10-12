import { writeFile, utils, type WorkBook } from "xlsx";
import { expect, test, type Page } from "@playwright/test";

// 0A.4: XLSX por ruta B (parser JS en Worker) + sonda de ruta A (nativa).
// El workbook de prueba se genera en Node con SheetJS (independiente del
// Worker que lo lee en el navegador):
// - Ventas: 3 filas; importe 100+200+30(fórmula con valor 30) = suma 330.
// - Meta: 2 filas.
function buildWorkbook(): WorkBook {
  const wb: WorkBook = utils.book_new();
  const ventas = utils.aoa_to_sheet([
    ["id", "producto", "importe"],
    [1, "pan", 100],
    [2, "leche", 200],
    [3, "pan", { t: "n", v: 30, f: "10+20" }],
  ]);
  const meta = utils.aoa_to_sheet([
    ["k", "v"],
    ["a", 1],
    ["b", 2],
  ]);
  utils.book_append_sheet(wb, ventas, "Ventas");
  utils.book_append_sheet(wb, meta, "Meta");
  return wb;
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
  writeFile(buildWorkbook(), target);
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
  const { readFileSync, writeFileSync } = await import("node:fs");
  const target = testInfo.outputPath("corrupto.xlsx");
  // ZIP truncado determinista (fixture versionado cortado a 200 bytes):
  // falla al descomprimir de forma reproducible.
  writeFileSync(target, readFileSync("public/demo-data/sonda.xlsx").slice(0, 200));
  const panel = page.locator('section[aria-labelledby="importar"]');
  await chooseFile(page, target);
  await expect(panel.getByRole("alert")).toBeVisible({ timeout: 30_000 });

  const valid = testInfo.outputPath("multi.xlsx");
  writeFile(buildWorkbook(), valid);
  await chooseFile(page, valid);
  await expect(page.locator("#sheet")).toBeVisible({ timeout: 30_000 });
});
