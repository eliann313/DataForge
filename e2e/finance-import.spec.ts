import { expect, test, type Page } from "@playwright/test";

async function openFinance(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("dataforge-finance");
      request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
}

test.beforeEach(async ({ page }) => openFinance(page));

test("importa CSV solo tras revisar y confirmar; duplicados quedan excluidos", async ({ page }) => {
  const panel = page.locator('section[aria-labelledby="importar-movimientos"]');
  await panel.getByLabel("Seleccionar archivo").setInputFiles({ name: "movimientos.csv", mimeType: "text/csv", buffer: Buffer.from("fecha,descripcion,tipo,importe,categoria\n2024-03-01,Café,gasto,0.10,Alimentos\n2024-03-01,Café,gasto,0.10,Alimentos\n") });
  await panel.getByRole("button", { name: /validar y ver vista previa/i }).click();
  await expect(panel.getByText(/1 nuevos · 1 duplicados excluidos · 0 errores/)).toBeVisible();
  const confirm = panel.getByRole("button", { name: /confirmar importación/i });
  await expect(confirm).toBeVisible();
  await panel.getByLabel("Columna: Fecha").selectOption("1");
  await expect(confirm).toHaveCount(0);
  await panel.getByRole("button", { name: /validar y ver vista previa/i }).click();
  await expect(panel.getByRole("alert")).toContainText(/columna distinta/);
  await panel.getByLabel("Columna: Fecha").selectOption("0");
  await panel.getByRole("button", { name: /validar y ver vista previa/i }).click();
  await panel.getByRole("button", { name: /confirmar importación/i }).click();
  await expect(panel.getByRole("status")).toContainText(/se importaron 1 movimientos/i);
  const movements = page.locator('section[aria-labelledby="movimientos"]');
  await expect(movements.getByText("Café", { exact: true })).toHaveCount(1);
  await expect(movements.getByText(/0,10/)).toBeVisible();
});

test("importa XLSX de primera hoja conservando centavos", async ({ page }) => {
  const panel = page.locator('section[aria-labelledby="importar-movimientos"]');
  await panel.getByLabel("Seleccionar archivo").setInputFiles("e2e/fixtures/finanzas-minimas.xlsx");
  await expect(panel.getByText(/1 fila leída/)).toBeVisible();
  await panel.getByRole("button", { name: /validar y ver vista previa/i }).click();
  await expect(panel.getByText(/1 nuevos · 0 duplicados excluidos · 0 errores/)).toBeVisible();
  await panel.getByRole("button", { name: /confirmar importación/i }).click();
  await expect(panel.getByRole("status")).toContainText(/se importaron 1 movimientos/i);
  const movement = page.locator('section[aria-labelledby="movimientos"]');
  await expect(movement.getByText("Libro XLSX", { exact: true })).toBeVisible();
  await expect(movement.getByText(/12,34/)).toBeVisible();
});
