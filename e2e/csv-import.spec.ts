import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// 0A.3: CSV real de punta a punta. Referencias independientes (cálculo manual):
// - numeros.csv: 5 filas; importe suma 1475.75, media 295.15, mín 50.25, máx 1000.
// - muchas.csv: 45 filas (id 1..45, valor = id*2); valor suma 2070, media 46.
// - hostil.csv: delimitador ";" y cabeceras con comillas e intento de inyección;
//   debe importarse 1 fila sin dañar la tabla activa.
// - vacio.csv: 0 bytes; debe fallar con error recuperable.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
});

const fixture = (name: string) =>
  path.resolve("public/demo-data", name);

async function importFile(page: Page, name: string) {
  await page.locator("#csv-file").setInputFiles(fixture(name));
  await page.getByRole("button", { name: /importar archivo/i }).click();
}

test("importa fixture numérico con esquema, agregados y preview", async ({
  page,
}) => {
  await importFile(page, "numeros.csv");
  await expect(page.getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Suma: 1475.75")).toBeVisible();
  await expect(page.getByText("Media: 295.15")).toBeVisible();
  await expect(page.getByText("Mínimo: 50.25")).toBeVisible();
  await expect(page.getByText("Máximo: 1000")).toBeVisible();
  // Preview paginada con datos reales.
  await expect(page.getByRole("cell", { name: "alimentos", exact: true }).first()).toBeVisible();
});

test("pagina un dataset de 45 filas en 3 páginas", async ({ page }) => {
  await importFile(page, "muchas.csv");
  await expect(page.getByText("muchas.csv: 45 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("página 1 de 3")).toBeVisible();
  await page.getByRole("button", { name: /siguiente/i }).click();
  await expect(page.getByText("página 2 de 3")).toBeVisible();
  await expect(page.getByRole("cell", { name: "21", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /siguiente/i }).click();
  await expect(page.getByText("página 3 de 3")).toBeVisible();
  await page.getByRole("button", { name: /anterior/i }).click();
  await expect(page.getByText("página 2 de 3")).toBeVisible();
});

test("neutraliza cabeceras hostiles y conserva la tabla", async ({ page }) => {
  await importFile(page, "hostil.csv");
  await expect(page.getByText("hostil.csv: 1 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
  // La tabla activa sigue consultable: el DROP inyectado no corrió.
  await expect(page.getByText("página 1 de 1")).toBeVisible();
});

test("rechaza archivo vacío y se recupera con uno válido", async ({
  page,
}) => {
  const panel = page.locator('section[aria-labelledby="importar"]');
  await importFile(page, "vacio.csv");
  await expect(panel.getByRole("alert")).toContainText(/vacío/i, {
    timeout: 30_000,
  });
  await importFile(page, "numeros.csv");
  await expect(page.getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({
    timeout: 30_000,
  });
});
