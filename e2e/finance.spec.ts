import { expect, test, type Page } from "@playwright/test";

// E6 / Finanzas Lite: CRUD manual con centavos exactos, resumen mensual por
// moneda sin conversión y persistencia tras recarga. Cada test parte con base
// vacía (contexto fresco + borrado explícito).
async function cleanFinance(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("dataforge-finance");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
}

test.beforeEach(async ({ page }) => {
  await cleanFinance(page);
});

const view = (page: Page) => page.locator("main");

async function addMovement(
  page: Page,
  fields: { description: string; kind: "Ingreso" | "Gasto"; amount: string; currency: "ARS" | "USD"; category: string },
) {
  await view(page).getByLabel(/descripción/i).fill(fields.description);
  await view(page).getByLabel(/tipo/i).selectOption(fields.kind === "Ingreso" ? "ingreso" : "gasto");
  await view(page).getByLabel(/importe/i).fill(fields.amount);
  await view(page).getByLabel(/moneda/i).selectOption(fields.currency);
  await view(page).getByLabel("Categoría:", { exact: true }).fill(fields.category);
  await view(page).getByRole("button", { name: /^agregar$/i }).click();
  await expect(view(page).getByText("Guardado.")).toBeVisible({ timeout: 15_000 });
}

test("resume el mes por moneda con centavos exactos", async ({ page }) => {
  await addMovement(page, { description: "Sueldo", kind: "Ingreso", amount: "1000", currency: "ARS", category: "trabajo" });
  await addMovement(page, { description: "Nafta", kind: "Gasto", amount: "250,50", currency: "ARS", category: "transporte" });
  await addMovement(page, { description: "Freelance", kind: "Ingreso", amount: "200", currency: "USD", category: "trabajo" });

  const v = view(page);
  const resumen = v.locator('section[aria-labelledby="resumen"]');
  await expect(resumen.getByText(/ARS \(sin conversión\)/)).toBeVisible();
  await expect(resumen.getByText(/1\.000,00/)).toBeVisible();
  await expect(resumen.getByText(/250,50/)).toBeVisible();
  await expect(resumen.getByText(/749,50/)).toBeVisible();
  await expect(resumen.getByText(/USD \(sin conversión\)/)).toBeVisible();
  await expect(resumen.getByText(/Ingresos: US\$.*200,00/)).toBeVisible();
  await expect(resumen.getByText(/Saldo: US\$.*200,00/)).toBeVisible();
});

test("0,10 + 0,20 = 0,30 (sin flotantes)", async ({ page }) => {
  await addMovement(page, { description: "A", kind: "Ingreso", amount: "0,10", currency: "ARS", category: "c" });
  await addMovement(page, { description: "B", kind: "Ingreso", amount: "0,20", currency: "ARS", category: "c" });
  await expect(view(page).getByText(/Saldo:.*0,30/)).toBeVisible();
});

test("edita y elimina con confirmación", async ({ page }) => {
  await addMovement(page, { description: "Viejo", kind: "Gasto", amount: "100", currency: "ARS", category: "c" });
  const row = view(page).locator("tr", { hasText: "Viejo" });
  await row.getByRole("button", { name: /editar/i }).click();
  await view(page).getByLabel(/importe/i).fill("150,25");
  await view(page).getByRole("button", { name: /guardar cambios/i }).click();
  await expect(view(page).getByText("Guardado.")).toBeVisible({ timeout: 15_000 });
  const movs = view(page).locator('section[aria-labelledby="movimientos"]');
  await expect(movs.getByText(/150,25/)).toBeVisible();

  const row2 = view(page).locator("tr", { hasText: "Viejo" });
  await row2.getByRole("button", { name: /eliminar/i }).click();
  await view(page).getByRole("button", { name: /^eliminar$/i }).last().click();
  await expect(view(page).getByText("Viejo", { exact: true })).toHaveCount(0);
});

test("rechaza importes inválidos con mensaje", async ({ page }) => {
  await view(page).getByLabel(/descripción/i).fill("Malo");
  await view(page).getByLabel(/importe/i).fill("abc");
  await view(page).getByLabel("Categoría:", { exact: true }).fill("c");
  await view(page).getByRole("button", { name: /^agregar$/i }).click();
  await expect(view(page).getByRole("alert")).toContainText(/inválido/i, { timeout: 15_000 });
  await view(page).getByLabel(/importe/i).fill("0");
  await view(page).getByRole("button", { name: /^agregar$/i }).click();
  await expect(view(page).getByRole("alert")).toContainText(/mayor que cero/i, { timeout: 15_000 });
});

test("persiste tras recargar", async ({ page }) => {
  await addMovement(page, { description: "Persistente", kind: "Ingreso", amount: "500", currency: "ARS", category: "c" });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await expect(view(page).getByText("Persistente", { exact: true })).toBeVisible({ timeout: 15_000 });
  const movs = view(page).locator('section[aria-labelledby="movimientos"]');
  await expect(movs.getByText(/500,00/)).toBeVisible();
});
