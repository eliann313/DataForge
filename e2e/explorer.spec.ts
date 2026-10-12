import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// E4: Data Explorer. Referencias independientes (cálculo manual):
// - promo.json: 5 filas; importe suma 2021.25; promo 3 nulos (60 %);
//   producto 2 distintos (pan×3, leche×2); `origen` anidado.
// - ventas.parquet: 8 filas; importe suma 3901.50; cantidad 2 nulos.
// - muchas.csv: grupo=g1 son 15 de 45; valor máx 90.
// - duplicadas.csv: 3 filas, 1 grupo duplicado (1,x).
// - sin-encabezado.csv: 2 filas sin encabezados (column0/column1).
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
});

const fixture = (name: string) => path.resolve("public/demo-data", name);
const panel = (page: Page) =>
  page.locator('section[aria-labelledby="importar"]');

async function importFile(page: Page, name: string) {
  await page.locator("#csv-file").setInputFiles(fixture(name));
  await page.getByRole("button", { name: /importar archivo/i }).click();
}

test("importa JSON tabular con anidados y perfila nulos", async ({ page }) => {
  await importFile(page, "promo.json");
  await expect(panel(page).getByText("promo.json: 5 filas, 5 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel(page).getByText("Suma: 2021.25")).toBeVisible();
  // Anidado conservado como STRUCT (se muestra serializado).
  await expect(panel(page).getByRole("columnheader", { name: "origen" })).toBeVisible();
  await expect(panel(page).getByRole("cell", { name: /redes/ }).first()).toBeVisible();

  await panel(page).locator("#profile-col").selectOption("promo");
  await expect(panel(page).getByRole("rowheader", { name: "Nulos" })).toBeVisible();
  await expect(panel(page).getByText(/3 \(60 %\)/)).toBeVisible();
  await panel(page).locator("#profile-col").selectOption("producto");
  await expect(panel(page).getByText("Frecuencias principales")).toBeVisible();
  await expect(
    panel(page).getByRole("cell", { name: "pan", exact: true }).first(),
  ).toBeVisible();
});

test("importa Parquet nativo con tipos y nulos", async ({ page }) => {
  await importFile(page, "ventas.parquet");
  await expect(
    panel(page).getByText("ventas.parquet: 8 filas, 4 columnas"),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel(page).getByText("Suma: 3901.5")).toBeVisible();
  await panel(page).locator("#profile-col").selectOption("cantidad");
  await expect(panel(page).getByText(/2 \(25 %\)/)).toBeVisible();
});

test("filtra y ordena sobre el dataset completo", async ({ page }) => {
  await importFile(page, "muchas.csv");
  await expect(panel(page).getByText("muchas.csv: 45 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await panel(page).getByRole("button", { name: /agregar filtro/i }).click();
  await panel(page).getByLabel(/columna del filtro 1/i).selectOption("grupo");
  await panel(page).getByLabel(/operador del filtro 1/i).selectOption("eq");
  await panel(page).getByLabel(/valor del filtro 1/i).fill("g1");
  await panel(page).getByLabel(/ordenar por/i).selectOption("valor");
  await panel(page).getByLabel(/dirección del orden/i).selectOption("desc");
  await panel(page).getByRole("button", { name: /^aplicar$/i }).click();
  await expect(panel(page).getByText(/15 de 45 filas/)).toBeVisible({ timeout: 30_000 });
  // g1 = id ≡ 1 (mod 3): máx id 43 → valor 86, primero con orden desc.
  await expect(panel(page).getByRole("cell", { name: "86", exact: true })).toBeVisible();
});

test("respeta CSV sin encabezados", async ({ page }) => {
  await page.locator("#csv-file").setInputFiles(fixture("sin-encabezado.csv"));
  await panel(page).getByLabel(/encabezados/i).uncheck();
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(
    panel(page).getByText("sin-encabezado.csv: 2 filas, 2 columnas"),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel(page).getByRole("columnheader", { name: "column0" })).toBeVisible();
});

test("cuenta duplicados con definición visible", async ({ page }) => {
  await importFile(page, "duplicadas.csv");
  await expect(panel(page).getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel(page).getByText(/Duplicados potenciales:/)).toBeVisible();
  await expect(panel(page).getByText(/filas idénticas en todas las columnas/)).toBeVisible();
});

test("un fallo conserva el dataset activo", async ({ page }, testInfo) => {
  const { writeFileSync } = await import("node:fs");
  await importFile(page, "numeros.csv");
  await expect(panel(page).getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  const bad = testInfo.outputPath("malo.json");
  writeFileSync(bad, "{no es un arreglo}");
  await page.locator("#csv-file").setInputFiles(bad);
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(panel(page).getByRole("alert")).toContainText(/no tabular/i, {
    timeout: 30_000,
  });
  await expect(panel(page).getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible();
});

test("el rol semántico es editable por sesión", async ({ page }) => {
  await importFile(page, "numeros.csv");
  await expect(panel(page).getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  const rol = panel(page).getByLabel(/rol semántico de categoria/i);
  await expect(rol).toHaveValue("texto");
  await rol.selectOption("dimension");
  await expect(rol).toHaveValue("dimension");
});
